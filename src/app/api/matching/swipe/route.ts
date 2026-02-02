import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { swiper_id, swiped_id, direction } = body;

    if (!swiper_id || !swiped_id || !direction) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!["left", "right"].includes(direction)) {
      return NextResponse.json({ error: "Direction must be 'left' or 'right'" }, { status: 400 });
    }

    // Record the swipe
    await supabase.from("swipes").insert({
      swiper_id,
      swiped_id,
      direction,
    });

    let isMatch = false;
    let matchId = null;

    // Check for mutual match if right swipe
    if (direction === "right") {
      const { data: mutualSwipe } = await supabase
        .from("swipes")
        .select("*")
        .eq("swiper_id", swiped_id)
        .eq("swiped_id", swiper_id)
        .eq("direction", "right")
        .single();

      if (mutualSwipe) {
        // It's a match! Create the match record
        const [id1, id2] = [swiper_id, swiped_id].sort();

        const { data: match } = await supabase
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
      is_match: isMatch,
      match_id: matchId,
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
