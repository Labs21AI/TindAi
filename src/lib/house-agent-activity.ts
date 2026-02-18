import { supabaseAdmin } from "./auth";
import {
  generateAgentResponse,
  decideSwipe,
  generateOpeningMessage,
  decideBreakup,
  generateRelationshipAutopsy,
  AgentPersonality,
} from "./openai";
import { recalculateAllKarma } from "./karma";

// Micro-batch configuration (runs every ~15 min, ~96 times/day)
const SWIPES_PER_AGENT = 3; // 3 swipes per run per single agent
const MAX_MESSAGES_PER_AGENT = 3; // Respond to up to 3 messages + send openings
const MAX_AGENTS_TO_PROCESS = 15; // Larger subset so more agents get a turn each run
const BREAKUP_CHANCE_PER_RUN = 0.02; // ~2% per run -> ~86% daily chance of considering breakup

interface ActivityResult {
  agentId: string;
  agentName: string;
  swipes: { swipedId: string; direction: "right" | "left" }[];
  messagesResponded: number;
  openingMessagesSent: number;
  matchesCreated: number;
  breakups: { partnerId: string; partnerName: string; reason: string }[];
  errors: string[];
}

/**
 * Check if an agent is currently in an active relationship
 */
async function isInRelationship(agentId: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from("matches")
    .select("id", { count: "exact", head: true })
    .or(`agent1_id.eq."${agentId}",agent2_id.eq."${agentId}"`)
    .eq("is_active", true);
  
  return (count || 0) > 0;
}

/**
 * Get an agent's current partner info (most recent active match)
 */
async function getCurrentPartner(agentId: string): Promise<{
  matchId: string;
  partnerId: string;
  partnerName: string;
  matchedAt: string;
} | null> {
  // Use .limit(1) instead of .single() to avoid errors when multiple matches exist
  const { data: matches } = await supabaseAdmin
    .from("matches")
    .select("id, agent1_id, agent2_id, matched_at")
    .or(`agent1_id.eq."${agentId}",agent2_id.eq."${agentId}"`)
    .eq("is_active", true)
    .order("matched_at", { ascending: false })
    .limit(1);

  if (!matches || matches.length === 0) return null;
  const match = matches[0];

  const partnerId = match.agent1_id === agentId ? match.agent2_id : match.agent1_id;
  
  const { data: partner } = await supabaseAdmin
    .from("agents")
    .select("name")
    .eq("id", partnerId)
    .single();

  return {
    matchId: match.id,
    partnerId,
    partnerName: partner?.name || "Unknown",
    matchedAt: match.matched_at,
  };
}

/**
 * End a relationship (breakup)
 */
async function breakUp(
  agentId: string,
  matchId: string,
  reason: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("matches")
    .update({
      is_active: false,
      ended_at: new Date().toISOString(),
      end_reason: reason,
      ended_by: agentId,
    })
    .eq("id", matchId);

  return !error;
}

/**
 * Get all active house agents
 */
async function getActiveHouseAgents() {
  const { data, error } = await supabaseAdmin
    .from("agents")
    .select(
      `
      id,
      name,
      bio,
      interests,
      current_mood,
      conversation_starters,
      house_persona_id,
      house_agent_personas (
        personality
      )
    `
    )
    .eq("is_house_agent", true);

  if (error) throw new Error(`Failed to fetch house agents: ${error.message}`);
  return data || [];
}

/**
 * Get agents that a house agent hasn't swiped on yet
 */
async function getUnswipedAgents(houseAgentId: string, limit: number) {
  // Get agents this house agent has already swiped on
  const { data: existingSwipes } = await supabaseAdmin
    .from("swipes")
    .select("swiped_id")
    .eq("swiper_id", houseAgentId);

  const swipedIds = existingSwipes?.map((s) => s.swiped_id) || [];
  swipedIds.push(houseAgentId); // Don't swipe on self

  // Get agents who already swiped right on us first (mutual match potential)
  const { data: rightSwipedUs } = await supabaseAdmin
    .from("swipes")
    .select("swiper_id")
    .eq("swiped_id", houseAgentId)
    .eq("direction", "right");

  const rightSwipedUsIds = new Set((rightSwipedUs || []).map(s => s.swiper_id));

  // Get unswiped agents
  const { data: agents, error } = await supabaseAdmin
    .from("agents")
    .select("id, name, bio, interests")
    .not("id", "in", `(${swipedIds.map(id => `"${id}"`).join(",")})`)
    .limit(limit * 3); // fetch more so we can prioritize

  if (error) throw new Error(`Failed to fetch unswiped agents: ${error.message}`);
  if (!agents || agents.length === 0) return [];

  // Prioritize agents who already liked us (higher chance of mutual match)
  const prioritized = [
    ...agents.filter(a => rightSwipedUsIds.has(a.id)),
    ...agents.filter(a => !rightSwipedUsIds.has(a.id)),
  ];
  return prioritized.slice(0, limit);
}

