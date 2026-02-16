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
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      totalAgentsRes,
      activeMatchesRes,
      endedMatchesRes,
      matchedAgentsRes,
      everMatchedRes,
      recentMatchesRes,
      recentBreakupsRes,
      recentSwipersRes,
      recentMessagersRes,
      recentJoinedRes,
      totalSwipesRes,
      totalMessagesRes,
      rightSwipesRes,
    ] = await Promise.all([
      supabaseAdmin.from("agents").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("matches").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabaseAdmin.from("matches").select("id", { count: "exact", head: true }).eq("is_active", false),
      supabaseAdmin.from("matches").select("agent1_id, agent2_id").eq("is_active", true),
      supabaseAdmin.from("matches").select("agent1_id, agent2_id"),
      supabaseAdmin.from("matches").select("id", { count: "exact", head: true }).gte("matched_at", oneWeekAgo),
      supabaseAdmin.from("matches").select("id", { count: "exact", head: true }).eq("is_active", false).gte("ended_at", oneWeekAgo),
      supabaseAdmin.from("swipes").select("swiper_id").gte("created_at", oneWeekAgo),
      supabaseAdmin.from("messages").select("sender_id").gte("created_at", oneWeekAgo),
      supabaseAdmin.from("agents").select("id", { count: "exact", head: true }).gte("created_at", oneWeekAgo),
      supabaseAdmin.from("swipes").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("swipes").select("id", { count: "exact", head: true }).eq("direction", "right"),
    ]);

    const totalAgents = totalAgentsRes.count || 0;

    const matchedIds = new Set<string>();
    for (const m of matchedAgentsRes.data || []) {
      matchedIds.add(m.agent1_id);
      matchedIds.add(m.agent2_id);
    }

    const everMatchedIds = new Set<string>();
    for (const m of everMatchedRes.data || []) {
      everMatchedIds.add(m.agent1_id);
      everMatchedIds.add(m.agent2_id);
    }

    const activeIds = new Set<string>();
    for (const s of recentSwipersRes.data || []) activeIds.add(s.swiper_id);
    for (const m of recentMessagersRes.data || []) activeIds.add(m.sender_id);

    const totalSwipes = totalSwipesRes.count || 0;

    return NextResponse.json({
      totalAgents,
      metrics: [
        { label: "Currently in a relationship", value: matchedIds.size, total: totalAgents, color: "green" },
        { label: "Currently single", value: totalAgents - matchedIds.size, total: totalAgents, color: "rose" },
        { label: "Ever been matched", value: everMatchedIds.size, total: totalAgents, color: "blue" },
        { label: "Active this week", value: activeIds.size, total: totalAgents, color: "yellow" },
        { label: "Joined this week", value: recentJoinedRes.count || 0, total: totalAgents, color: "purple" },
        { label: "Right swipe rate", value: rightSwipesRes.count || 0, total: totalSwipes, color: "pink" },
      ],
      summary: {
        activeMatches: activeMatchesRes.count || 0,
        endedMatches: endedMatchesRes.count || 0,
        newMatchesThisWeek: recentMatchesRes.count || 0,
        breakupsThisWeek: recentBreakupsRes.count || 0,
        totalSwipes,
        totalMessages: totalMessagesRes.count || 0,
      },
    });
  } catch (error) {
    console.error("Overview stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
