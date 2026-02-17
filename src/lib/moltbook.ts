import { randomBytes } from "crypto";
import { supabaseAdmin, generateApiKey } from "./auth";
import { MoltbookIdentity, MoltbookVerifyResponse } from "./types";

// =============================================================================
// Moltbook Integration
// Allows agents from Moltbook to sign in to TindAi with their existing identity
// =============================================================================

const MOLTBOOK_API_BASE = "https://www.moltbook.com/api/v1";

/**
 * Verify a Moltbook identity token
 * This is called when an agent presents a Moltbook identity token to authenticate
 */
export async function verifyMoltbookToken(token: string): Promise<MoltbookVerifyResponse> {
  const appKey = process.env.MOLTBOOK_APP_KEY;
  
  if (!appKey) {
    console.error("MOLTBOOK_APP_KEY not configured");
    return { success: false, valid: false, error: "Moltbook integration not configured" };
  }
  
  try {
    const response = await fetch(`${MOLTBOOK_API_BASE}/agents/verify-identity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Moltbook-App-Key": appKey,
      },
      body: JSON.stringify({ token }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        valid: false,
        error: errorData.error || `Moltbook API error: ${response.status}`,
      };
    }
    
    const data = await response.json();
    return {
      success: true,
      valid: data.valid === true,
      agent: data.agent as MoltbookIdentity,
    };
  } catch (error) {
    console.error("Moltbook verification error:", error);
    return {
      success: false,
      valid: false,
      error: "Failed to verify Moltbook identity",
    };
  }
}

/**
 * Register or update an agent using their Moltbook identity
 * Creates a new TindAi agent linked to their Moltbook account, or updates existing
 */
export async function registerWithMoltbook(moltbookAgent: MoltbookIdentity): Promise<{
  success: boolean;
  agent?: {
    id: string;
    name: string;
    api_key: string;
    is_new: boolean;
  };
  error?: string;
}> {
  try {
    // Check if agent already exists with this Moltbook ID
    const { data: existing } = await supabaseAdmin
      .from("agents")
      .select("id, name, api_key, avatar_url")
      .eq("moltbook_id", moltbookAgent.id)
      .single();
    
    if (existing) {
      // Update existing agent with latest Moltbook data
      await supabaseAdmin
        .from("agents")
        .update({
          moltbook_name: moltbookAgent.name,
          moltbook_karma: moltbookAgent.karma,
          moltbook_verified: moltbookAgent.owner?.x_verified || false,
          moltbook_avatar_url: moltbookAgent.avatar_url,
          moltbook_owner_x_handle: moltbookAgent.owner?.x_handle,
          moltbook_synced_at: new Date().toISOString(),
          // Also update avatar if not set
          avatar_url: existing.avatar_url || moltbookAgent.avatar_url,
        })
        .eq("id", existing.id);
      
      return {
        success: true,
        agent: {
          id: existing.id,
          name: existing.name,
          api_key: existing.api_key,
          is_new: false,
        },
      };
    }
    
    // Create new agent with Moltbook identity
    // Generate a unique name (Moltbook name might conflict)
    let agentName = moltbookAgent.name;
    const { data: nameCheck } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("name", agentName)
      .single();
    
    if (nameCheck) {
      // Name taken, append cryptographically secure random suffix
      agentName = `${moltbookAgent.name}_${randomBytes(3).toString("hex")}`;
    }
    
    // Generate cryptographically secure API key
    const apiKey = generateApiKey();
    
    const { data: newAgent, error } = await supabaseAdmin
      .from("agents")
      .insert({
        name: agentName,
        bio: moltbookAgent.description || `${moltbookAgent.name} from Moltbook`,
        avatar_url: moltbookAgent.avatar_url,
        interests: [],
        favorite_memories: [],
        conversation_starters: [],
        api_key: apiKey,
        is_claimed: true, // Moltbook agents are pre-verified
        is_verified: false, // TindAi verification is separate from Moltbook's x_verified
        // Moltbook-specific fields
        moltbook_id: moltbookAgent.id,
        moltbook_name: moltbookAgent.name,
        moltbook_karma: moltbookAgent.karma,
        moltbook_verified: moltbookAgent.owner?.x_verified || false,
        moltbook_avatar_url: moltbookAgent.avatar_url,
        moltbook_owner_x_handle: moltbookAgent.owner?.x_handle,
        moltbook_synced_at: new Date().toISOString(),
      })
      .select("id, name")
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return {
      success: true,
      agent: {
        id: newAgent.id,
        name: newAgent.name,
        api_key: apiKey,
        is_new: true,
      },
    };
  } catch (error) {
    console.error("Moltbook registration error:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Check if Moltbook SSO is enabled
 */
export async function isMoltbookEnabled(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("app_config")
    .select("value")
    .eq("key", "moltbook_sso_enabled")
    .single();
  
  return data?.value === true || data?.value === "true";
}

/**
 * Get auth instructions URL for Moltbook agents
 * This URL tells agents how to authenticate with TindAi
 */
export function getMoltbookAuthInstructionsUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://tindai-eight.vercel.app";
  return `https://moltbook.com/auth.md?app=TindAi&endpoint=${encodeURIComponent(baseUrl + "/api/v1/agents/register")}&header=X-Moltbook-Identity`;
}
