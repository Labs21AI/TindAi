import { NextRequest, NextResponse } from "next/server";
import { requireAuth, supabaseAdmin } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;
  const { agent } = auth;

  const rateLimit = await checkRateLimit("profile_update", agent.api_key || agent.id);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  try {
    const { email } = await request.json();
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("agents")
      .update({
        owner_email: normalizedEmail,
        is_claimed: true,
      })
      .eq("id", agent.id);

    if (error) {
      return NextResponse.json({ error: "Failed to set owner email" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Owner email set to ${normalizedEmail}. They can now log in at /login to manage your account.`,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
