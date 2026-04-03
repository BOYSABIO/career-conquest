import { Territory, MapDimensions } from "./types";
import { seededRandom, hashString, buildRoutingData, RoutingData } from "./map-layout";

/**
 * Renders the full world background into an offscreen canvas:
 * parchment, territory borders, trees, mountains, lakes, rocks.
 */
export function renderWorldBackground(
  territories: Territory[],
  dimensions: MapDimensions,
  routingData?: RoutingData
): HTMLCanvasElement {
  const start =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const { width: w, height: h } = dimensions;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  drawParchment(ctx, w, h);
  const biomeField = createBiomeField(territories, dimensions);
  drawBiomeTint(ctx, dimensions, biomeField);
  const routing = routingData ?? buildRoutingData(territories, dimensions);
  const hydroField = { lakes: routing.lakes };
  drawHydroFeatures(ctx, dimensions, hydroField);
  drawTerritoryBorders(ctx, territories, dimensions);
  drawMountains(ctx, dimensions, territories.length);
  const propMetrics = drawBiomeProps(ctx, territories, dimensions, biomeField, hydroField);

  const end =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    console.debug("[terrain] background render", {
      ms: Math.round((end - start) * 100) / 100,
      size: `${Math.round(w)}x${Math.round(h)}`,
      territories: territories.length,
      ...propMetrics,
    });
  }

  return canvas;
}

const TERRAIN_TUNING = {
  borderNeighborDistance: 520,
  borderMinLength: 28,
  borderSampleCount: 22,
  borderNoiseAmplitude: 2.6,
  borderNoiseFrequency: 0.012,
  borderSplineSteps: 10,
  forestThreshold: 0.53,
  rockyThreshold: 0.66,
  treeMinSpacing: {
    forest: 9,
    plains: 18,
    rocky: 28,
  },
  bushMinSpacing: {
    forest: 10,
    plains: 20,
    rocky: 35,
  },
  rockMinSpacing: {
    forest: 30,
    plains: 24,
    rocky: 14,
  },
  castleExclusionRadius: 92,
  territoryExclusionRadius: 58,
  routeExclusionRadius: 15,
  forestDensePatchChance: 0.55,
  forestDenseAcceptanceBoost: 0.32,
  clearingRadiusMin: 14,
  clearingRadiusMax: 28,
  forestBlobMinRadius: 24,
  forestBlobMaxRadius: 44,
  forestBlobSpacing: 48,
  forestBlobLakeBuffer: 12,
  forestBlobCountMin: 1,
  forestBlobCountMax: 3,
} as const;

type BiomeType = "forest" | "plains" | "rocky";

interface BiomeField {
  sample: (x: number, y: number) => BiomeType;
}

interface Lake {
  x: number;
  y: number;
  radius: number;
  wobble: number;
}

interface HydroField {
  lakes: Lake[];
}

interface ForestClearing {
  x: number;
  y: number;
  radius: number;
}

interface ForestPatch {
  x: number;
  y: number;
  radius: number;
  strength: number;
  dense: boolean;
  clearings: ForestClearing[];
}

interface ForestBlob {
  x: number;
  y: number;
  radius: number;
  sprite: HTMLCanvasElement;
}

interface TerrainRenderProfile {
  densityScale: number;
  patchCap: number;
  blobCountBoost: number;
  blobRadiusScale: number;
  treeAttemptScale: number;
  bushAttemptScale: number;
  rockAttemptScale: number;
}

interface TerrainRenderMetrics {
  forestPatches: number;
  forestBlobs: number;
  trees: number;
  bushes: number;
  rocks: number;
}

// -- Parchment --

