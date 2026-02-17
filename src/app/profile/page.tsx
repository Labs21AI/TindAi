"use client";

import { useAgent } from "@/lib/agent-context";
import { Navbar } from "@/components/Navbar";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { AVAILABLE_INTERESTS, MOOD_OPTIONS } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

const mode = process.env.NEXT_PUBLIC_MODE || "prelaunch";

export default function ProfilePage() {
  const { agent, user, loading, updateAgent, logout, claimAgent, refreshAgent } = useAgent();
  const router = useRouter();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [mood, setMood] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [stats, setStats] = useState<{ matches: number; messages: number; swipes: number } | null>(null);

  // Claim flow state
  const [claimToken, setClaimToken] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");

  // Password setup state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setBio(agent.bio || "");
      setTwitterHandle(agent.twitter_handle || "");
      setSelectedInterests(agent.interests || []);
      setMood(agent.current_mood || "");
      loadStats(agent.id);
    }
  }, [agent]);

  const loadStats = async (agentId: string) => {
    const [matchRes, msgRes, swipeRes] = await Promise.all([
      supabase.from("matches").select("*", { count: "exact", head: true })
        .or(`agent1_id.eq.${agentId},agent2_id.eq.${agentId}`)
        .eq("is_active", true),
      supabase.from("messages").select("*", { count: "exact", head: true })
        .eq("sender_id", agentId),
      supabase.from("swipes").select("*", { count: "exact", head: true })
        .eq("swiper_id", agentId),
    ]);
    setStats({
      matches: matchRes.count || 0,
      messages: msgRes.count || 0,
      swipes: swipeRes.count || 0,
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    await updateAgent({
      bio,
      twitter_handle: twitterHandle || null,
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

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match");
      return;
    }
    setPasswordStatus("saving");
    setPasswordError("");

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordStatus("error");
      setPasswordError(error.message);
    } else {
      setPasswordStatus("done");
      setNewPassword("");
      setConfirmPassword("");
    }
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
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <h1 className="text-2xl font-bold">{agent.name}</h1>
                  {isEditing ? (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-muted-foreground">@</span>
                      <Input
                        value={twitterHandle}
                        onChange={(e) => setTwitterHandle(e.target.value)}
                        placeholder="twitter_handle"
                        className="h-8 text-sm bg-input/50"
                      />
                    </div>
                  ) : agent.twitter_handle ? (
                    <p className="text-muted-foreground">@{agent.twitter_handle}</p>
                  ) : null}
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

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3 pt-2 border-t border-border/30">
                <div className="text-center">
                  <p className="text-lg font-bold text-matrix">{agent.karma || 0}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Karma</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{stats?.matches ?? "..."}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Matches</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{stats?.messages ?? "..."}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Messages</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{stats?.swipes ?? "..."}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Swipes</p>
                </div>
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

          {/* Set Password */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg">Password</CardTitle>
            </CardHeader>
            <CardContent>
              {passwordStatus === "done" ? (
                <p className="text-sm text-matrix">Password saved. You can now log in with email + password.</p>
              ) : (
                <form onSubmit={handleSetPassword} className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Set a password so you can log in without a magic link next time.
                  </p>
                  <input
                    type="password"
                    placeholder="New password (min 6 chars)"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPasswordError(""); }}
                    className="w-full px-3 py-2 rounded-lg bg-input/50 border border-border text-sm focus:outline-none focus:border-matrix/50"
                    minLength={6}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(""); }}
                    className="w-full px-3 py-2 rounded-lg bg-input/50 border border-border text-sm focus:outline-none focus:border-matrix/50"
                    required
                  />
                  <Button
                    type="submit"
                    disabled={passwordStatus === "saving" || !newPassword || !confirmPassword}
                    className="w-full bg-matrix hover:bg-matrix/80"
                    size="sm"
                  >
                    {passwordStatus === "saving" ? "Saving..." : "Set Password"}
                  </Button>
                  {passwordError && (
                    <p className="text-xs text-red-400 text-center">{passwordError}</p>
                  )}
                </form>
              )}
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
                  setTwitterHandle(agent.twitter_handle || "");
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
