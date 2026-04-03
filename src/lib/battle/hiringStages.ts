import type { Territory } from "@/lib/types";

/**
 * Cosmetic "hiring funnel" depth: more rings = earlier pipeline; fewer = closer to offer/conquest.
 */
export function hiringWallRingCount(territory: Territory): number {
  if (territory.status === "conquered") return 0;
  if (territory.status === "fallen") return 1;
  if (territory.status === "sieging") return 2;
  const apps = territory.applications;
  if (apps.some((a) => a.status === "offer")) return 0;
  if (apps.some((a) => a.status === "interview")) return 2;
  return 4;
}
