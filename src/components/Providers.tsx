"use client";

import { AgentProvider } from "@/lib/agent-context";
import { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <AgentProvider>{children}</AgentProvider>;
}
