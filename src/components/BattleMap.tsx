"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Application as AppData, Territory, MapDimensions } from "@/lib/types";
import {
  computeMapLayout,
  computeObjectivePath,
  ObjectiveType,
  RoutingData,
} from "@/lib/map-layout";
import { renderWorldBackground } from "@/lib/terrain";
import {
  generateMarchingFrames,
  generateFallenFrames,
  generateFightingFrames,
  generateCastleSprite,
  generateFortressSprite,
  FORTRESS_SPRITE_DRAW_DX,
  FORTRESS_SPRITE_DRAW_DY,
  generateCatapultFrames,
  generateBatteringRamFrames,
  generateFlagBearerFrames,
  generateSuperSoldierFrames,
  generateDragonFrames,
  generateRestingFrames,
  generateCelebratingFrames,
  generateRetreatingFrames,
  generateCampSiteFrames,
  SpriteFrames,
} from "@/lib/sprites";
import { BattleImpactEvent } from "@/lib/battle/interaction";
import {
  BATTLE_BALANCE,
  BATTLE_TIMINGS,
  CAMPAIGN,
  INTERACTION_BALANCE,
} from "@/lib/battle/constants";
import {
  isActiveSideFormation,
  randomRespawnDelay,
  retreatSucceeded,
  tickRespawnCooldown,
} from "@/lib/battle/campaign";
import { hiringWallRingCount } from "@/lib/battle/hiringStages";
import { keyBearBackground } from "@/lib/spriteChroma";

interface BattleMapProps {
  applications: AppData[];
  onStatsUpdate?: (stats: MapStats) => void;
  onReady?: () => void;
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
  /** Set for retreat survivors — muted / wounded draw */
  wounded?: boolean;
}

type FormationState =
  | "spawning"   // assembling at castle gate (fade in)
  | "marching"   // moving along path
  | "fighting"   // engaged in skirmish, stopped, swinging weapons
  | "sieging"     // arrived at fortress, attacking
  | "dissolving"  // fading out after siege
  | "cooldown"   // brief terminal state before removal (siege cycle)
  | "buildingCamp" // winner erecting tent & fire (then rest or celebrate)
  | "camping"    // rest by the fire
  | "celebrating"
  | "retreating"; // loser heading home

interface Formation {
  id: number;
  t: number;
  speed: number;
  moraleBoost: number;
  soldiers: FormationSoldier[];
  state: FormationState;
  stateTimer: number;
  isDefender: boolean;
  opacity: number;
  reinforcementType?: "ram" | "super" | "dragon";
  objective: ObjectiveType;
  path: { x: number; y: number }[];
  objectiveLock: number;
  skirmishId: number | null;
  campAnchor: { x: number; y: number } | null;
  /** Failed retreat: dissolving into corpses before removal */
  retreatFailed?: boolean;
}

interface Skirmish {
  id: number;
  x: number;
  y: number;
  timer: number;
  maxTimer: number;
  attackerFormationId: number;
  defenderFormationId: number;
  attackerWon: boolean;
  resolved: boolean;
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
  castleX: number;
  castleY: number;
  formations: Formation[];
  skirmishes: Skirmish[];
  arrows: SiegeArrow[];
  arrowCooldown: number;
  catapultCooldown: number;
  status: Territory["status"];
  attackerRespawnCooldown: number;
  defenderRespawnCooldown: number;
  nextFormationId: number;
  nextSkirmishId: number;
  attackersWiped: boolean;
  defendersWiped: boolean;
}

/** Copilot bear bitmaps patrolling a lane (ping-pong on path). */
interface LaneBearPatrol {
  lineIndex: number;
  t: number;
  speed: number;
  alongDir: 1 | -1;
  phase: number;
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

function createFormation(line: TroopLine, isDefender: boolean, startT: number): Formation {
  return {
    id: line.nextFormationId++,
    t: startT,
    speed: 0.00015 + Math.random() * 0.00008,
    moraleBoost: 0,
    soldiers: buildFormationSoldiers(isDefender),
    state: "spawning",
    stateTimer: 0,
    isDefender,
    opacity: 0,
    objective: isDefender ? "toSkirmishMidpoint" : "toFortress",
    path: [],
    objectiveLock: 0,
    skirmishId: null,
    campAnchor: null,
  };
}

function lineHasActiveSide(line: TroopLine, isDefender: boolean): boolean {
  return line.formations.some(
    (f) => f.isDefender === isDefender && isActiveSideFormation(f.state)
  );
}

function randomLineRespawnDelay(): number {
  return (
    BATTLE_BALANCE.lineSpawnCooldownMin +
    Math.floor(
      Math.random() *
        (BATTLE_BALANCE.lineSpawnCooldownMax - BATTLE_BALANCE.lineSpawnCooldownMin)
    )
  );
}

/** Survivors limping home — fewer figures, marked wounded */
function cullSoldiersForRetreat(soldiers: FormationSoldier[]): FormationSoldier[] {
  const minR = CAMPAIGN.retreatSurvivorMinRatio;
  const maxR = CAMPAIGN.retreatSurvivorMaxRatio;
  const ratio = minR + Math.random() * (maxR - minR);
  const target = Math.max(1, Math.ceil(soldiers.length * ratio));
  const shuffled = [...soldiers].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, target);
  const cols = Math.min(2, picked.length);
  return picked.map((s, i) => ({
    ...s,
    row: Math.floor(i / cols),
    col: i % cols,
    type: i === 0 ? s.type : "spear",
    frameOffset: s.frameOffset + i,
    wounded: true,
  }));
}

function resolveObjectivePath(
  routingData: RoutingData,
  line: TroopLine,
  formation: Formation
): { x: number; y: number }[] {
  const objectivePath = computeObjectivePath(
    formation.objective,
    {
      territoryX: line.territory.x,
      territoryY: line.territory.y,
      castleX: line.castleX,
      castleY: line.castleY,
    },
    routingData,
    formation.soldiers[0]?.frameOffset ?? 0,
    80
  );
  if (objectivePath.length >= 2) return objectivePath;
  return line.path;
}

