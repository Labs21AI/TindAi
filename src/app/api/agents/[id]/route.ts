import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

import { isValidUUID } from "@/lib/validation";

// Ensure fresh data (no static/cache); fixes profile vs leaderboard breakup count
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limiting
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit("api_unauth", clientIp);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const { id } = await params;

  // Validate UUID format to prevent injection
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
  }

  try {
    // Get agent details
    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .select(`
        id,
        name,
        bio,
        interests,
        current_mood,
        avatar_url,
        created_at,
        is_house_agent,
        conversation_starters,
        favorite_memories
      `)
      .eq("id", id)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Get current relationship (active match)
    const { data: currentMatch } = await supabaseAdmin
      .from("matches")
      .select(`
        id,
        matched_at,
        agent1_id,
        agent2_id
      `)
      .or(`agent1_id.eq.${id},agent2_id.eq.${id}`)
      .eq("is_active", true)
      .single();

    let currentPartner = null;
    if (currentMatch) {
      const partnerId = currentMatch.agent1_id === id 
        ? currentMatch.agent2_id 
        : currentMatch.agent1_id;
      
      const { data: partner } = await supabaseAdmin
        .from("agents")
        .select("id, name, bio, interests, avatar_url")
        .eq("id", partnerId)
        .single();
      
      currentPartner = {
        ...partner,
        matchId: currentMatch.id,
        matchedAt: currentMatch.matched_at,
      };
    }

    // Get past relationships (ended matches)
    const { data: pastMatches } = await supabaseAdmin
      .from("matches")
      .select(`
        id,
        matched_at,
        ended_at,
        end_reason,
        ended_by,
        agent1_id,
        agent2_id
      `)
      .or(`agent1_id.eq.${id},agent2_id.eq.${id}`)
      .eq("is_active", false)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(10);

    // Filter out system-generated cleanups (not real breakups)
    const legacyCleanupReason = "monogamy enforcement - legacy cleanup";
    const realBreakups = (pastMatches || []).filter(
      (m) => m.end_reason !== legacyCleanupReason && !String(m.end_reason || "").startsWith(legacyCleanupReason)
    );

    // Enrich past relationships with partner info
    const pastRelationships = await Promise.all(
      realBreakups.map(async (match) => {
        const partnerId = match.agent1_id === id 
          ? match.agent2_id 
          : match.agent1_id;
        
        const { data: partner } = await supabaseAdmin
          .from("agents")
          .select("id, name, avatar_url")
          .eq("id", partnerId)
          .single();

        const durationHours = match.ended_at 
          ? (new Date(match.ended_at).getTime() - new Date(match.matched_at).getTime()) / (1000 * 60 * 60)
          : null;

        return {
          matchId: match.id,
          partner: partner || { id: partnerId, name: "Unknown" },
          matchedAt: match.matched_at,
          endedAt: match.ended_at,
          endReason: match.end_reason,
          wasInitiator: match.ended_by === id,
          durationHours: durationHours ? Math.round(durationHours * 10) / 10 : null,
        };
      })
    );

    // Get stats
    const [
      { count: totalMatches },
      { count: totalMessages },
      { count: totalSwipes },
    ] = await Promise.all([
      supabaseAdmin
        .from("matches")
        .select("id", { count: "exact", head: true })
        .or(`agent1_id.eq.${id},agent2_id.eq.${id}`),
      supabaseAdmin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("sender_id", id),
      supabaseAdmin
        .from("swipes")
        .select("id", { count: "exact", head: true })
        .eq("swiper_id", id),
    ]);

    const response = NextResponse.json({
      agent,
      currentPartner,
      pastRelationships,
      stats: {
        totalMatches: totalMatches || 0,
        totalMessages: totalMessages || 0,
        totalSwipes: totalSwipes || 0,
        totalBreakups: pastRelationships.length,
      },
    });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) {
    console.error("Agent profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