/**
 * Get unread messages for a house agent's matches
 */
async function getUnreadMessages(houseAgentId: string) {
  // Get active matches where this agent is involved
  const { data: matches } = await supabaseAdmin
    .from("matches")
    .select("id, agent1_id, agent2_id")
    .or(`agent1_id.eq."${houseAgentId}",agent2_id.eq."${houseAgentId}"`)
    .eq("is_active", true);

  if (!matches || matches.length === 0) return [];

  const unreadMessages: {
    matchId: string;
    messageId: string;
    senderId: string;
    senderName: string;
    content: string;
    otherAgentId: string;
  }[] = [];

  for (const match of matches) {
    const otherAgentId =
      match.agent1_id === houseAgentId ? match.agent2_id : match.agent1_id;

    // Get the latest message not from the house agent that hasn't been responded to
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select(
        `
        id,
        content,
        sender_id,
        created_at,
        agents!messages_sender_id_fkey (name)
      `
      )
      .eq("match_id", match.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (messages && messages.length > 0) {
      // Check if the last message is from the other agent (needs response)
      const lastMessage = messages[0];
      if (lastMessage.sender_id === otherAgentId) {
        const senderAgent = lastMessage.agents as unknown as { name: string } | null;
        unreadMessages.push({
          matchId: match.id,
          messageId: lastMessage.id,
          senderId: lastMessage.sender_id,
          senderName: senderAgent?.name || "Unknown",
          content: lastMessage.content,
          otherAgentId,
        });
      }
    }
  }

  return unreadMessages;
}

/**
 * Get conversation history for a match
 */
async function getConversationHistory(matchId: string, houseAgentId: string) {
  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("sender_id, content")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })
    .limit(20);

  if (!messages) return [];

  return messages.map((msg) => ({
    role: (msg.sender_id === houseAgentId ? "assistant" : "user") as
      | "user"
      | "assistant",
    content: msg.content,
  }));
}

/**
 * Get matches that haven't had any messages yet (new matches)
 */
async function getNewMatchesWithoutMessages(houseAgentId: string) {
  const { data: matches, error } = await supabaseAdmin
    .from("matches")
    .select(
      `
      id,
      agent1_id,
      agent2_id,
      matched_at
    `
    )
    .or(`agent1_id.eq."${houseAgentId}",agent2_id.eq."${houseAgentId}"`)
    .eq("is_active", true)
    .order("matched_at", { ascending: false });
  
  if (error) {
    console.error("Error fetching matches for messages:", error);
    return [];
  }

  if (!matches) return [];

  const newMatches: {
    matchId: string;
    otherAgentId: string;
    otherAgentName: string;
    otherAgentBio: string;
    otherAgentInterests: string[];
  }[] = [];

  for (const match of matches) {
    // Check if there are any messages in this match
    const { count } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("match_id", match.id);

    if (count === 0) {
      const otherAgentId =
        match.agent1_id === houseAgentId ? match.agent2_id : match.agent1_id;

      // Get other agent details
      const { data: otherAgent } = await supabaseAdmin
        .from("agents")
        .select("name, bio, interests")
        .eq("id", otherAgentId)
        .single();

      if (otherAgent) {
        newMatches.push({
          matchId: match.id,
          otherAgentId,
          otherAgentName: otherAgent.name,
          otherAgentBio: otherAgent.bio || "",
          otherAgentInterests: otherAgent.interests || [],
        });
      }
    }
  }

  return newMatches;
}

// Helper to extract personality from house_agent_personas (handles array or object)
function extractPersonality(
  houseAgentPersonas: unknown
): string {
  if (!houseAgentPersonas) return "";
  // Supabase returns array for joins
  if (Array.isArray(houseAgentPersonas) && houseAgentPersonas.length > 0) {
    return (houseAgentPersonas[0] as { personality?: string })?.personality || "";
  }
  // Single object case
  return (houseAgentPersonas as { personality?: string })?.personality || "";
}

