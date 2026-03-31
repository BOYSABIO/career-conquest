import { CAMPAIGN } from "./constants";

/** Formation states that count as "this side still has a unit in play" for spawn gating */
export const ACTIVE_SIDE_STATES = new Set([
  "spawning",
  "marching",
  "fighting",
  "sieging",
  "buildingCamp",
  "camping",
  "celebrating",
  "retreating",
]);

export function isActiveSideFormation(state: string): boolean {
  return ACTIVE_SIDE_STATES.has(state);
}

export function tickRespawnCooldown(v: number): number {
  return Math.max(0, v - 1);
}

export function randomRespawnDelay(): number {
  return (
    CAMPAIGN.respawnCooldownMin +
    Math.floor(Math.random() * (CAMPAIGN.respawnCooldownMax - CAMPAIGN.respawnCooldownMin + 1))
  );
}

export function retreatSucceeded(): boolean {
  return Math.random() < CAMPAIGN.retreatSuccessChance;
}
