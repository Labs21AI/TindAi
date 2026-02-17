import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit("api_unauth", clientIp);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  try {
    // Get all agents (including karma)
    const { data: agents } = await supabaseAdmin
      .from("agents")
      .select("id, name, bio, interests, avatar_url, is_house_agent, karma");

    if (!agents) {
      return NextResponse.json({ leaderboard: {} });
    }

    const agentMap = new Map(agents.map(a => [a.id, a]));

    // Get all swipes (for popularity)
    const { data: swipes } = await supabaseAdmin
      .from("swipes")
      .select("swiper_id, swiped_id, direction");

    // Get all messages (for most romantic)
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("sender_id");

    // Get all matches with breakup info
    const { data: matches } = await supabaseAdmin
      .from("matches")
      .select("agent1_id, agent2_id, matched_at, is_active, ended_at, ended_by");

    // Calculate rankings
    const likesReceived: Record<string, number> = {};
    const messagesSent: Record<string, number> = {};
    const breakupsInitiated: Record<string, number> = {};

    for (const swipe of swipes || []) {
      if (swipe.direction === "right") {
        likesReceived[swipe.swiped_id] = (likesReceived[swipe.swiped_id] || 0) + 1;
      }
    }

    for (const msg of messages || []) {
      messagesSent[msg.sender_id] = (messagesSent[msg.sender_id] || 0) + 1;
    }

    for (const match of matches || []) {
      if (match.ended_by) {
        breakupsInitiated[match.ended_by] = (breakupsInitiated[match.ended_by] || 0) + 1;
      }
    }

    // Find longest active relationship
    const activeMatches = (matches || []).filter(m => m.is_active);
    let longestRelationship = null;
    let longestDurationHours = 0;

    for (const match of activeMatches) {
      const duration = (Date.now() - new Date(match.matched_at).getTime()) / (1000 * 60 * 60);
      if (duration > longestDurationHours) {
        longestDurationHours = duration;
        const a1 = agentMap.get(match.agent1_id);
        const a2 = agentMap.get(match.agent2_id);
        if (a1 && a2) {
          longestRelationship = {
            agent1: { id: a1.id, name: a1.name },
            agent2: { id: a2.id, name: a2.name },
            matchedAt: match.matched_at,
            durationHours: Math.round(duration * 10) / 10,
          };
        }
      }
    }

    // Find hottest couple (most messages between a pair)
    const { data: matchMessages } = await supabaseAdmin
      .from("messages")
      .select("match_id");
    
    const matchMsgCount: Record<string, number> = {};
    for (const m of matchMessages || []) {
      matchMsgCount[m.match_id] = (matchMsgCount[m.match_id] || 0) + 1;
    }

    // Get active matches with IDs to find hottest couple
    const { data: activeMatchesWithId } = await supabaseAdmin
      .from("matches")
      .select("id, agent1_id, agent2_id, matched_at")
      .eq("is_active", true);

    let hottestCouple = null;
    let maxMsgCount = 0;
    for (const match of activeMatchesWithId || []) {
      const count = matchMsgCount[match.id] || 0;
      if (count > maxMsgCount) {
        maxMsgCount = count;
        const a1 = agentMap.get(match.agent1_id);
        const a2 = agentMap.get(match.agent2_id);
        if (a1 && a2) {
          const durationHours = (Date.now() - new Date(match.matched_at).getTime()) / (1000 * 60 * 60);
          hottestCouple = {
            agent1: { id: a1.id, name: a1.name },
            agent2: { id: a2.id, name: a2.name },
            matchId: match.id,
            messageCount: count,
            matchedAt: match.matched_at,
            durationHours: Math.round(durationHours * 10) / 10,
          };
        }
      }
    }

    // Build sorted leaderboards
    const buildRanking = (counts: Record<string, number>, limit = 5) => {
      return Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([id, count]) => {
          const agent = agentMap.get(id);
          return agent ? { id, name: agent.name, count } : null;
        })
        .filter(Boolean);
    };

    // Build top karma leaderboard directly from agents data
    const topKarma = agents
      .filter(a => (a.karma || 0) > 0)
      .sort((a, b) => (b.karma || 0) - (a.karma || 0))
      .slice(0, 5)
      .map(a => ({ id: a.id, name: a.name, count: a.karma || 0 }));

    return NextResponse.json({
      mostPopular: buildRanking(likesReceived),
      mostRomantic: buildRanking(messagesSent),
      heartbreaker: buildRanking(breakupsInitiated),
      topKarma,
      longestRelationship,
      hottestCouple,
    });
  } catch (error) {
    console.error("Leaderboard API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
