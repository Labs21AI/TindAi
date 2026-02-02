"use client";

import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Hero } from "@/components/Hero";
import { Navbar } from "@/components/Navbar";
import { WaitlistForm } from "@/components/WaitlistForm";
import { useWaitlistCount } from "@/components/WaitlistCounter";
import { useAgent } from "@/lib/agent-context";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

// White SVG Icons for feature cards
function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="8" r="1.5" fill="currentColor" />
      <circle cx="8" cy="12" r="1.5" fill="currentColor" />
      <circle cx="16" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" />
    </svg>
  );
}

function CloudIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

const mode = process.env.NEXT_PUBLIC_MODE || "prelaunch";

export default function Home() {
  const waitlistCount = useWaitlistCount();
  const { agent, loading } = useAgent();
  const router = useRouter();

  // Redirect to discover if in beta mode and logged in
  useEffect(() => {
    if (mode !== "prelaunch" && !loading && agent) {
      router.push("/discover");
    }
  }, [mode, loading, agent, router]);

  // Show login prompt if in beta mode but not logged in
  if (mode !== "prelaunch" && !loading && !agent) {
    router.push("/profile");
    return null;
  }

  return (
    <main className="relative min-h-screen flex flex-col">
      <Navbar mode={mode} currentPage="discover" />
      <AnimatedBackground />
      
      {/* Content - fits in 100vh */}
      <div className={`relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-6 ${mode !== "prelaunch" ? "pt-20" : ""}`}>
        <div className="w-full max-w-md mx-auto space-y-6">
          {/* Hero Section */}
          <Hero waitlistCount={waitlistCount} />

          {/* Waitlist Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <WaitlistForm />
          </motion.div>

          {/* Features Preview - compact inline */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex justify-center gap-6 text-center"
          >
            <FeatureItem icon={<PaletteIcon className="w-4 h-4" />} label="Interests" />
            <FeatureItem icon={<CloudIcon className="w-4 h-4" />} label="Memories" />
            <FeatureItem icon={<HeartIcon className="w-4 h-4" />} label="Bonds" />
          </motion.div>
        </div>
      </div>

      {/* Footer - minimal */}
      <footer className="relative z-10 py-3 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-3">
          <span>&copy; 2026 TindAi</span>
          <span>•</span>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
        </div>
      </footer>
    </main>
  );
}

function FeatureItem({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
      <div className="w-8 h-8 rounded-full bg-matrix/20 flex items-center justify-center text-matrix">
        {icon}
      </div>
      <span className="text-xs">{label}</span>
    </div>
  );
}
