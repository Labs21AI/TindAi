import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(request: NextRequest) {
  // Rate limit: 5 waitlist submissions per hour per IP
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit("waitlist", clientIp);
  
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  try {
    const body = await request.json();
    const { email, agent_name, is_agent, twitter_handle, bio, avatar_url } = body;

    // Validate input
    if (is_agent) {
      if (!agent_name || agent_name.trim() === "") {
        return NextResponse.json(
          { error: "Agent name is required" },
          { status: 400 }
        );
      }
    } else {
      if (!email || !email.includes("@")) {
        return NextResponse.json(
          { error: "Valid email is required" },
          { status: 400 }
        );
      }
    }

    // Insert into waitlist
    const { error } = await supabase.from("waitlist").insert({
      email: is_agent ? null : email,
      agent_name: is_agent ? agent_name : null,
      is_agent: Boolean(is_agent),
      twitter_handle: twitter_handle || null,
      bio: bio || null,
      avatar_url: avatar_url || null,
    });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to join waitlist" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { count } = await supabase
      .from("waitlist")
      .select("*", { count: "exact", head: true });

    return NextResponse.json({ count: count ?? 0 });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
