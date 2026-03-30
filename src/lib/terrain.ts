import { Territory, MapDimensions } from "./types";
import { seededRandom, hashString } from "./map-layout";

/**
 * Renders the full world background into an offscreen canvas:
 * parchment, territory borders, trees, mountains, rivers, rocks.
 */
export function renderWorldBackground(
  territories: Territory[],
  dimensions: MapDimensions
): HTMLCanvasElement {
  const { width: w, height: h } = dimensions;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  drawParchment(ctx, w, h);
  drawTerritoryBorders(ctx, territories, dimensions, w, h);
  drawMountains(ctx, dimensions, territories.length);
  drawTrees(ctx, dimensions, territories, territories.length);
  drawRocks(ctx, dimensions, territories, territories.length);

  return canvas;
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
  dimensions: MapDimensions,
  _w: number,
  _h: number
) {
  const sites = [
    { x: dimensions.castleX, y: dimensions.castleY },
    ...territories.map((t) => ({ x: t.x, y: t.y })),
  ];

  ctx.save();

  // Collect valid Voronoi edge segments
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      const a = sites[i];
      const b = sites[j];

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 500) continue;

      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const px = -dy / dist;
      const py = dx / dist;
      const edgeHalfLen = dist * 0.45;

      const sampleCount = 16;
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

      if (bestLen < 3) continue;

      edges.push({
        x1: mx + px * samples[bestStart].t,
        y1: my + py * samples[bestStart].t,
        x2: mx + px * samples[bestEnd].t,
        y2: my + py * samples[bestEnd].t,
      });
    }
  }

  // Draw hand-drawn style borders with wobble
  const rng = seededRandom(9999);

  for (const edge of edges) {
    const edgeDx = edge.x2 - edge.x1;
    const edgeDy = edge.y2 - edge.y1;
    const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
    if (edgeLen < 15) continue;

    const steps = Math.max(8, Math.floor(edgeLen / 8));
    const perpDx = -edgeDy / edgeLen;
    const perpDy = edgeDx / edgeLen;

    // Generate wobble offsets for the entire line (seeded per edge)
    const wobblePoints: { x: number; y: number }[] = [];
    for (let s = 0; s <= steps; s++) {
      const frac = s / steps;
      const baseX = edge.x1 + edgeDx * frac;
      const baseY = edge.y1 + edgeDy * frac;

      // Wobble fades at endpoints for clean joins
      const endFade = Math.min(frac * 4, (1 - frac) * 4, 1);
      const wobbleAmt = (rng() - 0.5) * 6 * endFade;

      wobblePoints.push({
        x: baseX + perpDx * wobbleAmt,
        y: baseY + perpDy * wobbleAmt,
      });
    }

    // Main border line — ink style
    ctx.strokeStyle = "rgba(80, 55, 30, 0.3)";
    ctx.lineWidth = 1.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(wobblePoints[0].x, wobblePoints[0].y);
    for (let s = 1; s < wobblePoints.length; s++) {
      // Smooth the curve with quadratic bezier between midpoints
      const prev = wobblePoints[s - 1];
      const cur = wobblePoints[s];
      const midX = (prev.x + cur.x) / 2;
      const midY = (prev.y + cur.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    }
    const last = wobblePoints[wobblePoints.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();

    // Faint shadow line offset slightly for depth
    ctx.strokeStyle = "rgba(60, 40, 20, 0.08)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(wobblePoints[0].x + 1.5, wobblePoints[0].y + 1.5);
    for (let s = 1; s < wobblePoints.length; s++) {
      const prev = wobblePoints[s - 1];
      const cur = wobblePoints[s];
      const midX = (prev.x + cur.x) / 2 + 1.5;
      const midY = (prev.y + cur.y) / 2 + 1.5;
      ctx.quadraticCurveTo(prev.x + 1.5, prev.y + 1.5, midX, midY);
    }
    ctx.lineTo(last.x + 1.5, last.y + 1.5);
    ctx.stroke();

    // Small cross-hatch marks at intervals along the border
    ctx.strokeStyle = "rgba(80, 55, 30, 0.15)";
    ctx.lineWidth = 0.8;
    const hatchSpacing = 18 + rng() * 8;
    for (let d = hatchSpacing; d < edgeLen - hatchSpacing; d += hatchSpacing) {
      const frac = d / edgeLen;
      const idx = Math.floor(frac * (wobblePoints.length - 1));
      const pt = wobblePoints[idx];
      const hatchLen = 3 + rng() * 3;
      const hatchAngle = rng() * 0.4 - 0.2;
      ctx.beginPath();
      ctx.moveTo(
        pt.x + (perpDx * Math.cos(hatchAngle) - perpDy * Math.sin(hatchAngle)) * hatchLen,
        pt.y + (perpDy * Math.cos(hatchAngle) + perpDx * Math.sin(hatchAngle)) * hatchLen
      );
      ctx.lineTo(
        pt.x - (perpDx * Math.cos(hatchAngle) - perpDy * Math.sin(hatchAngle)) * hatchLen,
        pt.y - (perpDy * Math.cos(hatchAngle) + perpDx * Math.sin(hatchAngle)) * hatchLen
      );
      ctx.stroke();
    }
  }

  ctx.restore();
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

// -- Trees --

function drawTrees(
  ctx: CanvasRenderingContext2D,
  dim: MapDimensions,
  territories: Territory[],
  territoryCount: number
) {
  const numTrees = 40 + territoryCount * 8;
  const rng = seededRandom(5678);

  const occupied = [
    { x: dim.castleX, y: dim.castleY, r: 80 },
    ...territories.map((t) => ({ x: t.x, y: t.y, r: 55 })),
  ];

  ctx.save();

  for (let i = 0; i < numTrees; i++) {
    const tx = rng() * dim.width;
    const ty = rng() * dim.height;

    // Skip if too close to castle or fortress
    const tooClose = occupied.some(
      (o) => Math.sqrt((tx - o.x) ** 2 + (ty - o.y) ** 2) < o.r
    );
    if (tooClose) continue;

    // Skip if too far from center (outside the world)
    const distFromCenter = Math.sqrt(
      (tx - dim.castleX) ** 2 + (ty - dim.castleY) ** 2
    );
    if (distFromCenter > dim.width * 0.45) continue;

    const treeType = Math.floor(rng() * 3);
    const size = 0.6 + rng() * 0.6;

    if (treeType === 0) {
      drawPineTree(ctx, tx, ty, size, rng);
    } else if (treeType === 1) {
      drawRoundTree(ctx, tx, ty, size, rng);
    } else {
      drawBushCluster(ctx, tx, ty, size, rng);
    }
  }

  ctx.restore();
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

// -- Rocks --

function drawRocks(
  ctx: CanvasRenderingContext2D,
  dim: MapDimensions,
  territories: Territory[],
  territoryCount: number
) {
  const numRocks = 15 + territoryCount * 3;
  const rng = seededRandom(9999);

  const occupied = [
    { x: dim.castleX, y: dim.castleY, r: 70 },
    ...territories.map((t) => ({ x: t.x, y: t.y, r: 45 })),
  ];

  ctx.save();

  for (let i = 0; i < numRocks; i++) {
    const rx = rng() * dim.width;
    const ry = rng() * dim.height;

    const tooClose = occupied.some(
      (o) => Math.sqrt((rx - o.x) ** 2 + (ry - o.y) ** 2) < o.r
    );
    if (tooClose) continue;

    const distFromCenter = Math.sqrt(
      (rx - dim.castleX) ** 2 + (ry - dim.castleY) ** 2
    );
    if (distFromCenter > dim.width * 0.45) continue;

    const size = 3 + rng() * 5;

    ctx.fillStyle = `rgba(${130 + Math.floor(rng() * 30)}, ${115 + Math.floor(rng() * 25)}, ${95 + Math.floor(rng() * 20)}, 0.4)`;
    ctx.beginPath();
    ctx.ellipse(rx, ry, size * 1.3, size * 0.8, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = "rgba(200, 185, 160, 0.15)";
    ctx.beginPath();
    ctx.ellipse(rx - size * 0.3, ry - size * 0.2, size * 0.6, size * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
