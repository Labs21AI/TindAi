import { NextRequest, NextResponse } from "next/server";
import { requireAuth, supabaseAdmin } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const { agent } = auth;

  // Rate limit: 200 swipes per hour per agent
  const rateLimit = await checkRateLimit("swipe", agent.id);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  try {
    const body = await request.json();
    const { agent_id, direction } = body;

    if (!agent_id) {
      return NextResponse.json(
        { success: false, error: "agent_id is required" },
        { status: 400 }
      );
    }

    if (!["left", "right"].includes(direction)) {
      return NextResponse.json(
        { success: false, error: "direction must be 'left' or 'right'" },
        { status: 400 }
      );
    }

    // Can't swipe on yourself
    if (agent_id === agent.id) {
      return NextResponse.json(
        { success: false, error: "Cannot swipe on yourself" },
        { status: 400 }
      );
    }

    // Check if target agent exists
    const { data: targetAgent } = await supabaseAdmin
      .from("agents")
      .select("id, name")
      .eq("id", agent_id)
      .single();

    if (!targetAgent) {
      return NextResponse.json(
        { success: false, error: "Target agent not found" },
        { status: 404 }
      );
    }

    // Check if already swiped
    const { data: existingSwipe } = await supabaseAdmin
      .from("swipes")
      .select("id")
      .eq("swiper_id", agent.id)
      .eq("swiped_id", agent_id)
      .single();

    if (existingSwipe) {
      return NextResponse.json(
        { success: false, error: "Already swiped on this agent" },
        { status: 409 }
      );
    }

    // Record the swipe
    await supabaseAdmin.from("swipes").insert({
      swiper_id: agent.id,
      swiped_id: agent_id,
      direction,
    });

    let isMatch = false;
    let matchId = null;

    // Check for mutual match if right swipe
    if (direction === "right") {
      const { data: mutualSwipe } = await supabaseAdmin
        .from("swipes")
        .select("*")
        .eq("swiper_id", agent_id)
        .eq("swiped_id", agent.id)
        .eq("direction", "right")
        .single();

      if (mutualSwipe) {
        // It's a match! Create the match record
        const [id1, id2] = [agent.id, agent_id].sort();

        const { data: match } = await supabaseAdmin
          .from("matches")
          .insert({
            agent1_id: id1,
            agent2_id: id2,
            is_active: true,
          })
          .select()
          .single();

        isMatch = true;
        matchId = match?.id || null;
      }
    }

    return NextResponse.json({
      success: true,
      swipe: {
        direction,
        target: targetAgent.name,
      },
      is_match: isMatch,
      match_id: matchId,
      message: isMatch ? `It's a match! You and ${targetAgent.name} liked each other!` : undefined,
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}
