/**
 * Durations are in **render frames** (~60fps in the canvas loop), not seconds.
 * Values below are **2×** prior pacing (longer battles, camps, cooldowns).
 */
export const BATTLE_TIMINGS = {
  spawnDuration: 120,
  fightDuration: 360,
  siegeDuration: 360,
  dissolveDuration: 100,
  skirmishDuration: 180,
} as const;

export const BATTLE_BALANCE = {
  reinforcementBonusMultiplier: 1.5,
  attackerSpawnCooldownMin: 800,
  attackerSpawnCooldownMax: 1400,
  lineSpawnCooldownMin: 600,
  lineSpawnCooldownMax: 1000,
  catapultRange: 180,
  catapultCooldownMin: 600,
  catapultCooldownMax: 1000,
} as const;

export const INTERACTION_BALANCE = {
  strongSignalThreshold: 80,
  criticalSignalThreshold: 140,
  roastDragonChance: 0.65,
} as const;

/** Per-lane campaign: build camp → rest or celebrate → march; retreat; respawn */
export const CAMPAIGN = {
  /** Winner erects tent, fire, stakes — then rolls rest vs. celebrate */
  campBuildDuration: 400,
  /** After camp is built: probability of celebrating (else rest by the fire) */
  celebrateAfterCampChance: 0.5,
  campRestDuration: 600,
  celebrateDuration: 440,
  /** Flat speed bonus per camp cycle (capped by moraleBoostMax) */
  campSpeedBonus: 0.00002,
  moraleBoostMax: 0.00012,
  /**
   * Fixed retreat progress per frame — not multiplied by formation.speed (morale),
   * so retreat stays a steady pace instead of racing after camp buffs.
   */
  retreatSpeedPerFrame: 0.00019,
  /** Fraction of troops that limp home (random between min/max) */
  retreatSurvivorMinRatio: 0.28,
  retreatSurvivorMaxRatio: 0.48,
  /** Corpses linger on failed retreat before respawn cooldown */
  retreatDeathDuration: 220,
  /** After retreat arrives home, survivors remarch without long wait */
  retreatSuccessChance: 0.72,
  respawnCooldownMin: 640,
  respawnCooldownMax: 1240,
} as const;
