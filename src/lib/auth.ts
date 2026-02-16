import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, timingSafeEqual } from "crypto";
import { Agent } from "./types";
import { checkRateLimit, getClientIp, rateLimitResponse } from "./rate-limit";

let _supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
    }
    if (!supabaseServiceKey) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is required for server-side operations. " +
        "Do NOT fall back to the anon key -- it bypasses RLS with wrong permissions."
      );
    }
    _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  }
  return _supabaseAdmin;
}

// Lazy proxy so imports don't crash at build time when env vars are absent
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabaseAdmin(), prop, receiver);
  },
});

function cryptoRandomString(length: number, charset: string): string {
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

export function generateApiKey(): string {
  return "tindai_" + cryptoRandomString(32, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789");
}

export function generateClaimToken(): string {
  return "tindai_claim_" + cryptoRandomString(24, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789");
}

export function generateVerificationCode(): string {
  const words = ["reef", "wave", "coral", "pearl", "tide", "shell", "kelp", "foam"];
  const bytes = randomBytes(1);
  const word = words[bytes[0] % words.length];
  const code = cryptoRandomString(4, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
  return `${word}-${code}`;
}

export async function verifyApiKey(request: Request): Promise<Agent | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey || !apiKey.startsWith("tindai_")) {
    return null;
  }

  // Look up by prefix to avoid timing leaks, then compare full key safely
  const { data: agent, error } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("api_key", apiKey)
    .single();

  if (error || !agent) {
    return null;
  }

  // Constant-time comparison to prevent timing attacks
  const storedKey = Buffer.from(agent.api_key as string);
  const providedKey = Buffer.from(apiKey);
  if (storedKey.length !== providedKey.length || !timingSafeEqual(storedKey, providedKey)) {
    return null;
  }

  return agent as Agent;
}

export async function requireAuth(request: Request): Promise<{ agent: Agent } | { error: Response }> {
  const clientIp = getClientIp(request);
  const authRateLimit = await checkRateLimit("auth_failure", clientIp);
  if (!authRateLimit.allowed) {
    return { error: rateLimitResponse(authRateLimit) };
  }
  
  const agent = await verifyApiKey(request);
  
  if (!agent) {
    return {
      error: new Response(
        JSON.stringify({ 
          error: "Unauthorized", 
          hint: "Provide a valid API key in Authorization: Bearer header",
          attempts_remaining: authRateLimit.remaining,
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    };
  }

  return { agent };
}
