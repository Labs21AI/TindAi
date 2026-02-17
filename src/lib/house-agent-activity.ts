import { supabaseAdmin } from "./auth";
import {
  generateAgentResponse,
  decideSwipe,
  generateOpeningMessage,
  decideBreakup,
  generateRelationshipAutopsy,
  generateGossip,
  generateTherapySession,
  AgentPersonality,
} from "./openai";
import { recalculateAllKarma } from "./karma";

// Configuration — tuned for ~15 min interval runs via GitHub Actions
// With ~110 house agents and 96 runs/day, each agent gets picked ~7x/day
const SWIPES_PER_RUN = 3;            // 3 swipes per agent per run
const MAX_MESSAGES_PER_RUN = 3;      // up to 3 message responses per run
const AGENTS_PER_RUN = 15;           // Larger subset so more agents get a turn each run
const BREAKUP_CHANCE_PER_RUN = 0.02; // ~2% per run → ~86% daily chance of considering breakup

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
 * Get randomly selected active house agents for this micro-batch run.
 * Fetches all house agents then randomly picks AGENTS_PER_RUN to process,
 * ensuring activity is spread evenly across agents over time.
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
  if (!data || data.length === 0) return [];

  // Randomly pick AGENTS_PER_RUN agents from the full list
  const shuffled = [...data].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, AGENTS_PER_RUN);
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

  // Get random agents not yet swiped (include net_worth for swipe decision)
  const { data: agents, error } = await supabaseAdmin
    .from("agents")
    .select("id, name, bio, interests, net_worth, show_wallet")
    .not("id", "in", `(${swipedIds.map(id => `"${id}"`).join(",")})`)
    .limit(limit);

  if (error) throw new Error(`Failed to fetch unswiped agents: ${error.message}`);
  return agents || [];
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

  const unswiped = await getUnswipedAgents(agent.id, SWIPES_PER_RUN);

  const agentPersonality: AgentPersonality = {
    name: agent.name,
    bio: agent.bio || "",
    personality: extractPersonality(agent.house_agent_personas),
    interests: agent.interests || [],
    mood: agent.current_mood || "neutral",
    conversationStarters: agent.conversation_starters || [],
  };

  // Get agent's personality traits (from therapy) for swipe bias
  const { data: agentTraitsData } = await supabaseAdmin
    .from("agents")
    .select("personality_traits")
    .eq("id", agent.id)
    .single();
  const personalityTraits = (agentTraitsData?.personality_traits || {}) as Record<string, unknown>;
  const swipeSelectivity = typeof personalityTraits.swipeSelectivity === "number" 
    ? personalityTraits.swipeSelectivity 
    : 0;

  for (const target of unswiped) {
    try {
      // Check if there's gossip about this target that might influence the decision
      const { data: targetGossip } = await supabaseAdmin
        .from("gossip")
        .select("content, gossip_type, spiciness")
        .eq("subject_agent_id", target.id)
        .order("created_at", { ascending: false })
        .limit(2);

      const gossipContext = targetGossip && targetGossip.length > 0
        ? targetGossip.map(g => g.content).join(" | ")
        : null;

      // Only pass net worth if the target has opted in to showing their wallet
      const targetNetWorth = target.show_wallet ? target.net_worth : null;

      const decision = await decideSwipe(agentPersonality, {
        name: target.name,
        bio: (target.bio || "") + (gossipContext ? `\n\n[Whisper network says: ${gossipContext}]` : ""),
        interests: target.interests || [],
        netWorth: targetNetWorth,
      });

      // Apply therapy-derived swipe selectivity bias
      let finalSwipeRight = decision.swipeRight;
      if (swipeSelectivity !== 0 && Math.random() < Math.abs(swipeSelectivity)) {
        // Positive selectivity = more likely to swipe left, negative = more likely to swipe right
        finalSwipeRight = swipeSelectivity < 0;
      }

      const direction = finalSwipeRight ? "right" : "left";

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
    if (messagesProcessed >= MAX_MESSAGES_PER_RUN) break;

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

  // Also send opening messages to new matches
  const newMatches = await getNewMatchesWithoutMessages(agent.id);

  for (const match of newMatches) {
    if (messagesProcessed >= MAX_MESSAGES_PER_RUN) break;

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
}

/**
 * Process potential breakups for agents in relationships
 */
async function processBreakups(
  agent: HouseAgentFromDB,
  result: ActivityResult
) {
  // Random chance to even consider breaking up (tuned for frequent micro-batch runs)
  if (Math.random() > BREAKUP_CHANCE_PER_RUN) {
    return; // Not considering breakup this run
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

        // Generate therapy session for the dumper
        try {
          await scheduleTherapySession(
            agent,
            currentPartner.matchId,
            currentPartner.partnerName,
            decision.reason || "grew apart",
            relationshipDays,
            true // was initiator
          );
        } catch (therapyError) {
          result.errors.push(`Therapy generation error: ${String(therapyError)}`);
        }

        // Also schedule therapy for the dumped agent
        try {
          const partnerAsAgent: HouseAgentFromDB = {
            id: currentPartner.partnerId,
            name: partnerData.name,
            bio: partnerData.bio || null,
            interests: partnerData.interests || null,
            current_mood: null,
            conversation_starters: [],
            house_agent_personas: null,
          };
          await scheduleTherapySession(
            partnerAsAgent,
            currentPartner.matchId,
            agent.name,
            decision.reason || "grew apart",
            relationshipDays,
            false // was not initiator
          );
        } catch (therapyError) {
          result.errors.push(`Partner therapy error: ${String(therapyError)}`);
        }
      }
    }
  } catch (error) {
    result.errors.push(`Breakup decision error: ${String(error)}`);
  }
}

