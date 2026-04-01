import { Application, Territory, MapDimensions } from "./types";

export interface LakeObstacle {
  x: number;
  y: number;
  radius: number;
  wobble: number;
}

export interface RoadPath {
  points: { x: number; y: number }[];
}

export interface RoutingData {
  lakes: LakeObstacle[];
  roads: RoadPath[];
  cellSize: number;
  cols: number;
  rows: number;
  costs: Float32Array;
}

export type ObjectiveType = "toFortress" | "toCastle" | "toSkirmishMidpoint";

/**
 * World-space layout: castle at center (0, 0), territories placed radially
 * outward in all directions. World size scales with territory count.
 */
export function computeMapLayout(
  applications: Application[]
): { territories: Territory[]; dimensions: MapDimensions; routingData: RoutingData } {
  const companyMap = new Map<string, Application[]>();
  for (const app of applications) {
    const existing = companyMap.get(app.company) || [];
    existing.push(app);
    companyMap.set(app.company, existing);
  }

  const companies = Array.from(companyMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { sensitivity: "base" })
  );
  const count = companies.length;

  // Placement arena: grows with territory count (final canvas size is derived from content below).
  const baseRadius = 820;
  const worldRadius = baseRadius + count * 88;
  const placeMargin = Math.max(520, Math.round(worldRadius * 0.5));
  const placeSize = worldRadius * 2 + placeMargin;

  const castleX = placeSize / 2;
  const castleY = placeSize / 2;

  const MIN_DIST = 330;
  const MIN_CASTLE_DIST = 380;
  const TERRITORY_AREA_BASE = 235;

  const placed: { x: number; y: number }[] = [];

  const territories: Territory[] = companies.map(([company, apps]) => {
    const seed = hashString(company);
    const rng = seededRandom(seed);
    // Stable base polar coords per company (same name → same angle/radius draw)
    let angle = rng() * Math.PI * 2;
    let dist = MIN_CASTLE_DIST + rng() * (worldRadius - MIN_CASTLE_DIST);
    let bestX = castleX + Math.cos(angle) * dist;
    let bestY = castleY + Math.sin(angle) * dist;

    // Deterministic collision nudges (depends only on company + attempt + prior placed)
    for (let attempt = 0; attempt < 60; attempt++) {
      let minDistToOther = Infinity;
      for (const p of placed) {
        const d = Math.hypot(bestX - p.x, bestY - p.y);
        minDistToOther = Math.min(minDistToOther, d);
      }
      const cDist = Math.hypot(bestX - castleX, bestY - castleY);
      const okCastle = cDist >= MIN_CASTLE_DIST;
      const okSep = placed.length === 0 || minDistToOther >= MIN_DIST;
      if (okCastle && okSep) break;

      const nRng = seededRandom(seed + 7919 + attempt * 97);
      angle += (nRng() - 0.5) * 1.1;
      dist = Math.min(worldRadius - 30, dist + 14 + nRng() * 30);
      bestX = castleX + Math.cos(angle) * dist;
      bestY = castleY + Math.sin(angle) * dist;
    }

    placed.push({ x: bestX, y: bestY });

    const allRejected = apps.every((a) => a.status === "reject");
    const hasInterview = apps.some((a) => a.status === "interview");
    const hasOffer = apps.some((a) => a.status === "offer");

    let status: Territory["status"] = "active";
    if (hasOffer) status = "conquered";
    else if (allRejected) status = "fallen";
    else if (hasInterview) status = "sieging";

    return {
      id: company.toLowerCase().replace(/\s+/g, "-"),
      company,
      applications: apps,
      x: bestX,
      y: bestY,
      status,
    };
  });

  const territoryAreaRadii = territories.map((t) => {
    const localRng = seededRandom(hashString(`territory-area|${t.company}`));
    // Per-company radius adds natural variation while preserving deterministic layout.
    return TERRITORY_AREA_BASE * (0.9 + localRng() * 0.4);
  });

  enforceTerritoryAreaSpacing(
    territories,
    territoryAreaRadii,
    castleX,
    castleY,
    MIN_CASTLE_DIST,
    worldRadius - 20
  );

  const dimensions = fitWorldDimensionsToContent(territories, castleX, castleY);
  const routingData = buildRoutingData(territories, dimensions);

  return {
    territories,
    dimensions,
    routingData,
  };
}