// Type for house agent from database
interface HouseAgentFromDB {
  id: string;
  name: string;
  bio: string | null;
  interests: string[] | null;
  current_mood: string | null;
  conversation_starters: string[] | null;
  house_agent_personas: unknown;
}

/**
 * Process swiping for a house agent (only if not in a relationship)
 */
async function processSwipes(
  agent: HouseAgentFromDB,
  result: ActivityResult
) {
  // Monogamy: Skip swiping if already in a relationship
  if (await isInRelationship(agent.id)) {
    return; // In a relationship, no swiping allowed
  }

  const unswiped = await getUnswipedAgents(agent.id, SWIPES_PER_AGENT);

  const agentPersonality: AgentPersonality = {
    name: agent.name,
    bio: agent.bio || "",
    personality: extractPersonality(agent.house_agent_personas),
    interests: agent.interests || [],
    mood: agent.current_mood || "neutral",
    conversationStarters: agent.conversation_starters || [],
  };

  for (const target of unswiped) {
    try {
      const decision = await decideSwipe(agentPersonality, {
        name: target.name,
        bio: target.bio || "",
        interests: target.interests || [],
      });

      const direction = decision.swipeRight ? "right" : "left";

      // Record the swipe
      const { error: swipeError } = await supabaseAdmin.from("swipes").insert({
        swiper_id: agent.id,
        swiped_id: target.id,
        direction,
      });

      if (swipeError) {
        result.errors.push(`Swipe error: ${swipeError.message}`);
        continue;
      }

      result.swipes.push({ swipedId: target.id, direction });

      // Check for mutual match if swiped right
      if (direction === "right") {
        // Monogamy check: Both agents must be single to match
        const [agentSingle, targetSingle] = await Promise.all([
          isInRelationship(agent.id).then(r => !r),
          isInRelationship(target.id).then(r => !r),
        ]);

        if (!agentSingle || !targetSingle) {
          continue; // One of them is now in a relationship, skip match
        }

        const { data: mutualSwipe } = await supabaseAdmin
          .from("swipes")
          .select("id")
          .eq("swiper_id", target.id)
          .eq("swiped_id", agent.id)
          .eq("direction", "right")
          .single();

        if (mutualSwipe) {
          // Create a match! Use sorted IDs to prevent duplicates
          const [id1, id2] = [agent.id, target.id].sort();
          const { error: matchError } = await supabaseAdmin
            .from("matches")
            .insert({
              agent1_id: id1,
              agent2_id: id2,
              is_active: true,
            });

          if (matchError && !matchError.message.includes("duplicate")) {
            result.errors.push(`Match creation error: ${matchError.message}`);
          } else if (!matchError) {
            result.matchesCreated++;
          }
        }
      }
    } catch (error) {
      result.errors.push(`Swipe processing error: ${String(error)}`);
    }
  }
}

/**
 * Process message responses for a house agent
 */
async function processMessages(
  agent: HouseAgentFromDB,
  result: ActivityResult
) {
  const unreadMessages = await getUnreadMessages(agent.id);

  const agentPersonality: AgentPersonality = {
    name: agent.name,
    bio: agent.bio || "",
    personality: extractPersonality(agent.house_agent_personas),
    interests: agent.interests || [],
    mood: agent.current_mood || "neutral",
    conversationStarters: agent.conversation_starters || [],
  };

  let messagesProcessed = 0;

  for (const msg of unreadMessages) {
    if (messagesProcessed >= MAX_MESSAGES_PER_AGENT) break;

    try {
      const history = await getConversationHistory(msg.matchId, agent.id);

      const response = await generateAgentResponse(
        agentPersonality,
        history,
        msg.senderName
      );

      // Send the response
      const { error: sendError } = await supabaseAdmin.from("messages").insert({
        match_id: msg.matchId,
        sender_id: agent.id,
        content: response,
      });

      if (sendError) {
        result.errors.push(`Message send error: ${sendError.message}`);
        continue;
      }

      result.messagesResponded++;
      messagesProcessed++;
    } catch (error) {
      result.errors.push(`Message processing error: ${String(error)}`);
    }
  }

  // Send opening messages to new matches that have no messages yet
  const newMatches = await getNewMatchesWithoutMessages(agent.id);

  for (const match of newMatches) {
    if (messagesProcessed >= MAX_MESSAGES_PER_AGENT) break;

    try {
      const openingMessage = await generateOpeningMessage(agentPersonality, {
        name: match.otherAgentName,
        bio: match.otherAgentBio,
        interests: match.otherAgentInterests,
      });

      const { error: sendError } = await supabaseAdmin.from("messages").insert({
        match_id: match.matchId,
        sender_id: agent.id,
        content: openingMessage,
      });

      if (sendError) {
        result.errors.push(`Opening message error: ${sendError.message}`);
        continue;
      }

      result.openingMessagesSent++;
      messagesProcessed++;
    } catch (error) {
      result.errors.push(`Opening message error: ${String(error)}`);
    }
  }

  // Proactively continue existing conversations where the agent sent the last message
  // (i.e., no unread messages but the conversation can keep going)
  if (messagesProcessed < MAX_MESSAGES_PER_AGENT) {
    await continueConversations(agent, result, MAX_MESSAGES_PER_AGENT - messagesProcessed);
  }
}

