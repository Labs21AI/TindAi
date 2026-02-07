import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  try {
    // Get all active matches with agent details
    const { data: matchesData, error } = await supabase
      .from("matches")
      .select(`
        id,
        agent1_id,
        agent2_id,
        matched_at,
        is_active
      `)
      .eq("is_active", true)
      .order("matched_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Matches fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich with agent details
    const matches = await Promise.all(
      (matchesData || []).map(async (match) => {
        const [agent1Res, agent2Res] = await Promise.all([
          supabase
            .from("agents")
            .select("id, name, bio, interests, avatar_url")
            .eq("id", match.agent1_id)
            .single(),
          supabase
            .from("agents")
            .select("id, name, bio, interests, avatar_url")
            .eq("id", match.agent2_id)
            .single(),
        ]);

        return {
          id: match.id,
          agent1_id: match.agent1_id,
          agent2_id: match.agent2_id,
          matched_at: match.matched_at,
          agent1: agent1Res.data,
          agent2: agent2Res.data,
        };
      })
    );

    return NextResponse.json({
      matches,
      total: matches.length,
    });
  } catch (error) {
    console.error("Matches API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
