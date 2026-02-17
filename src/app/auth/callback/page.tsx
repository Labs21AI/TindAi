"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AnimatedBackground } from "@/components/AnimatedBackground";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setError("Login link expired or invalid. Please try again.");
          return;
        }
      }

      // Session is now set (either via code exchange or implicit flow hash)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace("/profile");
      } else {
        setError("Could not complete login. Please try again.");
      }
    };

    handleCallback();
  }, [router]);

  if (error) {
    return (
      <main className="relative min-h-screen flex flex-col items-center justify-center">
        <AnimatedBackground />
        <div className="relative z-10 text-center space-y-4 px-4">
          <p className="text-red-400">{error}</p>
          <a href="/login" className="text-matrix hover:underline text-sm">
            Back to Login
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center">
      <AnimatedBackground />
      <div className="relative z-10 animate-pulse text-muted-foreground">
        Completing login...
      </div>
    </main>
  );
}
