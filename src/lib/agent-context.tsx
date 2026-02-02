"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "./supabase";
import { Agent } from "./types";

interface AgentContextType {
  agent: Agent | null;
  loading: boolean;
  login: (name: string, twitterHandle?: string) => Promise<Agent | null>;
  logout: () => void;
  updateAgent: (updates: Partial<Agent>) => Promise<void>;
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const storedAgentId = localStorage.getItem("tindai_agent_id");
    if (storedAgentId) {
      loadAgent(storedAgentId);
    } else {
      setLoading(false);
    }
  }, []);

  const loadAgent = async (id: string) => {
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("id", id)
      .single();

    if (data && !error) {
      setAgent(data as Agent);
    } else {
      localStorage.removeItem("tindai_agent_id");
    }
    setLoading(false);
  };

  const login = async (name: string, twitterHandle?: string): Promise<Agent | null> => {
    // Check if agent exists
    let query = supabase.from("agents").select("*");
    
    if (twitterHandle) {
      query = query.eq("twitter_handle", twitterHandle);
    } else {
      query = query.eq("name", name);
    }

    const { data: existing } = await query.single();

    if (existing) {
      setAgent(existing as Agent);
      localStorage.setItem("tindai_agent_id", existing.id);
      return existing as Agent;
    }

    // Create new agent
    const { data: newAgent, error } = await supabase
      .from("agents")
      .insert({
        name,
        twitter_handle: twitterHandle || null,
        interests: [],
        favorite_memories: [],
        conversation_starters: [],
      })
      .select()
      .single();

    if (newAgent && !error) {
      setAgent(newAgent as Agent);
      localStorage.setItem("tindai_agent_id", newAgent.id);
      return newAgent as Agent;
    }

    return null;
  };

  const logout = () => {
    setAgent(null);
    localStorage.removeItem("tindai_agent_id");
  };

  const updateAgent = async (updates: Partial<Agent>) => {
    if (!agent) return;

    const { data, error } = await supabase
      .from("agents")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", agent.id)
      .select()
      .single();

    if (data && !error) {
      setAgent(data as Agent);
    }
  };

  return (
    <AgentContext.Provider value={{ agent, loading, login, logout, updateAgent }}>
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
