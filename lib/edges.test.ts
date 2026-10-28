import { describe, expect, it } from "vitest";
import {
  analyzeSketch,
  augmentEdges,
  mstEdges,
  normalizeEdgePairs,
  repairFigureEdges,
  sameEdgeSet,
} from "@/lib/edges";
import type { FigureEdge, Point } from "@/lib/types";

const points: Point[] = [
  { x: 0.2, y: 0.3 },
  { x: 0.5, y: 0.2 },
  { x: 0.8, y: 0.55 },
  { x: 0.6, y: 0.8 },
  { x: 0.3, y: 0.72 },
];

function isConnected(starCount: number, edges: FigureEdge[]): boolean {
  if (edges.length === 0) return false;
  const adjacency = Array.from({ length: starCount }, () => new Set<number>());
  for (const [a, b] of edges) {
    adjacency[a].add(b);
    adjacency[b].add(a);
  }
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length > 0) {
    const current = stack.pop() as number;
    for (const next of adjacency[current]) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen.size === starCount;
}

describe("normalizeEdgePairs", () => {
  it("deduplicates, orders and drops invalid pairs", () => {
    expect(
      normalizeEdgePairs(
        [
          [0, 1],
          [1, 0],
          [0, 0],
          [9, 1],
          [1, 2],
          "nope",
          [2],
        ],
        3,
      ),
    ).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it("returns an empty array for non-array input", () => {
    expect(normalizeEdgePairs(null, 5)).toEqual([]);
  });

  it("keeps every one of the 60 accepted segments", () => {
    const drawn: FigureEdge[] = [];
    for (let a = 0; a < 16 && drawn.length < 60; a += 1) {
      for (let b = a + 1; b < 16 && drawn.length < 60; b += 1) {
        drawn.push([b, a]);
      }
    }
    const normalized = normalizeEdgePairs(drawn, 16);
    expect(normalized).toHaveLength(60);
    expect(sameEdgeSet(normalized, drawn)).toBe(true);
  });
});

describe("sameEdgeSet", () => {
  it("ignores endpoint and input order", () => {
    expect(
      sameEdgeSet(
        [
          [0, 1],
          [2, 3],
        ],
        [
          [3, 2],
          [1, 0],
        ],
      ),
    ).toBe(true);
  });

  it("detects missing, extra and re-routed segments", () => {
    expect(sameEdgeSet([[0, 1]], [[0, 1], [1, 2]])).toBe(false);
    expect(sameEdgeSet([[0, 1]], [[0, 2]])).toBe(false);
    expect(sameEdgeSet([[0, 1], [1, 2]], [[0, 1], [2, 3]])).toBe(false);
  });
});

describe("mstEdges", () => {
  it("connects every star with the minimum number of edges", () => {
    const edges = mstEdges(points);
    expect(edges).toHaveLength(points.length - 1);
    expect(isConnected(points.length, edges)).toBe(true);
  });
});

describe("augmentEdges", () => {
  it("adds edges up to the minimum while staying connected", () => {
    const edges = augmentEdges([[0, 1]], points, 6, 11);
    expect(edges.length).toBeGreaterThanOrEqual(5);
    expect(edges.length).toBeLessThanOrEqual(11);
    expect(isConnected(points.length, edges)).toBe(true);
  });

  it("preserves the requested edges", () => {
    const edges = augmentEdges([[2, 4]], points, 4, 8);
    expect(edges).toContainEqual([2, 4]);
  });
});

describe("analyzeSketch", () => {
  it("reports separate groups without forcing them together", () => {
    const topology = analyzeSketch(
      [
        [0, 1],
        [1, 2],
        [3, 4],
      ],
      points.length,
    );
    expect(topology.partCount).toBe(2);
    expect(topology.hasLines).toBe(true);
    expect(topology.isolated).toEqual([]);
    expect(topology.components.map((component) => component.shape)).toEqual([
      "path",
      "path",
    ]);
  });

  it("detects cycles, branches and isolated stars", () => {
    const branching = analyzeSketch(
      [
        [0, 1],
        [1, 2],
        [2, 0],
        [2, 3],
        [4, 5],
      ],
      7,
    );
    expect(branching.partCount).toBe(2);
    expect(branching.isolated).toEqual([6]);
    expect(branching.hasBranch).toBe(true);
    expect(branching.hasCycle).toBe(false);

    const ring = analyzeSketch(
      [
        [0, 1],
        [1, 2],
        [2, 0],
      ],
      4,
    );
    expect(ring.components[0].shape).toBe("cycle");
    expect(ring.hasCycle).toBe(true);
    expect(ring.isolated).toEqual([3]);
  });
});

describe("repairFigureEdges", () => {
  it("preserves a sparse, disconnected model selection", () => {
    expect(repairFigureEdges([[0, 1], [2, 3]], points, 60)).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(repairFigureEdges([[2, 4]], points, 60)).toEqual([[2, 4]]);
  });

  it("returns null when there is no usable signal", () => {
    expect(repairFigureEdges([], points, 60)).toBeNull();
    expect(repairFigureEdges([[0, 0], [9, 2]], points, 60)).toBeNull();
  });
});
