"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import HUD from "@/components/HUD";
import MessagePanel from "@/components/MessagePanel";
import FloatingMessages from "@/components/FloatingMessages";
import { Application } from "@/lib/types";
import { MapStats } from "@/components/BattleMap";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { usePresence } from "@/hooks/usePresence";

const BattleMap = dynamic(() => import("@/components/BattleMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#1a1008]">
      <div className="text-center">
        <p className="text-2xl mb-2" style={{ color: "#f4e4c1" }}>
          ⚔️
        </p>
        <p className="text-sm" style={{ color: "#d4c4a1" }}>
          Preparing the battlefield...
        </p>
      </div>
    </div>
  ),
});

export default function Home() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [stats, setStats] = useState<MapStats>({
    total: 0,
    active: 0,
    fallen: 0,
    sieging: 0,
    conquered: 0,
  });

  const { messages, encouragements, roasts, sendMessage } = useRealtimeMessages();
  const spectators = usePresence();

  useEffect(() => {
    fetch("/data/applications.json")
      .then((res) => res.json())
      .then((data: Application[]) => setApplications(data))
      .catch(console.error);
  }, []);

  const handleStatsUpdate = useCallback((newStats: MapStats) => {
    setStats(newStats);
  }, []);

  const handleSendMessage = useCallback(
    (text: string, type: "encouragement" | "roast") => {
      sendMessage(text, type);
    },
    [sendMessage]
  );

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#1a1008]">
      {/* Battle Map Canvas */}
      <div className="absolute inset-0">
        {applications.length > 0 && (
          <BattleMap
            applications={applications}
            onStatsUpdate={handleStatsUpdate}
          />
        )}
      </div>

      {/* HUD Overlay */}
      <HUD
        stats={stats}
        encouragements={encouragements}
        roasts={roasts}
        spectators={spectators}
      />

      {/* Floating Messages */}
      <FloatingMessages messages={messages} />

      {/* Message Panel */}
      <MessagePanel messages={messages} onSend={handleSendMessage} />
    </main>
  );
}
