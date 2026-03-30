import { Application, Territory, MapDimensions } from "./types";

/**
 * World-space layout: castle at center (0, 0), territories placed radially
 * outward in all directions. World size scales with territory count.
 */
export function computeMapLayout(
  applications: Application[]
): { territories: Territory[]; dimensions: MapDimensions } {
  const companyMap = new Map<string, Application[]>();
  for (const app of applications) {
    const existing = companyMap.get(app.company) || [];
    existing.push(app);
    companyMap.set(app.company, existing);
  }

  const companies = Array.from(companyMap.entries());
  const count = companies.length;

  // World size grows with territory count — generous spacing
  const baseRadius = 600;
  const worldRadius = baseRadius + count * 50;
  const worldSize = worldRadius * 2 + 300;

  const castleX = worldSize / 2;
  const castleY = worldSize / 2;

  const MIN_DIST = 200;
  const MIN_CASTLE_DIST = 250;

  const placed: { x: number; y: number }[] = [];

  const territories: Territory[] = companies.map(([company, apps]) => {
    const seed = hashString(company);
    const rng = seededRandom(seed);

    let bestX = castleX;
    let bestY = castleY;
    let bestMinDist = 0;

    for (let attempt = 0; attempt < 100; attempt++) {
      // Place in a ring around the castle
      const angle = rng() * Math.PI * 2;
      const dist = MIN_CASTLE_DIST + rng() * (worldRadius - MIN_CASTLE_DIST);
      const cx = castleX + Math.cos(angle) * dist;
      const cy = castleY + Math.sin(angle) * dist;

      let minDist = Infinity;
      for (const p of placed) {
        const d = Math.sqrt((cx - p.x) ** 2 + (cy - p.y) ** 2);
        minDist = Math.min(minDist, d);
      }
      const cDist = Math.sqrt((cx - castleX) ** 2 + (cy - castleY) ** 2);
      if (cDist < MIN_CASTLE_DIST) continue;

      if (placed.length === 0) minDist = MIN_DIST + 1;

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestX = cx;
        bestY = cy;
        if (minDist >= MIN_DIST) break;
      }
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

  return {
    territories,
    dimensions: { width: worldSize, height: worldSize, castleX, castleY },
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

export function computePath(
  castleX: number,
  castleY: number,
  targetX: number,
  targetY: number,
  segments: number = 80
): { x: number; y: number }[] {
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

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}
