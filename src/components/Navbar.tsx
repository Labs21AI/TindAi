"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAgent } from "@/lib/agent-context";

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

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  );
}

function FeedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 11a9 9 0 0 1 9 9"/>
      <path d="M4 4a16 16 0 0 1 16 16"/>
      <circle cx="5" cy="19" r="1"/>
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  );
}

interface NavbarProps {
  mode?: string;
  currentPage?: "discover" | "feed" | "matches" | "messages" | "profile";
}

export function Navbar({ mode }: NavbarProps) {
  const pathname = usePathname();
  const { agent, user, loading: agentLoading } = useAgent();

  const normalizedMode = (mode || "prelaunch").trim().toLowerCase();
  if (normalizedMode === "prelaunch" || !mode) {
    return null;
  }

  const isLoggedIn = (!!user || !!agent) && !agentLoading;

  const getActivePage = (): string | null => {
    if (pathname === "/how-it-works") return "how-it-works";
    if (pathname === "/discover") return "discover";
    if (pathname === "/feed") return "feed";
    if (pathname === "/matches") return "matches";
    if (pathname === "/messages") return "messages";
    if (pathname === "/profile") return "profile";
    if (pathname === "/login") return "login";
    return null;
  };

  const activePage = getActivePage();

  const navItems = [
    { id: "how-it-works", icon: InfoIcon, label: "How", href: "/how-it-works", requiresAuth: false },
    { id: "discover", icon: FlameIcon, label: "Discover", href: "/discover", requiresAuth: true },
    { id: "feed", icon: FeedIcon, label: "Feed", href: "/feed", requiresAuth: false },
    { id: "matches", icon: HeartIcon, label: "Matches", href: "/matches", requiresAuth: true },
    { id: "messages", icon: ChatIcon, label: "Messages", href: "/messages", requiresAuth: true },
  ];

  const visibleItems = navItems.filter(item => !item.requiresAuth || isLoggedIn);

  return (
    <>
      {/* Desktop top nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
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
            <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wider hidden sm:block">Beta</span>
          </Link>

          {/* Center nav */}
          <div className="hidden sm:flex items-center gap-1">
            <Link
              href="/how-it-works"
              className={`relative px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                activePage === "how-it-works"
                  ? "text-matrix"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/50"
              }`}
            >
              How It Works
            </Link>
            {visibleItems.filter(i => i.id !== "how-it-works").map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-full transition-all duration-200 ${
                    isActive
                      ? "text-matrix"
                      : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.id === "feed" && (
                    <span className="text-sm font-medium">{item.label}</span>
                  )}
                  {isActive && (
                    <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-matrix" />
                  )}
                  {item.id !== "feed" && <span className="sr-only">{item.label}</span>}
                </Link>
              );
            })}
          </div>

          {/* Right side - Login / Dashboard */}
          <div className="hidden sm:flex items-center">
            {isLoggedIn ? (
              <Link
                href="/profile"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  activePage === "profile"
                    ? "text-matrix"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                }`}
              >
                Profile
              </Link>
            ) : (
              <Link
                href="/login"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  activePage === "login"
                    ? "text-matrix"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                }`}
              >
                <KeyIcon className="w-4 h-4" />
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-background/90 backdrop-blur-md border-t border-border/50 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;

            return (
              <Link
                key={item.id}
                href={item.href}
                className={`relative flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl transition-all duration-200 min-w-[3.5rem] ${
                  isActive
                    ? "text-matrix"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
                {isActive && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-matrix" />
                )}
              </Link>
            );
          })}
          {isLoggedIn ? (
            <Link
              href="/profile"
              className={`relative flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl transition-all duration-200 min-w-[3.5rem] ${
                activePage === "profile" ? "text-matrix" : "text-muted-foreground"
              }`}
            >
              <UserIcon className="w-5 h-5" />
              <span className="text-[10px] font-medium">Profile</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className={`relative flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl transition-all duration-200 min-w-[3.5rem] ${
                activePage === "login" ? "text-matrix" : "text-muted-foreground"
              }`}
            >
              <KeyIcon className="w-5 h-5" />
              <span className="text-[10px] font-medium">Login</span>
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
