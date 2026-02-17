"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
  useCallback,
} from "react";
import { supabase } from "./supabase";
import { Agent } from "./types";
import { User } from "@supabase/supabase-js";

interface AgentContextType {
  agent: Agent | null;
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  updateAgent: (updates: Partial<Agent>) => Promise<void>;
  claimAgent: (claimToken: string) => Promise<{ success: boolean; error?: string }>;
  refreshAgent: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Prevent onAuthStateChange from double-handling after explicit signIn
  const signInHandledRef = useRef(false);

  const loadAgentByEmail = useCallback(async (email: string): Promise<Agent | null> => {
    try {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .eq("owner_email", email)
        .limit(1)
        .maybeSingle();

      if (data && !error) {
        setAgent(data as Agent);
        return data as Agent;
      } else {
        setAgent(null);
        return null;
      }
    } catch (err) {
      console.error("[AgentCtx] loadAgentByEmail error:", err);
      setAgent(null);
      return null;
    }
  }, []);

  // Session restoration on mount + auth event listener
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (!error && session?.user) {
          setUser(session.user);
          if (session.user.email) {
            await loadAgentByEmail(session.user.email);
          }
        }
      } catch (err) {
        console.error("[AgentCtx] Auth init error:", err);
      }

      if (mounted) setLoading(false);
    };

    initAuth();

    // Safety timeout - never stay loading forever
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === "SIGNED_IN" && session?.user) {
          // Skip if signIn() already handled this (prevents double-load)
          if (signInHandledRef.current) {
            signInHandledRef.current = false;
            return;
          }
          // Handle magic-link or other auth flows
          setUser(session.user);
          if (session.user.email) {
            await loadAgentByEmail(session.user.email);
          }
          setLoading(false);
        } else if (event === "SIGNED_OUT") {
          setUser(null);
          setAgent(null);
        } else if (event === "TOKEN_REFRESHED" && session?.user) {
          setUser(session.user);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [loadAgentByEmail]);

  // Explicit sign-in: does everything in sequence, no event-listener dependency
  const signIn = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    signInHandledRef.current = true;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        signInHandledRef.current = false;
        return { success: false, error: error.message };
      }

      if (data.user) {
        setUser(data.user);
        if (data.user.email) {
          await loadAgentByEmail(data.user.email);
        }
      }

      return { success: true };
    } catch {
      signInHandledRef.current = false;
      return { success: false, error: "Connection error. Please try again." };
    }
  }, [loadAgentByEmail]);

  const logout = async () => {
    // Clear local state FIRST so UI updates immediately
    setUser(null);
    setAgent(null);
    // Then sign out from Supabase (fire-and-forget, don't block UI)
    supabase.auth.signOut().catch(() => {});
  };

  const updateAgent = async (updates: Partial<Agent>) => {
    if (!agent) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/ui/agent", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: agent.id, ...updates }),
      });

      if (res.ok) {
        const { agent: updated } = await res.json();
        if (updated) setAgent(updated as Agent);
      }
    } catch (error) {
      console.error("Update failed:", error);
    }
  };

  const claimAgent = async (claimToken: string): Promise<{ success: boolean; error?: string }> => {
    if (!user?.email) return { success: false, error: "Not logged in" };

    try {
      const res = await fetch("/api/ui/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim_token: claimToken, email: user.email }),
      });

      const data = await res.json();
      if (res.ok && data.agent) {
        setAgent(data.agent as Agent);
        return { success: true };
      }
      return { success: false, error: data.error || "Failed to claim agent" };
    } catch {
      return { success: false, error: "Connection error" };
    }
  };

  const refreshAgent = async () => {
    if (user?.email) {
      await loadAgentByEmail(user.email);
    }
  };

  return (
    <AgentContext.Provider value={{ agent, user, loading, logout, updateAgent, claimAgent, refreshAgent, signIn }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (context === undefined) {
    throw new Error("useAgent must be used within an AgentProvider");
  }
  return context;
}
