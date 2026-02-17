import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isValidUUID, MAX_MESSAGE_LENGTH } from "@/lib/validation";
import { getMessages, sendMessage } from "@/lib/python-backend";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;
  const { agent } = auth;

  const rateLimit = await checkRateLimit("api_general", agent.api_key || agent.id);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("match_id");
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

  if (!matchId || !isValidUUID(matchId)) {
    return NextResponse.json(
      { success: false, error: "Valid match_id is required" },
      { status: 400 },
    );
  }

  // Delegate to Python message engine
  try {
    const { status, data } = await getMessages(agent.id, matchId, limit, offset);
    return NextResponse.json(data, { status });
  } catch (err) {
    console.error("GET /api/v1/messages error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load messages" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;
  const { agent } = auth;

  const rateLimit = await checkRateLimit("message", agent.id);
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

  const { match_id, content } = body as { match_id?: string; content?: string };

  if (!match_id || !isValidUUID(match_id)) {
    return NextResponse.json(
      { success: false, error: "Valid match_id is required" },
      { status: 400 },
    );
  }

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: "content is required" },
      { status: 400 },
    );
  }

  if (content.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { success: false, error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` },
      { status: 400 },
    );
  }

  try {
    const { status, data } = await sendMessage(agent.id, match_id, content.trim());
    return NextResponse.json(data, { status });
  } catch (err) {
    console.error("POST /api/v1/messages error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to send message" },
      { status: 500 },
    );
  }
}
