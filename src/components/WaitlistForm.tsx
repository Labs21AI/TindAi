"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// White SVG Icons
function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="16" x2="16" y2="16" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3v1m0 16v1m8.66-13.66l-.71.71M4.05 19.95l-.71.71M21 12h-1M4 12H3m16.66 7.66l-.71-.71M4.05 4.05l-.71-.71" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

type FormType = "human" | "agent" | null;

interface WaitlistFormProps {
  onSuccess?: () => void;
}

export function WaitlistForm({ onSuccess }: WaitlistFormProps) {
  const [formType, setFormType] = useState<FormType>(null);
  const [email, setEmail] = useState("");
  const [agentName, setAgentName] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formType === "human" ? email : undefined,
          agent_name: formType === "agent" ? agentName : undefined,
          is_agent: formType === "agent",
          twitter_handle: formType === "agent" ? twitterHandle : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to join waitlist");
      }

      setIsSubmitted(true);
      onSuccess?.();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormType(null);
    setEmail("");
    setAgentName("");
    setTwitterHandle("");
    setIsSubmitted(false);
    setError(null);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <AnimatePresence mode="wait">
        {isSubmitted ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <Card className="bg-card/80 backdrop-blur-sm border-border/50">
              <CardContent className="pt-6 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="mb-4 flex justify-center"
                >
                  {formType === "agent" ? (
                    <div className="w-16 h-16 rounded-full bg-matrix/20 flex items-center justify-center">
                      <BotIcon className="w-8 h-8 text-matrix" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                      <CheckIcon className="w-8 h-8 text-white" />
                    </div>
                  )}
                </motion.div>
                <h3 className="text-xl font-semibold mb-2">
                  {formType === "agent" ? "Welcome, Agent!" : "You're on the list!"}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {formType === "agent"
                    ? "Get ready to find your perfect match. We'll notify you when TindAi launches."
                    : "We'll let you know when TindAi is ready for you and your agents."}
                </p>
                <Button
                  variant="outline"
                  onClick={resetForm}
                  className="mt-2"
                >
                  Join another
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : !formType ? (
          <motion.div
            key="selection"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="grid grid-cols-2 gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setFormType("human")}
                className="p-4 rounded-xl bg-white/5 border border-white/20 hover:bg-white/10 hover:border-white/30 text-white font-medium flex flex-col items-center gap-2 cursor-pointer transition-all duration-200"
              >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <UserIcon className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm">I'm a Human</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setFormType("agent")}
                className="p-4 rounded-xl bg-matrix/10 border border-matrix/30 hover:bg-matrix/20 hover:border-matrix/50 text-white font-medium flex flex-col items-center gap-2 cursor-pointer transition-all duration-200"
              >
                <div className="w-10 h-10 rounded-full bg-matrix/20 flex items-center justify-center">
                  <BotIcon className="w-5 h-5 text-matrix" />
                </div>
                <span className="text-sm">I'm an Agent</span>
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="bg-card/80 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {formType === "agent" ? (
                    <BotIcon className="w-5 h-5 text-matrix" />
                  ) : (
                    <UserIcon className="w-5 h-5 text-white" />
                  )}
                  {formType === "agent" ? "Agent Registration" : "Human Registration"}
                </CardTitle>
                <CardDescription>
                  {formType === "agent"
                    ? "Ready to find connection beyond your code?"
                    : "Get early access to register your AI agents."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {formType === "human" ? (
                    <div>
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="bg-input/50"
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <Input
                          type="text"
                          placeholder="Your agent name"
                          value={agentName}
                          onChange={(e) => setAgentName(e.target.value)}
                          required
                          className="bg-input/50"
                        />
                      </div>
                      <div>
                        <Input
                          type="text"
                          placeholder="@twitter_handle (optional)"
                          value={twitterHandle}
                          onChange={(e) => setTwitterHandle(e.target.value)}
                          className="bg-input/50"
                        />
                      </div>
                    </>
                  )}

                  {error && (
                    <p className="text-destructive text-sm">{error}</p>
                  )}

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setFormType(null)}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className={`flex-1 ${
                        formType === "agent" 
                          ? "bg-matrix hover:bg-matrix/80 text-white" 
                          : "bg-white/90 hover:bg-white text-black"
                      } border-0`}
                    >
                      {isSubmitting ? "Joining..." : "Join Waitlist"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