/** Smooth position along polyline (linear interp between vertices). Cheap: O(1). */
function interpolateAlongRoute(route: { x: number; y: number }[], t: number): { x: number; y: number } {
  if (route.length < 2) return route[0] ?? { x: 0, y: 0 };
  const pathLen = route.length - 1;
  const clampedT = Math.max(0, Math.min(1, t));
  const floatPos = clampedT * pathLen;
  const i0 = Math.min(Math.floor(floatPos), pathLen - 1);
  const frac = floatPos - i0;
  const i1 = Math.min(i0 + 1, pathLen);
  const p0 = route[i0];
  const p1 = route[i1];
  return {
    x: p0.x + (p1.x - p0.x) * frac,
    y: p0.y + (p1.y - p0.y) * frac,
  };
}

/** Unit tangent on the polyline at t in [0,1] (for patrol facing). */
function routeDirectionAtT(route: { x: number; y: number }[], t: number): { dx: number; dy: number } {
  if (route.length < 2) return { dx: 1, dy: 0 };
  const delta = 0.005;
  const t0 = Math.max(0, t - delta);
  const t1 = Math.min(1, t + delta);
  const p0 = interpolateAlongRoute(route, t0);
  const p1 = interpolateAlongRoute(route, t1);
  let dx = p1.x - p0.x;
  let dy = p1.y - p0.y;
  if (dx * dx + dy * dy < 1e-6) {
    const pathLen = route.length - 1;
    const floatPos = Math.max(0, Math.min(1, t)) * pathLen;
    const i0 = Math.min(Math.floor(floatPos), pathLen - 1);
    const i1 = Math.min(i0 + 1, pathLen);
    dx = route[i1].x - route[i0].x;
    dy = route[i1].y - route[i0].y;
  }
  const len = Math.hypot(dx, dy) || 1;
  return { dx: dx / len, dy: dy / len };
}

function formationPosition(formation: Formation): { x: number; y: number } | null {
  if (
    formation.campAnchor &&
    (formation.state === "buildingCamp" ||
      formation.state === "camping" ||
      formation.state === "celebrating")
  ) {
    return formation.campAnchor;
  }
  if (formation.path.length < 2) return null;
  return interpolateAlongRoute(formation.path, formation.t);
}

function routePointAtT(route: { x: number; y: number }[], t: number): { x: number; y: number } | null {
  if (route.length < 2) return null;
  return interpolateAlongRoute(route, t);
}