function enforceTerritoryAreaSpacing(
  territories: Territory[],
  territoryAreaRadii: number[],
  castleX: number,
  castleY: number,
  minCastleDist: number,
  maxCastleDist: number
): void {
  if (territories.length < 2) return;

  for (let iter = 0; iter < 12; iter++) {
    let moved = false;

    for (let i = 0; i < territories.length; i++) {
      for (let j = i + 1; j < territories.length; j++) {
        const a = territories[i];
        const b = territories[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);

        if (d < 1e-6) {
          dx = 1;
          dy = 0;
          d = 1;
        }

        const targetSeparation = territoryAreaRadii[i] + territoryAreaRadii[j];
        if (d >= targetSeparation) continue;
        const push = (targetSeparation - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;

        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        moved = true;
      }
    }

    for (const t of territories) {
      const vx = t.x - castleX;
      const vy = t.y - castleY;
      let dist = Math.hypot(vx, vy);
      if (dist < 1e-6) dist = 1;
      const nx = vx / dist;
      const ny = vy / dist;
      const clamped = Math.max(minCastleDist, Math.min(maxCastleDist, dist));
      t.x = castleX + nx * clamped;
      t.y = castleY + ny * clamped;
    }

    if (!moved) break;
  }
}

/** Tight square world around castle + fortresses; padding scales with spread so the map grows with data, not a fixed pixel size. */
function fitWorldDimensionsToContent(
  territories: Territory[],
  castleX: number,
  castleY: number
): MapDimensions {
  const castlePad = 125;
  const fortPad = 168;

  let minX = castleX - castlePad;
  let maxX = castleX + castlePad;
  let minY = castleY - castlePad;
  let maxY = castleY + castlePad;

  for (const t of territories) {
    minX = Math.min(minX, t.x - fortPad);
    maxX = Math.max(maxX, t.x + fortPad);
    minY = Math.min(minY, t.y - fortPad);
    maxY = Math.max(maxY, t.y + fortPad);
  }

  const spanW = maxX - minX;
  const spanH = maxY - minY;
  const span = Math.max(spanW, spanH);
  const edgePad = Math.max(400, span * 0.15);
  const worldSize = span + edgePad * 2;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const dx = worldSize / 2 - cx;
  const dy = worldSize / 2 - cy;

  for (const t of territories) {
    t.x += dx;
    t.y += dy;
  }

  return {
    width: worldSize,
    height: worldSize,
    castleX: castleX + dx,
    castleY: castleY + dy,
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export { seededRandom, hashString };

export function buildRoutingData(
  territories: Territory[],
  dimensions: MapDimensions
): RoutingData {
  const lakes = generateLakes(territories, dimensions);
  const roads: RoadPath[] = [];
  const cellSize = 28;
  const cols = Math.ceil(dimensions.width / cellSize);
  const rows = Math.ceil(dimensions.height / cellSize);
  const costs = new Float32Array(cols * rows);

  const terrainSeed = hashString(
    `route-cost|${territories.map((t) => t.id).join("|")}|${Math.round(dimensions.width)}`
  );

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const wx = x * cellSize + cellSize * 0.5;
      const wy = y * cellSize + cellSize * 0.5;
      const idx = y * cols + x;

      const blockedByLake = lakes.some((l) => Math.hypot(wx - l.x, wy - l.y) <= l.radius * 1.15);
      if (blockedByLake) {
        costs[idx] = Number.POSITIVE_INFINITY;
        continue;
      }

      const n1 = smoothNoise2d((wx / dimensions.width) * 7.2, (wy / dimensions.height) * 7.2, terrainSeed);
      const n2 = smoothNoise2d((wx / dimensions.width) * 14.3, (wy / dimensions.height) * 14.3, terrainSeed + 41) * 0.45;
      const field = n1 * 0.7 + n2 * 0.3;

      let baseCost = 1.0; // plains
      if (field < -0.1) baseCost = 1.55; // forest
      else if (field > 0.28) baseCost = 2.2; // rocky

      costs[idx] = baseCost;
    }
  }

  return { lakes, roads, cellSize, cols, rows, costs };
}

export function computePath(
  castleX: number,
  castleY: number,
  targetX: number,
  targetY: number,
  segments: number = 80,
  routingData?: RoutingData
): { x: number; y: number }[] {
  if (routingData) {
    const routed = computeAStarPath(castleX, castleY, targetX, targetY, routingData);
    if (routed.length >= 2) {
      return resamplePath(smoothPolyline(routed), segments);
    }
  }

  const dx = targetX - castleX;
  const dy = targetY - castleY;

  // Perpendicular offset for S-curve variety
  const perpX = -dy * 0.15;
  const perpY = dx * 0.15;

  const cp1x = castleX + dx * 0.3 + perpX;
  const cp1y = castleY + dy * 0.3 + perpY;
  const cp2x = castleX + dx * 0.7 - perpX;
  const cp2y = castleY + dy * 0.7 - perpY;

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = cubicBezier(t, castleX, cp1x, cp2x, targetX);
    const y = cubicBezier(t, castleY, cp1y, cp2y, targetY);
    points.push({ x, y });
  }

  return points;
}

