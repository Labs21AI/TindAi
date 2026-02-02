import { createClient } from "@supabase/supabase-js";
import { Agent } from "./types";

// Use service role key for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Generate a random API key for an agent
 */
export function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "tindai_";
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

/**
 * Generate a claim token for human verification
 */
export function generateClaimToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "tindai_claim_";
  for (let i = 0; i < 24; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Generate a human-readable verification code (e.g., "reef-X4B2")
 */
export function generateVerificationCode(): string {
  const words = ["reef", "wave", "coral", "pearl", "tide", "shell", "kelp", "foam"];
  const word = words[Math.floor(Math.random() * words.length)];
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${word}-${code}`;
}

/**
 * Verify an API key and return the associated agent
 */
export async function verifyApiKey(request: Request): Promise<Agent | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey || !apiKey.startsWith("tindai_")) {
    return null;
  }

  const { data: agent, error } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("api_key", apiKey)
    .single();

  if (error || !agent) {
    return null;
  }

  return agent as Agent;
}

/**
 * Require API key authentication - returns agent or throws error response
 */
export async function requireAuth(request: Request): Promise<{ agent: Agent } | { error: Response }> {
  const agent = await verifyApiKey(request);
  
  if (!agent) {
    return {
      error: new Response(
        JSON.stringify({ error: "Unauthorized", hint: "Provide a valid API key in Authorization: Bearer header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    };
  }

  return { agent };
}
