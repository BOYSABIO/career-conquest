"use client";

import { useState, useEffect } from "react";
import { getSupabase } from "@/lib/supabase";

export function usePresence() {
  const [count, setCount] = useState(1);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setCount(1);
      return;
    }

    const channel = supabase.channel("battlefield-presence", {
      config: { presence: { key: crypto.randomUUID() } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const totalUsers = Object.keys(state).length;
        setCount(Math.max(1, totalUsers));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, []);

  return count;
}
