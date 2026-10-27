import type { Edge, FigureEdge, Point, Star } from "./types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * The playable area inside the chrome. Keeping stars out of the toolbar and
 * the bottom action bar makes the canvas feel like a sheet of paper placed on
 * a desk, rather than a game hidden behind UI.
 */
export function getStageRect(viewportWidth: number, viewportHeight: number): Rect {
  const mobile = viewportWidth < 720;
  const x = mobile ? 72 : 100;
  const y = mobile ? 82 : 98;
  const right = mobile ? 14 : 34;
  const bottom = mobile ? 104 : 112;

  return {
    x,
    y,
    width: Math.max(180, viewportWidth - x - right),
    height: Math.max(220, viewportHeight - y - bottom),
  };
}

export function starToScreen(point: Point, rect: Rect): { x: number; y: number } {
  return {
    x: rect.x + point.x * rect.width,
    y: rect.y + point.y * rect.height,
  };
}

export function screenToStar(
  screen: { x: number; y: number },
  rect: Rect,
): Point {
  return {
    x: clamp01((screen.x - rect.x) / rect.width),
    y: clamp01((screen.y - rect.y) / rect.height),
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function edgeLength(points: Point[], edge: FigureEdge): number {
  return distance(points[edge[0]], points[edge[1]]);
}

export interface StarIdEdge {
  a: string;
  b: string;
}

export function edgeToIndices(edge: Edge, stars: Star[]): FigureEdge | null {
  const a = stars.findIndex((star) => star.id === edge.a);
  const b = stars.findIndex((star) => star.id === edge.b);
  if (a < 0 || b < 0 || a === b) return null;
  return [a, b];
}

export function edgesToIndices(edges: Edge[], stars: Star[]): FigureEdge[] {
  return edges
    .map((edge) => edgeToIndices(edge, stars))
    .filter((edge): edge is FigureEdge => edge !== null);
}

export function hasEdge(edges: Edge[], a: string, b: string): boolean {
  return edges.some(
    (edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a),
  );
}

export function newStarId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `s_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `s_${Math.random().toString(36).slice(2, 10)}`;
}

export interface RandomSource {
  (): number;
}

/**
 * A loose Poisson-disc scatter. Six stars is the default; the extra attempts
 * make a pleasing composition without feeling like a perfect polygon.
 */
export function generateDefaultStars(
  count = 6,
  random: RandomSource = Math.random,
): Star[] {
  const stars: Star[] = [];
  const margin = 0.075;
  let minDistance = 0.2;

  while (stars.length < count) {
    let placed = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const candidate: Star = {
        id: newStarId(),
        x: margin + random() * (1 - margin * 2),
        y: margin + random() * (1 - margin * 2),
      };
      const farEnough = stars.every(
        (star) => distance(star, candidate) >= minDistance,
      );
      if (farEnough) {
        stars.push(candidate);
        placed = true;
        break;
      }
    }
    if (!placed) {
      minDistance = Math.max(0.1, minDistance - 0.025);
    }
  }

  return stars;
}

export function segmentCrosses(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): boolean {
  const orient = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function countCrossings(points: Point[], edges: FigureEdge[]): number {
  let crossings = 0;
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const [a, b] = edges[i];
      const [c, d] = edges[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (
        segmentCrosses(points[a], points[b], points[c], points[d])
      ) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): RandomSource {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