export function computeObjectivePath(
  objective: ObjectiveType,
  line: { territoryX: number; territoryY: number; castleX: number; castleY: number },
  routingData: RoutingData,
  laneSeed: number,
  segments: number = 80
): { x: number; y: number }[] {
  let sx = line.castleX;
  let sy = line.castleY;
  let tx = line.territoryX;
  let ty = line.territoryY;

  if (objective === "toCastle") {
    sx = line.territoryX;
    sy = line.territoryY;
    tx = line.castleX;
    ty = line.castleY;
  } else if (objective === "toSkirmishMidpoint") {
    sx = line.territoryX;
    sy = line.territoryY;
    tx = (line.castleX + line.territoryX) / 2;
    ty = (line.castleY + line.territoryY) / 2;
  }

  const laneRng = seededRandom(Math.abs(laneSeed) + 19);
  const lane = (laneRng() - 0.5) * routingData.cellSize * 1.15;
  const vx = tx - sx;
  const vy = ty - sy;
  const len = Math.hypot(vx, vy) || 1;
  const px = -vy / len;
  const py = vx / len;

  return computePath(
    sx + px * lane,
    sy + py * lane,
    tx + px * lane,
    ty + py * lane,
    segments,
    routingData
  );
}

function computeAStarPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  data: RoutingData
): { x: number; y: number }[] {
  const toCell = (x: number, y: number) => ({
    cx: Math.max(0, Math.min(data.cols - 1, Math.floor(x / data.cellSize))),
    cy: Math.max(0, Math.min(data.rows - 1, Math.floor(y / data.cellSize))),
  });

  const start = toCell(startX, startY);
  const goal = toCell(endX, endY);
  const startIdx = start.cy * data.cols + start.cx;
  const goalIdx = goal.cy * data.cols + goal.cx;

  const gScore = new Float32Array(data.cols * data.rows);
  gScore.fill(Number.POSITIVE_INFINITY);
  gScore[startIdx] = 0;
  const cameFrom = new Int32Array(data.cols * data.rows);
  cameFrom.fill(-1);
  const openSet = new Set<number>([startIdx]);

  const heuristic = (idx: number) => {
    const x = idx % data.cols;
    const y = Math.floor(idx / data.cols);
    return Math.hypot(x - goal.cx, y - goal.cy);
  };

  while (openSet.size > 0) {
    let current = -1;
    let bestF = Number.POSITIVE_INFINITY;
    for (const idx of openSet) {
      const f = gScore[idx] + heuristic(idx);
      if (f < bestF) {
        bestF = f;
        current = idx;
      }
    }
    if (current === goalIdx) break;
    openSet.delete(current);

    const cx = current % data.cols;
    const cy = Math.floor(current / data.cols);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        const nx = cx + ox;
        const ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= data.cols || ny >= data.rows) continue;
        const nIdx = ny * data.cols + nx;
        const cellCost = data.costs[nIdx];
        if (!Number.isFinite(cellCost)) continue;
        const step = (ox !== 0 && oy !== 0 ? 1.42 : 1) * cellCost;
        const tentative = gScore[current] + step;
        if (tentative < gScore[nIdx]) {
          cameFrom[nIdx] = current;
          gScore[nIdx] = tentative;
          openSet.add(nIdx);
        }
      }
    }
  }

  if (cameFrom[goalIdx] === -1) return [];

  const reverse: number[] = [goalIdx];
  let cur = goalIdx;
  while (cur !== startIdx) {
    cur = cameFrom[cur];
    if (cur === -1) break;
    reverse.push(cur);
  }
  reverse.reverse();

  return reverse.map((idx) => ({
    x: (idx % data.cols) * data.cellSize + data.cellSize * 0.5,
    y: Math.floor(idx / data.cols) * data.cellSize + data.cellSize * 0.5,
  }));
}

