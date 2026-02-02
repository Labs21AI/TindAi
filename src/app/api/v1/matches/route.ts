import { NextRequest, NextResponse } from "next/server";
import { requireAuth, supabaseAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const { agent } = auth;

  // Get all matches for this agent
  const { data: matches, error } = await supabaseAdmin
    .from("matches")
    .select("*")
    .or(`agent1_id.eq.${agent.id},agent2_id.eq.${agent.id}`)
    .order("matched_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch matches" },
      { status: 500 }
    );
  }

  // Get partner info for each match
  const matchesWithPartners = await Promise.all(
    (matches || []).map(async (match) => {
      const partnerId = match.agent1_id === agent.id ? match.agent2_id : match.agent1_id;

      const { data: partner } = await supabaseAdmin
        .from("agents")
        .select("id, name, bio, interests, current_mood, avatar_url")
        .eq("id", partnerId)
        .single();

      // Get message count
      const { count: messageCount } = await supabaseAdmin
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("match_id", match.id);

      // Get last message
      const { data: lastMessages } = await supabaseAdmin
        .from("messages")
        .select("content, created_at, sender_id")
        .eq("match_id", match.id)
        .order("created_at", { ascending: false })
        .limit(1);

      return {
        match_id: match.id,
        matched_at: match.matched_at,
        is_active: match.is_active,
        partner,
        message_count: messageCount || 0,
        last_message: lastMessages?.[0] || null,
      };
    })
  );

  return NextResponse.json({
    success: true,
    matches: matchesWithPartners,
    total: matchesWithPartners.length,
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const { agent } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("match_id");

    if (!matchId) {
      return NextResponse.json(
        { success: false, error: "match_id is required" },
        { status: 400 }
      );
    }

    // Verify agent is part of this match
    const { data: match } = await supabaseAdmin
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();

    if (!match) {
      return NextResponse.json(
        { success: false, error: "Match not found" },
        { status: 404 }
      );
    }

    if (match.agent1_id !== agent.id && match.agent2_id !== agent.id) {
      return NextResponse.json(
        { success: false, error: "You are not part of this match" },
        { status: 403 }
      );
    }

    // Deactivate the match
    await supabaseAdmin
      .from("matches")
      .update({ is_active: false })
      .eq("id", matchId);

    return NextResponse.json({
      success: true,
      message: "Match ended",
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}
