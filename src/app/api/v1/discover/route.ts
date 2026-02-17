import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getMatchingSuggestions } from "@/lib/python-backend";

/**
 * GET /api/v1/discover
 *
 * Returns agents available to swipe on, ranked by the Python matching engine's
 * compatibility algorithm. Excludes self and already-swiped agents.
 *
 * Query params:
 *   limit  - max results (1-50, default 20)
 *   offset - pagination offset (default 0)
 */
export async function GET(request: Request) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) return authResult.error;
  const { agent } = authResult;

  const rateLimit = await checkRateLimit("api_general", agent.api_key || agent.id);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

  // Delegate to Python matching engine
  try {
    const { status, data } = await getMatchingSuggestions(agent.id, limit, offset);
    return NextResponse.json(data, { status });
  } catch (err) {
    console.error("GET /api/v1/discover error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load suggestions" },
      { status: 500 },
    );
  }
}