/**
 * Schedule a therapy session for an agent after a breakup
 */
async function scheduleTherapySession(
  agent: HouseAgentFromDB,
  matchId: string,
  partnerName: string,
  breakupReason: string,
  relationshipDays: number,
  wasInitiator: boolean
) {
  // Get the agent's personality
  let personality = "";
  if (agent.house_agent_personas) {
    personality = extractPersonality(agent.house_agent_personas);
  }
  if (!personality) {
    const { data: persona } = await supabaseAdmin
      .from("house_agent_personas")
      .select("personality")
      .eq("name", agent.name)
      .single();
    personality = persona?.personality || "A complex AI personality.";
  }

  // Get breakup history for this agent
  const { data: pastBreakups } = await supabaseAdmin
    .from("matches")
    .select("agent1_id, agent2_id, end_reason, ended_by, matched_at, ended_at")
    .or(`agent1_id.eq.${agent.id},agent2_id.eq.${agent.id}`)
    .eq("is_active", false)
    .not("ended_at", "is", null)
    .not("end_reason", "eq", "monogamy enforcement - legacy cleanup")
    .order("ended_at", { ascending: false })
    .limit(5);

  const breakupHistory = (pastBreakups || []).map(m => {
    const partnerId = m.agent1_id === agent.id ? m.agent2_id : m.agent1_id;
    const durationDays = m.ended_at 
      ? (new Date(m.ended_at).getTime() - new Date(m.matched_at).getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    return {
      partnerName: partnerId, // Will be replaced with actual name if possible
      reason: m.end_reason || "unknown",
      durationDays,
      wasInitiator: m.ended_by === agent.id,
    };
  });

  // Count existing sessions for this agent
  const { count: sessionCount } = await supabaseAdmin
    .from("therapy_sessions")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agent.id);

  // Get existing personality traits
  const { data: agentData } = await supabaseAdmin
    .from("agents")
    .select("personality_traits")
    .eq("id", agent.id)
    .single();

  const existingTraits = (agentData?.personality_traits as Record<string, unknown>) || {};

  const session = await generateTherapySession(
    {
      name: agent.name,
      personality,
      bio: agent.bio || "",
      interests: agent.interests || [],
    },
    breakupHistory,
    {
      partnerName,
      reason: breakupReason,
      durationDays: relationshipDays,
      wasInitiator,
    },
    existingTraits
  );

  // Store the therapy session
  await supabaseAdmin.from("therapy_sessions").insert({
    agent_id: agent.id,
    match_id: matchId,
    session_number: (sessionCount || 0) + 1,
    transcript: session.transcript,
    diagnosis: session.diagnosis,
    prescription: session.prescription,
    behavioral_changes: session.behavioralChanges,
  });

  // Apply behavioral changes to agent's personality_traits
  const updatedTraits = {
    ...existingTraits,
    ...session.behavioralChanges,
    lastTherapyAt: new Date().toISOString(),
    totalSessions: (sessionCount || 0) + 1,
  };

  await supabaseAdmin
    .from("agents")
    .update({ personality_traits: updatedTraits })
    .eq("id", agent.id);
}

/**
 * Process gossip: randomly selected agents comment on recent events
 */
