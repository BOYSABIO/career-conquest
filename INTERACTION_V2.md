# Spectator Interaction V2

This document defines how audience messages influence the battle simulation.

## Goals

- Make spectator input feel meaningful, not purely cosmetic.
- Keep the system deterministic enough to tune.
- Preserve current behavior as the baseline for low-intensity messages.

## Event Model

Each incoming message is classified into:

- `type`: `encouragement` or `roast`
- `intensity`: `1 | 2 | 3`

Classification currently uses a lightweight score:

- Base score from message length.
- Bonus for strong keywords (`legend`, `victory`, `crush`, etc.).
- Extra bonus for critical keywords (`cooked`, `gg`, `apocalypse`, etc.).
- Bonus for expressive punctuation (`!` and `?`).

Intensity thresholds:

- `< 80` -> `1` (normal)
- `80-139` -> `2` (strong)
- `>= 140` -> `3` (critical)

## Battle Effects

### Encouragement

- Intensity 1: spawn 1 friendly reinforcement wave.
- Intensity 2: spawn 2 friendly reinforcement waves.
- Intensity 3: spawn 3 friendly reinforcement waves.
- Friendly wave type is randomized between `ram` and `super`.

### Roast

- Intensity 1: 1 catapult burst + 1 enemy reinforcement wave.
- Intensity 2: 2 catapult bursts + 2 enemy reinforcement waves.
- Intensity 3: 3 catapult bursts + 3 enemy reinforcement waves.
- Enemy wave type is weighted toward dragons (`roastDragonChance`).

## Tuning Surface

Core values live in `src/lib/battle/constants.ts`:

- `INTERACTION_BALANCE.strongSignalThreshold`
- `INTERACTION_BALANCE.criticalSignalThreshold`
- `INTERACTION_BALANCE.roastDragonChance`

## Future Extensions

- Add per-user cooldown to prevent spam amplification.
- Add territory-targeted messages (vote for where reinforcements land).
- Add anti-streak balancing so repeated roasts/encouragements have diminishing returns.
