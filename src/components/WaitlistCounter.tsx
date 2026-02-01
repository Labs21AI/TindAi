"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useWaitlistCount() {
  const [count, setCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    const fetchCount = async () => {
      const { count: waitlistCount } = await supabase
        .from("waitlist")
        .select("*", { count: "exact", head: true });
      
      setCount(waitlistCount ?? 0);
    };

    fetchCount();

    // Subscribe to changes
    const channel = supabase
      .channel("waitlist-count")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "waitlist" },
        () => {
          setCount((prev) => (prev ?? 0) + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
