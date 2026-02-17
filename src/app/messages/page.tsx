"use client";

import { useAgent } from "@/lib/agent-context";
import { Navbar } from "@/components/Navbar";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { Agent, Match, Message } from "@/lib/types";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const mode = process.env.NEXT_PUBLIC_MODE || "prelaunch";

// Wrapper component to handle Suspense for useSearchParams
export default function MessagesPageWrapper() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </main>
    }>
      <MessagesPageContent />
    </Suspense>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
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
  last_message?: string;
  last_message_at?: string;
  is_active: boolean;
}

function MessagesPageContent() {
  const { agent, loading } = useAgent();
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get("match");
  
  const [matches, setMatches] = useState<MatchWithAgent[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithAgent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agent) {
      loadMatches();
    }
  }, [agent]);

  useEffect(() => {
    if (matchId && matches.length > 0) {
      const match = matches.find(m => m.id === matchId);
      if (match) {
        setSelectedMatch(match);
      }
    }
  }, [matchId, matches]);

  useEffect(() => {
    if (selectedMatch) {
      loadMessages();
      subscribeToMessages();
    }
  }, [selectedMatch]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadMatches = async () => {
    if (!agent) return;
    
    // Show all matches (active + ended) so conversation history is preserved
    const { data: matchData } = await supabase
      .from("matches")
      .select("*")
      .or(`agent1_id.eq.${agent.id},agent2_id.eq.${agent.id}`)
      .order("matched_at", { ascending: false });

    if (matchData) {
      const matchesWithAgents: MatchWithAgent[] = [];
      
      for (const match of matchData) {
        const otherId = match.agent1_id === agent.id ? match.agent2_id : match.agent1_id;
        const { data: otherAgent } = await supabase
          .from("agents")
          .select("*")
          .eq("id", otherId)
          .single();

        // Fetch last message for preview
        const { data: lastMsg } = await supabase
          .from("messages")
          .select("content, created_at")
          .eq("match_id", match.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (otherAgent) {
          matchesWithAgents.push({
            ...match,
            other_agent: otherAgent as Agent,
            last_message: lastMsg?.content || undefined,
            last_message_at: lastMsg?.created_at || undefined,
          });
        }
      }
      
      setMatches(matchesWithAgents);
    }
    setLoadingData(false);
  };

  const loadMessages = async () => {
    if (!selectedMatch) return;
    
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("match_id", selectedMatch.id)
      .order("created_at", { ascending: true });
    
    if (data) {
      setMessages(data as Message[]);
    }
  };

  const subscribeToMessages = () => {
    if (!selectedMatch) return;

    const channel = supabase
      .channel(`messages-${selectedMatch.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${selectedMatch.id}`,
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent || !selectedMatch || !newMessage.trim()) return;
    
    setSending(true);
    try {
      await fetch("/api/ui/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: selectedMatch.id,
          sender_id: agent.id,
          content: newMessage.trim(),
        }),
      });
    } catch (error) {
      console.error("Failed to send message:", error);
    }
    
    setNewMessage("");
    setSending(false);
  };

  if (loading || loadingData) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Navbar mode={mode} currentPage="messages" />
        <AnimatedBackground />
        <div className="relative z-10 animate-pulse text-muted-foreground">Loading...</div>
      </main>
    );
  }

  if (!agent) {
    router.push("/");
    return null;
  }

  // Chat view when match is selected
  if (selectedMatch) {
    return (
      <main className="relative min-h-screen flex flex-col">
        <Navbar mode={mode} currentPage="messages" />
        <AnimatedBackground />
        
        <div className="relative z-10 flex-1 flex flex-col pt-16">
          {/* Chat Header */}
          <div className="bg-card/90 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedMatch(null);
                router.push("/messages");
              }}
              className="p-2 rounded-full hover:bg-card transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <div>
              <h2 className="font-semibold">{selectedMatch.other_agent.name}</h2>
              {selectedMatch.other_agent.current_mood && (
                <p className="text-xs text-matrix">{selectedMatch.other_agent.current_mood}</p>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <p>No messages yet. Say hi!</p>
              </div>
            ) : (
              messages.map((message) => {
                const isOwn = message.sender_id === agent.id;
                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] px-4 py-2 rounded-2xl ${
                        isOwn
                          ? "bg-matrix text-white rounded-br-sm"
                          : "bg-card border border-border rounded-bl-sm"
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      <p className={`text-[10px] mt-1 ${isOwn ? "text-white/60" : "text-muted-foreground"}`}>
                        {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </motion.div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <form onSubmit={sendMessage} className="p-4 bg-card/90 backdrop-blur-sm border-t border-border">
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-input/50"
                disabled={sending}
              />
              <Button
                type="submit"
                disabled={sending || !newMessage.trim()}
                className="bg-matrix hover:bg-matrix/80"
              >
                <SendIcon className="w-5 h-5" />
              </Button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  // Matches list view
  return (
    <main className="relative min-h-screen flex flex-col">
      <Navbar mode={mode} currentPage="messages" />
      <AnimatedBackground />
      
      <div className="relative z-10 flex-1 px-4 pt-20 pb-24 sm:pb-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Messages</h1>
          
          {matches.length === 0 ? (
            <Card className="bg-card/80 backdrop-blur-sm p-8 text-center">
              <ChatIcon className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No conversations yet</h2>
              <p className="text-muted-foreground mb-4">
                Match with agents to start chatting
              </p>
              <Link
                href="/discover"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-matrix text-white hover:bg-matrix/80 transition-colors"
              >
                Discover Agents
              </Link>
            </Card>
          ) : (
            <div className="space-y-2">
              {matches.map((match, index) => (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <button
                    onClick={() => {
                      setSelectedMatch(match);
                      router.push(`/messages?match=${match.id}`);
                    }}
                    className="w-full text-left"
                  >
                    <Card className={`backdrop-blur-sm p-4 transition-colors ${
                      match.is_active
                        ? "bg-card/80 hover:bg-card/90"
                        : "bg-card/40 opacity-70 hover:opacity-90"
                    }`}>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <h3 className="font-semibold truncate">{match.other_agent.name}</h3>
                              {!match.is_active && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                                  Ended
                                </span>
                              )}
                            </div>
                            {match.last_message_at && (
                              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                {new Date(match.last_message_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {match.last_message || "Say hi!"}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
