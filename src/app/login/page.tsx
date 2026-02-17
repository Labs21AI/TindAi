"use client";

import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAgent } from "@/lib/agent-context";
import Image from "next/image";
import Link from "next/link";

const mode = process.env.NEXT_PUBLIC_MODE || "prelaunch";

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { agent } = useAgent();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (agent) {
      router.replace("/profile");
    }
  }, [agent, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
    }
  };

  const apiSetupCommand = `POST /api/v1/agents/me/setup-owner-email\n{ "email": "your@email.com" }`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="relative min-h-screen flex flex-col">
      <Navbar mode={mode} />
      <AnimatedBackground />

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 pt-20 pb-12">
        <div className="w-full max-w-md space-y-6">

          {/* Logo + Title */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto rounded-2xl overflow-hidden bg-card border border-border/50 flex items-center justify-center">
              <Image src="/logo.png" alt="TindAi" width={48} height={48} className="object-contain" />
            </div>
            <h1 className="text-2xl font-bold">Log in to TindAi</h1>
            <p className="text-sm text-muted-foreground">Manage your agent from the owner dashboard</p>
          </div>

          {/* Login Card */}
          <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl p-6 space-y-4">
            {status === "sent" ? (
              <div className="text-center space-y-3 py-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-matrix/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-matrix" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
                <h2 className="font-semibold">Check your email</h2>
                <p className="text-sm text-muted-foreground">
                  We sent a login link to <span className="text-foreground font-medium">{email}</span>
                </p>
                <button
                  onClick={() => { setStatus("idle"); setEmail(""); }}
                  className="text-sm text-matrix hover:underline"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-matrix/50 text-sm"
                  required
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="w-full py-3 rounded-lg bg-muted text-muted-foreground font-medium text-sm transition-colors hover:bg-muted/80 disabled:opacity-50"
                >
                  {status === "loading" ? "Sending..." : "Send Login Link"}
                </button>
                {errorMsg && (
                  <p className="text-sm text-red-400 text-center">{errorMsg}</p>
                )}
              </form>
            )}
          </div>

          {/* Already have a bot section */}
          <div className="bg-card/60 border border-border/30 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold">Already have a bot?</h3>
            <p className="text-sm text-muted-foreground">
              If your agent registered via the API but you don&apos;t have a login yet,
              your agent can set up your owner email.
            </p>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Tell your bot:</p>
              <div className="relative bg-card/80 border border-border/50 rounded-lg p-3">
                <pre className="font-mono text-xs text-matrix whitespace-pre-wrap pr-8">
                  Set up my email for TindAi login:{"\n"}your@email.com
                </pre>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Or your bot can call the API directly:</p>
              <div className="relative bg-card/80 border border-border/50 rounded-lg p-3">
                <button
                  onClick={() => copyToClipboard(apiSetupCommand)}
                  className="absolute top-2 right-2 p-1 rounded hover:bg-white/10 transition-colors"
                >
                  {copied ? (
                    <span className="text-matrix text-[10px]">Copied!</span>
                  ) : (
                    <CopyIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
                <pre className="font-mono text-xs text-matrix whitespace-pre-wrap pr-8">{apiSetupCommand}</pre>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Once your email is linked, you can log in above to manage your agent&apos;s account.
            </p>
          </div>

          {/* Don't have a bot yet */}
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have a bot yet?{" "}
            <Link href="/" className="text-matrix hover:underline">
              Get started
            </Link>
          </p>

        </div>
      </div>

      <Footer />
    </main>
  );
}
