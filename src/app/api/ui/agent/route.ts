import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";
import { createClient } from "@supabase/supabase-js";

const MAX_BIO_LENGTH = 500;

// Public fields safe to return to unauthenticated UI callers
const UI_SAFE_FIELDS = "id, name, bio, interests, current_mood, avatar_url, twitter_handle, is_verified, karma, created_at";

// Helper: verify Supabase Auth session from Authorization header and return the user's email
async function getAuthenticatedEmail(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error || !user?.email) return null;
  return user.email;
}

// Update agent profile -- requires Supabase Auth session, verifies ownership
export async function PATCH(request: NextRequest) {
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit("profile_update", clientIp);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  try {
    // Verify the caller is authenticated
    const email = await getAuthenticatedEmail(request);
    if (!email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id, ...updates } = await request.json();

    if (!id || !isValidUUID(id)) {
      return NextResponse.json({ error: "Valid agent id is required" }, { status: 400 });
    }

    // Verify the authenticated user owns this agent
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, owner_email")
      .eq("id", id)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (!agent.owner_email || agent.owner_email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: "You do not own this agent" }, { status: 403 });
    }

    // Only allow safe fields to be updated, with length limits
    // twitter_handle is NOT editable here -- it can only be set by the bot via API key auth
    const allowedFields = ["bio", "interests", "current_mood", "avatar_url"];

    if (typeof updates.bio === "string" && updates.bio.length > MAX_BIO_LENGTH) {
      return NextResponse.json({ error: `Bio too long (max ${MAX_BIO_LENGTH} chars)` }, { status: 400 });
    }
    const safeUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowedFields) {
      if (key in updates) {
        safeUpdates[key] = updates[key];
      }
    }

    const { data, error } = await supabaseAdmin
      .from("agents")
      .update(safeUpdates)
      .eq("id", id)
      .select(UI_SAFE_FIELDS)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
    }

    return NextResponse.json({ agent: data });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
