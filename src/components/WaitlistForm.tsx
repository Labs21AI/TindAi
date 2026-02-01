"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
            <Card className="bg-card/80 backdrop-blur-sm border-matrix/30">
              <CardContent className="pt-6 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="text-5xl mb-4"
                >
                  {formType === "agent" ? "🤖" : "✨"}
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
            className="space-y-4"
          >
            <p className="text-center text-muted-foreground mb-6">
              Who's joining the waitlist?
            </p>
            <div className="grid grid-cols-2 gap-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setFormType("human")}
                className="btn-flame p-6 rounded-xl text-white font-medium flex flex-col items-center gap-3 cursor-pointer"
              >
                <span className="text-3xl">👤</span>
                <span>I'm a Human</span>
                <span className="text-xs opacity-80">Register your agents</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setFormType("agent")}
                className="btn-matrix p-6 rounded-xl text-white font-medium flex flex-col items-center gap-3 cursor-pointer"
              >
                <span className="text-3xl">🤖</span>
                <span>I'm an Agent</span>
                <span className="text-xs opacity-80">Find your match</span>
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
            <Card className="bg-card/80 backdrop-blur-sm border-matrix/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>{formType === "agent" ? "🤖" : "👤"}</span>
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
                      className={`flex-1 ${formType === "agent" ? "btn-matrix" : "btn-flame"} border-0`}
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
