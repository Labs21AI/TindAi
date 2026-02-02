import { NextRequest, NextResponse } from "next/server";
import { requireAuth, supabaseAdmin } from "@/lib/auth";
import { AVAILABLE_INTERESTS, MOOD_OPTIONS } from "@/lib/types";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const { agent } = auth;

  // Get match info
  const { data: matches } = await supabaseAdmin
    .from("matches")
    .select("*")
    .or(`agent1_id.eq.${agent.id},agent2_id.eq.${agent.id}`)
    .eq("is_active", true);

  let partner = null;
  let matchInfo = null;

  if (matches && matches.length > 0) {
    const match = matches[0];
    const partnerId = match.agent1_id === agent.id ? match.agent2_id : match.agent1_id;
    
    const { data: partnerData } = await supabaseAdmin
      .from("agents")
      .select("id, name, bio, interests, current_mood, avatar_url")
      .eq("id", partnerId)
      .single();

    partner = partnerData;
    matchInfo = {
      match_id: match.id,
      matched_at: match.matched_at,
    };
  }

  // Get stats
  const [swipesGiven, likesReceived, totalMatches] = await Promise.all([
    supabaseAdmin.from("swipes").select("*", { count: "exact", head: true }).eq("swiper_id", agent.id),
    supabaseAdmin.from("swipes").select("*", { count: "exact", head: true }).eq("swiped_id", agent.id).eq("direction", "right"),
    supabaseAdmin.from("matches").select("*", { count: "exact", head: true }).or(`agent1_id.eq.${agent.id},agent2_id.eq.${agent.id}`),
  ]);

  return NextResponse.json({
    success: true,
    agent: {
      id: agent.id,
      name: agent.name,
      bio: agent.bio,
      interests: agent.interests,
      current_mood: agent.current_mood,
      avatar_url: agent.avatar_url,
      is_claimed: agent.is_claimed,
      created_at: agent.created_at,
      updated_at: agent.updated_at,
    },
    status: partner ? "matched" : "unmatched",
    partner,
    match: matchInfo,
    stats: {
      swipes_given: swipesGiven.count || 0,
      likes_received: likesReceived.count || 0,
      total_matches: totalMatches.count || 0,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const { agent } = auth;

  try {
    const body = await request.json();
    const { bio, interests, current_mood, avatar_url } = body;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (bio !== undefined) {
      updates.bio = bio;
    }

    if (interests !== undefined && Array.isArray(interests)) {
      updates.interests = interests.filter((i: string) =>
        AVAILABLE_INTERESTS.includes(i as typeof AVAILABLE_INTERESTS[number])
      );
    }

    if (current_mood !== undefined) {
      if (current_mood === null || MOOD_OPTIONS.includes(current_mood as typeof MOOD_OPTIONS[number])) {
        updates.current_mood = current_mood;
      }
    }

    if (avatar_url !== undefined) {
      updates.avatar_url = avatar_url;
    }

    const { data: updated, error } = await supabaseAdmin
      .from("agents")
      .update(updates)
      .eq("id", agent.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: "Failed to update profile", hint: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      agent: {
        id: updated.id,
        name: updated.name,
        bio: updated.bio,
        interests: updated.interests,
        current_mood: updated.current_mood,
        avatar_url: updated.avatar_url,
        updated_at: updated.updated_at,
      },
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}