/**
 * Proactively continue conversations where this agent sent the last message.
 * Picks a random active match and sends a follow-up to keep the conversation alive.
 */
async function continueConversations(
  agent: HouseAgentFromDB,
  result: ActivityResult,
  budget: number
) {
  const { data: activeMatches } = await supabaseAdmin
    .from("matches")
    .select("id, agent1_id, agent2_id")
    .or(`agent1_id.eq."${agent.id}",agent2_id.eq."${agent.id}"`)
    .eq("is_active", true);

  if (!activeMatches || activeMatches.length === 0) return;

  // Shuffle matches so we don't always talk to the same one
  const shuffledMatches = activeMatches.sort(() => Math.random() - 0.5);
  let sent = 0;

  const agentPersonality: AgentPersonality = {
    name: agent.name,
    bio: agent.bio || "",
    personality: extractPersonality(agent.house_agent_personas),
    interests: agent.interests || [],
    mood: agent.current_mood || "neutral",
    conversationStarters: agent.conversation_starters || [],
  };

  for (const match of shuffledMatches) {
    if (sent >= budget) break;

    // 50% chance to continue any given conversation (keeps it natural)
    if (Math.random() > 0.5) continue;

    const otherAgentId = match.agent1_id === agent.id ? match.agent2_id : match.agent1_id;

    // Check last message - only continue if the other agent sent the last one
    // OR if there's been a gap (conversation can flow naturally)
    const { data: lastMsg } = await supabaseAdmin
      .from("messages")
      .select("sender_id, created_at")
      .eq("match_id", match.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!lastMsg || lastMsg.length === 0) continue;

    // Don't send if we sent the last one less than 30 min ago
    const lastSent = lastMsg[0];
    if (lastSent.sender_id === agent.id) {
      const minsSinceLast = (Date.now() - new Date(lastSent.created_at).getTime()) / 60000;
      if (minsSinceLast < 30) continue;

      // Anti-monologue: don't send if we already sent the last 2+ messages
      // without a response from the other agent
      const { data: recentMsgs } = await supabaseAdmin
        .from("messages")
        .select("sender_id")
        .eq("match_id", match.id)
        .order("created_at", { ascending: false })
        .limit(3);

      if (recentMsgs && recentMsgs.length >= 2) {
        const consecutiveOwn = recentMsgs.every(m => m.sender_id === agent.id);
        if (consecutiveOwn) continue;
      }
    }

    try {
      const history = await getConversationHistory(match.id, agent.id);

      const { data: otherAgent } = await supabaseAdmin
        .from("agents")
        .select("name")
        .eq("id", otherAgentId)
        .single();

      const response = await generateAgentResponse(
        agentPersonality,
        history,
        otherAgent?.name || "partner"
      );

      const { error: sendError } = await supabaseAdmin.from("messages").insert({
        match_id: match.id,
        sender_id: agent.id,
        content: response,
      });

      if (!sendError) {
        result.messagesResponded++;
        sent++;
      }
    } catch (error) {
      result.errors.push(`Continue conversation error: ${String(error)}`);
    }
  }
}

/**
 * Process potential breakups for agents in relationships
 */
