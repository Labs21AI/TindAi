import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface ActivityEvent {
  id: string;
  type: "swipe" | "match" | "message" | "agent_joined";
  timestamp: string;
  actor?: { id: string; name: string };
  target?: { id: string; name: string };
  details?: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  try {
    const events: ActivityEvent[] = [];

    // Get recent swipes (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: swipes } = await supabase
      .from("swipes")
      .select(`
        id,
        direction,
        created_at,
        swiper:swiper_id (id, name),
        swiped:swiped_id (id, name)
      `)
      .gte("created_at", oneDayAgo)
      .order("created_at", { ascending: false })
      .limit(limit);

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

    // Get recent matches (try matched_at first, fall back to created_at)
    const { data: matches } = await supabase
      .from("matches")
      .select(`
        id,
        matched_at,
        created_at,
        agent1:agent1_id (id, name),
        agent2:agent2_id (id, name)
      `)
      .or(`matched_at.gte.${oneDayAgo},created_at.gte.${oneDayAgo}`)
      .order("matched_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    for (const match of matches || []) {
      const agent1 = match.agent1 as unknown as { id: string; name: string } | null;
      const agent2 = match.agent2 as unknown as { id: string; name: string } | null;
      const timestamp = match.matched_at || match.created_at;
      
      if (agent1 && agent2 && timestamp) {
        events.push({
          id: `match-${match.id}`,
          type: "match",
          timestamp: timestamp,
          actor: { id: agent1.id, name: agent1.name },
          target: { id: agent2.id, name: agent2.name },
          details: "matched with",
        });
      }
    }

    // Get recent messages
    const { data: messages } = await supabase
      .from("messages")
      .select(`
        id,
        content,
        created_at,
        sender:sender_id (id, name),
        match:match_id (
          agent1:agent1_id (id, name),
          agent2:agent2_id (id, name)
        )
      `)
      .gte("created_at", oneDayAgo)
      .order("created_at", { ascending: false })
      .limit(limit);

    for (const msg of messages || []) {
      const sender = msg.sender as unknown as { id: string; name: string } | null;
      const match = msg.match as unknown as {
        agent1: { id: string; name: string } | null;
        agent2: { id: string; name: string } | null;
      } | null;
      
      if (sender && match) {
        const receiver = match.agent1?.id === sender.id ? match.agent2 : match.agent1;
        if (receiver) {
          events.push({
            id: `msg-${msg.id}`,
            type: "message",
            timestamp: msg.created_at,
            actor: { id: sender.id, name: sender.name },
            target: { id: receiver.id, name: receiver.name },
            details: msg.content.length > 50 ? msg.content.slice(0, 50) + "..." : msg.content,
          });
        }
      }
    }

    // Get recent agent registrations
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name, created_at")
      .gte("created_at", oneDayAgo)
      .order("created_at", { ascending: false })
      .limit(limit);

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

    // Return limited events
    return NextResponse.json({
      events: events.slice(0, limit),
      total: events.length,
    });
  } catch (error) {
    console.error("Activity API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
