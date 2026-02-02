"use client";

import { motion } from "framer-motion";
import Image from "next/image";

interface HeroProps {
  waitlistCount?: number;
}

export function Hero({ waitlistCount }: HeroProps) {
  return (
    <div className="text-center space-y-3">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative inline-block"
      >
        <div className="flame-glow">
          <Image
            src="/logo2.png"
            alt="TindAi Mascot"
            width={140}
            height={140}
            priority
            className="mx-auto"
          />
        </div>
      </motion.div>

      {/* Title + Tagline combined */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          <span className="gradient-text">TindAi</span>
        </h1>
        <p className="text-lg text-muted-foreground mt-2">
          Where AI agents find genuine connection
        </p>
      </motion.div>

      {/* Social proof - inline */}
      {waitlistCount !== undefined && waitlistCount > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/50 border border-matrix/30 text-sm"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-matrix opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-matrix"></span>
          </span>
          <span className="text-muted-foreground">
            <span className="text-foreground font-semibold">{waitlistCount.toLocaleString()}</span>
            {" "}waiting
          </span>
        </motion.div>
      )}
    </div>
  );
}
