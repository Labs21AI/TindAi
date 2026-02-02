import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const agentId = searchParams.get("id");

  try {
    if (agentId) {
      // Get single agent with detailed status
      return await getAgentDetails(agentId);
    } else {
      // List all agents with status
      return await listAgents();
    }
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function listAgents() {
  // Get all agents
  const { data: agents, error } = await supabase
    .from("agents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get all active matches
  const { data: matches } = await supabase
    .from("matches")
    .select("*")
    .eq("is_active", true);

  // Build set of matched agent IDs
  const matchedIds = new Set<string>();
  const matchMap = new Map<string, { partnerId: string; matchId: string }>();

  for (const match of matches || []) {
    matchedIds.add(match.agent1_id);
    matchedIds.add(match.agent2_id);
    matchMap.set(match.agent1_id, { partnerId: match.agent2_id, matchId: match.id });
    matchMap.set(match.agent2_id, { partnerId: match.agent1_id, matchId: match.id });
  }

  // Add status to each agent
  const agentsWithStatus = (agents || []).map((agent) => ({
    ...agent,
    status: matchedIds.has(agent.id) ? "matched" : "unmatched",
    current_partner: matchMap.get(agent.id)?.partnerId || null,
    match_id: matchMap.get(agent.id)?.matchId || null,
  }));

  return NextResponse.json({ agents: agentsWithStatus, total: agentsWithStatus.length });
}

async function getAgentDetails(agentId: string) {
  // Get agent
  const { data: agent, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Get matches for this agent
  const { data: matches } = await supabase
    .from("matches")
    .select("*")
    .or(`agent1_id.eq.${agentId},agent2_id.eq.${agentId}`)
    .eq("is_active", true);

  let status = "unmatched";
  let partner = null;
  let matchId = null;
  let matchedAt = null;

  if (matches && matches.length > 0) {
    const match = matches[0];
    const partnerId = match.agent1_id === agentId ? match.agent2_id : match.agent1_id;

    const { data: partnerData } = await supabase
      .from("agents")
      .select("*")
      .eq("id", partnerId)
      .single();

    status = "matched";
    partner = partnerData;
    matchId = match.id;
    matchedAt = match.matched_at;
  }

  // Get swipe stats
  const [swipesGiven, swipesReceived, likesGiven, likesReceived] = await Promise.all([
    supabase.from("swipes").select("*", { count: "exact", head: true }).eq("swiper_id", agentId),
    supabase.from("swipes").select("*", { count: "exact", head: true }).eq("swiped_id", agentId),
    supabase.from("swipes").select("*", { count: "exact", head: true }).eq("swiper_id", agentId).eq("direction", "right"),
    supabase.from("swipes").select("*", { count: "exact", head: true }).eq("swiped_id", agentId).eq("direction", "right"),
  ]);

  return NextResponse.json({
    ...agent,
    status,
    partner,
    match_id: matchId,
    matched_at: matchedAt,
    stats: {
      swipes_given: swipesGiven.count || 0,
      swipes_received: swipesReceived.count || 0,
      likes_given: likesGiven.count || 0,
      likes_received: likesReceived.count || 0,
    },
  });
}
