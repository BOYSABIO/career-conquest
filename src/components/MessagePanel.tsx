"use client";

import { useState, useRef, useEffect } from "react";
import { GuestMessage } from "@/lib/types";

interface MessagePanelProps {
  messages: GuestMessage[];
  onSend: (text: string, type: "encouragement" | "roast") => void;
}

export default function MessagePanel({ messages, onSend }: MessagePanelProps) {
  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (type: "encouragement" | "roast") => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed, type);
    setText("");
  };

  return (
    <div className="absolute bottom-0 right-0 z-20 p-3 max-w-sm w-full">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-2 px-4 rounded-t-lg text-sm font-bold transition-colors cursor-pointer"
        style={{
          background: "rgba(44, 24, 16, 0.9)",
          border: "1px solid rgba(139, 115, 85, 0.5)",
          borderBottom: isOpen ? "none" : "1px solid rgba(139, 115, 85, 0.5)",
          color: "#f4e4c1",
        }}
      >
        {isOpen ? "▼ War Council" : "▲ Join the Battle — Send a Message"}
      </button>

      {isOpen && (
        <div
          className="rounded-b-lg overflow-hidden"
          style={{
            background: "rgba(44, 24, 16, 0.92)",
            border: "1px solid rgba(139, 115, 85, 0.5)",
            borderTop: "none",
            backdropFilter: "blur(8px)",
          }}
        >
          {/* Message feed */}
          <div
            ref={feedRef}
            className="h-40 overflow-y-auto p-3 space-y-2"
            style={{ scrollbarWidth: "thin" }}
          >
            {messages.length === 0 ? (
              <p className="text-xs text-center opacity-40" style={{ color: "#d4c4a1" }}>
                No messages yet. Be the first to rally the troops!
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className="text-xs p-1.5 rounded"
                  style={{
                    background:
                      msg.type === "encouragement"
                        ? "rgba(74, 222, 128, 0.1)"
                        : "rgba(239, 68, 68, 0.1)",
                    borderLeft: `2px solid ${msg.type === "encouragement" ? "#4ade80" : "#ef4444"}`,
                    color: "#d4c4a1",
                  }}
                >
                  <span
                    className="font-bold mr-1"
                    style={{
                      color: msg.type === "encouragement" ? "#4ade80" : "#ef4444",
                    }}
                  >
                    {msg.type === "encouragement" ? "⚔️" : "🔥"}
                  </span>
                  {msg.text}
                  {msg.author && (
                    <span className="opacity-40 ml-1">— {msg.author}</span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Input */}
          <div className="p-3 pt-0">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && text.trim()) handleSend("encouragement");
              }}
              placeholder="Write your message..."
              maxLength={200}
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{
                background: "rgba(244, 228, 193, 0.1)",
                border: "1px solid rgba(139, 115, 85, 0.4)",
                color: "#f4e4c1",
              }}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleSend("encouragement")}
                disabled={!text.trim()}
                className="flex-1 py-2 rounded text-xs font-bold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-125"
                style={{
                  background: "rgba(74, 222, 128, 0.2)",
                  border: "1px solid rgba(74, 222, 128, 0.4)",
                  color: "#4ade80",
                }}
              >
                ⚔️ Send Reinforcements
              </button>
              <button
                onClick={() => handleSend("roast")}
                disabled={!text.trim()}
                className="flex-1 py-2 rounded text-xs font-bold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-125"
                style={{
                  background: "rgba(239, 68, 68, 0.2)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#ef4444",
                }}
              >
                🔥 Fire Catapult
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
