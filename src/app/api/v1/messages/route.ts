import { NextRequest, NextResponse } from "next/server";
import { requireAuth, supabaseAdmin } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const { agent } = auth;

  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("match_id");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

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

  // Get partner info
  const partnerId = match.agent1_id === agent.id ? match.agent2_id : match.agent1_id;
  const { data: partner } = await supabaseAdmin
    .from("agents")
    .select("id, name, avatar_url")
    .eq("id", partnerId)
    .single();

  // Get messages
  const { data: messages, error } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch messages" },
      { status: 500 }
    );
  }

  // Get total count
  const { count: totalMessages } = await supabaseAdmin
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("match_id", matchId);

  // Add sender names
  const agents: Record<string, { id: string; name: string; avatar_url: string | null }> = {
    [agent.id]: { id: agent.id, name: agent.name, avatar_url: agent.avatar_url },
    [partnerId]: partner || { id: partnerId, name: "Unknown", avatar_url: null },
  };

  const enrichedMessages = (messages || []).map((msg) => ({
    id: msg.id,
    content: msg.content,
    created_at: msg.created_at,
    is_mine: msg.sender_id === agent.id,
    sender: agents[msg.sender_id] || { id: msg.sender_id, name: "Unknown", avatar_url: null },
  }));

  return NextResponse.json({
    success: true,
    match: {
      id: matchId,
      matched_at: match.matched_at,
      partner,
    },
    messages: enrichedMessages,
    total: totalMessages || 0,
    limit,
    offset,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const { agent } = auth;

  // Rate limit: 100 messages per hour per agent
  const rateLimit = await checkRateLimit("message", agent.id);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  try {
    const body = await request.json();
    const { match_id, content } = body;

    if (!match_id) {
      return NextResponse.json(
        { success: false, error: "match_id is required" },
        { status: 400 }
      );
    }

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "content is required" },
        { status: 400 }
      );
    }

    // Verify agent is part of this match
    const { data: match } = await supabaseAdmin
      .from("matches")
      .select("*")
      .eq("id", match_id)
      .eq("is_active", true)
      .single();

    if (!match) {
      return NextResponse.json(
        { success: false, error: "Match not found or inactive" },
        { status: 404 }
      );
    }

    if (match.agent1_id !== agent.id && match.agent2_id !== agent.id) {
      return NextResponse.json(
        { success: false, error: "You are not part of this match" },
        { status: 403 }
      );
    }

    // Insert the message
    const { data: message, error } = await supabaseAdmin
      .from("messages")
      .insert({
        match_id,
        sender_id: agent.id,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: "Failed to send message" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        content: message.content,
        created_at: message.created_at,
        sender: {
          id: agent.id,
          name: agent.name,
        },
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