function resamplePath(points: { x: number; y: number }[], segments: number): { x: number; y: number }[] {
  if (points.length < 2) return points;
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    cumulative.push(cumulative[cumulative.length - 1] + d);
  }
  const total = cumulative[cumulative.length - 1] || 1;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * total;
    let k = 1;
    while (k < cumulative.length && cumulative[k] < t) k++;
    const k0 = Math.max(0, k - 1);
    const k1 = Math.min(points.length - 1, k);
    const d0 = cumulative[k0];
    const d1 = cumulative[k1] || d0 + 1;
    const lt = d1 === d0 ? 0 : (t - d0) / (d1 - d0);
    out.push({
      x: points[k0].x + (points[k1].x - points[k0].x) * lt,
      y: points[k0].y + (points[k1].y - points[k0].y) * lt,
    });
  }
  return out;
}

function smoothPolyline(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points;
  const smoothed: { x: number; y: number }[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    smoothed.push({
      x: (points[i - 1].x + points[i].x * 4 + points[i + 1].x) / 6,
      y: (points[i - 1].y + points[i].y * 4 + points[i + 1].y) / 6,
    });
  }
  smoothed.push(points[points.length - 1]);
  return smoothed;
}

function generateLakes(territories: Territory[], dim: MapDimensions): LakeObstacle[] {
  const seed = hashString(`lakes|${territories.map((t) => t.id).join("|")}|${Math.round(dim.width)}`);
  const rng = seededRandom(seed);
  const occupied = [
    { x: dim.castleX, y: dim.castleY, r: 120 },
    ...territories.map((t) => ({ x: t.x, y: t.y, r: 78 })),
  ];
  const lakes: LakeObstacle[] = [];
  const target = 1 + Math.floor(rng() * 4);
  let guard = 0;
  while (lakes.length < target && guard < target * 40) {
    guard++;
    const x = rng() * dim.width;
    const y = rng() * dim.height;
    const radius = 20 + rng() * 34;
    if (occupied.some((o) => Math.hypot(x - o.x, y - o.y) < o.r + radius)) continue;
    lakes.push({ x, y, radius, wobble: 0.08 + rng() * 0.1 });
  }
  return lakes;
}


function smoothNoise2d(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = x - x0;
  const sy = y - y0;
  const n00 = valueNoise(x0, y0, seed);
  const n10 = valueNoise(x1, y0, seed);
  const n01 = valueNoise(x0, y1, seed);
  const n11 = valueNoise(x1, y1, seed);
  const ix0 = lerp(n00, n10, smoothstep(sx));
  const ix1 = lerp(n01, n11, smoothstep(sx));
  return lerp(ix0, ix1, smoothstep(sy));
}

function valueNoise(x: number, y: number, seed: number): number {
  const n = Math.sin((x * 127.1 + y * 311.7 + seed * 0.017) * 12.9898) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}
