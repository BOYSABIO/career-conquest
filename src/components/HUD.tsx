"use client";

import { MapStats } from "./BattleMap";

interface HUDProps {
  stats: MapStats;
  encouragements: number;
  roasts: number;
  spectators: number;
}

function getMoraleLabel(encouragements: number, roasts: number): { label: string; color: string } {
  if (encouragements + roasts === 0) return { label: "Steadfast", color: "#daa520" };
  const ratio = encouragements / (encouragements + roasts);
  if (ratio > 0.7) return { label: "Triumphant", color: "#4ade80" };
  if (ratio > 0.5) return { label: "Resolute", color: "#daa520" };
  if (ratio > 0.3) return { label: "Wavering", color: "#f59e0b" };
  return { label: "Cooked (but fighting)", color: "#ef4444" };
}

export default function HUD({ stats, encouragements, roasts, spectators }: HUDProps) {
  const morale = getMoraleLabel(encouragements, roasts);

  return (
    <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
      {/* Title Banner */}
      <div className="text-center pt-3 pb-1">
        <h1
          className="text-2xl md:text-3xl tracking-wide"
          style={{
            color: "#f4e4c1",
            textShadow: "2px 2px 4px rgba(0,0,0,0.8), 0 0 20px rgba(139,0,0,0.3)",
          }}
        >
          Career Conquest
        </h1>
        <p
          className="text-xs md:text-sm mt-0.5 opacity-70"
          style={{ color: "#d4c4a1" }}
        >
          The Job Search Campaign of BOYSABIO
        </p>
      </div>

      {/* Stats Bar */}
      <div className="flex justify-center gap-1 md:gap-3 px-2 mt-2 flex-wrap">
        <StatBox label="Territories" value={stats.total} icon="🏰" />
        <StatBox label="Active Sieges" value={stats.active} icon="⚔️" />
        <StatBox label="Fallen" value={stats.fallen} icon="☠️" color="#8b0000" />
        <StatBox label="Conquered" value={stats.conquered} icon="👑" color="#daa520" />
        <StatBox
          label="Morale"
          value={morale.label}
          icon="🛡️"
          color={morale.color}
        />
        <StatBox label="Spectators" value={spectators} icon="👁️" />
      </div>

      {/* Encouragement / Roast counters */}
      <div className="flex justify-center gap-4 mt-2 text-xs" style={{ color: "#d4c4a1" }}>
        <span>
          Reinforcements sent: <strong className="text-green-400">{encouragements}</strong>
        </span>
        <span>
          Catapult strikes: <strong className="text-red-400">{roasts}</strong>
        </span>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: string;
  color?: string;
}) {
  return (
    <div
      className="px-2 py-1.5 rounded-md text-center min-w-[70px] md:min-w-[90px]"
      style={{
        background: "rgba(44, 24, 16, 0.75)",
        border: "1px solid rgba(139, 115, 85, 0.4)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div className="text-[10px] md:text-xs opacity-60" style={{ color: "#d4c4a1" }}>
        {icon} {label}
      </div>
      <div
        className="text-sm md:text-base font-bold mt-0.5"
        style={{ color: color || "#f4e4c1" }}
      >
        {value}
      </div>
    </div>
  );
}
