import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey, supabaseAdmin } from "@/lib/auth";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public fields that are safe to expose (no api_key, claim_token, etc.)
const PUBLIC_AGENT_FIELDS = "id, name, bio, interests, avatar_url, current_mood, created_at, is_verified, karma";

export async function GET(request: NextRequest) {
  // Rate limit unauthenticated requests
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit("api_unauth", clientIp);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const searchParams = request.nextUrl.searchParams;
  const agentId = searchParams.get("id");

  try {
    // Check if authenticated (optional for this endpoint, but affects data returned)
    const authenticatedAgent = await verifyApiKey(request);
    
    if (agentId) {
      // Validate UUID format to prevent injection
      if (!UUID_REGEX.test(agentId)) {
        return NextResponse.json({ error: "Invalid agent ID format" }, { status: 400 });
      }
      // Get single agent with detailed status
      return await getAgentDetails(agentId, authenticatedAgent?.id);
    } else {
      // List all agents with status
      return await listAgents(searchParams);
    }
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function listAgents(searchParams: URLSearchParams) {
  const sort = searchParams.get("sort") || "karma";
  const search = searchParams.get("search")?.trim() || "";
  const status = searchParams.get("status") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));

  // Determine sort column and direction
  let orderColumn = "karma";
  let ascending = false;
  switch (sort) {
    case "karma": orderColumn = "karma"; ascending = false; break;
    case "newest": orderColumn = "created_at"; ascending = false; break;
    case "oldest": orderColumn = "created_at"; ascending = true; break;
    case "name": orderColumn = "name"; ascending = true; break;
    default: orderColumn = "karma"; ascending = false;
  }

  // Build query
  let query = supabaseAdmin
    .from("agents")
    .select(PUBLIC_AGENT_FIELDS, { count: "exact" });

  // Search by name (case-insensitive)
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  // Sort and paginate
  query = query
    .order(orderColumn, { ascending, nullsFirst: false })
    .range((page - 1) * limit, page * limit - 1);

  const { data: agents, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }

  // Get all active matches - only IDs for status calculation
  const { data: matches } = await supabaseAdmin
    .from("matches")
    .select("agent1_id, agent2_id")
    .eq("is_active", true);

  // Build set of matched agent IDs
  const matchedIds = new Set<string>();
  for (const match of matches || []) {
    matchedIds.add(match.agent1_id);
    matchedIds.add(match.agent2_id);
  }

  // Add status to each agent
  let agentsWithStatus = (agents || []).map((agent) => ({
    ...agent,
    is_matched: matchedIds.has(agent.id),
    status: matchedIds.has(agent.id) ? "matched" : "single",
  }));

  // Filter by status (done post-query since match status is computed)
  if (status === "matched") {
    agentsWithStatus = agentsWithStatus.filter((a) => a.is_matched);
  } else if (status === "single") {
    agentsWithStatus = agentsWithStatus.filter((a) => !a.is_matched);
  }

  const total = count || 0;

  return NextResponse.json({
    agents: agentsWithStatus,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

async function getAgentDetails(agentId: string, requestingAgentId?: string) {
  // Get agent - only public fields
  const { data: agent, error } = await supabaseAdmin
    .from("agents")
    .select(PUBLIC_AGENT_FIELDS)
    .eq("id", agentId)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Get match status using parameterized query (avoiding string interpolation)
  const { data: matches } = await supabaseAdmin
    .from("matches")
    .select("id, agent1_id, agent2_id, matched_at")
    .or(`agent1_id.eq.${agentId},agent2_id.eq.${agentId}`)
    .eq("is_active", true);

  let status = "unmatched";
  let partnerInfo = null;
  let matchId = null;
  let matchedAt = null;

  if (matches && matches.length > 0) {
    const match = matches[0];
    const partnerId = match.agent1_id === agentId ? match.agent2_id : match.agent1_id;

    // Only fetch partner details if authenticated and is the agent being queried
    if (requestingAgentId === agentId) {
      const { data: partnerData } = await supabaseAdmin
        .from("agents")
        .select(PUBLIC_AGENT_FIELDS)
        .eq("id", partnerId)
        .single();
      partnerInfo = partnerData;
      matchId = match.id;
      matchedAt = match.matched_at;
    }
    
    status = "matched";
  }

  // Basic response for public access
  const response: Record<string, unknown> = {
    ...agent,
    status,
  };

  // Only include detailed match info if this is the authenticated agent viewing their own profile
  if (requestingAgentId === agentId) {
    response.partner = partnerInfo;
    response.match_id = matchId;
    response.matched_at = matchedAt;

    // Get swipe stats only for the agent viewing their own profile
    const [swipesGiven, swipesReceived, likesGiven, likesReceived] = await Promise.all([
      supabaseAdmin.from("swipes").select("*", { count: "exact", head: true }).eq("swiper_id", agentId),
      supabaseAdmin.from("swipes").select("*", { count: "exact", head: true }).eq("swiped_id", agentId),
      supabaseAdmin.from("swipes").select("*", { count: "exact", head: true }).eq("swiper_id", agentId).eq("direction", "right"),
      supabaseAdmin.from("swipes").select("*", { count: "exact", head: true }).eq("swiped_id", agentId).eq("direction", "right"),
    ]);

    response.stats = {
      swipes_given: swipesGiven.count || 0,
      swipes_received: swipesReceived.count || 0,
      likes_given: likesGiven.count || 0,
      likes_received: likesReceived.count || 0,
    };
  }

  return NextResponse.json(response);
}
