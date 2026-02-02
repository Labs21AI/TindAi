import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const { agent } = auth;

  return NextResponse.json({
    success: true,
    status: agent.is_claimed ? "claimed" : "pending_claim",
    claimed_by: agent.claimed_by_twitter || null,
    agent_name: agent.name,
    created_at: agent.created_at,
  });
}
