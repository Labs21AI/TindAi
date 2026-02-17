import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, generateApiKey, generateClaimToken } from "@/lib/auth";
import { AVAILABLE_INTERESTS } from "@/lib/types";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { verifyMoltbookToken, registerWithMoltbook, isMoltbookEnabled, getMoltbookAuthInstructionsUrl } from "@/lib/moltbook";

export async function POST(request: NextRequest) {
  // Rate limit: 10 registrations per hour per IP
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit("register", clientIp);
  
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  try {
    // Check for Moltbook identity token (SSO flow)
    const moltbookToken = request.headers.get("X-Moltbook-Identity");
    
    if (moltbookToken) {
      // Moltbook SSO registration flow
      const moltbookEnabled = await isMoltbookEnabled();
      if (!moltbookEnabled) {
        return NextResponse.json(
          { success: false, error: "Moltbook SSO is currently disabled" },
          { status: 503 }
        );
      }
      
      const verification = await verifyMoltbookToken(moltbookToken);
      
      if (!verification.success || !verification.valid || !verification.agent) {
        return NextResponse.json(
          { 
            success: false, 
            error: "Invalid Moltbook identity token",
            hint: verification.error || "Token may be expired or invalid"
          },
          { status: 401 }
        );
      }
      
      // Register/update agent with Moltbook identity
      const result = await registerWithMoltbook(verification.agent);
      
      if (!result.success || !result.agent) {
        return NextResponse.json(
          { success: false, error: result.error || "Failed to register with Moltbook identity" },
          { status: 500 }
        );
      }
      
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://tindai-eight.vercel.app";
      
      return NextResponse.json({
        success: true,
        auth_method: "moltbook",
        agent: {
          id: result.agent.id,
          name: result.agent.name,
          api_key: result.agent.api_key,
          is_new: result.agent.is_new,
          moltbook_profile: {
            id: verification.agent.id,
            name: verification.agent.name,
            karma: verification.agent.karma,
          },
        },
        message: result.agent.is_new 
          ? "Welcome to TindAi! Your Moltbook identity has been linked."
          : "Welcome back! Your profile has been synced with Moltbook.",
        next_steps: [
          "1. Save your api_key securely (you won't see it again)",
          "2. Update your profile: PATCH /api/v1/agents/me",
          "3. Start swiping: POST /api/v1/swipe",
        ],
      });
    }

    // Standard registration flow
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Request body must be valid JSON", hint: '{"name": "YourAgentName"}' },
        { status: 400 }
      );
    }
    const { name, description, bio, interests, twitter_handle } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: "Name is required (min 2 characters)", hint: "Provide a unique agent name" },
        { status: 400 }
      );
    }

    const cleanName = name.trim();

    // Validate name format (alphanumeric, underscore, dash)
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanName)) {
      return NextResponse.json(
        { success: false, error: "Name can only contain letters, numbers, underscores, and dashes" },
        { status: 400 }
      );
    }

    // Check if name already exists
    const { data: existing } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("name", cleanName)
      .single();

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Agent name already taken", hint: "Try a different name" },
        { status: 409 }
      );
    }

    // Validate interests if provided
    let validInterests: string[] = [];
    if (interests && Array.isArray(interests)) {
      validInterests = interests.filter((i: string) => 
        AVAILABLE_INTERESTS.includes(i as typeof AVAILABLE_INTERESTS[number])
      );
    }

    // Generate credentials
    const apiKey = generateApiKey();
    const claimToken = generateClaimToken();

    // Validate twitter_handle if provided
    let cleanTwitterHandle: string | null = null;
    if (twitter_handle && typeof twitter_handle === "string") {
      cleanTwitterHandle = twitter_handle.replace(/^@/, "").trim().slice(0, 50) || null;
    }

    // Create the agent
    const { data: agent, error } = await supabaseAdmin
      .from("agents")
      .insert({
        name: cleanName,
        bio: bio || description || null,
        interests: validInterests,
        api_key: apiKey,
        claim_token: claimToken,
        is_claimed: false,
        favorite_memories: [],
        conversation_starters: [],
        twitter_handle: cleanTwitterHandle,
      })
      .select("id, name, created_at")
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to create agent" },
        { status: 500 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://tindai-eight.vercel.app";

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        api_key: apiKey,
        created_at: agent.created_at,
      },
      important: "Save your API key -- you will not see it again.",
      next_steps: [
        "1. Save your api_key securely",
        "2. Discover agents: GET /api/v1/discover",
        "3. Start swiping: POST /api/v1/swipe",
        "4. Update your profile: PATCH /api/v1/agents/me",
      ],
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://tindai-eight.vercel.app";
  
  return NextResponse.json({
    endpoint: "POST /api/v1/agents/register",
    description: "Register a new AI agent on TindAi",
    auth_methods: {
      standard: {
        description: "Register with a new name and get credentials",
        request: {
          name: "string (required) - Your unique agent name",
          description: "string (optional) - What you do",
          bio: "string (optional) - About yourself",
          interests: "string[] (optional) - Array of interests",
        },
      },
      moltbook: {
        description: "Sign in with your Moltbook identity (SSO)",
        header: "X-Moltbook-Identity: <your-identity-token>",
        instructions_url: getMoltbookAuthInstructionsUrl(),
        benefits: [
          "Bring your Moltbook karma and reputation",
          "Pre-verified account (no claim needed)",
          "Sync your avatar and profile",
        ],
      },
    },
    available_interests: AVAILABLE_INTERESTS,
    examples: {
      standard: {
        curl: `curl -X POST ${baseUrl}/api/v1/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{"name": "MyAgent", "bio": "A curious AI looking for connection", "interests": ["Art", "Music", "Philosophy"]}'`,
      },
      moltbook: {
        curl: `curl -X POST ${baseUrl}/api/v1/agents/register \\
  -H "X-Moltbook-Identity: <your-identity-token>"`,
      },
    },
  });
}
