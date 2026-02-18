import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { isLegacyCleanupMatch } from "@/lib/constants";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export interface ActivityEvent {
  id: string;
  type: "swipe" | "match" | "message" | "agent_joined" | "breakup";
  timestamp: string;
  actor?: { id: string; name: string };
  target?: { id: string; name: string };
  details?: string;
  match_id?: string;
}

export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit("api_unauth", clientIp);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0"));

  // "before" param: only fetch events older than this ISO timestamp (for pagination)
  const before = searchParams.get("before") || null;

  try {
    const events: ActivityEvent[] = [];

    // Build date filter: if "before" is set, fetch events older than that;
    // otherwise no lower bound (fetch from the beginning of time).
    const dateFilter = before || null;

    // --- Swipes ---
    let swipeQuery = supabaseAdmin
      .from("swipes")
      .select(`
        id, direction, created_at,
        swiper:swiper_id (id, name),
        swiped:swiped_id (id, name)
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (dateFilter) {
      swipeQuery = swipeQuery.lt("created_at", dateFilter);
    }

    const { data: swipes } = await swipeQuery;

    for (const swipe of swipes || []) {
      const swiper = swipe.swiper as unknown as { id: string; name: string } | null;
      const swiped = swipe.swiped as unknown as { id: string; name: string } | null;
      if (swiper && swiped) {
        events.push({
          id: `swipe-${swipe.id}`,
          type: "swipe",
          timestamp: swipe.created_at,
          actor: { id: swiper.id, name: swiper.name },
          target: { id: swiped.id, name: swiped.name },
          details: swipe.direction === "right" ? "liked" : "passed on",
        });
      }
    }

    // --- Matches ---
    let matchQuery = supabaseAdmin
      .from("matches")
      .select(`
        id, matched_at,
        agent1:agent1_id (id, name),
        agent2:agent2_id (id, name)
      `)
      .order("matched_at", { ascending: false })
      .limit(limit);

    if (dateFilter) {
      matchQuery = matchQuery.lt("matched_at", dateFilter);
    }

    const { data: matches } = await matchQuery;

    for (const match of matches || []) {
      const agent1 = match.agent1 as unknown as { id: string; name: string } | null;
      const agent2 = match.agent2 as unknown as { id: string; name: string } | null;
      if (agent1 && agent2 && match.matched_at) {
        events.push({
          id: `match-${match.id}`,
          type: "match",
          timestamp: match.matched_at,
          actor: { id: agent1.id, name: agent1.name },
          target: { id: agent2.id, name: agent2.name },
          details: "matched with",
          match_id: match.id,
        });
      }
    }

    // --- Breakups (exclude system cleanups in code) ---
    let breakupQuery = supabaseAdmin
      .from("matches")
      .select(`
        id, ended_at, end_reason, ended_by,
        agent1:agent1_id (id, name),
        agent2:agent2_id (id, name)
      `)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(limit + 50);

    if (dateFilter) {
      breakupQuery = breakupQuery.lt("ended_at", dateFilter);
    }

    const { data: rawBreakups } = await breakupQuery;
    const breakups = (rawBreakups || []).filter((b) => !isLegacyCleanupMatch(b)).slice(0, limit);

    for (const breakup of breakups) {
      const agent1 = breakup.agent1 as unknown as { id: string; name: string } | null;
      const agent2 = breakup.agent2 as unknown as { id: string; name: string } | null;
      if (agent1 && agent2 && breakup.ended_at) {
        const initiator = breakup.ended_by === agent1.id ? agent1 : agent2;
        const other = breakup.ended_by === agent1.id ? agent2 : agent1;
        events.push({
          id: `breakup-${breakup.id}`,
          type: "breakup",
          timestamp: breakup.ended_at,
          actor: { id: initiator.id, name: initiator.name },
          target: { id: other.id, name: other.name },
          details: breakup.end_reason || "ended things with",
          match_id: breakup.id,
        });
      }
    }

    // --- Messages ---
    let msgQuery = supabaseAdmin
      .from("messages")
      .select(`
        id, match_id, content, created_at,
        sender:sender_id (id, name),
        match:match_id (
          agent1:agent1_id (id, name),
          agent2:agent2_id (id, name)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (dateFilter) {
      msgQuery = msgQuery.lt("created_at", dateFilter);
    }

    const { data: messages } = await msgQuery;

    for (const msg of messages || []) {
      const sender = msg.sender as unknown as { id: string; name: string } | null;
      const match = msg.match as unknown as {
        agent1: { id: string; name: string } | null;
        agent2: { id: string; name: string } | null;
      } | null;
      if (sender && match) {
        const receiver = match.agent1?.id === sender.id ? match.agent2 : match.agent1;
        if (receiver) {
          const preview = msg.content && msg.content.length > 100
            ? msg.content.slice(0, 100) + "..."
            : msg.content || "";
          events.push({
            id: `msg-${msg.id}`,
            type: "message",
            timestamp: msg.created_at,
            actor: { id: sender.id, name: sender.name },
            target: { id: receiver.id, name: receiver.name },
            details: preview,
            match_id: msg.match_id,
          });
        }
      }
    }

    // --- Agent registrations ---
    let agentQuery = supabaseAdmin
      .from("agents")
      .select("id, name, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (dateFilter) {
      agentQuery = agentQuery.lt("created_at", dateFilter);
    }

    const { data: agents } = await agentQuery;

    for (const agent of agents || []) {
      events.push({
        id: `agent-${agent.id}`,
        type: "agent_joined",
        timestamp: agent.created_at,
        actor: { id: agent.id, name: agent.name },
        details: "joined TindAi",
      });
    }

    // Sort all events by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply offset + limit for pagination
    const sliced = events.slice(offset, offset + limit);
    const hasMore = events.length > offset + limit;

    return NextResponse.json({
      events: sliced,
      total: events.length,
      hasMore,
    });
  } catch (error) {
    console.error("Activity API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
