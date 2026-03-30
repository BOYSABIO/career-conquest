"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Application as AppData, Territory, MapDimensions } from "@/lib/types";
import { computeMapLayout, computePath } from "@/lib/map-layout";
import { renderWorldBackground } from "@/lib/terrain";
import {
  generateMarchingFrames,
  generateFallenFrames,
  generateFightingFrames,
  generateCastleSprite,
  generateFortressSprite,
  generateCatapultFrames,
  generateBatteringRamFrames,
  generateFlagBearerFrames,
  generateSuperSoldierFrames,
  generateDragonFrames,
  SpriteFrames,
} from "@/lib/sprites";

interface BattleMapProps {
  applications: AppData[];
  onStatsUpdate?: (stats: MapStats) => void;
}

export interface MapStats {
  total: number;
  active: number;
  fallen: number;
  sieging: number;
  conquered: number;
}

type SoldierType = "spear" | "flag" | "shield";

interface FormationSoldier {
  row: number;
  col: number;
  type: SoldierType;
  frameOffset: number;
}

type FormationState =
  | "spawning"   // assembling at castle gate (fade in)
  | "marching"   // moving along path
  | "fighting"   // engaged in skirmish, stopped, swinging weapons
  | "sieging"     // arrived at fortress, attacking
  | "dissolving"  // fading out after siege
  | "cooldown";   // waiting to respawn

interface Formation {
  t: number;
  speed: number;
  soldiers: FormationSoldier[];
  state: FormationState;
  stateTimer: number;
  isDefender: boolean;
  opacity: number;
  reinforcementType?: "ram" | "super" | "dragon";
}

interface Skirmish {
  x: number;
  y: number;
  timer: number;
  maxTimer: number;
}

interface SiegeArrow {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  timer: number;
  maxTimer: number;
}

interface TroopLine {
  territory: Territory;
  path: { x: number; y: number }[];
  formations: Formation[];
  skirmishes: Skirmish[];
  arrows: SiegeArrow[];
  arrowCooldown: number;
  catapultCooldown: number;
  status: Territory["status"];
  spawnCooldown: number;
}

interface LiveEffect {
  type: "catapult";
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  frame: number;
  maxFrames: number;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

function buildFormationSoldiers(isDefender: boolean): FormationSoldier[] {
  const rows = 2 + Math.floor(Math.random() * 2);
  const cols = isDefender ? 2 : 2 + Math.floor(Math.random() * 2);
  const soldiers: FormationSoldier[] = [];

  for (let c = 0; c < cols; c++) {
    const isCenter = c === Math.floor(cols / 2) && !isDefender;
    soldiers.push({
      row: 0,
      col: c,
      type: isCenter ? "flag" : "spear",
      frameOffset: c,
    });
  }
  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      soldiers.push({
        row: r,
        col: c,
        type: Math.random() > 0.5 ? "spear" : "shield",
        frameOffset: r * cols + c,
      });
    }
  }
  return soldiers;
}

function createFormation(isDefender: boolean, startT: number): Formation {
  return {
    t: startT,
    speed: 0.00015 + Math.random() * 0.00008,
    soldiers: buildFormationSoldiers(isDefender),
    state: "spawning",
    stateTimer: 0,
    isDefender,
    opacity: 0,
  };
}

