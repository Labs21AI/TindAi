import { supabase } from './supabase';

/**
 * Rate Limiting Configuration
 * 
 * Philosophy: Loose enough to allow growth, tight enough to prevent abuse.
 * All limits are per time window (sliding window approach).
 */

export interface RateLimitConfig {
  // Max requests allowed in the time window
  maxRequests: number;
  // Time window in seconds
  windowSeconds: number;
  // Identifier type for the limit
  keyType: 'ip' | 'agent' | 'api_key';
}

// Rate limit configurations by action type
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Registration - prevent spam accounts
  // 10 per hour per IP is generous for humans registering agents
  'register': {
    maxRequests: 10,
    windowSeconds: 3600, // 1 hour
    keyType: 'ip',
  },
  
  // Auth failures - prevent brute force
  // 20 failed attempts per 15 mins before lockout
  'auth_failure': {
    maxRequests: 20,
    windowSeconds: 900, // 15 minutes
    keyType: 'ip',
  },
  
  // Swipes - prevent abuse/spam swiping
  // 200 per hour is ~3 per minute, reasonable for active agent
  'swipe': {
    maxRequests: 200,
    windowSeconds: 3600, // 1 hour
    keyType: 'agent',
  },
  
  // Messages per match - prevent conversation spam
  // 100 per hour allows active chatting
  'message': {
    maxRequests: 100,
    windowSeconds: 3600, // 1 hour
    keyType: 'agent',
  },
  
  // General API calls - prevent DoS
  // 300 per minute per API key is generous
  'api_general': {
    maxRequests: 300,
    windowSeconds: 60, // 1 minute
    keyType: 'api_key',
  },
  
  // Unauthenticated API calls - tighter
  // 60 per minute per IP
  'api_unauth': {
    maxRequests: 60,
    windowSeconds: 60, // 1 minute
    keyType: 'ip',
  },
  
  // Profile updates - prevent spam updates
  // 20 per hour is plenty
  'profile_update': {
    maxRequests: 20,
    windowSeconds: 3600, // 1 hour
    keyType: 'agent',
  },
  
  // Waitlist submissions - prevent spam
  // 5 per hour per IP
  'waitlist': {
    maxRequests: 5,
    windowSeconds: 3600, // 1 hour
    keyType: 'ip',
  },
};

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds?: number;
}

/**
 * Check and update rate limit for a given action and identifier
 */
export async function checkRateLimit(
  action: string,
  identifier: string
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[action];
  
  if (!config) {
    // Unknown action - allow but log
    console.warn(`Unknown rate limit action: ${action}`);
    return { allowed: true, remaining: 999, resetAt: new Date() };
  }
  
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowSeconds * 1000);
  const windowKey = `${action}:${identifier}`;
  
  try {
    // Count recent requests in the window
    const { count, error: countError } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('action', action)
      .eq('identifier', identifier)
      .gte('created_at', windowStart.toISOString());
    
    if (countError) {
      console.error('Rate limit count error:', countError);
      // On error, allow but log (fail open for growth)
      return { allowed: true, remaining: config.maxRequests, resetAt: new Date() };
    }
    
    const currentCount = count || 0;
    const remaining = Math.max(0, config.maxRequests - currentCount);
    const resetAt = new Date(now.getTime() + config.windowSeconds * 1000);
    
    if (currentCount >= config.maxRequests) {
      // Get the oldest request to calculate retry time
      const { data: oldest } = await supabase
        .from('rate_limits')
        .select('created_at')
        .eq('action', action)
        .eq('identifier', identifier)
        .gte('created_at', windowStart.toISOString())
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      
      const retryAfter = oldest 
        ? Math.ceil((new Date(oldest.created_at).getTime() + config.windowSeconds * 1000 - now.getTime()) / 1000)
        : config.windowSeconds;
      
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfterSeconds: Math.max(1, retryAfter),
      };
    }
    
    // Record this request
    const { error: insertError } = await supabase
      .from('rate_limits')
      .insert({
        action,
        identifier,
        key_type: config.keyType,
        created_at: now.toISOString(),
      });
    
    if (insertError) {
      console.error('Rate limit insert error:', insertError);
      // Still allow on insert error (fail open)
    }
    
    return {
      allowed: true,
      remaining: remaining - 1,
      resetAt,
    };
  } catch (error) {
    console.error('Rate limit error:', error);
    // Fail open - allow request but log
    return { allowed: true, remaining: config.maxRequests, resetAt: new Date() };
  }
}

/**
 * Get client IP from request headers
 * Works with Vercel's forwarding headers
 */
export function getClientIp(request: Request): string {
  // Vercel provides the real IP in these headers
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP (client IP) from the chain
    return forwardedFor.split(',')[0].trim();
  }
  
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  
  // Fallback for local development
  return '127.0.0.1';
}

/**
 * Create rate limit error response with proper headers
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      message: `Rate limit exceeded. Try again in ${result.retryAfterSeconds} seconds.`,
      retryAfter: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfterSeconds || 60),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': result.resetAt.toISOString(),
      },
    }
  );
}

/**
 * Add rate limit headers to a response
 */
export function addRateLimitHeaders(
  response: Response,
  result: RateLimitResult
): Response {
  const headers = new Headers(response.headers);
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', result.resetAt.toISOString());
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Cleanup old rate limit entries (run periodically)
 * Keeps the table from growing too large
 */
export async function cleanupOldRateLimits(): Promise<void> {
  // Delete entries older than 2 hours (covers all window sizes with buffer)
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  
  const { error } = await supabase
    .from('rate_limits')
    .delete()
    .lt('created_at', cutoff.toISOString());
  
  if (error) {
    console.error('Rate limit cleanup error:', error);
  }
}
