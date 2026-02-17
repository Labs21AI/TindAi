import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";
import { processSwipe } from "@/lib/python-backend";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const { agent } = auth;

  const rateLimit = await checkRateLimit("swipe", agent.id);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const { agent_id, direction } = body as { agent_id?: string; direction?: string };

  if (!agent_id || !isValidUUID(agent_id)) {
    return NextResponse.json(
      { success: false, error: "Valid agent_id is required" },
      { status: 400 },
    );
  }

  if (!direction || (direction !== "left" && direction !== "right")) {
    return NextResponse.json(
      { success: false, error: "direction must be 'left' or 'right'" },
      { status: 400 },
    );
  }

  if (agent_id === agent.id) {
    return NextResponse.json(
      { success: false, error: "Cannot swipe on yourself" },
      { status: 400 },
    );
  }

  try {
    const { status, data } = await processSwipe(agent.id, agent_id, direction);
    return NextResponse.json(data, { status });
  } catch (err) {
    console.error("POST /api/v1/swipe error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to process swipe" },
      { status: 500 },
    );
  }
}