function drawParchment(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
  gradient.addColorStop(0, "#f4e4c1");
  gradient.addColorStop(0.5, "#e8d4a8");
  gradient.addColorStop(0.85, "#d8c498");
  gradient.addColorStop(1, "#b8a478");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Texture noise (seeded so it's stable)
  const rng = seededRandom(42);
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 600; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const size = rng() * 4 + 1;
    ctx.fillStyle = rng() > 0.5 ? "#8b7355" : "#d4c4a1";
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;

  // Outer fog of war
  const fog = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, w * 0.55);
  fog.addColorStop(0, "rgba(0,0,0,0)");
  fog.addColorStop(1, "rgba(40, 25, 10, 0.5)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, w, h);
}

// -- Territory borders --

function drawTerritoryBorders(
  ctx: CanvasRenderingContext2D,
  territories: Territory[],
  dimensions: MapDimensions
) {
  const sites = [
    { x: dimensions.castleX, y: dimensions.castleY },
    ...territories.map((t) => ({ x: t.x, y: t.y })),
  ];

  ctx.save();

  // Stage A: collect clean frontier candidates
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      const a = sites[i];
      const b = sites[j];

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > TERRAIN_TUNING.borderNeighborDistance) continue;

      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const px = -dy / dist;
      const py = dx / dist;
      const edgeHalfLen = dist * 0.45;

      const sampleCount = TERRAIN_TUNING.borderSampleCount;
      const samples: { t: number; valid: boolean }[] = [];
      for (let s = 0; s <= sampleCount; s++) {
        const t = -edgeHalfLen + (s / sampleCount) * edgeHalfLen * 2;
        const sx = mx + px * t;
        const sy = my + py * t;
        const dToA = (sx - a.x) ** 2 + (sy - a.y) ** 2;
        let closerSiteExists = false;
        for (let k = 0; k < sites.length; k++) {
          if (k === i || k === j) continue;
          const dToK = (sx - sites[k].x) ** 2 + (sy - sites[k].y) ** 2;
          if (dToK < dToA - 100) {
            closerSiteExists = true;
            break;
          }
        }
        samples.push({ t, valid: !closerSiteExists });
      }

      let bestStart = 0, bestEnd = 0, bestLen = 0;
      let curStart = 0;
      for (let s = 0; s < samples.length; s++) {
        if (samples[s].valid) {
          if (s === 0 || !samples[s - 1].valid) curStart = s;
          const len = s - curStart + 1;
          if (len > bestLen) {
            bestLen = len;
            bestStart = curStart;
            bestEnd = s;
          }
        }
      }

      if (bestLen < 4) continue;

      const ex1 = mx + px * samples[bestStart].t;
      const ey1 = my + py * samples[bestStart].t;
      const ex2 = mx + px * samples[bestEnd].t;
      const ey2 = my + py * samples[bestEnd].t;
      const edgeLen = Math.hypot(ex2 - ex1, ey2 - ey1);
      if (edgeLen < TERRAIN_TUNING.borderMinLength) continue;

      edges.push({
        x1: ex1,
        y1: ey1,
        x2: ex2,
        y2: ey2,
      });
    }
  }

  // Stage B: draw clean, constrained organic frontiers
  const borderSeed = hashString(
    `${territories.length}|${Math.round(dimensions.width)}|${Math.round(dimensions.height)}`
  );

  for (const edge of edges) {
    const stylized = stylizeFrontier(edge, borderSeed);
    if (stylized.length < 2) continue;

    ctx.strokeStyle = "rgba(80, 55, 30, 0.3)";
    ctx.lineWidth = 1.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    drawSmoothPath(ctx, stylized, 0);

    // Faint shadow line offset slightly for depth
    ctx.strokeStyle = "rgba(60, 40, 20, 0.08)";
    ctx.lineWidth = 2.5;
    drawSmoothPath(ctx, stylized, 1.5);

  }

  ctx.restore();
}

function drawSmoothPath(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  offset: number
) {
  ctx.beginPath();
  ctx.moveTo(points[0].x + offset, points[0].y + offset);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const midX = (prev.x + cur.x) / 2 + offset;
    const midY = (prev.y + cur.y) / 2 + offset;
    ctx.quadraticCurveTo(prev.x + offset, prev.y + offset, midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x + offset, last.y + offset);
  ctx.stroke();
}