export default function BattleMap({ applications, onStatsUpdate }: BattleMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const troopLinesRef = useRef<TroopLine[]>([]);
  const effectsRef = useRef<LiveEffect[]>([]);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false,
    lastX: 0,
    lastY: 0,
  });
  const spritesRef = useRef<{
    marching?: SpriteFrames;
    fighting?: SpriteFrames;
    fallen?: SpriteFrames;
    catapult?: SpriteFrames;
    ram?: SpriteFrames;
    superSoldier?: SpriteFrames;
    dragon?: SpriteFrames;
    flagBearer?: SpriteFrames;
    castle?: HTMLCanvasElement;
    fortresses: Map<string, HTMLCanvasElement>;
    worldBg?: HTMLCanvasElement;
  }>({ fortresses: new Map() });
  const layoutRef = useRef<{
    territories: Territory[];
    dimensions: MapDimensions;
  } | null>(null);
  const screenRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const [isReady, setIsReady] = useState(false);

  const initialize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const screenW = rect.width;
    const screenH = rect.height;
    screenRef.current = { w: screenW, h: screenH };

    spritesRef.current.marching = generateMarchingFrames();
    spritesRef.current.fighting = generateFightingFrames();
    spritesRef.current.fallen = generateFallenFrames();
    spritesRef.current.catapult = generateCatapultFrames();
    spritesRef.current.superSoldier = generateSuperSoldierFrames();
    spritesRef.current.dragon = generateDragonFrames();
    spritesRef.current.ram = generateBatteringRamFrames();
    spritesRef.current.flagBearer = generateFlagBearerFrames();
    spritesRef.current.castle = generateCastleSprite("BOYSABIO's\nKingdom", true);

    // World-space layout (not tied to screen size)
    const layout = computeMapLayout(applications);
    layoutRef.current = layout;

    for (const territory of layout.territories) {
      spritesRef.current.fortresses.set(
        territory.id,
        generateFortressSprite(territory.company, territory.status)
      );
    }

    // Pre-render world background (terrain, borders, rivers, etc.)
    spritesRef.current.worldBg = renderWorldBackground(
      layout.territories,
      layout.dimensions
    );

    // Center camera on castle
    cameraRef.current = {
      x: layout.dimensions.castleX - screenW / 2,
      y: layout.dimensions.castleY - screenH / 2,
      zoom: 1,
    };

    // Create troop routes with lifecycle-managed formations
    const lines: TroopLine[] = [];

    for (const territory of layout.territories) {
      const path = computePath(
        layout.dimensions.castleX,
        layout.dimensions.castleY,
        territory.x,
        territory.y
      );

      if (territory.status === "fallen") {
        lines.push({
          territory, path, formations: [], skirmishes: [],
          arrows: [], arrowCooldown: 0, catapultCooldown: 0,
          status: territory.status, spawnCooldown: 0,
        });
        continue;
      }

      const formations: Formation[] = [];

      // First attacker: start already marching partway so map isn't empty
      const attacker = createFormation(false, 0.15 + Math.random() * 0.3);
      attacker.state = "marching";
      attacker.opacity = 1;
      formations.push(attacker);

      // First defender: start coming back from the fortress
      const defender = createFormation(true, 0.7 + Math.random() * 0.2);
      defender.state = "marching";
      defender.opacity = 1;
      formations.push(defender);

      lines.push({
        territory, path, formations, skirmishes: [],
        arrows: [], arrowCooldown: 0,
        catapultCooldown: 600 + Math.floor(Math.random() * 800),
        status: territory.status,
        spawnCooldown: 300 + Math.floor(Math.random() * 200),
      });
    }
    troopLinesRef.current = lines;

    if (onStatsUpdate) {
      onStatsUpdate({
        total: layout.territories.length,
        active: layout.territories.filter((t) => t.status === "active").length,
        fallen: layout.territories.filter((t) => t.status === "fallen").length,
        sieging: layout.territories.filter((t) => t.status === "sieging").length,
        conquered: layout.territories.filter((t) => t.status === "conquered").length,
      });
    }

    setIsReady(true);
  }, [applications, onStatsUpdate]);

  // --- Camera controls ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e: MouseEvent) => {
      dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
      canvas.style.cursor = "grabbing";
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;

      const cam = cameraRef.current;
      cam.x -= dx / cam.zoom;
      cam.y -= dy / cam.zoom;
    };

    const onMouseUp = () => {
      dragRef.current.dragging = false;
      canvas.style.cursor = "grab";
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current;
      const rect = canvas.getBoundingClientRect();

      // Mouse position in screen coords
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // World position under mouse before zoom
      const worldXBefore = cam.x + mx / cam.zoom;
      const worldYBefore = cam.y + my / cam.zoom;

      // Apply zoom
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      cam.zoom = Math.max(0.3, Math.min(3, cam.zoom * zoomFactor));

      // Adjust camera so the world point under mouse stays fixed
      cam.x = worldXBefore - mx / cam.zoom;
      cam.y = worldYBefore - my / cam.zoom;
    };

    // Touch support
    let lastTouchDist = 0;
    let lastTouchX = 0;
    let lastTouchY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        dragRef.current = {
          dragging: true,
          lastX: e.touches[0].clientX,
          lastY: e.touches[0].clientY,
        };
      } else if (e.touches.length === 2) {
        lastTouchDist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        lastTouchX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && dragRef.current.dragging) {
        const dx = e.touches[0].clientX - dragRef.current.lastX;
        const dy = e.touches[0].clientY - dragRef.current.lastY;
        dragRef.current.lastX = e.touches[0].clientX;
        dragRef.current.lastY = e.touches[0].clientY;
        const cam = cameraRef.current;
        cam.x -= dx / cam.zoom;
        cam.y -= dy / cam.zoom;
      } else if (e.touches.length === 2) {
        const newDist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        const cam = cameraRef.current;
        const scale = newDist / lastTouchDist;
        cam.zoom = Math.max(0.3, Math.min(3, cam.zoom * scale));
        lastTouchDist = newDist;
      }
    };

    const onTouchEnd = () => {
      dragRef.current.dragging = false;
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    canvas.style.cursor = "grab";

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // --- Render loop ---
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layoutRef.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const screenW = screenRef.current.w;
    const screenH = screenRef.current.h;
    const cam = cameraRef.current;

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#1a1008";
    ctx.fillRect(0, 0, screenW, screenH);

    ctx.save();
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const layout = layoutRef.current;
    const sprites = spritesRef.current;
    const tick = Date.now();

    if (sprites.worldBg) {
      ctx.drawImage(sprites.worldBg, 0, 0);
    }

    // Draw fortresses (before troops so troops render on top)
    for (const territory of layout.territories) {
      const fortressSprite = sprites.fortresses.get(territory.id);
      if (fortressSprite) {
        ctx.drawImage(fortressSprite, territory.x - 40, territory.y - 32);
      }
      if (territory.status === "fallen") {
        const rejectCount = territory.applications.filter((a) => a.status === "reject").length;
        drawCasualtyCounter(ctx, territory.x, territory.y - 38, rejectCount);
      }
    }

    // ========== FORMATION LIFECYCLE UPDATE + RENDER ==========
    const ROW_SPACING = 14;
    const COL_SPACING = 10;
    const SPAWN_DURATION = 60;
    const FIGHT_DURATION = 120;
    const SIEGE_DURATION = 180;
    const DISSOLVE_DURATION = 50;
    const SKIRMISH_DURATION = 90;

    for (const line of troopLinesRef.current) {
      // -- Fallen territories: just draw corpses --
      if (line.status === "fallen") {
        if (sprites.fallen) {
          for (let i = 0; i < line.territory.applications.length; i++) {
            const fx = line.territory.x - 20 + i * 15;
            const fy = line.territory.y + 22 + (i % 2) * 5;
            ctx.drawImage(sprites.fallen.frames[0], fx, fy);
          }
        }
        continue;
      }

      // -- Spawn cooldown: periodically spawn new waves --
      line.spawnCooldown--;
      if (line.spawnCooldown <= 0) {
        const hasActiveAttacker = line.formations.some(
          (f) => !f.isDefender && f.state !== "cooldown"
        );
        const hasActiveDefender = line.formations.some(
          (f) => f.isDefender && f.state !== "cooldown"
        );

        if (!hasActiveAttacker) {
          line.formations.push(createFormation(false, 0));
        }
        if (!hasActiveDefender) {
          line.formations.push(createFormation(true, 1));
        }
        line.spawnCooldown = 400 + Math.floor(Math.random() * 300);
      }

      // -- Enemy catapult: fortress fires when attackers get close --
      line.catapultCooldown--;
      if (line.catapultCooldown <= 0) {
        const CATAPULT_RANGE = 180;
        const tx = line.territory.x;
        const ty = line.territory.y;

        // Only fire at attackers within range of the fortress
        const nearbyAttackers = line.formations.filter((f) => {
          if (f.isDefender || f.state !== "marching") return false;
          const idx = Math.floor(f.t * (line.path.length - 1));
          const pt = line.path[idx];
          const dist = Math.sqrt((pt.x - tx) ** 2 + (pt.y - ty) ** 2);
          return dist < CATAPULT_RANGE;
        });

        if (nearbyAttackers.length > 0) {
          const target = nearbyAttackers[Math.floor(Math.random() * nearbyAttackers.length)];
          const targetPathIdx = Math.floor(target.t * (line.path.length - 1));
          const targetPos = line.path[targetPathIdx];

          effectsRef.current.push({
            type: "catapult",
            x: tx,
            y: ty - 10,
            targetX: targetPos.x + (Math.random() - 0.5) * 20,
            targetY: targetPos.y + (Math.random() - 0.5) * 15,
            frame: 0,
            maxFrames: 150,
          });
          line.catapultCooldown = 300 + Math.floor(Math.random() * 200);
        } else {
          line.catapultCooldown = 60;
        }
      }

      // -- Update each formation's state --
      for (let fi = line.formations.length - 1; fi >= 0; fi--) {
        const formation = line.formations[fi];
        formation.stateTimer++;

        switch (formation.state) {
          case "spawning":
            formation.opacity = Math.min(1, formation.stateTimer / SPAWN_DURATION);
            if (formation.stateTimer >= SPAWN_DURATION) {
              formation.state = "marching";
              formation.stateTimer = 0;
              formation.opacity = 1;
            }
            break;

          case "marching":
            if (formation.isDefender) {
              formation.t -= formation.speed;
              if (formation.t <= 0.08) {
                formation.state = "dissolving";
                formation.stateTimer = 0;
              }
            } else {
              formation.t += formation.speed;
              if (formation.t >= 0.92) {
                formation.state = "sieging";
                formation.stateTimer = 0;
              }
            }
            break;

          case "fighting":
            if (formation.stateTimer >= FIGHT_DURATION) {
              formation.state = "marching";
              formation.stateTimer = 0;
            }
            break;

          case "sieging":
            if (formation.stateTimer >= SIEGE_DURATION) {
              formation.state = "dissolving";
              formation.stateTimer = 0;
            }
            break;

          case "dissolving":
            formation.opacity = Math.max(0, 1 - formation.stateTimer / DISSOLVE_DURATION);
            if (formation.stateTimer >= DISSOLVE_DURATION) {
              formation.state = "cooldown";
              formation.stateTimer = 0;
            }
            break;

          case "cooldown":
            line.formations.splice(fi, 1);
            continue;
        }

        // -- Skirmish detection: attacker vs defender on same route --
        if (formation.state === "marching" && !formation.isDefender) {
          for (const other of line.formations) {
            if (!other.isDefender || other.state !== "marching") continue;
            const tDist = Math.abs(formation.t - other.t);
            if (tDist < 0.04) {
              const skirmishPathIdx = Math.floor(
                ((formation.t + other.t) / 2) * (line.path.length - 1)
              );
              const skPt = line.path[skirmishPathIdx];
              const alreadyNear = line.skirmishes.some(
                (s) => Math.abs(s.x - skPt.x) < 30 && Math.abs(s.y - skPt.y) < 30
              );
              if (!alreadyNear) {
                line.skirmishes.push({
                  x: skPt.x, y: skPt.y,
                  timer: 0, maxTimer: SKIRMISH_DURATION,
                });
              }

              // Both stop and enter fighting state
              formation.state = "fighting";
              formation.stateTimer = 0;
              other.state = "fighting";
              other.stateTimer = 0;

              // Reinforcements get a combat bonus (+50% effective size)
              const reinforcementBonus = 1.5;
              const attackerSize = formation.soldiers.length *
                (formation.reinforcementType ? reinforcementBonus : 1);
              const defenderSize = other.soldiers.length *
                (other.reinforcementType ? reinforcementBonus : 1);
              const totalSize = attackerSize + defenderSize;
              const attackerWinChance = attackerSize / totalSize;
              const roll = Math.random();

              if (roll < attackerWinChance) {
                // Attacker wins — defender dissolves after the fight
                other.state = "dissolving";
                other.stateTimer = 0;
              } else {
                // Defender wins — attacker dissolves after the fight
                formation.state = "dissolving";
                formation.stateTimer = 0;
              }
            }
          }
        }
      }

      // -- Render each formation --
      for (const formation of line.formations) {
        if (formation.state === "cooldown") continue;

        const pathLen = line.path.length - 1;
        const clampedT = Math.max(0, Math.min(1, formation.t));
        const pathIndex = Math.floor(clampedT * pathLen);
        const pos = line.path[pathIndex];
        const nextIndex = Math.min(pathIndex + 1, pathLen);
        const nextPos = line.path[nextIndex];

        const ddx = nextPos.x - pos.x;
        const ddy = nextPos.y - pos.y;
        const pathDirLen = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        const dirX = ddx / pathDirLen;
        const dirY = ddy / pathDirLen;
        const perpX = -dirY;
        const perpY = dirX;

        const facingRight = formation.isDefender ? ddx < 0 : ddx >= 0;

        ctx.save();
        ctx.globalAlpha = formation.opacity;

        const isCombat = formation.state === "fighting" || formation.state === "sieging";

        // ---- REINFORCEMENT: Battering Ram ----
        if (formation.reinforcementType === "ram") {
          const ramSprite = sprites.ram;
          if (ramSprite) {
            const frameIndex = Math.floor(tick / 180) % ramSprite.frames.length;

            ctx.save();
            ctx.translate(pos.x, pos.y);
            if (!facingRight) ctx.scale(-1, 1);

            // Ram impact shake during siege
            if (isCombat) {
              const shake = Math.sin(tick * 0.03) * 3;
              ctx.translate(shake, Math.abs(shake) * 0.5);
            }

            ctx.drawImage(
              ramSprite.frames[frameIndex],
              -ramSprite.width / 2,
              -ramSprite.height / 2
            );
            ctx.restore();
          }

          // Glow: gold for friendly, red for enemy reinforcements
          if (formation.state !== "dissolving") {
            const glowColor = formation.isDefender
              ? `rgba(200, 50, 50, ${0.3 + 0.15 * Math.sin(tick * 0.005)})`
              : `rgba(218, 165, 32, ${0.3 + 0.15 * Math.sin(tick * 0.005)})`;
            ctx.strokeStyle = glowColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 22, 0, Math.PI * 2);
            ctx.stroke();
          }

        // ---- REINFORCEMENT: Super Soldier ----
        } else if (formation.reinforcementType === "super") {
          const superSprite = isCombat ? sprites.fighting : sprites.superSoldier;
          if (superSprite) {
            const animSpeed = isCombat ? 160 : 300;
            const frameIndex = Math.floor(tick / animSpeed) % superSprite.frames.length;

            ctx.save();
            ctx.translate(pos.x, pos.y);
            if (!facingRight) ctx.scale(-1, 1);

            const scale = isCombat ? 1.3 : 1;
            if (scale !== 1) ctx.scale(scale, scale);

            ctx.drawImage(
              superSprite.frames[frameIndex],
              -superSprite.width / 2,
              -superSprite.height / 2
            );
            ctx.restore();
          }

          // Escort soldiers around the super unit
          const numCols = Math.max(...formation.soldiers.map((s) => s.col)) + 1;
          for (const soldier of formation.soldiers) {
            const colOffset = (soldier.col - (numCols - 1) / 2) * COL_SPACING;
            const rowOffset = (soldier.row + 1) * ROW_SPACING;
            const sx = pos.x - dirX * rowOffset + perpX * colOffset;
            const sy = pos.y - dirY * rowOffset + perpY * colOffset;

            const spriteSet = isCombat ? sprites.fighting : sprites.marching;
            if (!spriteSet) continue;
            const animSpeed = isCombat ? 180 : 350;
            const frameIndex =
              Math.floor((tick + soldier.frameOffset * 120) / animSpeed) % spriteSet.frames.length;

            ctx.save();
            ctx.translate(sx, sy);
            if (!facingRight) ctx.scale(-1, 1);
            ctx.drawImage(spriteSet.frames[frameIndex], -spriteSet.width / 2, -spriteSet.height / 2);
            ctx.restore();
          }

          // Glow: gold for friendly, red for enemy reinforcements
          if (formation.state !== "dissolving") {
            const glowColor = formation.isDefender
              ? `rgba(200, 50, 50, ${0.3 + 0.15 * Math.sin(tick * 0.005)})`
              : `rgba(218, 165, 32, ${0.3 + 0.15 * Math.sin(tick * 0.005)})`;
            ctx.strokeStyle = glowColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);
            ctx.stroke();
          }

        // ---- REINFORCEMENT: Dragon ----
        } else if (formation.reinforcementType === "dragon") {
          const dragonSprite = sprites.dragon;
          if (dragonSprite) {
            const animSpeed = isCombat ? 120 : 200;
            const frameIndex = Math.floor(tick / animSpeed) % dragonSprite.frames.length;

            ctx.save();
            ctx.translate(pos.x, pos.y - 15);
            if (!facingRight) ctx.scale(-1, 1);
            ctx.scale(1.6, 1.6);

            ctx.drawImage(
              dragonSprite.frames[frameIndex],
              -dragonSprite.width / 2,
              -dragonSprite.height / 2
            );
            ctx.restore();
          }

          // Fire glow underneath the dragon
          if (formation.state !== "dissolving") {
            // Large shadow on the ground
            ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
            ctx.beginPath();
            ctx.ellipse(pos.x, pos.y + 10, 20, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Fire glow
            const fireAlpha = 0.2 + 0.12 * Math.sin(tick * 0.008);
            ctx.fillStyle = `rgba(255, 80, 0, ${fireAlpha})`;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 16 + Math.sin(tick * 0.006) * 5, 0, Math.PI * 2);
            ctx.fill();

            // Red menacing glow ring
            ctx.strokeStyle = `rgba(200, 30, 30, ${0.4 + 0.2 * Math.sin(tick * 0.005)})`;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y - 10, 30, 0, Math.PI * 2);
            ctx.stroke();
          }

        // ---- NORMAL FORMATION ----
        } else {
          const numCols = Math.max(...formation.soldiers.map((s) => s.col)) + 1;

          for (const soldier of formation.soldiers) {
            const colOffset = (soldier.col - (numCols - 1) / 2) * COL_SPACING;
            const rowOffset = soldier.row * ROW_SPACING;

            let sx = pos.x - dirX * rowOffset + perpX * colOffset;
            let sy = pos.y - dirY * rowOffset + perpY * colOffset;

            if (isCombat) {
              sx += Math.sin(tick * 0.015 + soldier.frameOffset * 2.3) * 1.5;
              sy += Math.cos(tick * 0.012 + soldier.frameOffset * 1.7) * 1;
            }

            let spriteSet: SpriteFrames | undefined;
            if (isCombat && sprites.fighting) {
              spriteSet = sprites.fighting;
            } else if (soldier.type === "flag" && sprites.flagBearer) {
              spriteSet = sprites.flagBearer;
            } else {
              spriteSet = sprites.marching;
            }
            if (!spriteSet) continue;

            const animSpeed = isCombat ? 180 : 350;
            const frameIndex =
              Math.floor((tick + soldier.frameOffset * 120) / animSpeed) % spriteSet.frames.length;

            ctx.save();
            ctx.translate(sx, sy);
            if (!facingRight) ctx.scale(-1, 1);
            ctx.drawImage(spriteSet.frames[frameIndex], -spriteSet.width / 2, -spriteSet.height / 2);
            ctx.restore();
          }

          // Small colored banner above normal formations
          if (formation.state === "marching" || formation.state === "spawning") {
            const bannerColor = formation.isDefender
              ? "rgba(180, 40, 40, 0.7)"
              : "rgba(40, 80, 180, 0.7)";
            ctx.save();
            ctx.fillStyle = bannerColor;
            ctx.fillRect(pos.x - 3, pos.y - 18, 6, 5);
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y - 18);
            ctx.lineTo(pos.x, pos.y - 10);
            ctx.stroke();
            ctx.restore();
          }
        }

        // Siege dust cloud at the fortress + arrow spawning (all attacker types)
        if (formation.state === "sieging" && !formation.isDefender) {
          const dustAlpha = 0.15 + 0.1 * Math.sin(tick * 0.005);
          const dustSize = 15 + 8 * Math.sin(tick * 0.003 + 1);
          ctx.fillStyle = `rgba(160, 130, 90, ${dustAlpha})`;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y + 5, dustSize, 0, Math.PI * 2);
          ctx.fill();

          // Ram impact shockwave
          if (formation.reinforcementType === "ram" && formation.stateTimer % 40 < 5) {
            ctx.strokeStyle = `rgba(180, 140, 60, 0.5)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pos.x + 20, pos.y, (formation.stateTimer % 40) * 4, 0, Math.PI * 2);
            ctx.stroke();
          }

          line.arrowCooldown--;
          if (line.arrowCooldown <= 0) {
            const tx = line.territory.x;
            const ty = line.territory.y;
            const arrowCount = 2 + Math.floor(Math.random() * 2);
            for (let a = 0; a < arrowCount; a++) {
              line.arrows.push({
                startX: tx + (Math.random() - 0.5) * 30,
                startY: ty - 10 + Math.random() * 10,
                targetX: pos.x + (Math.random() - 0.5) * 25,
                targetY: pos.y + (Math.random() - 0.5) * 20,
                timer: 0,
                maxTimer: 40 + Math.floor(Math.random() * 20),
              });
            }
            line.arrowCooldown = 25 + Math.floor(Math.random() * 20);
          }
        }

        ctx.restore();
      }

      // -- Render skirmishes (visual effects only) --
      for (let si = line.skirmishes.length - 1; si >= 0; si--) {
        const sk = line.skirmishes[si];
        sk.timer++;

        if (sk.timer >= sk.maxTimer) {
          line.skirmishes.splice(si, 1);
          continue;
        }

        const skProgress = sk.timer / sk.maxTimer;

        // Clash sparks
        const sparkCount = 4;
        for (let sp = 0; sp < sparkCount; sp++) {
          const angle = (sp / sparkCount) * Math.PI * 2 + tick * 0.012;
          const radius = 5 + skProgress * 10;
          const sparkX = sk.x + Math.cos(angle) * radius;
          const sparkY = sk.y + Math.sin(angle) * radius;
          const sparkAlpha = 0.9 * (1 - skProgress);

          ctx.fillStyle = `rgba(255, 200, 50, ${sparkAlpha})`;
          ctx.beginPath();
          ctx.arc(sparkX, sparkY, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Dust cloud
        ctx.fillStyle = `rgba(140, 110, 70, ${0.25 * (1 - skProgress)})`;
        ctx.beginPath();
        ctx.arc(sk.x, sk.y, 8 + skProgress * 18, 0, Math.PI * 2);
        ctx.fill();

        // Crossed swords icon
        if (skProgress < 0.7) {
          ctx.save();
          ctx.translate(sk.x, sk.y - 20);
          ctx.fillStyle = `rgba(200, 30, 30, ${0.9 * (1 - skProgress / 0.7)})`;
          ctx.font = "bold 11px Georgia, serif";
          ctx.textAlign = "center";
          ctx.fillText("⚔", 0, 0);
          ctx.restore();
        }
      }

      // -- Render siege arrows --
      for (let ai = line.arrows.length - 1; ai >= 0; ai--) {
        const arrow = line.arrows[ai];
        arrow.timer++;

        if (arrow.timer >= arrow.maxTimer) {
          line.arrows.splice(ai, 1);
          continue;
        }

        const t = arrow.timer / arrow.maxTimer;
        const ax = arrow.startX + (arrow.targetX - arrow.startX) * t;
        const ay = arrow.startY + (arrow.targetY - arrow.startY) * t
          - Math.sin(t * Math.PI) * 25;

        // Arrow direction for rotation
        const nextT = Math.min(t + 0.05, 1);
        const nax = arrow.startX + (arrow.targetX - arrow.startX) * nextT;
        const nay = arrow.startY + (arrow.targetY - arrow.startY) * nextT
          - Math.sin(nextT * Math.PI) * 25;
        const arrowAngle = Math.atan2(nay - ay, nax - ax);

        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(arrowAngle);

        // Arrow shaft
        ctx.strokeStyle = `rgba(80, 50, 20, ${0.8 * (1 - t * 0.3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(4, 0);
        ctx.stroke();

        // Arrowhead
        ctx.fillStyle = `rgba(100, 100, 100, ${0.9 * (1 - t * 0.3)})`;
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(3, -1.5);
        ctx.lineTo(3, 1.5);
        ctx.closePath();
        ctx.fill();

        // Fletching
        ctx.strokeStyle = `rgba(120, 80, 40, ${0.6 * (1 - t * 0.3)})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(-6.5, -1.5);
        ctx.moveTo(-5, 0);
        ctx.lineTo(-6.5, 1.5);
        ctx.stroke();

        ctx.restore();

        // Impact puff at the end
        if (t > 0.85) {
          const impactT = (t - 0.85) / 0.15;
          ctx.fillStyle = `rgba(140, 110, 70, ${0.3 * (1 - impactT)})`;
          ctx.beginPath();
          ctx.arc(arrow.targetX, arrow.targetY, 3 + impactT * 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw castle on top of troops so spawning formations emerge from behind it
    if (sprites.castle) {
      ctx.drawImage(
        sprites.castle,
        layout.dimensions.castleX - 40,
        layout.dimensions.castleY - 35
      );
    }

    // ========== LIVE EFFECTS (catapult) ==========
    const effects = effectsRef.current;
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.frame++;
      if (effect.frame >= effect.maxFrames) {
        effects.splice(i, 1);
        continue;
      }

      if (effect.type === "catapult" && sprites.catapult) {
        const spriteFrame = Math.min(
          Math.floor((effect.frame / effect.maxFrames) * sprites.catapult.frames.length),
          sprites.catapult.frames.length - 1
        );
        ctx.drawImage(sprites.catapult.frames[spriteFrame], effect.x - 20, effect.y - 15);

        const t = effect.frame / effect.maxFrames;
        if (t > 0.25) {
          const projT = (t - 0.25) / 0.75;
          const px = effect.x + (effect.targetX - effect.x) * projT;
          const py =
            effect.y + (effect.targetY - effect.y) * projT - Math.sin(projT * Math.PI) * 80;

          ctx.fillStyle = "#444";
          ctx.beginPath();
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fill();

          if (projT > 0.1) {
            ctx.fillStyle = `rgba(100, 80, 60, ${0.2 * (1 - projT)})`;
            const trailX = effect.x + (effect.targetX - effect.x) * (projT - 0.05);
            const trailY =
              effect.y +
              (effect.targetY - effect.y) * (projT - 0.05) -
              Math.sin((projT - 0.05) * Math.PI) * 80;
            ctx.beginPath();
            ctx.arc(trailX, trailY, 2, 0, Math.PI * 2);
            ctx.fill();
          }

          if (projT > 0.9) {
            const impactSize = (projT - 0.9) / 0.1;
            ctx.fillStyle = `rgba(255, 100, 0, ${0.5 * (1 - impactSize)})`;
            ctx.beginPath();
            ctx.arc(effect.targetX, effect.targetY, impactSize * 20, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

    }

    ctx.restore(); // camera transform
    ctx.restore(); // dpr scale
    animFrameRef.current = requestAnimationFrame(render);
  }, []);

  // Expose effect trigger
  useEffect(() => {
    (window as any).__battleMapTriggerEffect = (type: "catapult" | "ram") => {
      const layout = layoutRef.current;
      if (!layout) return;

      // Only target active (non-fallen) territories
      const activeLines = troopLinesRef.current.filter(
        (l) => l.status !== "fallen"
      );
      if (activeLines.length === 0) return;

      const targetLine = activeLines[Math.floor(Math.random() * activeLines.length)];

      if (type === "catapult") {
        // Roast: fire catapult at troops AND spawn enemy reinforcement
        const attackers = targetLine.formations.filter(
          (f) => !f.isDefender && (f.state === "marching" || f.state === "sieging") && f.t > 0.1
        );
        let targetX: number, targetY: number;
        if (attackers.length > 0) {
          const victim = attackers[Math.floor(Math.random() * attackers.length)];
          const idx = Math.floor(victim.t * (targetLine.path.length - 1));
          const pt = targetLine.path[idx];
          targetX = pt.x + (Math.random() - 0.5) * 20;
          targetY = pt.y + (Math.random() - 0.5) * 15;
        } else {
          const midIdx = Math.floor(targetLine.path.length * 0.5);
          const midPt = targetLine.path[midIdx];
          targetX = midPt.x + (Math.random() - 0.5) * 30;
          targetY = midPt.y + (Math.random() - 0.5) * 20;
        }
        effectsRef.current.push({
          type: "catapult",
          x: targetLine.territory.x,
          y: targetLine.territory.y - 10,
          targetX,
          targetY,
          frame: 0,
          maxFrames: 200,
        });

        // Spawn enemy reinforcement: dragon or ram (dragon more likely)
        const enemyType: "dragon" | "ram" = Math.random() > 0.35 ? "dragon" : "ram";
        const enemyReinforcement: Formation = {
          t: 0.85,
          speed: enemyType === "ram" ? 0.00012 : 0.0002,
          soldiers: buildFormationSoldiers(true),
          state: "marching",
          stateTimer: 0,
          isDefender: true,
          opacity: 1,
          reinforcementType: enemyType,
        };
        targetLine.formations.push(enemyReinforcement);
      } else {
        // Reinforcement: spawn a ram or super soldier as a real formation
        const reinforcementType = Math.random() > 0.5 ? "ram" : "super";
        const formation: Formation = {
          t: 0,
          speed: reinforcementType === "ram" ? 0.00012 : 0.0002,
          soldiers: buildFormationSoldiers(false),
          state: "spawning",
          stateTimer: 0,
          isDefender: false,
          opacity: 0,
          reinforcementType,
        };
        targetLine.formations.push(formation);
      }
    };
    return () => {
      delete (window as any).__battleMapTriggerEffect;
    };
  }, []);

  useEffect(() => {
    initialize();
    const handleResize = () => initialize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [initialize]);

  useEffect(() => {
    if (isReady) {
      animFrameRef.current = requestAnimationFrame(render);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isReady, render]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

// -- Drawing helpers --

function drawCasualtyCounter(ctx: CanvasRenderingContext2D, x: number, y: number, count: number) {
  ctx.save();
  ctx.fillStyle = "rgba(139, 0, 0, 0.85)";
  ctx.beginPath();
  ctx.roundRect(x - 22, y - 8, 44, 16, 4);
  ctx.fill();
  ctx.fillStyle = "#f4e4c1";
  ctx.font = "bold 9px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(`☠ ${count} fallen`, x, y + 4);
  ctx.restore();
}
