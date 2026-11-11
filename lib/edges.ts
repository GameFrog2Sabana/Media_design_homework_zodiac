import type { Edge, FigureEdge } from "./types";

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

/** Stable, order-independent key for an editor edge between two star ids. */
export function starEdgeKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

export function removeEdgeByKey(edges: Edge[], key: string): Edge[] {
  return edges.filter((edge) => starEdgeKey(edge.a, edge.b) !== key);
}

/**
 * Compare two figures as undirected segment sets. Endpoint order and input
 * order do not matter; a missing, extra or re-routed segment does.
 */
export function sameEdgeSet(a: FigureEdge[], b: FigureEdge[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a.map(edgeKey));
  const right = new Set(b.map(edgeKey));
  if (left.size !== right.size) return false;
  for (const key of left) {
    if (!right.has(key)) return false;
  }
  return true;
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
 * of the composition and should reach the name, subject and myth.
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
