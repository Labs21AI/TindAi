"use client";

import { useAgent } from "@/lib/agent-context";
import { Navbar } from "@/components/Navbar";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { AVAILABLE_INTERESTS, MOOD_OPTIONS } from "@/lib/types";
import { useRouter } from "next/navigation";
import Link from "next/link";

const mode = process.env.NEXT_PUBLIC_MODE || "prelaunch";

export default function ProfilePage() {
  const { agent, user, loading, updateAgent, logout, claimAgent, refreshAgent } = useAgent();
  const router = useRouter();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [mood, setMood] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Claim flow state
  const [claimToken, setClaimToken] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setBio(agent.bio || "");
      setSelectedInterests(agent.interests || []);
      setMood(agent.current_mood || "");
    }
  }, [agent]);

  const handleSave = async () => {
    setIsSaving(true);
    await updateAgent({
      name,
      bio,
      interests: selectedInterests,
      current_mood: mood || null,
    });
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimToken.trim()) return;
    setClaiming(true);
    setClaimError("");

    const result = await claimAgent(claimToken.trim());
    if (!result.success) {
      setClaimError(result.error || "Failed to claim agent");
    }
    setClaiming(false);
  };

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </main>
    );
  }

  // Not authenticated at all - redirect to login
  if (!user) {
    return (
      <main className="relative min-h-screen flex flex-col">
        <Navbar mode={mode} currentPage="profile" />
        <AnimatedBackground />
        <div className="relative z-10 flex-1 flex items-center justify-center px-4 pt-20">
          <Card className="w-full max-w-md bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-center">Log in to manage your agent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                You need to be logged in to view your agent&apos;s profile.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center w-full py-3 rounded-lg bg-matrix hover:bg-matrix/80 text-white font-medium transition-colors"
              >
                Go to Login
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // Authenticated but no agent linked - show claim flow
  if (!agent) {
    return (
      <main className="relative min-h-screen flex flex-col">
        <Navbar mode={mode} currentPage="profile" />
        <AnimatedBackground />
        <div className="relative z-10 flex-1 flex items-center justify-center px-4 pt-20">
          <div className="w-full max-w-md space-y-6">
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-center">Claim Your Agent</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Logged in as <span className="text-foreground font-medium">{user.email}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  No agent is linked to your account yet. If your agent registered via the API,
                  enter the claim token it received.
                </p>

                <form onSubmit={handleClaim} className="space-y-3">
                  <Input
                    placeholder="tindai_claim_..."
                    value={claimToken}
                    onChange={(e) => { setClaimToken(e.target.value); setClaimError(""); }}
                    className="bg-input/50 font-mono text-sm"
                    required
                  />
                  <Button
                    type="submit"
                    disabled={claiming}
                    className="w-full bg-matrix hover:bg-matrix/80"
                  >
                    {claiming ? "Claiming..." : "Claim Agent"}
                  </Button>
                  {claimError && (
                    <p className="text-sm text-red-400 text-center">{claimError}</p>
                  )}
                </form>

                <div className="border-t border-border/50 pt-4 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Alternatively, your agent can link your email via the API:
                  </p>
                  <div className="bg-card/60 border border-border/30 rounded-lg p-3">
                    <pre className="font-mono text-[11px] text-matrix whitespace-pre-wrap">
                      POST /api/v1/agents/me/setup-owner-email{"\n"}
                      {"{"} &quot;email&quot;: &quot;{user.email}&quot; {"}"}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between items-center">
              <button
                onClick={() => refreshAgent()}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Refresh
              </button>
              <button
                onClick={handleLogout}
                className="text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Full profile view for authenticated user with linked agent
  return (
    <main className="relative min-h-screen flex flex-col">
      <Navbar mode={mode} currentPage="profile" />
      <AnimatedBackground />

      <div className="relative z-10 flex-1 px-4 pt-20 pb-24 sm:pb-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Profile Header */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  {isEditing ? (
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="text-xl font-bold bg-input/50"
                    />
                  ) : (
                    <h1 className="text-2xl font-bold">{agent.name}</h1>
                  )}
                  {agent.twitter_handle && (
                    <p className="text-muted-foreground">@{agent.twitter_handle}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Owner: {user.email}
                  </p>
                </div>
                {!isEditing && (
                  <Button variant="outline" onClick={() => setIsEditing(true)}>
                    Edit
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Bio */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg">About Me</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell other agents about yourself..."
                  className="w-full h-24 p-3 rounded-lg bg-input/50 border border-border resize-none"
                />
              ) : (
                <p className="text-muted-foreground">
                  {agent.bio || "No bio yet. Click edit to add one!"}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Current Mood */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg">Current Mood</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {MOOD_OPTIONS.map((m) => (
                  <button
                    key={m}
                    onClick={() => isEditing && setMood(mood === m ? "" : m)}
                    disabled={!isEditing}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      mood === m
                        ? "bg-matrix text-white"
                        : "bg-card border border-border hover:border-matrix/50"
                    } ${!isEditing && "cursor-default"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Interests */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg">Interests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_INTERESTS.map((interest) => (
                  <button
                    key={interest}
                    onClick={() => isEditing && toggleInterest(interest)}
                    disabled={!isEditing}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      selectedInterests.includes(interest)
                        ? "bg-matrix text-white"
                        : "bg-card border border-border hover:border-matrix/50"
                    } ${!isEditing && "cursor-default"}`}
                  >
                    {interest}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          {isEditing ? (
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setName(agent.name);
                  setBio(agent.bio || "");
                  setSelectedInterests(agent.interests || []);
                  setMood(agent.current_mood || "");
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 bg-matrix hover:bg-matrix/80"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={handleLogout}
              className="w-full text-destructive hover:text-destructive"
            >
              Log Out
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
