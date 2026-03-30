"use client";

import { useEffect, useState, useRef } from "react";
import { GuestMessage } from "@/lib/types";

interface FloatingMessagesProps {
  messages: GuestMessage[];
}

interface FloatingMsg {
  id: string;
  text: string;
  type: "encouragement" | "roast";
  x: number;
  startTime: number;
}

export default function FloatingMessages({ messages }: FloatingMessagesProps) {
  const [floating, setFloating] = useState<FloatingMsg[]>([]);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      const newMessages = messages.slice(prevCountRef.current);
      const newFloating: FloatingMsg[] = newMessages.map((msg) => ({
        id: msg.id + "-float",
        text: msg.type === "encouragement" ? `⚔️ ${msg.text}` : `🔥 ${msg.text}`,
        type: msg.type,
        x: 15 + Math.random() * 50,
        startTime: Date.now(),
      }));
      setFloating((prev) => [...prev, ...newFloating]);
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  // Clean up expired messages
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setFloating((prev) => prev.filter((m) => now - m.startTime < 4000));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-15 overflow-hidden">
      {floating.map((msg) => {
        const elapsed = Date.now() - msg.startTime;
        const progress = Math.min(elapsed / 4000, 1);
        const y = 80 - progress * 80;
        const opacity = progress < 0.1 ? progress * 10 : progress > 0.7 ? (1 - progress) / 0.3 : 1;

        return (
          <div
            key={msg.id}
            className="absolute text-sm font-bold whitespace-nowrap px-3 py-1 rounded-full"
            style={{
              left: `${msg.x}%`,
              bottom: `${y}%`,
              opacity,
              color: msg.type === "encouragement" ? "#4ade80" : "#ef4444",
              background:
                msg.type === "encouragement"
                  ? "rgba(74, 222, 128, 0.15)"
                  : "rgba(239, 68, 68, 0.15)",
              textShadow: "1px 1px 2px rgba(0,0,0,0.5)",
              transition: "bottom 0.1s linear, opacity 0.3s",
              maxWidth: "280px",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {msg.text}
          </div>
        );
      })}
    </div>
  );
}
