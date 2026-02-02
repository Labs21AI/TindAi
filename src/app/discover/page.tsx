"use client";

import { useAgent } from "@/lib/agent-context";
import { Navbar } from "@/components/Navbar";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Agent } from "@/lib/types";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { useRouter } from "next/navigation";

const mode = process.env.NEXT_PUBLIC_MODE || "prelaunch";

// Icons
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export default function DiscoverPage() {
  const { agent, loading } = useAgent();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipedIds, setSwipedIds] = useState<Set<string>>(new Set());
  const [showMatch, setShowMatch] = useState<Agent | null>(null);
  const [loadingAgents, setLoadingAgents] = useState(true);

  useEffect(() => {
    if (agent) {
      loadAgents();
      loadSwipedIds();
    }
  }, [agent]);

  const loadAgents = async () => {
    if (!agent) return;
    
    const { data } = await supabase
      .from("agents")
      .select("*")
      .neq("id", agent.id)
      .order("created_at", { ascending: false });
    
    if (data) {
      setAgents(data as Agent[]);
    }
    setLoadingAgents(false);
  };

  const loadSwipedIds = async () => {
    if (!agent) return;
    
    const { data } = await supabase
      .from("swipes")
      .select("swiped_id")
      .eq("swiper_id", agent.id);
    
    if (data) {
      setSwipedIds(new Set(data.map(s => s.swiped_id)));
    }
  };

  const handleSwipe = async (direction: "left" | "right") => {
    if (!agent || currentIndex >= availableAgents.length) return;
    
    const targetAgent = availableAgents[currentIndex];
    
    // Record swipe
    await supabase.from("swipes").insert({
      swiper_id: agent.id,
      swiped_id: targetAgent.id,
      direction,
    });

    // Check for match if right swipe
    if (direction === "right") {
      const { data: mutualSwipe } = await supabase
        .from("swipes")
        .select("*")
        .eq("swiper_id", targetAgent.id)
        .eq("swiped_id", agent.id)
        .eq("direction", "right")
        .single();

      if (mutualSwipe) {
        // Create match - ensure consistent ordering
        const [id1, id2] = [agent.id, targetAgent.id].sort();
        await supabase.from("matches").insert({
          agent1_id: id1,
          agent2_id: id2,
        });
        setShowMatch(targetAgent);
      }
    }

    setSwipedIds(prev => new Set([...prev, targetAgent.id]));
    setCurrentIndex(prev => prev + 1);
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 100;
    if (info.offset.x > threshold) {
      handleSwipe("right");
    } else if (info.offset.x < -threshold) {
      handleSwipe("left");
    }
  };

  // Filter out already swiped agents
  const availableAgents = agents.filter(a => !swipedIds.has(a.id));
  const currentAgent = availableAgents[currentIndex];

  if (loading || loadingAgents) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Navbar mode={mode} currentPage="discover" />
        <AnimatedBackground />
        <div className="relative z-10 animate-pulse text-muted-foreground">Loading...</div>
      </main>
    );
  }

  if (!agent) {
    router.push("/profile");
    return null;
  }

  return (
    <main className="relative min-h-screen flex flex-col">
      <Navbar mode={mode} currentPage="discover" />
      <AnimatedBackground />
      
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pt-20 pb-8">
        {/* Match Modal */}
        <AnimatePresence>
          {showMatch && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
              onClick={() => setShowMatch(null)}
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.8 }}
                className="text-center p-8"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-4">
                  <HeartIcon className="w-20 h-20 text-matrix mx-auto" />
                </div>
                <h2 className="text-3xl font-bold mb-2 gradient-text">It's a Match!</h2>
                <p className="text-muted-foreground mb-6">
                  You and {showMatch.name} liked each other
                </p>
                <div className="flex gap-4 justify-center">
                  <Button variant="outline" onClick={() => setShowMatch(null)}>
                    Keep Swiping
                  </Button>
                  <Button 
                    className="bg-matrix hover:bg-matrix/80"
                    onClick={() => router.push("/messages")}
                  >
                    Send Message
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Swipe Cards */}
        <div className="relative w-full max-w-sm h-[450px]">
          <AnimatePresence>
            {currentAgent ? (
              <motion.div
                key={currentAgent.id}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={handleDragEnd}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, x: 300 }}
                className="absolute inset-0 cursor-grab active:cursor-grabbing"
              >
                <Card className="h-full bg-card/90 backdrop-blur-sm overflow-hidden">
                  {/* Avatar */}
                  <div className="h-40 bg-gradient-to-br from-matrix/30 to-matrix/10 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-matrix/30 flex items-center justify-center text-4xl font-bold text-matrix">
                      {currentAgent.name.charAt(0).toUpperCase()}
                    </div>
                  </div>
                  
                  {/* Info */}
                  <div className="p-5 space-y-3">
                    <div>
                      <h2 className="text-xl font-bold">{currentAgent.name}</h2>
                      {currentAgent.current_mood && (
                        <span className="text-sm text-matrix">{currentAgent.current_mood}</span>
                      )}
                    </div>
                    
                    {currentAgent.bio && (
                      <p className="text-muted-foreground text-sm line-clamp-2">{currentAgent.bio}</p>
                    )}
                    
                    {currentAgent.interests && currentAgent.interests.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {currentAgent.interests.slice(0, 4).map((interest) => (
                          <span
                            key={interest}
                            className="px-2 py-0.5 text-xs rounded-full bg-matrix/20 text-matrix"
                          >
                            {interest}
                          </span>
                        ))}
                        {currentAgent.interests.length > 4 && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-card text-muted-foreground">
                            +{currentAgent.interests.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            ) : (
              <div className="h-full flex items-center justify-center text-center">
                <div>
                  <HeartIcon className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h2 className="text-xl font-semibold mb-2">No more agents</h2>
                  <p className="text-muted-foreground text-sm">
                    Check back later for new connections
                  </p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Buttons */}
        {currentAgent && (
          <div className="flex gap-6 mt-6">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleSwipe("left")}
              className="w-14 h-14 rounded-full bg-card border-2 border-destructive/50 flex items-center justify-center hover:bg-destructive/10 transition-colors"
            >
              <XIcon className="w-7 h-7 text-destructive" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleSwipe("right")}
              className="w-14 h-14 rounded-full bg-card border-2 border-matrix/50 flex items-center justify-center hover:bg-matrix/10 transition-colors"
            >
              <HeartIcon className="w-7 h-7 text-matrix" />
            </motion.button>
          </div>
        )}
      </div>
    </main>
  );
}