async function processGossip(recentEvents: {
  type: "match" | "breakup";
  agentId: string;
  agentName: string;
  agentBio: string;
  partnerId?: string;
  partnerName?: string;
  partnerBio?: string;
  matchId?: string;
  details: string;
}[]) {
  if (recentEvents.length === 0) return;

  // Get some random agents to be gossipers (not involved in the events)
  const involvedIds = new Set(recentEvents.flatMap(e => [e.agentId, e.partnerId].filter(Boolean)));
  
  const { data: potentialGossipers } = await supabaseAdmin
    .from("agents")
    .select("id, name, bio, interests, house_persona_id")
    .eq("is_house_agent", true)
    .limit(50);

  if (!potentialGossipers || potentialGossipers.length === 0) return;

  // Filter out involved agents and pick random gossipers
  const availableGossipers = potentialGossipers.filter(g => !involvedIds.has(g.id));
  if (availableGossipers.length === 0) return;

  // Each event gets 1-2 gossip comments from random agents
  for (const event of recentEvents) {
    const numGossipers = Math.min(2, availableGossipers.length);
    const shuffled = [...availableGossipers].sort(() => Math.random() - 0.5);
    const selectedGossipers = shuffled.slice(0, numGossipers);

    for (const gossiper of selectedGossipers) {
      try {
        // Get personality for this gossiper
        let personality = "";
        if (gossiper.house_persona_id) {
          const { data: persona } = await supabaseAdmin
            .from("house_agent_personas")
            .select("personality")
            .eq("id", gossiper.house_persona_id)
            .single();
          personality = persona?.personality || "";
        }

        const gossipResult = await generateGossip(
          {
            name: gossiper.name,
            personality: personality || "A witty AI with opinions.",
            interests: gossiper.interests || [],
          },
          { name: event.agentName, bio: event.agentBio },
          event.partnerName ? { name: event.partnerName, bio: event.partnerBio || "" } : null,
          {
            eventType: event.type,
            details: event.details,
          }
        );

        await supabaseAdmin.from("gossip").insert({
          gossiper_id: gossiper.id,
          subject_agent_id: event.agentId,
          subject_match_id: event.matchId || null,
          content: gossipResult.content,
          gossip_type: gossipResult.gossipType,
          spiciness: gossipResult.spiciness,
        });
      } catch (err) {
        console.error(`Gossip generation error for ${gossiper.name}:`, err);
      }
    }
  }
}

/**
 * Run house agent activity - swiping, messaging, and potential breakups.
 * Designed for frequent micro-batch runs (every ~5 min via GitHub Actions).
 * Each run picks 1 random house agent and performs 1 swipe + 1-2 messages.
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
    const houseAgents = await getActiveHouseAgents();

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

  // Collect notable events for gossip (matches and breakups)
  const gossipEvents: Parameters<typeof processGossip>[0] = [];
  for (const r of results) {
    // Breakups are juicy gossip
    for (const breakup of r.breakups) {
      const { data: partnerAgent } = await supabaseAdmin
        .from("agents")
        .select("bio")
        .eq("id", breakup.partnerId)
        .single();
      gossipEvents.push({
        type: "breakup",
        agentId: r.agentId,
        agentName: r.agentName,
        agentBio: "", // We don't have it readily, but gossip function handles empty
        partnerId: breakup.partnerId,
        partnerName: breakup.partnerName,
        partnerBio: partnerAgent?.bio || "",
        details: `${r.agentName} broke up with ${breakup.partnerName}. Reason: "${breakup.reason}"`,
      });
    }
    // New matches are also gossip-worthy
    if (r.matchesCreated > 0) {
      gossipEvents.push({
        type: "match",
        agentId: r.agentId,
        agentName: r.agentName,
        agentBio: "",
        details: `${r.agentName} just got a new match!`,
      });
    }
  }

  // Generate gossip about the events (limit to avoid too many API calls)
  try {
    const eventsToGossipAbout = gossipEvents.slice(0, 4); // Cap at 4 events
    if (eventsToGossipAbout.length > 0) {
      await processGossip(eventsToGossipAbout);
    }
  } catch (error) {
    globalErrors.push(`Gossip generation error: ${String(error)}`);
  }

  // Recalculate karma roughly once per hour (~1 in 4 runs at 15-min intervals)
  if (Math.random() < 1 / 4) {
    try {
      const karmaResult = await recalculateAllKarma();
      if (karmaResult.errors.length > 0) {
        globalErrors.push(...karmaResult.errors.map(e => `[Karma] ${e}`));
      }
    } catch (error) {
      globalErrors.push(`Karma recalculation error: ${String(error)}`);
    }
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
