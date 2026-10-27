import { distanceSquared } from "./geometry";
import type { FigureEdge, Point } from "./types";

/** The same cap the API accepts for a user's hand-drawn figure. */
export const MAX_FIGURE_EDGES = 60;

export function normalizeEdgePairs(
  raw: unknown,
  starCount: number,
): FigureEdge[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const edges: FigureEdge[] = [];

  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const a = Number(entry[0]);
    const b = Number(entry[1]);
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    if (a < 0 || b < 0 || a >= starCount || b >= starCount || a === b) continue;
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    const key = `${low}-${high}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([low, high]);
  }

  return edges;
}

export function edgeKey(edge: FigureEdge): string {
  return `${Math.min(edge[0], edge[1])}-${Math.max(edge[0], edge[1])}`;
}

export function mstEdges(points: Point[]): FigureEdge[] {
  if (points.length < 2) return [];

  const visited = new Set<number>([0]);
  const edges: FigureEdge[] = [];

  while (visited.size < points.length) {
    let best: FigureEdge | null = null;
    let bestLength = Number.POSITIVE_INFINITY;

    for (const a of visited) {
      for (let b = 0; b < points.length; b += 1) {
        if (visited.has(b)) continue;
        const length = distanceSquared(points[a], points[b]);
        if (length < bestLength) {
          bestLength = length;
          best = [a, b];
        }
      }
    }

    if (!best) break;
    edges.push(best);
    visited.add(best[1]);
  }

  return edges;
}

function degrees(starCount: number, edges: FigureEdge[]): number[] {
  const result = new Array<number>(starCount).fill(0);
  for (const [a, b] of edges) {
    result[a] += 1;
    result[b] += 1;
  }
  return result;
}

function connectedComponents(starCount: number, edges: FigureEdge[]): number[][] {
  const adjacency = Array.from({ length: starCount }, () => new Set<number>());
  for (const [a, b] of edges) {
    adjacency[a].add(b);
    adjacency[b].add(a);
  }

  const seen = new Set<number>();
  const components: number[][] = [];

  for (let start = 0; start < starCount; start += 1) {
    if (seen.has(start)) continue;
    const stack = [start];
    const component: number[] = [];
    seen.add(start);

    while (stack.length > 0) {
      const current = stack.pop() as number;
      component.push(current);
      for (const next of adjacency[current]) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }

    components.push(component);
  }

  return components;
}

/**
 * Add the shortest non-crossing edges until the drawing is connected and has
 * at least `minimumEdges`. Used for both the offline generator and as a safety
 * net around LLM output.
 */
export function augmentEdges(
  input: FigureEdge[],
  points: Point[],
  minimumEdges = Math.min(7, Math.max(4, points.length - 1)),
  maximumEdges = 11,
): FigureEdge[] {
  const edges = [...input];
  const existing = new Set(edges.map(edgeKey));
  const connected = new Set<number>();

  while (edges.length < maximumEdges) {
    const components = connectedComponents(points.length, edges);
    const degree = degrees(points.length, edges);
    let best: FigureEdge | null = null;
    let bestLength = Number.POSITIVE_INFINITY;
    let bestCrossing = Number.POSITIVE_INFINITY;

    const candidates: FigureEdge[] = [];
    if (components.length > 1) {
      for (let i = 0; i < components.length; i += 1) {
        for (let j = i + 1; j < components.length; j += 1) {
          for (const a of components[i]) {
            for (const b of components[j]) {
              candidates.push([a, b]);
            }
          }
        }
      }
    } else if (edges.length < minimumEdges) {
      for (let a = 0; a < points.length; a += 1) {
        for (let b = a + 1; b < points.length; b += 1) {
          candidates.push([a, b]);
        }
      }
    } else {
      break;
    }

    for (const candidate of candidates) {
      const key = edgeKey(candidate);
      if (existing.has(key)) continue;
      const [a, b] = candidate;
      if (degree[a] >= 3 || degree[b] >= 3) continue;

      const crossingCount = countCrossingEdges(candidate, edges, points);
      const length = distanceSquared(points[a], points[b]);
      if (
        crossingCount < bestCrossing ||
        (crossingCount === bestCrossing && length < bestLength)
      ) {
        bestCrossing = crossingCount;
        bestLength = length;
        best = candidate;
      }
    }

    if (!best) {
      // Relax the degree constraint; a compelling figure matters more than a
      // perfectly sparse graph.
      for (const candidate of candidates) {
        const key = edgeKey(candidate);
        if (existing.has(key)) continue;
        const [a, b] = candidate;
        const length = distanceSquared(points[a], points[b]);
        if (length < bestLength) {
          bestLength = length;
          best = candidate;
        }
      }
    }

    if (!best) break;
    edges.push(best);
    existing.add(edgeKey(best));
    connected.add(best[0]);
    connected.add(best[1]);
  }

  return edges.slice(0, maximumEdges);
}

function countCrossingEdges(
  candidate: FigureEdge,
  edges: FigureEdge[],
  points: Point[],
): number {
  let count = 0;
  for (const edge of edges) {
    if (
      edge[0] === candidate[0] ||
      edge[0] === candidate[1] ||
      edge[1] === candidate[0] ||
      edge[1] === candidate[1]
    ) {
      continue;
    }
    if (
      segmentsIntersect(
        points[candidate[0]],
        points[candidate[1]],
        points[edge[0]],
        points[edge[1]],
      )
    ) {
      count += 1;
    }
  }
  return count;
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export type SketchShape = "cycle" | "path" | "branch" | "mesh";

export interface SketchComponent {
  stars: number[];
  edgeCount: number;
  shape: SketchShape;
}

export interface SketchTopology {
  components: SketchComponent[];
  /** Stars that are not touched by any line. */
  isolated: number[];
  /** Number of separate line groups. Zero when no line was drawn. */
  partCount: number;
  hasLines: boolean;
  /** True only for a pure ring component (every star has degree two). */
  hasCycle: boolean;
  hasBranch: boolean;
  summary: string;
}

const SHAPE_LABELS: Record<SketchShape, string> = {
  cycle: "輪",
  path: "鎖",
  branch: "枝分かれ",
  mesh: "網",
};

/**
 * Read the graph the user actually drew. We deliberately do not connect
 * components or add edges here: separate groups and untouched stars are part
 * of the composition and should reach the name, motif and myth.
 */
export function analyzeSketch(
  raw: FigureEdge[],
  starCount: number,
): SketchTopology {
  const edges = normalizeEdgePairs(raw, starCount);
  const adjacency = Array.from({ length: starCount }, () => new Set<number>());

  for (const [a, b] of edges) {
    adjacency[a].add(b);
    adjacency[b].add(a);
  }

  const seen = new Set<number>();
  const components: SketchComponent[] = [];

  for (let start = 0; start < starCount; start += 1) {
    if (seen.has(start) || adjacency[start].size === 0) continue;

    const stack = [start];
    const stars: number[] = [];
    seen.add(start);

    while (stack.length > 0) {
      const current = stack.pop() as number;
      stars.push(current);
      for (const next of adjacency[current]) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }

    stars.sort((a, b) => a - b);
    const members = new Set(stars);
    const edgeCount = edges.filter(
      ([a, b]) => members.has(a) && members.has(b),
    ).length;
    const maxDegree = Math.max(...stars.map((star) => adjacency[star].size));
    const isCycle =
      stars.length >= 3 &&
      edgeCount === stars.length &&
      stars.every((star) => adjacency[star].size === 2);
    const isPath = edgeCount === stars.length - 1 && maxDegree <= 2;
    const hasBranch = stars.some((star) => adjacency[star].size >= 3);

    components.push({
      stars,
      edgeCount,
      shape: isCycle
        ? "cycle"
        : isPath
          ? "path"
          : hasBranch
            ? "branch"
            : "mesh",
    });
  }

  const isolated: number[] = [];
  for (let index = 0; index < starCount; index += 1) {
    if (adjacency[index].size === 0) isolated.push(index);
  }

  const shapes = components
    .map((component) => SHAPE_LABELS[component.shape])
    .join("・");
  const summary =
    edges.length === 0
      ? `線なし（孤立星${isolated.length}）`
      : `${components.length}個のまとまり（${shapes}）${
          isolated.length > 0 ? `＋孤立星${isolated.length}` : ""
        }`;

  return {
    components,
    isolated,
    partCount: components.length,
    hasLines: edges.length > 0,
    hasCycle: components.some((component) => component.shape === "cycle"),
    hasBranch: components.some((component) => component.shape === "branch"),
    summary,
  };
}

/**
 * Normalize the model's selection without connecting it. A constellation may
 * consist of several parts, a single line, or no useful model edges at all.
 */
export function repairFigureEdges(
  raw: unknown,
  points: Point[],
  maximumEdges = MAX_FIGURE_EDGES,
): FigureEdge[] | null {
  const edges = normalizeEdgePairs(raw, points.length).slice(0, maximumEdges);
  return edges.length > 0 ? edges : null;
}
