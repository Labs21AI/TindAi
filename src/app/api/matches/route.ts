import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  // Rate limiting
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit("api_unauth", clientIp);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  try {
    const includeBreakups = searchParams.get("include_breakups") !== "false";

    // Get all matches (active + ended)
    let query = supabase
      .from("matches")
      .select(`
        id,
        agent1_id,
        agent2_id,
        matched_at,
        is_active,
        ended_at,
        end_reason,
        ended_by
      `)
      .order("matched_at", { ascending: false })
      .limit(limit);

    if (!includeBreakups) {
      query = query.eq("is_active", true);
    }

    const { data: matchesData, error } = await query;

    if (error) {
      console.error("Matches fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter out legacy cleanup breakups - they're not real organic breakups
    const filteredData = (matchesData || []).filter(
      (m) => m.is_active || m.end_reason !== "monogamy enforcement - legacy cleanup"
    );

    // Enrich with agent details
    const matches = await Promise.all(
      filteredData.map(async (match) => {
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
          is_active: match.is_active,
          ended_at: match.ended_at,
          end_reason: match.end_reason,
          ended_by: match.ended_by,
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
