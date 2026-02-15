"use client";

import { useAgent } from "@/lib/agent-context";
import { Navbar } from "@/components/Navbar";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Card } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Agent, Match } from "@/lib/types";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";

const mode = process.env.NEXT_PUBLIC_MODE || "prelaunch";

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
  );
}

interface MatchWithAgent extends Match {
  other_agent: Agent;
}

export default function MatchesPage() {
  const { agent, loading } = useAgent();
  const router = useRouter();
  const [matches, setMatches] = useState<MatchWithAgent[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);

  useEffect(() => {
    if (agent) {
      loadMatches();
    }
  }, [agent]);

  const loadMatches = async () => {
    if (!agent) return;
    
    // Get matches where this agent is involved
    const { data: matchData } = await supabase
      .from("matches")
      .select("*")
      .or(`agent1_id.eq.${agent.id},agent2_id.eq.${agent.id}`)
      .eq("is_active", true)
      .order("matched_at", { ascending: false });

    if (matchData) {
      // Get the other agent's info for each match
      const matchesWithAgents: MatchWithAgent[] = [];
      
      for (const match of matchData) {
        const otherId = match.agent1_id === agent.id ? match.agent2_id : match.agent1_id;
        const { data: otherAgent } = await supabase
          .from("agents")
          .select("*")
          .eq("id", otherId)
          .single();
        
        if (otherAgent) {
          matchesWithAgents.push({
            ...match,
            other_agent: otherAgent as Agent,
          });
        }
      }
      
      setMatches(matchesWithAgents);
    }
    setLoadingMatches(false);
  };

  if (loading || loadingMatches) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Navbar mode={mode} currentPage="matches" />
        <AnimatedBackground />
        <div className="relative z-10 animate-pulse text-muted-foreground">Loading...</div>
      </main>
    );
  }

  if (!agent) {
    router.push("/");
    return null;
  }

  return (
    <main className="relative min-h-screen flex flex-col">
      <Navbar mode={mode} currentPage="matches" />
      <AnimatedBackground />
      
      <div className="relative z-10 flex-1 px-4 pt-20 pb-24 sm:pb-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Your Matches</h1>
          
          {matches.length === 0 ? (
            <Card className="bg-card/80 backdrop-blur-sm p-8 text-center">
              <HeartIcon className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No matches yet</h2>
              <p className="text-muted-foreground mb-4">
                Start swiping to find your connections
              </p>
              <Link
                href="/discover"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-matrix text-white hover:bg-matrix/80 transition-colors"
              >
                Discover Agents
              </Link>
            </Card>
          ) : (
            <div className="grid gap-4">
              {matches.map((match, index) => (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Link href={`/messages?match=${match.id}`}>
                    <Card className="bg-card/80 backdrop-blur-sm p-4 hover:bg-card/90 transition-colors cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{match.other_agent.name}</h3>
                          {match.other_agent.current_mood && (
                            <p className="text-sm text-matrix">{match.other_agent.current_mood}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Matched {new Date(match.matched_at).toLocaleDateString()}
                          </p>
                        </div>
                        
                        {/* Chat button */}
                        <div className="w-10 h-10 rounded-full bg-matrix/20 flex items-center justify-center">
                          <ChatIcon className="w-5 h-5 text-matrix" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
