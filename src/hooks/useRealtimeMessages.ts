"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { GuestMessage } from "@/lib/types";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export function useRealtimeMessages() {
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [encouragements, setEncouragements] = useState(0);
  const [roasts, setRoasts] = useState(0);
  const channelRef = useRef<ReturnType<
    NonNullable<ReturnType<typeof getSupabase>>["channel"]
  > | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    // Fetch existing messages
    supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (data) {
          const msgs = data as GuestMessage[];
          setMessages(msgs);
          setEncouragements(msgs.filter((m) => m.type === "encouragement").length);
          setRoasts(msgs.filter((m) => m.type === "roast").length);
        }
      });

    // Subscribe to new messages
    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as GuestMessage;
          setMessages((prev) => [...prev, newMsg]);
          if (newMsg.type === "encouragement") {
            setEncouragements((prev) => prev + 1);
          } else {
            setRoasts((prev) => prev + 1);
          }

          // Trigger canvas animation
          const trigger = (window as any).__battleMapTriggerEffect;
          if (trigger) {
            trigger(newMsg.type === "roast" ? "catapult" : "ram");
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string, type: "encouragement" | "roast", author?: string) => {
      const supabase = getSupabase();

      const newMessage: GuestMessage = {
        id: Date.now().toString(),
        text,
        type,
        author: author || "Anonymous",
        created_at: new Date().toISOString(),
      };

      if (supabase) {
        // Insert into Supabase — the realtime subscription will handle the state update
        await supabase.from("messages").insert({
          text,
          type,
          author: author || "Anonymous",
        });
      } else {
        // Offline mode: update state directly
        setMessages((prev) => [...prev, newMessage]);
        if (type === "encouragement") {
          setEncouragements((prev) => prev + 1);
        } else {
          setRoasts((prev) => prev + 1);
        }

        // Trigger canvas animation locally
        const trigger = (window as any).__battleMapTriggerEffect;
        if (trigger) {
          trigger(type === "roast" ? "catapult" : "ram");
        }
      }
    },
    []
  );

  return { messages, encouragements, roasts, sendMessage };
}
