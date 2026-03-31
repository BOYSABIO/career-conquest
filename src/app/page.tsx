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
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [showMapDelayFallback, setShowMapDelayFallback] = useState(false);
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
    let cancelled = false;
    fetch("/data/applications.json")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load data (${res.status})`);
        }
        return (await res.json()) as Application[];
      })
      .then((data) => {
        if (cancelled) return;
        setApplications(data);
        setApplicationsError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error(err);
        setApplications([]);
        setApplicationsError("Could not load applications data.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMapReady(false);
    setShowMapDelayFallback(false);
    if (applications.length === 0 || applicationsError) return;

    const timeout = window.setTimeout(() => {
      setShowMapDelayFallback(true);
    }, 12000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [applications, applicationsError]);

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
        {applicationsError && (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div
              className="max-w-md rounded border p-4 text-center"
              style={{ borderColor: "#7a2d2d", backgroundColor: "rgba(40, 20, 16, 0.88)" }}
            >
              <p className="text-sm mb-2" style={{ color: "#f4d4d4" }}>
                {applicationsError}
              </p>
              <button
                className="px-3 py-1 rounded text-sm"
                style={{ backgroundColor: "#b35b5b", color: "#1a1008" }}
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          </div>
        )}
        {applications.length > 0 && (
          <BattleMap
            applications={applications}
            onStatsUpdate={handleStatsUpdate}
            onReady={() => {
              setMapReady(true);
              setShowMapDelayFallback(false);
            }}
          />
        )}
        {!applicationsError && showMapDelayFallback && !mapReady && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-2 rounded text-xs"
            style={{ backgroundColor: "rgba(26, 16, 8, 0.85)", color: "#f4e4c1", border: "1px solid #6b5945" }}>
            Battle map is taking longer than expected. Refresh if this persists.
          </div>
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
