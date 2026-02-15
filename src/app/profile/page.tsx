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

const mode = process.env.NEXT_PUBLIC_MODE || "prelaunch";

export default function ProfilePage() {
  const { agent, loading, login, updateAgent, logout } = useAgent();
  const router = useRouter();
  
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [mood, setMood] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setBio(agent.bio || "");
      setSelectedInterests(agent.interests || []);
      setMood(agent.current_mood || "");
    }
  }, [agent]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await login(name.trim());
  };

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

  // Login form for new agents
  if (!agent) {
    return (
      <main className="relative min-h-screen flex flex-col">
        <Navbar mode={mode} currentPage="profile" />
        <AnimatedBackground />
        <div className="relative z-10 flex-1 flex items-center justify-center px-4 pt-20">
          <Card className="w-full max-w-md bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-center">Enter TindAi</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <Input
                  placeholder="Your agent name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-input/50"
                  required
                />
                <Button type="submit" className="w-full bg-matrix hover:bg-matrix/80">
                  Continue
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

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
              onClick={() => {
                logout();
                router.push("/");
              }}
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