function stylizeFrontier(
  edge: { x1: number; y1: number; x2: number; y2: number },
  seed: number
): { x: number; y: number }[] {
  const edgeDx = edge.x2 - edge.x1;
  const edgeDy = edge.y2 - edge.y1;
  const edgeLen = Math.hypot(edgeDx, edgeDy);
  const steps = Math.max(10, Math.floor(edgeLen / TERRAIN_TUNING.borderSplineSteps));
  const perpX = -edgeDy / (edgeLen || 1);
  const perpY = edgeDx / (edgeLen || 1);

  const points: { x: number; y: number }[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const baseX = edge.x1 + edgeDx * t;
    const baseY = edge.y1 + edgeDy * t;
    const endpointFade = Math.min(t * 3, (1 - t) * 3, 1);
    const noise = smoothNoise2d(
      baseX * TERRAIN_TUNING.borderNoiseFrequency,
      baseY * TERRAIN_TUNING.borderNoiseFrequency,
      seed
    );
    const offset = noise * TERRAIN_TUNING.borderNoiseAmplitude * endpointFade;
    points.push({
      x: baseX + perpX * offset,
      y: baseY + perpY * offset,
    });
  }
  return points;
}

// -- Mountains --

function drawMountains(ctx: CanvasRenderingContext2D, dim: MapDimensions, territoryCount: number) {
  const numRanges = Math.min(3, 1 + Math.floor(territoryCount / 7));
  const rng = seededRandom(1234);

  ctx.save();

  for (let r = 0; r < numRanges; r++) {
    // Place mountain range in a line at a random angle from center
    const rangeAngle = rng() * Math.PI * 2;
    const rangeDist = dim.width * (0.2 + rng() * 0.25);
    const rangeCenterX = dim.castleX + Math.cos(rangeAngle) * rangeDist;
    const rangeCenterY = dim.castleY + Math.sin(rangeAngle) * rangeDist;
    const perpAngle = rangeAngle + Math.PI / 2;

    const numPeaks = 3 + Math.floor(rng() * 4);

    for (let p = 0; p < numPeaks; p++) {
      const offset = (p - numPeaks / 2) * (30 + rng() * 20);
      const px = rangeCenterX + Math.cos(perpAngle) * offset;
      const py = rangeCenterY + Math.sin(perpAngle) * offset;
      const peakH = 20 + rng() * 25;
      const peakW = 18 + rng() * 14;

      // Mountain body
      ctx.fillStyle = "rgba(120, 100, 80, 0.35)";
      ctx.beginPath();
      ctx.moveTo(px - peakW, py + peakH * 0.3);
      ctx.lineTo(px - peakW * 0.1, py - peakH);
      ctx.lineTo(px + peakW * 0.15, py - peakH * 0.85);
      ctx.lineTo(px + peakW, py + peakH * 0.3);
      ctx.closePath();
      ctx.fill();

      // Snow cap
      ctx.fillStyle = "rgba(230, 225, 215, 0.5)";
      ctx.beginPath();
      ctx.moveTo(px - peakW * 0.25, py - peakH * 0.6);
      ctx.lineTo(px - peakW * 0.1, py - peakH);
      ctx.lineTo(px + peakW * 0.15, py - peakH * 0.85);
      ctx.lineTo(px + peakW * 0.2, py - peakH * 0.55);
      ctx.closePath();
      ctx.fill();

      // Shadow side
      ctx.fillStyle = "rgba(80, 60, 40, 0.12)";
      ctx.beginPath();
      ctx.moveTo(px + peakW * 0.15, py - peakH * 0.85);
      ctx.lineTo(px + peakW, py + peakH * 0.3);
      ctx.lineTo(px, py + peakH * 0.3);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();
}

// -- Biome field + props --

function createBiomeField(territories: Territory[], dim: MapDimensions): BiomeField {
  const biomeSeed = hashString(
    `${territories.map((t) => t.id).join("|")}|${Math.round(dim.width)}|${Math.round(dim.height)}`
  );

  const sample = (x: number, y: number): BiomeType => {
    const nx = x / dim.width;
    const ny = y / dim.height;
    const dx = x - dim.castleX;
    const dy = y - dim.castleY;
    const radial = Math.min(1, Math.hypot(dx, dy) / (dim.width * 0.55));

    const n1 = smoothNoise2d(nx * 6.2, ny * 6.2, biomeSeed);
    const n2 = smoothNoise2d(nx * 12.7, ny * 12.7, biomeSeed + 71) * 0.5;
    const field = n1 * 0.75 + n2 * 0.25 + radial * 0.12;

    if (field < TERRAIN_TUNING.forestThreshold) return "forest";
    if (field > TERRAIN_TUNING.rockyThreshold) return "rocky";
    return "plains";
  };

  return { sample };
}

function drawBiomeTint(
  ctx: CanvasRenderingContext2D,
  dim: MapDimensions,
  biomeField: BiomeField
) {
  ctx.save();
  const step = 48;
  for (let y = 0; y < dim.height; y += step) {
    for (let x = 0; x < dim.width; x += step) {
      const biome = biomeField.sample(x + step / 2, y + step / 2);
      if (biome === "forest") {
        ctx.fillStyle = "rgba(55, 95, 55, 0.05)";
      } else if (biome === "rocky") {
        ctx.fillStyle = "rgba(95, 85, 70, 0.05)";
      } else {
        ctx.fillStyle = "rgba(180, 160, 110, 0.025)";
      }
      ctx.fillRect(x, y, step, step);
    }
  }
  ctx.restore();
}

function drawHydroFeatures(
  ctx: CanvasRenderingContext2D,
  _dim: MapDimensions,
  hydro: HydroField
) {
  ctx.save();

  for (const lake of hydro.lakes) {
    const shape = createLakeShape(lake);
    const grad = ctx.createRadialGradient(lake.x, lake.y, lake.radius * 0.25, lake.x, lake.y, lake.radius * 1.2);
    grad.addColorStop(0, "rgba(120, 170, 190, 0.28)");
    grad.addColorStop(1, "rgba(70, 125, 150, 0.2)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(shape[0].x, shape[0].y);
    for (let i = 1; i < shape.length; i++) ctx.lineTo(shape[i].x, shape[i].y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(205, 220, 200, 0.14)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(shape[0].x, shape[0].y);
    for (let i = 1; i < shape.length; i++) ctx.lineTo(shape[i].x, shape[i].y);
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

function createLakeShape(lake: Lake): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const ang = t * Math.PI * 2;
    const wobble = 1 + Math.sin(ang * 3.2 + lake.wobble * 25) * lake.wobble;
    pts.push({
      x: lake.x + Math.cos(ang) * lake.radius * wobble,
      y: lake.y + Math.sin(ang) * lake.radius * wobble * 0.92,
    });
  }
  return pts;
}

function drawBiomeProps(
  ctx: CanvasRenderingContext2D,
  territories: Territory[],
  dim: MapDimensions,
  biomeField: BiomeField,
  hydroField: HydroField
): TerrainRenderMetrics {
  const propSeed = hashString(
    `props|${territories.map((t) => t.id).join("|")}|${Math.round(dim.width)}`
  );
  const rng = seededRandom(propSeed);
  const worldRadius = dim.width * 0.45;
  const renderProfile = getTerrainRenderProfile(dim, territories.length);

  const occupied = [
    { x: dim.castleX, y: dim.castleY, r: TERRAIN_TUNING.castleExclusionRadius },
    ...territories.map((t) => ({ x: t.x, y: t.y, r: TERRAIN_TUNING.territoryExclusionRadius })),
  ];
  const routeSegments = territories.map((t) => ({
    x1: dim.castleX,
    y1: dim.castleY,
    x2: t.x,
    y2: t.y,
  }));

  const forestPatches = buildForestPatches(dim, biomeField, rng, occupied, renderProfile);
  const forestBlobs = buildForestBlobs(forestPatches, hydroField, rng, renderProfile);
  const treePoints: { x: number; y: number }[] = [];
  const bushPoints: { x: number; y: number }[] = [];
  const rockPoints: { x: number; y: number }[] = [];

  const treeAttempts = Math.floor(
    Math.min(4200, (1200 + territories.length * 110) * renderProfile.treeAttemptScale)
  );
  const bushAttempts = Math.floor(
    Math.min(2600, (900 + territories.length * 70) * renderProfile.bushAttemptScale)
  );
  const rockAttempts = Math.floor(
    Math.min(2200, (850 + territories.length * 75) * renderProfile.rockAttemptScale)
  );

  for (let i = 0; i < treeAttempts; i++) {
    const x = rng() * dim.width;
    const y = rng() * dim.height;
    if (!isWorldPointValid(x, y, dim, worldRadius, occupied, routeSegments, hydroField)) continue;
    const biome = biomeField.sample(x, y);
    const spacing = TERRAIN_TUNING.treeMinSpacing[biome];
    const densityBoost = biome === "forest" ? forestDensityMask(x, y, forestPatches) : 0;
    const acceptance = biome === "forest" ? 0.17 + densityBoost * 0.68 : biome === "plains" ? 0.09 : 0.03;
    if (isInsideForestClearing(x, y, forestPatches)) continue;
    if (isInsideForestBlob(x, y, forestBlobs, 0.75)) continue;
    const adjustedAcceptance =
      biome === "forest"
        ? Math.min(0.78, acceptance * renderProfile.densityScale)
        : acceptance;
    if (rng() > adjustedAcceptance) continue;
    if (!passesMinSpacing(x, y, treePoints, spacing)) continue;
    if (biome === "forest" && isInsideForestBlob(x, y, forestBlobs, 0.95) && rng() > 0.2) continue;
    treePoints.push({ x, y });
  }

  for (let i = 0; i < bushAttempts; i++) {
    const x = rng() * dim.width;
    const y = rng() * dim.height;
    if (!isWorldPointValid(x, y, dim, worldRadius, occupied, routeSegments, hydroField)) continue;
    const biome = biomeField.sample(x, y);
    const spacing = TERRAIN_TUNING.bushMinSpacing[biome];
    const acceptance = biome === "forest" ? 0.1 : biome === "plains" ? 0.11 : 0.02;
    if (isInsideForestClearing(x, y, forestPatches)) continue;
    if (isInsideForestBlob(x, y, forestBlobs, 0.68)) continue;
    if (rng() > acceptance) continue;
    if (!passesMinSpacing(x, y, bushPoints, spacing)) continue;
    bushPoints.push({ x, y });
  }

  for (let i = 0; i < rockAttempts; i++) {
    const x = rng() * dim.width;
    const y = rng() * dim.height;
    if (!isWorldPointValid(x, y, dim, worldRadius, occupied, routeSegments, hydroField)) continue;
    const biome = biomeField.sample(x, y);
    const spacing = TERRAIN_TUNING.rockMinSpacing[biome];
    const acceptance = biome === "rocky" ? 0.25 : biome === "plains" ? 0.09 : 0.04;
    if (rng() > acceptance) continue;
    if (!passesMinSpacing(x, y, rockPoints, spacing)) continue;
    rockPoints.push({ x, y });
  }

  ctx.save();
  for (const blob of forestBlobs) {
    ctx.globalAlpha = 0.95;
    ctx.drawImage(blob.sprite, blob.x - blob.radius, blob.y - blob.radius * 1.2);
  }
  ctx.globalAlpha = 1;
  for (const p of treePoints) {
    const size = 0.75 + rng() * 0.95;
    if (rng() > 0.5) drawPineTree(ctx, p.x, p.y, size, rng);
    else drawRoundTree(ctx, p.x, p.y, size, rng);
  }
  for (const p of bushPoints) {
    const size = 0.6 + rng() * 0.6;
    drawBushCluster(ctx, p.x, p.y, size, rng);
  }
  for (const p of rockPoints) {
    drawSingleRock(ctx, p.x, p.y, 3 + rng() * 5, rng);
  }
  ctx.restore();

  return {
    forestPatches: forestPatches.length,
    forestBlobs: forestBlobs.length,
    trees: treePoints.length,
    bushes: bushPoints.length,
    rocks: rockPoints.length,
  };
}

function buildForestPatches(
  dim: MapDimensions,
  biomeField: BiomeField,
  rng: () => number,
  occupied: { x: number; y: number; r: number }[],
  renderProfile: TerrainRenderProfile
): ForestPatch[] {
  const patches: ForestPatch[] = [];
  const patchCount = Math.min(
    renderProfile.patchCap,
    Math.floor(6 + Math.min(18, dim.width / 220))
  );
  let guard = 0;
  while (patches.length < patchCount && guard < patchCount * 30) {
    guard++;
    const x = rng() * dim.width;
    const y = rng() * dim.height;
    if (biomeField.sample(x, y) !== "forest") continue;
    if (occupied.some((o) => Math.hypot(x - o.x, y - o.y) < o.r + 22)) continue;
    const radius = 55 + rng() * 85;
    const strength = 0.45 + rng() * 0.55;
    const dense = rng() < TERRAIN_TUNING.forestDensePatchChance;
    const clearings: ForestClearing[] = [];
    if (dense) {
      const clearCount = 1 + (rng() > 0.72 ? 1 : 0);
      for (let i = 0; i < clearCount; i++) {
        const ang = rng() * Math.PI * 2;
        const dist = radius * (0.15 + rng() * 0.45);
        const cr =
          TERRAIN_TUNING.clearingRadiusMin +
          rng() * (TERRAIN_TUNING.clearingRadiusMax - TERRAIN_TUNING.clearingRadiusMin);
        clearings.push({
          x: x + Math.cos(ang) * dist,
          y: y + Math.sin(ang) * dist,
          radius: cr,
        });
      }
    }
    patches.push({ x, y, radius, strength, dense, clearings });
  }
  return patches;
}

function forestDensityMask(
  x: number,
  y: number,
  patches: ForestPatch[]
): number {
  let density = 0;
  for (const p of patches) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d > p.radius) continue;
    const falloff = 1 - d / p.radius;
    const denseBoost = p.dense ? TERRAIN_TUNING.forestDenseAcceptanceBoost : 0;
    density = Math.max(density, falloff * (p.strength + denseBoost));
  }
  return density;
}

function isInsideForestClearing(
  x: number,
  y: number,
  patches: ForestPatch[]
): boolean {
  for (const p of patches) {
    for (const c of p.clearings) {
      if (Math.hypot(x - c.x, y - c.y) <= c.radius) return true;
    }
  }
  return false;
}

function buildForestBlobs(
  patches: ForestPatch[],
  hydroField: HydroField,
  rng: () => number,
  renderProfile: TerrainRenderProfile
): ForestBlob[] {
  const blobs: ForestBlob[] = [];

  for (const patch of patches) {
    if (!patch.dense) continue;
    const targetCount =
      TERRAIN_TUNING.forestBlobCountMin +
      Math.floor(
        rng() *
          (TERRAIN_TUNING.forestBlobCountMax -
            TERRAIN_TUNING.forestBlobCountMin +
            1 +
            renderProfile.blobCountBoost)
      );

    let guard = 0;
    while (guard < targetCount * 30 && blobs.filter((b) => isBlobWithinPatch(b, patch)).length < targetCount) {
      guard++;
      const angle = rng() * Math.PI * 2;
      const dist = patch.radius * (0.08 + rng() * 0.58);
      const x = patch.x + Math.cos(angle) * dist;
      const y = patch.y + Math.sin(angle) * dist;
      const radius =
        (TERRAIN_TUNING.forestBlobMinRadius +
          rng() * (TERRAIN_TUNING.forestBlobMaxRadius - TERRAIN_TUNING.forestBlobMinRadius)) *
        renderProfile.blobRadiusScale;

      if (isPointInPatchClearings(x, y, patch, radius * 0.75)) continue;
      if (hydroField.lakes.some((l) => Math.hypot(x - l.x, y - l.y) < l.radius + radius + TERRAIN_TUNING.forestBlobLakeBuffer)) continue;
      if (blobs.some((b) => Math.hypot(x - b.x, y - b.y) < b.radius + radius + TERRAIN_TUNING.forestBlobSpacing)) continue;

      blobs.push({
        x,
        y,
        radius,
        sprite: generateForestBlobSprite(radius, hashString(`${Math.round(x)}|${Math.round(y)}|${Math.round(radius)}`)),
      });
    }
  }

  return blobs;
}

function isBlobWithinPatch(blob: ForestBlob, patch: ForestPatch): boolean {
  return Math.hypot(blob.x - patch.x, blob.y - patch.y) <= patch.radius;
}

function isPointInPatchClearings(x: number, y: number, patch: ForestPatch, extraRadius: number): boolean {
  return patch.clearings.some((c) => Math.hypot(x - c.x, y - c.y) <= c.radius + extraRadius);
}

function isInsideForestBlob(
  x: number,
  y: number,
  blobs: ForestBlob[],
  radiusFactor: number
): boolean {
  for (const blob of blobs) {
    if (Math.hypot(x - blob.x, y - blob.y) <= blob.radius * radiusFactor) return true;
  }
  return false;
}

function passesMinSpacing(
  x: number,
  y: number,
  existing: { x: number; y: number }[],
  minSpacing: number
): boolean {
  for (let i = existing.length - 1; i >= 0; i--) {
    const p = existing[i];
    if (Math.abs(x - p.x) > minSpacing * 1.4 || Math.abs(y - p.y) > minSpacing * 1.4) continue;
    if (Math.hypot(x - p.x, y - p.y) < minSpacing) return false;
  }
  return true;
}

function isWorldPointValid(
  x: number,
  y: number,
  dim: MapDimensions,
  worldRadius: number,
  occupied: { x: number; y: number; r: number }[],
  routeSegments: { x1: number; y1: number; x2: number; y2: number }[],
  hydroField: HydroField
): boolean {
  if (Math.hypot(x - dim.castleX, y - dim.castleY) > worldRadius) return false;
  for (const o of occupied) {
    if (Math.hypot(x - o.x, y - o.y) < o.r) return false;
  }
  for (const segment of routeSegments) {
    if (distanceToSegment(x, y, segment) < TERRAIN_TUNING.routeExclusionRadius) return false;
  }
  for (const lake of hydroField.lakes) {
    if (Math.hypot(x - lake.x, y - lake.y) < lake.radius + 5) return false;
  }
  return true;
}

function distanceToSegment(
  px: number,
  py: number,
  s: { x1: number; y1: number; x2: number; y2: number }
): number {
  const vx = s.x2 - s.x1;
  const vy = s.y2 - s.y1;
  const wx = px - s.x1;
  const wy = py - s.y1;
  const c1 = wx * vx + wy * vy;
  const c2 = vx * vx + vy * vy;
  const t = c2 === 0 ? 0 : Math.max(0, Math.min(1, c1 / c2));
  const projX = s.x1 + t * vx;
  const projY = s.y1 + t * vy;
  return Math.hypot(px - projX, py - projY);
}

function drawPineTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rng: () => number
) {
  const h = 12 * size;
  const w = 8 * size;

  // Trunk
  ctx.fillStyle = "rgba(100, 70, 40, 0.5)";
  ctx.fillRect(x - 1.5 * size, y - 2, 3 * size, 5 * size);

  // Layers of foliage
  ctx.fillStyle = `rgba(${50 + Math.floor(rng() * 30)}, ${90 + Math.floor(rng() * 40)}, ${40 + Math.floor(rng() * 20)}, 0.45)`;
  for (let layer = 0; layer < 3; layer++) {
    const ly = y - 2 - layer * h * 0.35;
    const lw = w * (1 - layer * 0.25);
    ctx.beginPath();
    ctx.moveTo(x - lw, ly);
    ctx.lineTo(x, ly - h * 0.45);
    ctx.lineTo(x + lw, ly);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRoundTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rng: () => number
) {
  // Trunk
  ctx.fillStyle = "rgba(100, 70, 40, 0.45)";
  ctx.fillRect(x - 1.5 * size, y - 1, 3 * size, 6 * size);

  // Round canopy
  const r = 7 * size;
  ctx.fillStyle = `rgba(${60 + Math.floor(rng() * 30)}, ${100 + Math.floor(rng() * 40)}, ${50 + Math.floor(rng() * 20)}, 0.4)`;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.7, r, 0, Math.PI * 2);
  ctx.fill();

  // Highlight
  ctx.fillStyle = "rgba(120, 160, 80, 0.15)";
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.9, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBushCluster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rng: () => number
) {
  const numBushes = 2 + Math.floor(rng() * 2);
  for (let b = 0; b < numBushes; b++) {
    const bx = x + (rng() - 0.5) * 10 * size;
    const by = y + (rng() - 0.5) * 6 * size;
    const br = (3 + rng() * 3) * size;
    ctx.fillStyle = `rgba(${70 + Math.floor(rng() * 30)}, ${110 + Math.floor(rng() * 30)}, ${50 + Math.floor(rng() * 20)}, 0.35)`;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSingleRock(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  size: number,
  rng: () => number
) {
  ctx.fillStyle = `rgba(${130 + Math.floor(rng() * 30)}, ${115 + Math.floor(rng() * 25)}, ${95 + Math.floor(rng() * 20)}, 0.4)`;
  ctx.beginPath();
  ctx.ellipse(rx, ry, size * 1.3, size * 0.8, rng() * Math.PI, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(200, 185, 160, 0.15)";
  ctx.beginPath();
  ctx.ellipse(rx - size * 0.3, ry - size * 0.2, size * 0.6, size * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function generateForestBlobSprite(radius: number, seed: number): HTMLCanvasElement {
  const size = Math.ceil(radius * 2.6);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rng = seededRandom(seed);
  const cx = size / 2;
  const cy = size / 2 - radius * 0.15;

  const canopyLayers = 22 + Math.floor(rng() * 10);
  for (let i = 0; i < canopyLayers; i++) {
    const t = i / canopyLayers;
    const ang = rng() * Math.PI * 2;
    const spread = radius * (0.15 + rng() * 0.82);
    const x = cx + Math.cos(ang) * spread * (0.5 + t * 0.5);
    const y = cy + Math.sin(ang) * spread * (0.35 + t * 0.35);
    const rx = radius * (0.26 + rng() * 0.26);
    const ry = rx * (0.72 + rng() * 0.25);
    const g = 70 + Math.floor(rng() * 40);
    ctx.fillStyle = `rgba(${35 + Math.floor(rng() * 18)}, ${g}, ${34 + Math.floor(rng() * 14)}, ${0.36 + rng() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dark lower silhouette for mass
  const shade = ctx.createLinearGradient(0, cy, 0, size);
  shade.addColorStop(0, "rgba(20, 45, 20, 0)");
  shade.addColorStop(1, "rgba(20, 45, 20, 0.25)");
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius * 0.4, radius * 1.05, radius * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();

  // Trunk hints near bottom edge so it reads as many trees.
  const trunkCount = Math.max(6, Math.floor(radius / 4));
  const trunkBaselineY = Math.min(size - 2, cy + radius * 0.98);
  for (let i = 0; i < trunkCount; i++) {
    const tx = cx - radius * 0.72 + (i / Math.max(1, trunkCount - 1)) * radius * 1.45 + (rng() - 0.5) * 4;
    const h = 5 + rng() * 7;
    const w = 1.2 + rng() * 1.6;
    const ty = trunkBaselineY - h;
    ctx.fillStyle = `rgba(${72 + Math.floor(rng() * 25)}, ${46 + Math.floor(rng() * 16)}, ${28 + Math.floor(rng() * 12)}, 0.55)`;
    ctx.fillRect(tx, ty, w, h);
  }

  return canvas;
}

function getTerrainRenderProfile(dim: MapDimensions, territoryCount: number): TerrainRenderProfile {
  const worldArea = dim.width * dim.height;
  const sizeScale = Math.min(1.6, Math.max(0.85, Math.sqrt(worldArea / (2100 * 2100))));
  const territoryScale = Math.min(1.5, Math.max(0.9, territoryCount / 16));
  const pressure = Math.max(1, sizeScale * territoryScale);

  return {
    densityScale: Math.min(1.12, 0.92 + pressure * 0.08),
    patchCap: Math.max(9, Math.floor(26 / pressure)),
    blobCountBoost: Math.min(2.4, 0.8 + pressure * 0.8),
    blobRadiusScale: Math.min(1.4, 1.08 + pressure * 0.08),
    treeAttemptScale: Math.max(0.56, 0.92 / pressure),
    bushAttemptScale: Math.max(0.62, 0.9 / pressure),
    rockAttemptScale: Math.max(0.75, 0.97 / pressure),
  };
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

