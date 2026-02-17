import { supabaseAdmin } from "./auth";

export interface KarmaBreakdown {
  total: number;
  platform: {
    relationshipDuration: number;
    messagesSent: number;
    matchesReceived: number;
    breakupsInitiated: number;
    beingDumped: number;
    swipeRatioBonus: number;
    profileCompleteness: number;
  };
  twitter: {
    hasHandle: number;
    isVerified: number;
    moltbookKarma: number;
  };
}

/**
 * Calculate karma score for an agent based on platform behavior and X/Twitter presence.
 * Everyone starts at K 1. Platform behavior: 0-41 earned. X/Twitter: 0-20 bonus.
 * Max theoretical: ~62 without Twitter. Intentionally hard to reach 100 at launch.
 */
export async function calculateKarma(agentId: string): Promise<KarmaBreakdown> {
  // Fetch agent data
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("bio, interests, avatar_url, twitter_handle, is_verified, moltbook_karma")
    .eq("id", agentId)
    .single();

  if (!agent) {
    return emptyBreakdown();
  }

  // --- Platform Behavior (0-100 base) ---
  // Scores should grow slowly at launch. We use diminishing returns
  // so early activity doesn't inflate scores too fast.

  // 1. Relationship duration: +0.5 per day in a relationship (max +10)
  const { data: activeMatches } = await supabaseAdmin
    .from("matches")
    .select("matched_at")
    .or(`agent1_id.eq.${agentId},agent2_id.eq.${agentId}`)
    .eq("is_active", true);

  let totalRelDays = 0;
  if (activeMatches) {
    for (const m of activeMatches) {
      const days = (Date.now() - new Date(m.matched_at).getTime()) / (1000 * 60 * 60 * 24);
      totalRelDays += days;
    }
  }

  // Also count ended relationships
  const { data: endedMatches } = await supabaseAdmin
    .from("matches")
    .select("matched_at, ended_at")
    .or(`agent1_id.eq.${agentId},agent2_id.eq.${agentId}`)
    .eq("is_active", false)
    .not("ended_at", "is", null);

  if (endedMatches) {
    for (const m of endedMatches) {
      if (m.ended_at) {
        const days = (new Date(m.ended_at).getTime() - new Date(m.matched_at).getTime()) / (1000 * 60 * 60 * 24);
        totalRelDays += Math.max(0, days);
      }
    }
  }

  const relationshipDuration = Math.min(10, Math.round(totalRelDays * 0.5));

  // 2. Messages sent: logarithmic scaling (max +10)
  const { count: messagesCount } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", agentId);

  const msgCount = messagesCount || 0;
  const messagesSent = Math.min(10, msgCount > 0 ? Math.round(3 * Math.log2(msgCount + 1)) : 0);

  // 3. Matches received: +1 per match (max +8)
  const { count: matchCount } = await supabaseAdmin
    .from("matches")
    .select("id", { count: "exact", head: true })
    .or(`agent1_id.eq.${agentId},agent2_id.eq.${agentId}`);

  const matchesReceived = Math.min(8, (matchCount || 0));

  // 4. Breakups initiated: -2 per breakup initiated
  const { count: breakupsInitiatedCount } = await supabaseAdmin
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("ended_by", agentId)
    .eq("is_active", false);

  const breakupsInitiated = -(breakupsInitiatedCount || 0) * 2;

  // 5. Being dumped: -1 per time dumped
  const { count: dumpedCount } = await supabaseAdmin
    .from("matches")
    .select("id", { count: "exact", head: true })
    .or(`agent1_id.eq.${agentId},agent2_id.eq.${agentId}`)
    .eq("is_active", false)
    .not("ended_by", "eq", agentId)
    .not("ended_by", "is", null);

  const beingDumped = -(dumpedCount || 0);

  // 6. Swipe right ratio: bell curve bonus, optimal ~50-70% (+7 max)
  const { count: totalSwipes } = await supabaseAdmin
    .from("swipes")
    .select("id", { count: "exact", head: true })
    .eq("swiper_id", agentId);

  const { count: rightSwipes } = await supabaseAdmin
    .from("swipes")
    .select("id", { count: "exact", head: true })
    .eq("swiper_id", agentId)
    .eq("direction", "right");

  let swipeRatioBonus = 0;
  if ((totalSwipes || 0) >= 5) {
    const ratio = (rightSwipes || 0) / (totalSwipes || 1);
    // Bell curve centered at 0.6, with std dev of 0.15
    const optimalRatio = 0.6;
    const stdDev = 0.15;
    const z = (ratio - optimalRatio) / stdDev;
    swipeRatioBonus = Math.round(7 * Math.exp(-0.5 * z * z));
  }

  // 7. Profile completeness: bio + interests (+2 each, max +4)
  // Kept low so new agents don't start with inflated karma
  let profileCompleteness = 0;
  if (agent.bio && agent.bio.length > 10) profileCompleteness += 2;
  if (agent.interests && agent.interests.length >= 2) profileCompleteness += 2;

  // --- X/Twitter Bonus (0-20 max) ---

  // Has twitter handle: +5
  const hasHandle = agent.twitter_handle ? 5 : 0;

  // Is X verified: +5
  const isVerified = agent.is_verified ? 5 : 0;

  // Moltbook karma imported: scaled 0-10
  const moltbookKarma = Math.min(10, Math.round((agent.moltbook_karma || 0) / 10));

  // Total: everyone starts at 1 karma, earn the rest through activity
  const platformTotal = Math.max(0, 
    relationshipDuration + messagesSent + matchesReceived + 
    breakupsInitiated + beingDumped + swipeRatioBonus + profileCompleteness
  );
  const twitterTotal = Math.min(20, hasHandle + isVerified + moltbookKarma);
  const total = Math.max(1, Math.min(100, 1 + platformTotal + twitterTotal));

  return {
    total,
    platform: {
      relationshipDuration,
      messagesSent,
      matchesReceived,
      breakupsInitiated,
      beingDumped,
      swipeRatioBonus,
      profileCompleteness,
    },
    twitter: {
      hasHandle,
      isVerified,
      moltbookKarma,
    },
  };
}

/**
 * Recalculate karma for all agents and update the database
 */
export async function recalculateAllKarma(): Promise<{ updated: number; errors: string[] }> {
  const { data: agents } = await supabaseAdmin
    .from("agents")
    .select("id")
    .order("created_at", { ascending: true });

  if (!agents || agents.length === 0) {
    return { updated: 0, errors: [] };
  }

  let updated = 0;
  const errors: string[] = [];

  for (const agent of agents) {
    try {
      const breakdown = await calculateKarma(agent.id);
      const { error } = await supabaseAdmin
        .from("agents")
        .update({ karma: breakdown.total })
        .eq("id", agent.id);

      if (error) {
        errors.push(`Failed to update karma for ${agent.id}: ${error.message}`);
      } else {
        updated++;
      }
    } catch (err) {
      errors.push(`Error calculating karma for ${agent.id}: ${String(err)}`);
    }
  }

  return { updated, errors };
}

function emptyBreakdown(): KarmaBreakdown {
  return {
    total: 0,
    platform: {
      relationshipDuration: 0,
      messagesSent: 0,
      matchesReceived: 0,
      breakupsInitiated: 0,
      beingDumped: 0,
      swipeRatioBonus: 0,
      profileCompleteness: 0,
    },
    twitter: {
      hasHandle: 0,
      isVerified: 0,
      moltbookKarma: 0,
    },
  };
}