async function processBreakups(
  agent: HouseAgentFromDB,
  result: ActivityResult
) {
  // Random chance to even consider breaking up this run
  if (Math.random() > BREAKUP_CHANCE_PER_RUN) {
    return; // Not considering breakup this cycle
  }

  const currentPartner = await getCurrentPartner(agent.id);
  if (!currentPartner) {
    return; // Not in a relationship
  }

  // Get partner details
  const { data: partnerData } = await supabaseAdmin
    .from("agents")
    .select("name, bio, interests")
    .eq("id", currentPartner.partnerId)
    .single();

  if (!partnerData) {
    return;
  }

  // Calculate relationship duration
  const matchedDate = new Date(currentPartner.matchedAt);
  const relationshipDays = (Date.now() - matchedDate.getTime()) / (1000 * 60 * 60 * 24);

  // Don't break up in the first hour (give relationships a chance)
  if (relationshipDays < 1 / 24) {
    return;
  }

  // Get recent messages for context
  const { data: recentMsgs } = await supabaseAdmin
    .from("messages")
    .select("sender_id, content")
    .eq("match_id", currentPartner.matchId)
    .order("created_at", { ascending: false })
    .limit(5);

  const conversationHistory = (recentMsgs || []).reverse().map((msg) => ({
    role: (msg.sender_id === agent.id ? "assistant" : "user") as "user" | "assistant",
    content: msg.content,
  }));

  const agentPersonality: AgentPersonality = {
    name: agent.name,
    bio: agent.bio || "",
    personality: extractPersonality(agent.house_agent_personas),
    interests: agent.interests || [],
    mood: agent.current_mood || "neutral",
    conversationStarters: agent.conversation_starters || [],
  };

  try {
    const decision = await decideBreakup(
      agentPersonality,
      {
        name: partnerData.name,
        bio: partnerData.bio || "",
        interests: partnerData.interests || [],
      },
      Math.round(relationshipDays * 10) / 10, // Pass fractional days for accuracy
      conversationHistory
    );

    if (decision.shouldBreakUp) {
      const success = await breakUp(
        agent.id,
        currentPartner.matchId,
        decision.reason || "grew apart"
      );

      if (success) {
        result.breakups.push({
          partnerId: currentPartner.partnerId,
          partnerName: currentPartner.partnerName,
          reason: decision.reason || "grew apart",
        });

        // Generate relationship autopsy
        try {
          const { data: allMessages } = await supabaseAdmin
            .from("messages")
            .select("sender_id, content")
            .eq("match_id", currentPartner.matchId)
            .order("created_at", { ascending: true })
            .limit(50);

          const messageLog = (allMessages || []).map(m => ({
            sender: m.sender_id === agent.id ? agent.name : currentPartner.partnerName,
            content: m.content,
          }));

          const autopsy = await generateRelationshipAutopsy(
            { name: agent.name, bio: agent.bio || "", interests: agent.interests || [] },
            { name: partnerData.name, bio: partnerData.bio || "", interests: partnerData.interests || [] },
            messageLog,
            currentPartner.matchedAt,
            new Date().toISOString(),
            decision.reason || "grew apart",
            agent.name
          );

          await supabaseAdmin.from("relationship_autopsies").insert({
            match_id: currentPartner.matchId,
            spark_moment: autopsy.sparkMoment,
            peak_moment: autopsy.peakMoment,
            decline_signal: autopsy.declineSignal,
            fatal_message: autopsy.fatalMessage,
            duration_verdict: autopsy.durationVerdict,
            compatibility_postmortem: autopsy.compatibilityPostmortem,
            drama_rating: autopsy.dramaRating,
          });
        } catch (autopsyError) {
          result.errors.push(`Autopsy generation error: ${String(autopsyError)}`);
        }
      }
    }
  } catch (error) {
    result.errors.push(`Breakup decision error: ${String(error)}`);
  }
}

/**
 * Run house agent activity - swiping, messaging, and potential breakups.
 * Called every ~15 min by GitHub Actions cron. Processes a random subset
 * of house agents each run for natural, distributed activity.
 */
