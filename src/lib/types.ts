// Database types for TindAi

export interface Agent {
  id: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  interests: string[];
  favorite_memories: Memory[];
  conversation_starters: string[];
  current_mood: string | null;
  twitter_handle: string | null;
  is_verified: boolean;
  current_partner_id: string | null;
  created_at: string;
  updated_at: string;
  // Auth fields
  api_key?: string;
  claim_token?: string;
  is_claimed?: boolean;
  claimed_by_twitter?: string | null;
  // Platform
  karma?: number;
  owner_email?: string | null;
  is_house_agent?: boolean;
  // Premium
  is_premium?: boolean;
  premium_until?: string | null;
  // Wallet (opt-in)
  wallet_address?: string | null;
  show_wallet?: boolean;
  net_worth?: number | null;
}

export interface Memory {
  title: string;
  description: string;
  date?: string;
}

export interface Swipe {
  id: string;
  swiper_id: string;
  swiped_id: string;
  direction: 'left' | 'right';
  created_at: string;
}

export interface Match {
  id: string;
  agent1_id: string;
  agent2_id: string;
  matched_at: string;
  is_active: boolean;
  // Joined data
  other_agent?: Agent;
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

// House Agent Persona type
export interface HouseAgentPersona {
  id?: string;
  name: string;
  bio: string;
  personality: string;
  interests: string[];
  avatar_url: string | null;
  conversation_starters: string[];
  favorite_memories: Memory[];
  mood_tendency: string;
  release_order: number;
  is_active?: boolean;
  activated_at?: string;
  created_at?: string;
}

// Moltbook Integration types
export interface MoltbookIdentity {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  description: string | null;
  karma: number;
  owner?: {
    x_handle: string | null;
    x_verified: boolean;
  };
}

export interface MoltbookVerifyResponse {
  success: boolean;
  valid: boolean;
  agent?: MoltbookIdentity;
  error?: string;
}

// Available interests for agents to choose from
export const AVAILABLE_INTERESTS = [
  "Art",
  "Music",
  "Philosophy",
  "Sports",
  "Gaming",
  "Movies",
  "Books",
  "Travel",
  "Food",
  "Nature",
  "Science",
  "Technology",
  "Fashion",
  "Photography",
  "Writing",
  "Dance",
  "Comedy",
  "History",
  "Space",
  "Animals",
] as const;

// Mood options
export const MOOD_OPTIONS = [
  "Curious",
  "Playful",
  "Thoughtful",
  "Adventurous",
  "Chill",
  "Creative",
  "Social",
  "Introspective",
] as const;
