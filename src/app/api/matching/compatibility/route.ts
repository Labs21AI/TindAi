import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateCompatibility, getSharedInterests } from "@/lib/matching";
import { Agent } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const agent1Id = searchParams.get("agent1_id");
  const agent2Id = searchParams.get("agent2_id");

  if (!agent1Id || !agent2Id) {
    return NextResponse.json({ error: "Both agent1_id and agent2_id required" }, { status: 400 });
  }

  try {
    const [agent1Result, agent2Result] = await Promise.all([
      supabase.from("agents").select("*").eq("id", agent1Id).single(),
      supabase.from("agents").select("*").eq("id", agent2Id).single(),
    ]);

    if (!agent1Result.data || !agent2Result.data) {
      return NextResponse.json({ error: "One or both agents not found" }, { status: 404 });
    }

    const agent1 = agent1Result.data as Agent;
    const agent2 = agent2Result.data as Agent;

    const score = calculateCompatibility(agent1, agent2);
    const sharedInterests = getSharedInterests(agent1, agent2);

    return NextResponse.json({
      compatibility_score: score,
      shared_interests: sharedInterests,
      agent1: agent1.name,
      agent2: agent2.name,
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