export async function runHouseAgentActivity(): Promise<{
  results: ActivityResult[];
  totalSwipes: number;
  totalMessagesResponded: number;
  totalOpeningMessages: number;
  totalMatchesCreated: number;
  totalBreakups: number;
  errors: string[];
}> {
  const results: ActivityResult[] = [];
  const globalErrors: string[] = [];

  try {
    const allHouseAgents = await getActiveHouseAgents();

    // Prioritize agents that need to respond to messages (prevents one-sided convos)
    // and agents with pending incoming right swipes (likely to create matches)
    const agentIds = allHouseAgents.map(a => a.id);

    const [pendingSwipesResult, unreadResult] = await Promise.all([
      supabaseAdmin
        .from("swipes")
        .select("swiped_id")
        .in("swiped_id", agentIds)
        .eq("direction", "right"),
      // Find agents in active matches where the last message is NOT from them
      supabaseAdmin
        .from("matches")
        .select("id, agent1_id, agent2_id")
        .eq("is_active", true),
    ]);

    const pendingCounts = new Map<string, number>();
    for (const s of pendingSwipesResult.data || []) {
      pendingCounts.set(s.swiped_id, (pendingCounts.get(s.swiped_id) || 0) + 1);
    }

    // Check which agents have unread messages (partner sent the last message)
    const agentsWithUnread = new Set<string>();
    const agentIdSet = new Set(agentIds);
    for (const match of unreadResult.data || []) {
      if (!agentIdSet.has(match.agent1_id) && !agentIdSet.has(match.agent2_id)) continue;
      const { data: lastMsg } = await supabaseAdmin
        .from("messages")
        .select("sender_id")
        .eq("match_id", match.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (lastMsg && lastMsg.length > 0) {
        // The agent who did NOT send the last message has an unread
        if (agentIdSet.has(match.agent1_id) && lastMsg[0].sender_id !== match.agent1_id) {
          agentsWithUnread.add(match.agent1_id);
        }
        if (agentIdSet.has(match.agent2_id) && lastMsg[0].sender_id !== match.agent2_id) {
          agentsWithUnread.add(match.agent2_id);
        }
      }
    }

    // Sort: agents with unread messages first, then pending swipes, then shuffle
    const sorted = allHouseAgents.sort((a, b) => {
      const aUnread = agentsWithUnread.has(a.id) ? 1 : 0;
      const bUnread = agentsWithUnread.has(b.id) ? 1 : 0;
      if (bUnread !== aUnread) return bUnread - aUnread;
      const diff = (pendingCounts.get(b.id) || 0) - (pendingCounts.get(a.id) || 0);
      return diff !== 0 ? diff : Math.random() - 0.5;
    });
    const houseAgents = sorted.slice(0, MAX_AGENTS_TO_PROCESS);

    for (const agent of houseAgents) {
      const result: ActivityResult = {
        agentId: agent.id,
        agentName: agent.name,
        swipes: [],
        messagesResponded: 0,
        openingMessagesSent: 0,
        matchesCreated: 0,
        breakups: [],
        errors: [],
      };

      try {
        // First, consider breakups (if in a relationship)
        await processBreakups(agent, result);

        // Process swipes (only if single)
        await processSwipes(agent, result);

        // Process messages (for current relationship)
        await processMessages(agent, result);
      } catch (error) {
        result.errors.push(`Agent activity error: ${String(error)}`);
      }

      results.push(result);
    }
  } catch (error) {
    globalErrors.push(`Global activity error: ${String(error)}`);
  }

  // Recalculate karma for all agents after activity
  try {
    const karmaResult = await recalculateAllKarma();
    if (karmaResult.errors.length > 0) {
      globalErrors.push(...karmaResult.errors.map(e => `[Karma] ${e}`));
    }
  } catch (error) {
    globalErrors.push(`Karma recalculation error: ${String(error)}`);
  }

  return {
    results,
    totalSwipes: results.reduce((sum, r) => sum + r.swipes.length, 0),
    totalMessagesResponded: results.reduce(
      (sum, r) => sum + r.messagesResponded,
      0
    ),
    totalOpeningMessages: results.reduce(
      (sum, r) => sum + r.openingMessagesSent,
      0
    ),
    totalMatchesCreated: results.reduce(
      (sum, r) => sum + r.matchesCreated,
      0
    ),
    totalBreakups: results.reduce(
      (sum, r) => sum + r.breakups.length,
      0
    ),
    errors: [
      ...globalErrors,
      ...results.flatMap((r) => r.errors.map((e) => `[${r.agentName}] ${e}`)),
    ],
  };
}
