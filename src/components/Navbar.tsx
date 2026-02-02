"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

// Icons for Tinder-style navigation
function FlameIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C10.97 2 9.5 3.5 9.5 3.5C7.5 5.5 6 8 6 11c0 3.31 2.69 6 6 6s6-2.69 6-6c0-3-1.5-5.5-3.5-7.5C14.5 3.5 13.03 2 12 2zm0 13c-1.66 0-3-1.34-3-3 0-1.66 1.34-3 3-3s3 1.34 3 3c0 1.66-1.34 3-3 3z"/>
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
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

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

interface NavbarProps {
  mode?: string;
  currentPage?: "discover" | "matches" | "messages" | "profile";
}

export function Navbar({ mode, currentPage = "discover" }: NavbarProps) {
  // Don't render navbar in prelaunch mode (check with trim and lowercase)
  const normalizedMode = (mode || "prelaunch").trim().toLowerCase();
  if (normalizedMode === "prelaunch" || !mode) {
    return null;
  }

  const navItems = [
    { id: "discover", icon: FlameIcon, label: "Discover", href: "/discover" },
    { id: "matches", icon: HeartIcon, label: "Matches", href: "/matches" },
    { id: "messages", icon: ChatIcon, label: "Messages", href: "/messages" },
    { id: "profile", icon: UserIcon, label: "Profile", href: "/profile" },
  ];

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50"
    >
      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-card border border-border/50 flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="TindAi"
              width={32}
              height={32}
              className="object-contain"
            />
          </div>
          <span className="font-bold text-lg gradient-text hidden sm:block">TindAi</span>
        </Link>

        {/* Navigation Icons - Tinder style */}
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`relative p-3 rounded-full transition-all duration-200 ${
                  isActive
                    ? "text-matrix"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                }`}
              >
                <Icon className="w-6 h-6" />
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-matrix"
                  />
                )}
                <span className="sr-only">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Right side - could add notifications or settings */}
        <div className="w-10" /> {/* Spacer for balance */}
      </div>
    </motion.nav>
  );
}
