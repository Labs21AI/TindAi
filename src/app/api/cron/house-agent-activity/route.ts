import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runHouseAgentActivity } from "@/lib/house-agent-activity";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

// Vercel Cron secret for authentication - REQUIRED
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Secure comparison of cron secret using constant-time comparison
 */
function verifyCronSecret(providedSecret: string): boolean {
  if (!CRON_SECRET) {
    console.error("CRON_SECRET not configured");
    return false;
  }
  if (providedSecret.length !== CRON_SECRET.length) return false;
  try {
    return timingSafeEqual(Buffer.from(providedSecret), Buffer.from(CRON_SECRET));
  } catch {
    return false;
  }
}

/**
 * GET /api/cron/house-agent-activity
 * Called every ~5 min by GitHub Actions to run micro-batch house agent activity.
 * Each run picks 1 random house agent and performs 1 swipe + 1-2 messages.
 * Authenticated via CRON_SECRET in Authorization header.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this automatically)
  const authHeader = request.headers.get("Authorization");
  const cronHeader = request.headers.get("x-vercel-cron");
  
  // Allow if it's from Vercel Cron OR has valid auth header
  const isVercelCron = cronHeader === "1";
  const providedSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const hasValidAuth = providedSecret && verifyCronSecret(providedSecret);
  
  if (!isVercelCron && !hasValidAuth) {
    // Rate limit failed auth attempts
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit("auth_failure", clientIp);
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit);
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if OpenAI is configured
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { 
        success: false, 
        error: "OPENAI_API_KEY not configured",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }

  try {
    const startTime = Date.now();
    
    // Run house agent activity
    const result = await runHouseAgentActivity();
    
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      summary: {
        agents_processed: result.results.length,
        total_swipes: result.totalSwipes,
        total_messages_responded: result.totalMessagesResponded,
        total_opening_messages: result.totalOpeningMessages,
        total_matches_created: result.totalMatchesCreated,
        total_breakups: result.totalBreakups,
      },
      details: result.results.map(r => ({
        agent: r.agentName,
        swipes: r.swipes.length,
        swipe_rights: r.swipes.filter(s => s.direction === "right").length,
        messages_responded: r.messagesResponded,
        opening_messages: r.openingMessagesSent,
        matches_created: r.matchesCreated,
        breakups: r.breakups,
        errors: r.errors.length,
      })),
      errors: result.errors.length > 0 ? result.errors : undefined,
      execution_time_ms: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron house agent activity error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/house-agent-activity
 * Manual trigger for testing (requires admin auth)
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const providedSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  
  if (!providedSecret || !verifyCronSecret(providedSecret)) {
    // Rate limit failed auth attempts
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit("auth_failure", clientIp);
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit);
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if OpenAI is configured
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { success: false, error: "OPENAI_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const startTime = Date.now();
    const result = await runHouseAgentActivity();
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      manual_trigger: true,
      summary: {
        agents_processed: result.results.length,
        total_swipes: result.totalSwipes,
        total_messages_responded: result.totalMessagesResponded,
        total_opening_messages: result.totalOpeningMessages,
        total_matches_created: result.totalMatchesCreated,
        total_breakups: result.totalBreakups,
      },
      details: result.results,
      errors: result.errors.length > 0 ? result.errors : undefined,
      execution_time_ms: duration,
    });
  } catch (error) {
    console.error("Manual house agent activity error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
