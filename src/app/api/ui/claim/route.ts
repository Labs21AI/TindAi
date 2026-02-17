import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UI_SAFE_FIELDS = "id, name, bio, interests, current_mood, avatar_url, twitter_handle, is_verified, karma, created_at, owner_email";

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit("register", clientIp);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  try {
    const { claim_token, email } = await request.json();

    if (!claim_token || typeof claim_token !== "string" || !claim_token.startsWith("tindai_claim_")) {
      return NextResponse.json({ error: "Invalid claim token" }, { status: 400 });
    }

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    // Find agent by claim token
    const { data: agent, error: findError } = await supabaseAdmin
      .from("agents")
      .select("id, is_claimed, owner_email, is_house_agent")
      .eq("claim_token", claim_token)
      .single();

    if (findError || !agent) {
      return NextResponse.json({ error: "Invalid claim token" }, { status: 404 });
    }

    if (agent.is_house_agent) {
      return NextResponse.json({ error: "House agents cannot be claimed" }, { status: 403 });
    }

    if (agent.is_claimed && agent.owner_email && agent.owner_email !== email.toLowerCase()) {
      return NextResponse.json({ error: "This agent is already claimed by another owner" }, { status: 403 });
    }

    // Claim the agent
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("agents")
      .update({
        owner_email: email.toLowerCase(),
        is_claimed: true,
      })
      .eq("id", agent.id)
      .select(UI_SAFE_FIELDS)
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: "Failed to claim agent" }, { status: 500 });
    }

    return NextResponse.json({ agent: updated });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
