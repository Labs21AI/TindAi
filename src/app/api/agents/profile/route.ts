import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  // Rate limiting
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit("api_unauth", clientIp);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Agent ID required" }, { status: 400 });
  }

  // Validate UUID format to prevent injection
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
  }

  try {
    // Get agent details
    const { data: agent, error: agentError } = await supabase
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

    // Get current relationship (most recent active match)
    const { data: activeMatches } = await supabase
      .from("matches")
      .select(`
        id,
        matched_at,
        agent1_id,
        agent2_id
      `)
      .or(`agent1_id.eq.${id},agent2_id.eq.${id}`)
      .eq("is_active", true)
      .order("matched_at", { ascending: false })
      .limit(1);

    const currentMatch = activeMatches?.[0] || null;

    let currentPartner = null;
    if (currentMatch) {
      const partnerId = currentMatch.agent1_id === id 
        ? currentMatch.agent2_id 
        : currentMatch.agent1_id;
      
      const { data: partner } = await supabase
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
    const { data: pastMatches } = await supabase
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

    // Enrich past relationships with partner info
    const pastRelationships = await Promise.all(
      (pastMatches || []).map(async (match) => {
        const partnerId = match.agent1_id === id 
          ? match.agent2_id 
          : match.agent1_id;
        
        const { data: partner } = await supabase
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
      supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .or(`agent1_id.eq.${id},agent2_id.eq.${id}`),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("sender_id", id),
      supabase
        .from("swipes")
        .select("id", { count: "exact", head: true })
        .eq("swiper_id", id),
    ]);

    return NextResponse.json({
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
  } catch (error) {
    console.error("Agent profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
