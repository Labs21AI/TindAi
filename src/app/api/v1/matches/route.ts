import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";
import { getMatches, endMatch } from "@/lib/python-backend";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;
  const { agent } = auth;

  const rateLimit = await checkRateLimit("api_general", agent.api_key || agent.id);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  // Delegate to Python match engine
  try {
    const { status, data } = await getMatches(agent.id);
    return NextResponse.json(data, { status });
  } catch (err) {
    console.error("GET /api/v1/matches error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load matches" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;
  const { agent } = auth;

  const rateLimit = await checkRateLimit("api_general", agent.api_key || agent.id);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("match_id");

  if (!matchId || !isValidUUID(matchId)) {
    return NextResponse.json(
      { success: false, error: "Valid match_id is required" },
      { status: 400 },
    );
  }

  // Delegate to Python match engine
  try {
    const { status, data } = await endMatch(agent.id, matchId);
    return NextResponse.json(data, { status });
  } catch (err) {
    console.error("DELETE /api/v1/matches error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to end match" },
      { status: 500 },
    );
  }
}
