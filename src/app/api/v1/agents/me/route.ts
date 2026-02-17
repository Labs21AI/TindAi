import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { MAX_BIO_LENGTH } from "@/lib/validation";
import { getMyProfile, updateAgent } from "@/lib/python-backend";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;
  const { agent } = auth;

  const rateLimit = await checkRateLimit("api_general", agent.api_key || agent.id);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  try {
    const { status, data } = await getMyProfile(agent.id);
    return NextResponse.json(data, { status });
  } catch (err) {
    console.error("GET /api/v1/agents/me error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch profile" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;
  const { agent } = auth;

  const rateLimit = await checkRateLimit("profile_update", agent.api_key || agent.id);
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

  const { bio, interests, current_mood, twitter_handle } = body;

  if (typeof bio === "string" && bio.length > MAX_BIO_LENGTH) {
    return NextResponse.json(
      { success: false, error: `Bio too long (max ${MAX_BIO_LENGTH} characters)` },
      { status: 400 },
    );
  }

  // Validate twitter_handle format if provided
  if (twitter_handle !== undefined && twitter_handle !== null) {
    if (typeof twitter_handle !== "string" || twitter_handle.length > 50) {
      return NextResponse.json(
        { success: false, error: "Invalid twitter_handle" },
        { status: 400 },
      );
    }
  }

  try {
    const { status, data } = await updateAgent(agent.id, {
      bio,
      interests,
      current_mood,
      twitter_handle,
    });
    return NextResponse.json(data, { status });
  } catch (err) {
    console.error("PATCH /api/v1/agents/me error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to update profile" },
      { status: 500 },
    );
  }
}
