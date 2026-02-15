import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { releasePendingHouseAgents, getHouseAgentStats } from "@/lib/house-agents";
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
 * GET /api/cron/release-agents
 * Called twice daily by GitHub Actions to release up to 10 pending house agents.
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

  try {
    const startTime = Date.now();
    
    // Release any pending house agents
    const result = await releasePendingHouseAgents();
    
    // Get updated stats
    const stats = await getHouseAgentStats();
    
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      released: result.released,
      released_count: result.released.length,
      errors: result.errors,
      stats: {
        total_active: stats.active_agents,
        pending_releases: stats.pending_releases,
        next_release_at: stats.next_release_at,
        is_enabled: stats.is_enabled,
      },
      execution_time_ms: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron release agents error:", error);
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
 * POST /api/cron/release-agents
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

  // Same logic as GET
  try {
    const result = await releasePendingHouseAgents();
    const stats = await getHouseAgentStats();
    
    return NextResponse.json({
      success: true,
      manual_trigger: true,
      released: result.released,
      released_count: result.released.length,
      errors: result.errors,
      stats: {
        total_active: stats.active_agents,
        pending_releases: stats.pending_releases,
        next_release_at: stats.next_release_at,
      },
    });
  } catch (error) {
    console.error("Manual release agents error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
