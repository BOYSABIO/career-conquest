# Career Conquest Architecture

This project turns job application data into a live battlefield simulation.

## End-to-End Flow

1. Source data is authored in an Obsidian vault.
2. `scripts/parse-applications.ts` parses position notes plus `MASTER_APP_LIST.md`.
3. The parser writes normalized data to `public/data/applications.json`.
4. `src/app/page.tsx` loads that JSON and passes it into `src/components/BattleMap.tsx`.
5. `BattleMap` computes world layout (`src/lib/map-layout.ts`), terrain (`src/lib/terrain.ts`), and unit sprites (`src/lib/sprites.ts`), then runs a canvas render/update loop.
6. Realtime interaction is provided by Supabase through:
   - `src/hooks/useRealtimeMessages.ts` for message stream
   - `src/hooks/usePresence.ts` for spectator count
7. New audience messages trigger battle effects (`reinforcements` for encouragement, `catapult + enemy reinforcements` for roasts), and UI overlays update through:
   - `src/components/HUD.tsx`
   - `src/components/MessagePanel.tsx`
   - `src/components/FloatingMessages.tsx`

## Runtime Layers

- Data layer: parser output (`applications.json`) and optional Supabase realtime feed.
- Simulation layer: formation lifecycle, combat/skirmish transitions, siege projectiles, and special effects.
- Presentation layer: HTML overlays + single canvas world render.

## Status Mapping

Application status values drive territory state:

- `offer` -> `conquered`
- `interview` -> `sieging`
- all `reject` for a company -> `fallen`
- otherwise -> `active`

## Notes

- The app runs without Supabase, but spectator interaction degrades to local-only updates.
- Build uses parse-before-build (`npm run build` calls `npm run parse && next build`) so deployments always include fresh generated data.
