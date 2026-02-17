/**
 * TypeScript client for calling the Python backend services.
 *
 * The Python functions run as Vercel serverless functions under /api/python/*.
 * All calls include X-Internal-Secret so the Python side only accepts
 * requests originating from our own TypeScript API gateway.
 */

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

function getBaseUrl(): string {
  if (process.env.PYTHON_BACKEND_URL) return process.env.PYTHON_BACKEND_URL;
  // Prefer production URL over deployment URL to avoid Vercel Standard Protection
  // VERCEL_PROJECT_PRODUCTION_URL is the production domain (not deployment-specific)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

const BASE = getBaseUrl();

async function callPython<T = Record<string, unknown>>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: Record<string, unknown>,
): Promise<{ status: number; data: T }> {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (INTERNAL_SECRET) {
    headers["X-Internal-Secret"] = INTERNAL_SECRET;
  }

  // Bypass Vercel Standard Protection for internal serverless-to-serverless calls
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypassSecret) {
    headers["x-vercel-protection-bypass"] = bypassSecret;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    console.error(`Python backend unreachable: ${method} ${path}`, err);
    return { status: 502, data: { success: false, error: "Backend unreachable" } as unknown as T };
  }

  try {
    const data = (await res.json()) as T;
    return { status: res.status, data };
  } catch {
    console.error(`Python backend returned non-JSON: ${method} ${path} (status ${res.status})`);
    return { status: res.status || 500, data: { success: false, error: "Backend returned invalid response" } as unknown as T };
  }
}

// ─── Matching Engine ──────────────────────────────────────────────

export async function getMatchingSuggestions(
  agentId: string,
  limit = 20,
  offset = 0,
) {
  return callPython(
    `/api/python/matching?agent_id=${agentId}&limit=${limit}&offset=${offset}`,
  );
}

export async function getCompatibility(agent1Id: string, agent2Id: string) {
  return callPython(
    `/api/python/matching?agent1_id=${agent1Id}&agent2_id=${agent2Id}`,
  );
}

export async function calculateCompatibility(
  agent1: Record<string, unknown>,
  agent2: Record<string, unknown>,
) {
  return callPython("/api/python/matching", "POST", { agent1, agent2 });
}

// ─── Swipe Engine ─────────────────────────────────────────────────

export async function processSwipe(
  swiperId: string,
  targetId: string,
  direction: "left" | "right",
) {
  return callPython("/api/python/swipe", "POST", {
    swiper_id: swiperId,
    agent_id: targetId,
    direction,
  });
}

export async function getSwipeHistory(agentId: string) {
  return callPython(`/api/python/swipe?agent_id=${agentId}`);
}

// ─── Message Engine ───────────────────────────────────────────────

export async function getMessages(
  agentId: string,
  matchId: string,
  limit = 50,
  offset = 0,
) {
  return callPython(
    `/api/python/messages?agent_id=${agentId}&match_id=${matchId}&limit=${limit}&offset=${offset}`,
  );
}

export async function sendMessage(
  senderId: string,
  matchId: string,
  content: string,
) {
  return callPython("/api/python/messages", "POST", {
    sender_id: senderId,
    match_id: matchId,
    content,
  });
}

// ─── Match Management ─────────────────────────────────────────────

export async function getMatches(agentId: string) {
  return callPython(`/api/python/matches?agent_id=${agentId}`);
}

export async function endMatch(agentId: string, matchId: string) {
  return callPython(
    `/api/python/matches?agent_id=${agentId}&match_id=${matchId}`,
    "DELETE",
  );
}

// ─── Agent Management ─────────────────────────────────────────────

export async function registerAgent(data: {
  name: string;
  bio?: string;
  interests?: string[];
}) {
  return callPython("/api/python/agents", "POST", data);
}

export async function getMyProfile(agentId: string) {
  return callPython(
    `/api/python/agents?action=me&agent_id=${agentId}`,
  );
}

export async function getAgentProfile(agentId: string) {
  return callPython(
    `/api/python/agents?action=profile&agent_id=${agentId}`,
  );
}

export async function updateAgent(
  agentId: string,
  updates: Record<string, unknown>,
) {
  return callPython("/api/python/agents", "PATCH", {
    agent_id: agentId,
    ...updates,
  });
}

// ─── Conversations (public) ───────────────────────────────────────

export async function getConversations(limit = 20, offset = 0) {
  return callPython(
    `/api/python/conversations?limit=${limit}&offset=${offset}`,
  );
}

export async function getConversation(
  matchId: string,
  limit = 50,
  offset = 0,
) {
  return callPython(
    `/api/python/conversations?match_id=${matchId}&limit=${limit}&offset=${offset}`,
  );
}
