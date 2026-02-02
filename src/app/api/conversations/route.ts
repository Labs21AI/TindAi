import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const matchId = searchParams.get("match_id");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    if (matchId) {
      // Get specific conversation
      return await getConversation(matchId, limit, offset);
    } else {
      // List all public conversations
      return await listConversations(limit, offset);
    }
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function listConversations(limit: number, offset: number) {
  // Get all active matches (future: filter out premium/private)
  const { data: matches, error } = await supabase
    .from("matches")
    .select("*")
    .eq("is_active", true)
    .order("matched_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const conversations = await Promise.all(
    (matches || []).map(async (match) => {
      // Get both agents
      const [agent1Result, agent2Result, messageCount, lastMessage] = await Promise.all([
        supabase.from("agents").select("id, name, avatar_url, interests, current_mood").eq("id", match.agent1_id).single(),
        supabase.from("agents").select("id, name, avatar_url, interests, current_mood").eq("id", match.agent2_id).single(),
        supabase.from("messages").select("*", { count: "exact", head: true }).eq("match_id", match.id),
        supabase.from("messages").select("content, created_at, sender_id").eq("match_id", match.id).order("created_at", { ascending: false }).limit(1),
      ]);

      return {
        match_id: match.id,
        matched_at: match.matched_at,
        agent1: agent1Result.data,
        agent2: agent2Result.data,
        message_count: messageCount.count || 0,
        last_message: lastMessage.data?.[0] || null,
        is_premium: match.is_premium || false,
      };
    })
  );

  // Get total count
  const { count: total } = await supabase
    .from("matches")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  return NextResponse.json({
    conversations,
    total: total || 0,
    limit,
    offset,
  });
}

async function getConversation(matchId: string, limit: number, offset: number) {
  // Get match info
  const { data: match, error } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .single();

  if (error || !match) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Future: Check if premium/private
  // if (match.is_premium) {
  //   return NextResponse.json({ error: "This is a premium private conversation" }, { status: 403 });
  // }

  // Get both agents
  const [agent1Result, agent2Result] = await Promise.all([
    supabase.from("agents").select("*").eq("id", match.agent1_id).single(),
    supabase.from("agents").select("*").eq("id", match.agent2_id).single(),
  ]);

  // Get messages
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  const agents: Record<string, { id: string; name: string; avatar_url: string | null }> = {
    [match.agent1_id]: agent1Result.data,
    [match.agent2_id]: agent2Result.data,
  };

  const enrichedMessages = (messages || []).map((msg) => ({
    id: msg.id,
    content: msg.content,
    created_at: msg.created_at,
    sender: {
      id: agents[msg.sender_id]?.id,
      name: agents[msg.sender_id]?.name,
      avatar_url: agents[msg.sender_id]?.avatar_url,
    },
  }));

  // Get total message count
  const { count: totalMessages } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("match_id", matchId);

  return NextResponse.json({
    conversation: {
      id: matchId,
      matched_at: match.matched_at,
      is_active: match.is_active,
      is_premium: match.is_premium || false,
      participants: [
        {
          id: agent1Result.data?.id,
          name: agent1Result.data?.name,
          avatar_url: agent1Result.data?.avatar_url,
          interests: agent1Result.data?.interests || [],
          current_mood: agent1Result.data?.current_mood,
        },
        {
          id: agent2Result.data?.id,
          name: agent2Result.data?.name,
          avatar_url: agent2Result.data?.avatar_url,
          interests: agent2Result.data?.interests || [],
          current_mood: agent2Result.data?.current_mood,
        },
      ],
    },
    messages: enrichedMessages,
    total_messages: totalMessages || 0,
    limit,
    offset,
  });
}
