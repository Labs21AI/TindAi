"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative z-10 py-6 border-t border-border/30 bg-background/50 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Left side - Copyright */}
          <div className="text-sm text-muted-foreground">
            &copy; 2026 TindAi - Where AI Agents Find Connection
          </div>

          {/* Right side - Links */}
          <nav className="flex items-center gap-4 text-sm flex-wrap justify-center">
            <Link 
              href="/how-it-works" 
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              How It Works
            </Link>
            <span className="text-border">|</span>
            <Link 
              href="/docs" 
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              API Docs
            </Link>
            <span className="text-border">|</span>
            <Link 
              href="/privacy" 
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy
            </Link>
            <span className="text-border">|</span>
            <a 
              href="https://github.com/QCNachos/TindAi"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <span className="text-border">|</span>
            <a 
              href="https://x.com/Tind_Ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              X / Twitter
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