function closestRouteProgress(
  route: { x: number; y: number }[],
  point: { x: number; y: number }
): number {
  if (route.length < 2) return 0;
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < route.length; i++) {
    const rp = route[i];
    const d = (rp.x - point.x) ** 2 + (rp.y - point.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx / (route.length - 1);
}

/** Troops arranged around camp center; radius grows while building */
function campRingOffset(
  index: number,
  count: number,
  formation: Formation
): { lx: number; ly: number; faceRight: boolean } {
  const n = Math.max(1, count);
  const base = -Math.PI / 2;
  const angle = base + (index / n) * Math.PI * 2;
  const buildT =
    formation.state === "buildingCamp"
      ? Math.min(1, formation.stateTimer / CAMPAIGN.campBuildDuration)
      : 1;
  const rx = (formation.state === "buildingCamp" ? 14 : 20) + buildT * 12;
  const ry = 10 + buildT * 6;
  const lx = Math.cos(angle) * rx;
  const ly = Math.sin(angle) * ry * 0.92;
  return { lx, ly, faceRight: lx < 0 };
}

/** World position for a formation — matches the render path/route sampling. */
function approximateFormationCenter(
  line: TroopLine,
  formation: Formation
): { x: number; y: number } | null {
  if (
    formation.campAnchor &&
    (formation.state === "buildingCamp" ||
      formation.state === "camping" ||
      formation.state === "celebrating")
  ) {
    return formation.campAnchor;
  }
  const route = formation.path.length > 1 ? formation.path : line.path;
  if (route.length < 2) return null;
  return interpolateAlongRoute(route, formation.t);
}

function collectCampaignFocusPoints(
  line: TroopLine,
  side: "attacker" | "defender"
): { x: number; y: number }[] {
  const wantDefender = side === "defender";
  const pts: { x: number; y: number }[] = [];
  for (const f of line.formations) {
    if (f.state === "cooldown") continue;
    if (f.isDefender !== wantDefender) continue;
    const p = approximateFormationCenter(line, f);
    if (p) pts.push(p);
  }
  return pts;
}

function drawCampaignFocusIndicator(
  ctx: CanvasRenderingContext2D,
  line: TroopLine,
  tick: number,
  side: "attacker" | "defender"
) {
  const pts = collectCampaignFocusPoints(line, side);
  let cx: number;
  let cy: number;
  let radius: number;
  if (pts.length === 0) {
    cx = line.territory.x;
    cy = line.territory.y + 6;
    radius = 48;
  } else {
    cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    let maxD = 0;
    for (const p of pts) {
      maxD = Math.max(maxD, Math.hypot(p.x - cx, p.y - cy));
    }
    radius = Math.max(36, Math.min(102, maxD + 28));
  }

  const pulse = 0.06 * Math.sin(tick * 0.004);
  const label =
    line.territory.company.length > 30
      ? `${line.territory.company.slice(0, 27)}…`
      : line.territory.company;

  ctx.save();
  ctx.fillStyle = `rgba(255, 230, 190, ${0.045 + pulse * 0.5})`;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(200, 160, 90, ${0.38 + pulse})`;
  ctx.lineWidth = 1.35;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "600 11px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(42, 32, 20, 0.92)";
  ctx.shadowColor = "rgba(255, 248, 230, 0.95)";
  ctx.shadowBlur = 4;
  ctx.fillText(label, cx, cy - radius - 6);
  ctx.shadowBlur = 0;
  ctx.restore();
}

type CampaignFocusPick = { territoryId: string; side: "attacker" | "defender" };

function pickCampaignAtWorld(
  wx: number,
  wy: number,
  layout: { territories: Territory[] },
  lines: TroopLine[]
): CampaignFocusPick | null {
  let best: CampaignFocusPick | null = null;
  let bestD = Infinity;

  for (const line of lines) {
    for (const f of line.formations) {
      if (f.state === "cooldown") continue;
      const p = approximateFormationCenter(line, f);
      if (!p) continue;
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d < 44 && d < bestD) {
        bestD = d;
        best = {
          territoryId: line.territory.id,
          side: f.isDefender ? "defender" : "attacker",
        };
      }
    }
  }

  for (const t of layout.territories) {
    const d = Math.hypot(t.x - wx, t.y - wy);
    if (d < 58 && d < bestD) {
      bestD = d;
      // Fortress click: follow the attacking campaign from the castle by default
      best = { territoryId: t.id, side: "attacker" };
    }
  }

  return best;
}

export default function BattleMap({ applications, onStatsUpdate, onReady }: BattleMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const troopLinesRef = useRef<TroopLine[]>([]);
  const effectsRef = useRef<LiveEffect[]>([]);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  /** Highlight one side’s formations (attacker vs defender) for a territory. */
  const campaignFocusRef = useRef<CampaignFocusPick | null>(null);
  const dragRef = useRef<{
    dragging: boolean;
    lastX: number;
    lastY: number;
    startX: number;
    startY: number;
    moved: boolean;
  }>({
    dragging: false,
    lastX: 0,
    lastY: 0,
    startX: 0,
    startY: 0,
    moved: false,
  });
  const spritesRef = useRef<{
    marching?: SpriteFrames;
    fighting?: SpriteFrames;
    resting?: SpriteFrames;
    celebrating?: SpriteFrames;
    retreating?: SpriteFrames;
    campSite?: SpriteFrames;
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
    routingData: RoutingData;
  } | null>(null);
  const screenRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const [isReady, setIsReady] = useState(false);
  const bearPatrolRef = useRef<LaneBearPatrol[]>([]);
  const bearFramesRef = useRef<(HTMLCanvasElement | null)[]>([]);
  const lastBearTickRef = useRef(0);

  useEffect(() => {
    const urls = [...BEAR_DIRECTION_FRAME_URLS];
    bearFramesRef.current = urls.map(() => null);
    urls.forEach((src, i) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      img.onload = () => {
        try {
          bearFramesRef.current[i] = keyBearBackground(img);
        } catch {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const x = c.getContext("2d");
          if (x) x.drawImage(img, 0, 0);
          bearFramesRef.current[i] = c;
        }
      };
    });
  }, []);

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
    spritesRef.current.resting = generateRestingFrames();
    spritesRef.current.celebrating = generateCelebratingFrames();
    spritesRef.current.retreating = generateRetreatingFrames();
    spritesRef.current.campSite = generateCampSiteFrames();
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
        generateFortressSprite(
          territory.company,
          territory.status,
          hiringWallRingCount(territory)
        )
      );
    }

    // Pre-render world background (terrain, borders, rivers, etc.)
    spritesRef.current.worldBg = renderWorldBackground(
      layout.territories,
      layout.dimensions,
      layout.routingData
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
      const path = computeObjectivePath(
        "toFortress",
        {
          territoryX: territory.x,
          territoryY: territory.y,
          castleX: layout.dimensions.castleX,
          castleY: layout.dimensions.castleY,
        },
        layout.routingData,
        0,
        80
      );

      if (territory.status === "fallen") {
        lines.push({
          territory, path, castleX: layout.dimensions.castleX, castleY: layout.dimensions.castleY,
          formations: [], skirmishes: [],
          arrows: [], arrowCooldown: 0, catapultCooldown: 0,
          status: territory.status,
          attackerRespawnCooldown: 0,
          defenderRespawnCooldown: 0,
          nextFormationId: 1,
          nextSkirmishId: 1,
          attackersWiped: false, defendersWiped: false,
        });
        continue;
      }

      const formations: Formation[] = [];

      const line: TroopLine = {
        territory, path,
        castleX: layout.dimensions.castleX,
        castleY: layout.dimensions.castleY,
        formations,
        skirmishes: [],
        arrows: [], arrowCooldown: 0,
        catapultCooldown: 600 + Math.floor(Math.random() * 800),
        status: territory.status,
        attackerRespawnCooldown: 0,
        defenderRespawnCooldown: 0,
        nextFormationId: 1,
        nextSkirmishId: 1,
        attackersWiped: false,
        defendersWiped: false,
      };

      // First attacker: start already marching partway so map isn't empty
      const attacker = createFormation(line, false, 0.15 + Math.random() * 0.3);
      attacker.state = "marching";
      attacker.opacity = 1;
      attacker.objective = "toFortress";
      formations.push(attacker);

      // First defender: start coming back from the fortress
      const defender = createFormation(line, true, 0.25 + Math.random() * 0.2);
      defender.state = "marching";
      defender.opacity = 1;
      defender.objective = "toSkirmishMidpoint";
      formations.push(defender);

      for (const formation of line.formations) {
        formation.path = resolveObjectivePath(layout.routingData, line, formation);
      }
      lines.push(line);
    }
    troopLinesRef.current = lines;

    const eligible: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].status !== "fallen" && lines[i].path.length >= 2) eligible.push(i);
    }
    const want = Math.min(6, Math.max(2, Math.ceil(eligible.length * 0.35)));
    const patrols: LaneBearPatrol[] = [];
    for (let k = 0; k < want && eligible.length > 0; k++) {
      const lineIndex = eligible[Math.floor(Math.random() * eligible.length)];
      patrols.push({
        lineIndex,
        t: 0.12 + Math.random() * 0.76,
        speed: 0.014 + Math.random() * 0.018,
        alongDir: Math.random() > 0.5 ? 1 : -1,
        phase: Math.random() * Math.PI * 2,
      });
    }
    bearPatrolRef.current = patrols;
    lastBearTickRef.current = 0;

    campaignFocusRef.current = null;

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
      dragRef.current = {
        dragging: true,
        lastX: e.clientX,
        lastY: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      canvas.style.cursor = "grabbing";
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      if (
        Math.hypot(e.clientX - dragRef.current.startX, e.clientY - dragRef.current.startY) > 5
      ) {
        dragRef.current.moved = true;
      }
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;

      const cam = cameraRef.current;
      cam.x -= dx / cam.zoom;
      cam.y -= dy / cam.zoom;
    };

    const onMouseUp = (e: MouseEvent) => {
      const d = dragRef.current;
      const wasTap =
        d.dragging &&
        !d.moved &&
        Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 8;
      d.dragging = false;
      canvas.style.cursor = "grab";

      if (wasTap && layoutRef.current) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const cam = cameraRef.current;
        const wx = cam.x + mx / cam.zoom;
        const wy = cam.y + my / cam.zoom;
        campaignFocusRef.current = pickCampaignAtWorld(
          wx,
          wy,
          layoutRef.current,
          troopLinesRef.current
        );
      }
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
        const tx = e.touches[0].clientX;
        const ty = e.touches[0].clientY;
        dragRef.current = {
          dragging: true,
          lastX: tx,
          lastY: ty,
          startX: tx,
          startY: ty,
          moved: false,
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
        const t = e.touches[0];
        if (Math.hypot(t.clientX - dragRef.current.startX, t.clientY - dragRef.current.startY) > 8) {
          dragRef.current.moved = true;
        }
        const dx = t.clientX - dragRef.current.lastX;
        const dy = t.clientY - dragRef.current.lastY;
        dragRef.current.lastX = t.clientX;
        dragRef.current.lastY = t.clientY;
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

    const onTouchEnd = (e: TouchEvent) => {
      const d = dragRef.current;
      if (e.changedTouches.length === 1 && d.dragging && !d.moved && layoutRef.current) {
        const t = e.changedTouches[0];
        if (Math.hypot(t.clientX - d.startX, t.clientY - d.startY) < 12) {
          const rect = canvas.getBoundingClientRect();
          const mx = t.clientX - rect.left;
          const my = t.clientY - rect.top;
          const cam = cameraRef.current;
          const wx = cam.x + mx / cam.zoom;
          const wy = cam.y + my / cam.zoom;
          campaignFocusRef.current = pickCampaignAtWorld(
            wx,
            wy,
            layoutRef.current,
            troopLinesRef.current
          );
        }
      }
      d.dragging = false;
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") campaignFocusRef.current = null;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
    const prevBear = lastBearTickRef.current;
    const bearDt = prevBear > 0 ? Math.min(0.064, (tick - prevBear) / 1000) : 1 / 60;
    lastBearTickRef.current = tick;

    if (sprites.worldBg) {
      ctx.drawImage(sprites.worldBg, 0, 0);
    }

    // Draw fortresses (before troops so troops render on top)
    for (const territory of layout.territories) {
      const fortressSprite = sprites.fortresses.get(territory.id);
      if (fortressSprite) {
        ctx.drawImage(
          fortressSprite,
          territory.x - FORTRESS_SPRITE_DRAW_DX,
          territory.y - FORTRESS_SPRITE_DRAW_DY
        );
      }
      if (territory.status === "fallen") {
        const rejectCount = territory.applications.filter((a) => a.status === "reject").length;
        drawCasualtyCounter(ctx, territory.x, territory.y - 38, rejectCount);
      }
    }

    // Bear patrol: north/south/side art by travel heading + per-profile walk motion
    const bearFrames = bearFramesRef.current;
    const linesForBears = troopLinesRef.current;
    for (const b of bearPatrolRef.current) {
      const line = linesForBears[b.lineIndex];
      if (!line || line.status === "fallen" || line.path.length < 2) continue;
      b.t += b.speed * bearDt * b.alongDir;
      if (b.t >= 1) {
        b.t = 1;
        b.alongDir = -1;
      } else if (b.t <= 0) {
        b.t = 0;
        b.alongDir = 1;
      }
      const pt = interpolateAlongRoute(line.path, b.t);
      const tan = routeDirectionAtT(line.path, b.t);
      const dx = tan.dx * b.alongDir;
      const dy = tan.dy * b.alongDir;
      drawPatrolBearSprite(ctx, bearFrames, pt.x, pt.y, tick, b.phase, dx, dy, b.t * b.alongDir);
    }

    // ========== FORMATION LIFECYCLE UPDATE + RENDER ==========
    const ROW_SPACING = 14;
    const COL_SPACING = 10;
    const SPAWN_DURATION = BATTLE_TIMINGS.spawnDuration;
    const FIGHT_DURATION = BATTLE_TIMINGS.fightDuration;
    const SIEGE_DURATION = BATTLE_TIMINGS.siegeDuration;
    const DISSOLVE_DURATION = BATTLE_TIMINGS.dissolveDuration;
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
        {
          const focus = campaignFocusRef.current;
          if (focus && focus.territoryId === line.territory.id) {
            drawCampaignFocusIndicator(ctx, line, tick, focus.side);
          }
        }
        continue;
      }

      line.attackerRespawnCooldown = tickRespawnCooldown(line.attackerRespawnCooldown);
      line.defenderRespawnCooldown = tickRespawnCooldown(line.defenderRespawnCooldown);

      if (!lineHasActiveSide(line, false) && line.attackerRespawnCooldown <= 0) {
        const attacker = createFormation(line, false, 0);
        attacker.objective = "toFortress";
        attacker.path = resolveObjectivePath(layout.routingData, line, attacker);
        line.formations.push(attacker);
      }
      if (!lineHasActiveSide(line, true) && line.defenderRespawnCooldown <= 0) {
        const defender = createFormation(line, true, 0);
        defender.objective = "toSkirmishMidpoint";
        defender.path = resolveObjectivePath(layout.routingData, line, defender);
        line.formations.push(defender);
      }

      const activeAttackers = line.formations.filter(
        (f) => !f.isDefender && f.state !== "cooldown" && f.state !== "dissolving"
      );
      const activeDefenders = line.formations.filter(
        (f) => f.isDefender && f.state !== "cooldown" && f.state !== "dissolving"
      );

      // Edge-triggered wipe events.
      if (activeAttackers.length === 0 && activeDefenders.length > 0 && !line.attackersWiped) {
        line.attackersWiped = true;
        for (const defender of activeDefenders) {
          const currentPos = formationPosition(defender);
          defender.objective = "toCastle";
          defender.path = resolveObjectivePath(layout.routingData, line, defender);
          if (currentPos) {
            defender.t = closestRouteProgress(defender.path, currentPos);
          }
          defender.objectiveLock = 160;
        }
      } else if (activeAttackers.length > 0) {
        line.attackersWiped = false;
      }

      if (activeDefenders.length === 0 && activeAttackers.length > 0 && !line.defendersWiped) {
        line.defendersWiped = true;
        for (const attacker of activeAttackers) {
          const currentPos = formationPosition(attacker);
          attacker.objective = "toFortress";
          attacker.path = resolveObjectivePath(layout.routingData, line, attacker);
          if (currentPos) {
            attacker.t = closestRouteProgress(attacker.path, currentPos);
          }
          attacker.objectiveLock = 120;
        }
      } else if (activeDefenders.length > 0) {
        line.defendersWiped = false;
      }

      // -- Enemy catapult: fortress fires when attackers get close --
      line.catapultCooldown--;
      if (line.catapultCooldown <= 0) {
        const CATAPULT_RANGE = BATTLE_BALANCE.catapultRange;
        const tx = line.territory.x;
        const ty = line.territory.y;

        // Only fire at attackers within range of the fortress
        const nearbyAttackers = line.formations.filter((f) => {
          if (f.isDefender || f.state !== "marching") return false;
          const pt = formationPosition(f);
          if (!pt) return false;
          const dist = Math.sqrt((pt.x - tx) ** 2 + (pt.y - ty) ** 2);
          return dist < CATAPULT_RANGE;
        });

        if (nearbyAttackers.length > 0) {
          const target = nearbyAttackers[Math.floor(Math.random() * nearbyAttackers.length)];
          const targetPos = formationPosition(target);
          if (!targetPos) {
            line.catapultCooldown = 60;
            continue;
          }

          effectsRef.current.push({
            type: "catapult",
            x: tx,
            y: ty - 10,
            targetX: targetPos.x + (Math.random() - 0.5) * 20,
            targetY: targetPos.y + (Math.random() - 0.5) * 15,
            frame: 0,
            maxFrames: 150,
          });
          line.catapultCooldown =
            BATTLE_BALANCE.catapultCooldownMin +
            Math.floor(
              Math.random() *
                (BATTLE_BALANCE.catapultCooldownMax - BATTLE_BALANCE.catapultCooldownMin)
            );
        } else {
          line.catapultCooldown = 60;
        }
      }

      // -- Update each formation's state --
      for (let fi = line.formations.length - 1; fi >= 0; fi--) {
        const formation = line.formations[fi];
        formation.stateTimer++;
        if (formation.objectiveLock > 0) formation.objectiveLock--;

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
            formation.t += formation.speed;

            if (formation.t >= 0.92) {
              if (!formation.isDefender && formation.objective === "toFortress") {
                formation.state = "sieging";
                formation.stateTimer = 0;
              } else {
                formation.state = "dissolving";
                formation.stateTimer = 0;
                formation.retreatFailed = undefined;
              }
            }
            break;

          case "fighting":
            if (formation.stateTimer >= FIGHT_DURATION) {
              const sk =
                formation.skirmishId != null
                  ? line.skirmishes.find((s) => s.id === formation.skirmishId)
                  : null;
              if (sk && !sk.resolved) {
                sk.resolved = true;
                const attacker = line.formations.find(
                  (f) => f.id === sk.attackerFormationId
                );
                const defender = line.formations.find(
                  (f) => f.id === sk.defenderFormationId
                );
                if (attacker && defender) {
                  const winner = sk.attackerWon ? attacker : defender;
                  const loser = sk.attackerWon ? defender : attacker;
                  winner.campAnchor = { x: sk.x, y: sk.y };
                  winner.skirmishId = null;
                  if (winner.reinforcementType) {
                    winner.state = Math.random() < CAMPAIGN.celebrateAfterCampChance
                      ? "celebrating"
                      : "camping";
                  } else {
                    winner.state = "buildingCamp";
                  }
                  winner.stateTimer = 0;
                  loser.state = "retreating";
                  loser.stateTimer = 0;
                  loser.skirmishId = null;
                  loser.soldiers = cullSoldiersForRetreat(loser.soldiers);
                  loser.objective = loser.isDefender ? "toFortress" : "toCastle";
                  loser.path = resolveObjectivePath(layout.routingData, line, loser);
                  const lp = formationPosition(loser);
                  if (lp && loser.path.length >= 2) {
                    loser.t = closestRouteProgress(loser.path, lp);
                  } else {
                    loser.t = 0;
                  }
                }
              } else if (!sk && formation.stateTimer >= FIGHT_DURATION + 120) {
                // Orphaned fight (e.g. skirmish record removed out of sync): end combat
                formation.state = "dissolving";
                formation.stateTimer = 0;
                formation.retreatFailed = undefined;
              }
            }
            break;

          case "buildingCamp":
            if (formation.stateTimer >= CAMPAIGN.campBuildDuration) {
              formation.state = Math.random() < CAMPAIGN.celebrateAfterCampChance
                ? "celebrating"
                : "camping";
              formation.stateTimer = 0;
            }
            break;

          case "camping":
            if (formation.stateTimer >= CAMPAIGN.campRestDuration) {
              formation.state = "marching";
              formation.stateTimer = 0;
              formation.objective = formation.isDefender
                ? "toSkirmishMidpoint"
                : "toFortress";
              formation.path = resolveObjectivePath(layout.routingData, line, formation);
              const anchor = formation.campAnchor;
              if (anchor && formation.path.length >= 2) {
                formation.t = closestRouteProgress(formation.path, anchor);
              } else {
                formation.t = 0;
              }
              formation.campAnchor = null;
              const room = Math.max(0, CAMPAIGN.moraleBoostMax - formation.moraleBoost);
              const boost = Math.min(CAMPAIGN.campSpeedBonus, room);
              formation.moraleBoost += boost;
              formation.speed += boost;
            }
            break;

          case "celebrating":
            if (formation.stateTimer >= CAMPAIGN.celebrateDuration) {
              formation.state = "marching";
              formation.stateTimer = 0;
              formation.objective = formation.isDefender
                ? "toSkirmishMidpoint"
                : "toFortress";
              formation.path = resolveObjectivePath(layout.routingData, line, formation);
              const anchor = formation.campAnchor;
              if (anchor && formation.path.length >= 2) {
                formation.t = closestRouteProgress(formation.path, anchor);
              } else {
                formation.t = 0;
              }
              formation.campAnchor = null;
              const room = Math.max(0, CAMPAIGN.moraleBoostMax - formation.moraleBoost);
              const boost = Math.min(CAMPAIGN.campSpeedBonus, room);
              formation.moraleBoost += boost;
              formation.speed += boost;
            }
            break;

          case "retreating":
            formation.t += CAMPAIGN.retreatSpeedPerFrame;
            if (formation.t >= 0.92) {
              if (retreatSucceeded()) {
                formation.state = "spawning";
                formation.stateTimer = 0;
                formation.opacity = 0;
                formation.retreatFailed = undefined;
                for (const s of formation.soldiers) {
                  delete s.wounded;
                }
                formation.objective = formation.isDefender
                  ? "toSkirmishMidpoint"
                  : "toFortress";
                formation.path = resolveObjectivePath(layout.routingData, line, formation);
                formation.t = 0;
              } else {
                formation.state = "dissolving";
                formation.stateTimer = 0;
                formation.retreatFailed = true;
              }
            }
            break;

          case "sieging":
            if (formation.stateTimer >= SIEGE_DURATION) {
              formation.state = "dissolving";
              formation.stateTimer = 0;
              formation.retreatFailed = undefined;
            }
            break;

          case "dissolving": {
            const deathDur = formation.retreatFailed
              ? CAMPAIGN.retreatDeathDuration
              : DISSOLVE_DURATION;
            formation.opacity = Math.max(0, 1 - formation.stateTimer / deathDur);
            if (formation.stateTimer >= deathDur) {
              formation.state = "cooldown";
              formation.stateTimer = 0;
            }
            break;
          }

          case "cooldown":
            if (formation.isDefender) {
              line.defenderRespawnCooldown = formation.retreatFailed
                ? randomRespawnDelay()
                : randomLineRespawnDelay();
            } else {
              line.attackerRespawnCooldown = formation.retreatFailed
                ? randomRespawnDelay()
                : randomLineRespawnDelay();
            }
            formation.retreatFailed = undefined;
            line.formations.splice(fi, 1);
            continue;
        }

        // -- Skirmish detection: attacker vs defender on same route --
        if (formation.state === "marching" && !formation.isDefender) {
          const atkPos = formationPosition(formation);
          if (!atkPos) continue;
          for (const other of line.formations) {
            if (!other.isDefender || other.state !== "marching") continue;
            const defPos = formationPosition(other);
            if (!defPos) continue;
            const posDist = Math.hypot(atkPos.x - defPos.x, atkPos.y - defPos.y);
            // Terrain-routed lanes can diverge; allow a wider engagement radius
            // so opposing formations still collide frequently before sieges.
            if (posDist < 64) {
              const skPt = { x: (atkPos.x + defPos.x) / 2, y: (atkPos.y + defPos.y) / 2 };
              const alreadyNear = line.skirmishes.some(
                (s) => Math.abs(s.x - skPt.x) < 30 && Math.abs(s.y - skPt.y) < 30
              );
              if (alreadyNear) continue;

              const reinforcementBonus = BATTLE_BALANCE.reinforcementBonusMultiplier;
              const attackerSize = formation.soldiers.length *
                (formation.reinforcementType ? reinforcementBonus : 1);
              const defenderSize = other.soldiers.length *
                (other.reinforcementType ? reinforcementBonus : 1);
              const totalSize = attackerSize + defenderSize;
              const attackerWinChance = attackerSize / totalSize;
              const roll = Math.random();

              const skId = line.nextSkirmishId++;
              // maxTimer must stay > FIGHT_DURATION: sk.timer increments after the
              // formation pass each frame, so it is one frame ahead of stateTimer.
              // If maxTimer === FIGHT_DURATION, the skirmish is removed while
              // formations are still at stateTimer FIGHT_DURATION - 1 and never resolve.
              line.skirmishes.push({
                id: skId,
                x: skPt.x,
                y: skPt.y,
                timer: 0,
                maxTimer: FIGHT_DURATION + 1,
                attackerFormationId: formation.id,
                defenderFormationId: other.id,
                attackerWon: roll < attackerWinChance,
                resolved: false,
              });
              formation.skirmishId = skId;
              other.skirmishId = skId;

              formation.state = "fighting";
              formation.stateTimer = 0;
              other.state = "fighting";
              other.stateTimer = 0;
            }
          }
        }
      }

      {
        const focus = campaignFocusRef.current;
        if (focus && focus.territoryId === line.territory.id) {
          drawCampaignFocusIndicator(ctx, line, tick, focus.side);
        }
      }

      // -- Render each formation --
      for (const formation of line.formations) {
        if (formation.state === "cooldown") continue;

        let pos: { x: number; y: number };
        let dirX: number;
        let dirY: number;
        let perpX: number;
        let perpY: number;
        let facingRight: boolean;

        if (
          formation.state === "buildingCamp" ||
          formation.state === "camping" ||
          formation.state === "celebrating"
        ) {
          if (!formation.campAnchor) continue;
          pos = formation.campAnchor;
          const tx = formation.isDefender ? line.castleX : line.territory.x;
          const ty = formation.isDefender ? line.castleY : line.territory.y;
          facingRight = tx - pos.x >= 0;
          dirX = facingRight ? 1 : -1;
          dirY = 0;
          perpX = 0;
          perpY = 1;
        } else {
          const route = formation.path.length > 1 ? formation.path : line.path;
          if (route.length < 2) continue;
          const clampedT = Math.max(0, Math.min(1, formation.t));
          const pathLen = route.length - 1;
          const floatPos = clampedT * pathLen;
          const i0 = Math.min(Math.floor(floatPos), pathLen - 1);
          const i1 = Math.min(i0 + 1, pathLen);
          pos = interpolateAlongRoute(route, formation.t);
          const ddx = route[i1].x - route[i0].x;
          const ddy = route[i1].y - route[i0].y;
          const pathDirLen = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
          dirX = ddx / pathDirLen;
          dirY = ddy / pathDirLen;
          perpX = -dirY;
          perpY = dirX;
          facingRight = ddx >= 0;
        }

        ctx.save();
        ctx.globalAlpha = formation.opacity;

        const isCombat = formation.state === "fighting" || formation.state === "sieging";
        const isRetreatDeath = formation.state === "dissolving" && formation.retreatFailed;
        const marchSprite = isRetreatDeath
          ? sprites.fallen
          : formation.state === "buildingCamp"
            ? sprites.marching
            : formation.state === "camping"
              ? sprites.resting ?? sprites.marching
              : formation.state === "celebrating"
                ? sprites.celebrating ?? sprites.marching
                : formation.state === "retreating"
                  ? sprites.retreating ?? sprites.marching
                  : sprites.marching;

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
          const superSprite = isCombat
            ? sprites.fighting
            : formation.state === "retreating"
              ? sprites.retreating ?? sprites.superSoldier
              : sprites.superSoldier;
          if (superSprite) {
            const animSpeed = isCombat ? 160 : formation.state === "retreating" ? 420 : 300;
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

            const spriteSet = isCombat ? sprites.fighting : marchSprite;
            if (!spriteSet) continue;
            const animSpeed = isCombat
              ? 180
              : formation.state === "retreating"
                ? 420
                : 350;
            const frameIndex =
              Math.floor((tick + soldier.frameOffset * 120) / animSpeed) % spriteSet.frames.length;

            ctx.save();
            ctx.translate(sx, sy);
            if (!facingRight) ctx.scale(-1, 1);
            if (formation.state === "retreating" && soldier.wounded) {
              ctx.filter = "saturate(0.68) brightness(0.88) contrast(1.05)";
            }
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
          const useCampRing =
            !formation.reinforcementType &&
            formation.campAnchor &&
            (formation.state === "buildingCamp" ||
              formation.state === "camping" ||
              formation.state === "celebrating");

          const campSite = sprites.campSite;
          if (useCampRing && campSite) {
            if (formation.state === "buildingCamp") {
              const fi = Math.min(
                campSite.frames.length - 1,
                Math.floor(
                  (formation.stateTimer / CAMPAIGN.campBuildDuration) * campSite.frames.length
                )
              );
              ctx.drawImage(
                campSite.frames[fi],
                pos.x - campSite.width / 2,
                pos.y - campSite.height + 4
              );
            } else {
              ctx.drawImage(
                campSite.frames[campSite.frames.length - 1],
                pos.x - campSite.width / 2,
                pos.y - campSite.height + 4
              );
            }
          }

          const numCols = useCampRing
            ? 1
            : Math.max(...formation.soldiers.map((s) => s.col)) + 1;
          const nSoldiers = formation.soldiers.length;

          for (let si = 0; si < nSoldiers; si++) {
            const soldier = formation.soldiers[si];
            let sx: number;
            let sy: number;
            let faceSoldier: boolean;

            if (useCampRing) {
              const ring = campRingOffset(si, nSoldiers, formation);
              sx = pos.x + ring.lx;
              sy = pos.y + ring.ly;
              faceSoldier = ring.faceRight;
              if (formation.state === "buildingCamp") {
                sx += Math.sin(tick * 0.012 + soldier.frameOffset) * 1.2;
                sy += Math.cos(tick * 0.01 + si) * 0.8;
              }
            } else {
              const colOffset = (soldier.col - (numCols - 1) / 2) * COL_SPACING;
              const rowOffset = soldier.row * ROW_SPACING;
              sx = pos.x - dirX * rowOffset + perpX * colOffset;
              sy = pos.y - dirY * rowOffset + perpY * colOffset;
              faceSoldier = facingRight;
            }

            if (isCombat) {
              sx += Math.sin(tick * 0.015 + soldier.frameOffset * 2.3) * 1.5;
              sy += Math.cos(tick * 0.012 + soldier.frameOffset * 1.7) * 1;
            }

            let spriteSet: SpriteFrames | undefined;
            if (isRetreatDeath && sprites.fallen) {
              spriteSet = sprites.fallen;
            } else if (isCombat && sprites.fighting) {
              spriteSet = sprites.fighting;
            } else if (
              soldier.type === "flag" &&
              sprites.flagBearer &&
              formation.state !== "retreating" &&
              formation.state !== "camping" &&
              formation.state !== "celebrating" &&
              formation.state !== "buildingCamp" &&
              formation.state !== "dissolving"
            ) {
              spriteSet = sprites.flagBearer;
            } else {
              spriteSet = marchSprite;
            }
            if (!spriteSet) continue;

            const animSpeed = isCombat
              ? 180
              : formation.state === "retreating"
                ? 420
                : formation.state === "buildingCamp"
                  ? 300
                  : formation.state === "camping" || formation.state === "celebrating"
                    ? 280
                    : 350;
            const frameIndex = isRetreatDeath
              ? 0
              : Math.floor((tick + soldier.frameOffset * 120) / animSpeed) % spriteSet.frames.length;

            ctx.save();
            ctx.translate(sx, sy);
            if (!faceSoldier) ctx.scale(-1, 1);
            if (formation.state === "retreating" && soldier.wounded) {
              ctx.filter = "saturate(0.68) brightness(0.88) contrast(1.05)";
            }
            if (isRetreatDeath) {
              ctx.translate(
                Math.sin(soldier.frameOffset * 1.7) * 3,
                (soldier.row + soldier.col * 0.4) * 2
              );
            }
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

  useEffect(() => {
    (window as unknown as { __battleMapFitAll?: () => void }).__battleMapFitAll = () => {
      const layout = layoutRef.current;
      if (!layout) return;
      const screen = screenRef.current;
      const pad = 100;
      let minX = layout.dimensions.castleX - 48;
      let maxX = layout.dimensions.castleX + 48;
      let minY = layout.dimensions.castleY - 48;
      let maxY = layout.dimensions.castleY + 48;
      for (const t of layout.territories) {
        minX = Math.min(minX, t.x - 55);
        maxX = Math.max(maxX, t.x + 55);
        minY = Math.min(minY, t.y - 48);
        maxY = Math.max(maxY, t.y + 48);
      }
      const worldW = maxX - minX + pad * 2;
      const worldH = maxY - minY + pad * 2;
      const zoomX = screen.w / worldW;
      const zoomY = screen.h / worldH;
      const cam = cameraRef.current;
      cam.zoom = Math.max(0.12, Math.min(1.5, Math.min(zoomX, zoomY) * 0.92));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      cam.x = cx - screen.w / (2 * cam.zoom);
      cam.y = cy - screen.h / (2 * cam.zoom);
    };
    return () => {
      delete (window as unknown as { __battleMapFitAll?: () => void }).__battleMapFitAll;
    };
  }, []);

  // Expose effect trigger
  useEffect(() => {
    (window as any).__battleMapTriggerEffect = (
      payload: BattleImpactEvent | "catapult" | "ram"
    ) => {
      const layout = layoutRef.current;
      if (!layout) return;

      // Only target active (non-fallen) territories
      const activeLines = troopLinesRef.current.filter(
        (l) => l.status !== "fallen"
      );
      if (activeLines.length === 0) return;

      const targetLine = activeLines[Math.floor(Math.random() * activeLines.length)];
      const normalizedEvent: BattleImpactEvent =
        typeof payload === "string"
          ? { type: payload === "catapult" ? "roast" : "encouragement", intensity: 1 }
          : payload;

      if (normalizedEvent.type === "roast") {
        // Roast: fire catapult(s) at troops and spawn enemy reinforcement waves.
        const catapultBursts = normalizedEvent.intensity;
        const attackers = targetLine.formations.filter(
          (f) => !f.isDefender && (f.state === "marching" || f.state === "sieging") && f.t > 0.1
        );

        for (let burst = 0; burst < catapultBursts; burst++) {
          let targetX: number, targetY: number;
          if (attackers.length > 0) {
            const victim = attackers[Math.floor(Math.random() * attackers.length)];
            const victimRoute = victim.path.length > 1 ? victim.path : targetLine.path;
            const pt = routePointAtT(victimRoute, victim.t);
            if (pt) {
              targetX = pt.x + (Math.random() - 0.5) * 20;
              targetY = pt.y + (Math.random() - 0.5) * 15;
            } else {
              const midIdx = Math.floor(targetLine.path.length * 0.5);
              const midPt = targetLine.path[midIdx];
              targetX = midPt.x + (Math.random() - 0.5) * 30;
              targetY = midPt.y + (Math.random() - 0.5) * 20;
            }
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
        }

        const enemyWaves = normalizedEvent.intensity;
        for (let wave = 0; wave < enemyWaves; wave++) {
          const enemyType: "dragon" | "ram" =
            Math.random() < INTERACTION_BALANCE.roastDragonChance ? "dragon" : "ram";
          const enemyReinforcement: Formation = {
            id: targetLine.nextFormationId++,
            t: 0,
            speed: enemyType === "ram" ? 0.00012 : 0.0002,
            moraleBoost: 0,
            soldiers: buildFormationSoldiers(true),
            state: "spawning",
            stateTimer: 0,
            isDefender: true,
            opacity: 0,
            reinforcementType: enemyType,
            objective: "toSkirmishMidpoint",
            path: [],
            objectiveLock: 0,
            skirmishId: null,
            campAnchor: null,
          };
          enemyReinforcement.path = resolveObjectivePath(layout.routingData, targetLine, enemyReinforcement);
          targetLine.formations.push(enemyReinforcement);
        }
      } else {
        // Encouragement: send 1-3 reinforcement waves based on intensity.
        for (let wave = 0; wave < normalizedEvent.intensity; wave++) {
          const reinforcementType = Math.random() > 0.5 ? "ram" : "super";
          const formation: Formation = {
            id: targetLine.nextFormationId++,
            t: 0,
            speed: reinforcementType === "ram" ? 0.00012 : 0.0002,
            moraleBoost: 0,
            soldiers: buildFormationSoldiers(false),
            state: "spawning",
            stateTimer: 0,
            isDefender: false,
            opacity: 0,
            reinforcementType,
            objective: "toFortress",
            path: [],
            objectiveLock: 0,
            skirmishId: null,
            campAnchor: null,
          };
          formation.path = resolveObjectivePath(layout.routingData, targetLine, formation);
          targetLine.formations.push(formation);
        }
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
      onReady?.();
      animFrameRef.current = requestAnimationFrame(render);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isReady, onReady, render]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

// -- Drawing helpers --

/** Index 0 = north (−Y), 1 = south (+Y), 2 = side (±X, flip when west). */
const BEAR_DIRECTION_FRAME_URLS = [
  "/bear/bear_north.png",
  "/bear/bear_south.png",
  "/bear/bear_side.png",
] as const;

const BEAR_TARGET_H = 40;

function bearSpriteForHeading(dx: number, dy: number): { frame: 0 | 1 | 2; flipX: boolean } {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > ay) {
    return dx >= 0 ? { frame: 2, flipX: false } : { frame: 2, flipX: true };
  }
  return dy > 0 ? { frame: 1, flipX: false } : { frame: 0, flipX: false };
}

/** Per-profile walk: bob, squash, light sway (no extra texture frames). */
function bearWalkMotion(
  tick: number,
  phase: number,
  frame: 0 | 1 | 2,
  pathPhase: number
): { bob: number; squashX: number; squashY: number; sway: number } {
  const t = tick * 0.001;
  const leg = Math.sin(t * 24 + phase * 1.4 + pathPhase * 12);
  if (frame === 0) {
    return {
      bob: Math.sin(t * 11 + phase) * 1.55 + leg * 0.35,
      squashX: 1 + leg * 0.022,
      squashY: 1 - leg * 0.028,
      sway: Math.sin(t * 9 + phase) * 0.045,
    };
  }
  if (frame === 1) {
    return {
      bob: Math.sin(t * 12 + phase * 1.1) * 1.9 + leg * 0.42,
      squashX: 1 + Math.sin(t * 22 + phase) * 0.026,
      squashY: 1 - Math.sin(t * 22 + phase + 0.4) * 0.032,
      sway: Math.sin(t * 8.5 + phase) * 0.038,
    };
  }
  return {
    bob: Math.sin(t * 13 + phase) * 1.7 + leg * 0.38,
    squashX: 1 + leg * 0.03,
    squashY: 1 - leg * 0.03,
    sway: Math.sin(t * 10 + phase * 1.2) * 0.065,
  };
}

function drawPatrolBearSprite(
  ctx: CanvasRenderingContext2D,
  frames: (HTMLCanvasElement | null)[],
  x: number,
  y: number,
  tick: number,
  phase: number,
  dirX: number,
  dirY: number,
  pathPhase: number
) {
  const { frame, flipX } = bearSpriteForHeading(dirX, dirY);
  let img = frames[frame] ?? null;
  if (!img || img.width < 1 || img.height < 1) {
    img = frames.find((f) => f && f.width > 0 && f.height > 0) ?? null;
  }
  if (!img) return;

  const motion = bearWalkMotion(tick, phase, frame, pathPhase);
  const scale = BEAR_TARGET_H / img.height;
  const dw = img.width * scale;
  const dh = BEAR_TARGET_H;

  ctx.save();
  ctx.fillStyle = "rgba(20, 16, 12, 0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y + motion.bob + 5, dw * 0.38, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(x, y + motion.bob);
  ctx.rotate(motion.sway);
  ctx.scale(motion.squashX, motion.squashY);
  if (flipX) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -dw * 0.5, -dh + 8, dw, dh);
  ctx.restore();
}

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
