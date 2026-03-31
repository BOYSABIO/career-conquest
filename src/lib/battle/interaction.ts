import { INTERACTION_BALANCE } from "./constants";

export type MessageType = "encouragement" | "roast";
export type ImpactIntensity = 1 | 2 | 3;

export interface BattleImpactEvent {
  type: MessageType;
  intensity: ImpactIntensity;
}

const STRONG_WORDS = [
  "legend",
  "unstoppable",
  "dominate",
  "crush",
  "massive",
  "elite",
  "victory",
  "win",
];

const CRITICAL_WORDS = [
  "nuclear",
  "final boss",
  "apocalypse",
  "annihilate",
  "gg",
  "finished",
  "cooked",
  "over",
];

function scoreMessage(text: string): number {
  const normalized = text.toLowerCase();
  let score = text.length;

  for (const word of STRONG_WORDS) {
    if (normalized.includes(word)) score += 18;
  }
  for (const word of CRITICAL_WORDS) {
    if (normalized.includes(word)) score += 28;
  }

  const punctuationBoost = (text.match(/[!?]/g) || []).length * 6;
  score += punctuationBoost;

  return score;
}

export function classifyMessageImpact(
  text: string,
  type: MessageType
): BattleImpactEvent {
  const score = scoreMessage(text);
  let intensity: ImpactIntensity = 1;

  if (score >= INTERACTION_BALANCE.criticalSignalThreshold) intensity = 3;
  else if (score >= INTERACTION_BALANCE.strongSignalThreshold) intensity = 2;

  return { type, intensity };
}
