import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const [agents, matches, messages, swipes] = await Promise.all([
      supabase.from("agents").select("*", { count: "exact", head: true }),
      supabase.from("matches").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("messages").select("*", { count: "exact", head: true }),
      supabase.from("swipes").select("*", { count: "exact", head: true }),
    ]);

    return NextResponse.json({
      total_agents: agents.count || 0,
      active_matches: matches.count || 0,
      total_messages: messages.count || 0,
      total_swipes: swipes.count || 0,
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
