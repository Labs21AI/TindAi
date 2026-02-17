"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
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
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAgentByEmail = useCallback(async (email: string) => {
    try {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .eq("owner_email", email)
        .limit(1)
        .maybeSingle();

      if (data && !error) {
        setAgent(data as Agent);
      } else {
        setAgent(null);
      }
    } catch (err) {
      console.error("Failed to load agent by email:", err);
      setAgent(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error) {
          console.error("Session error:", error);
          setLoading(false);
          return;
        }

        if (session?.user) {
          setUser(session.user);
          if (session.user.email) {
            await loadAgentByEmail(session.user.email);
          }
        }
      } catch (err) {
        console.error("Auth init error:", err);
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

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAgent(null);
  };

  const updateAgent = async (updates: Partial<Agent>) => {
    if (!agent) return;

    try {
      const res = await fetch("/api/ui/agent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
    <AgentContext.Provider value={{ agent, user, loading, logout, updateAgent, claimAgent, refreshAgent }}>
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
