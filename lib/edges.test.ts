import { describe, expect, it } from "vitest";
import {
  analyzeSketch,
  normalizeEdgePairs,
  removeEdgeByKey,
  sameEdgeSet,
  starEdgeKey,
} from "@/lib/edges";
import type { FigureEdge, Point } from "@/lib/types";

const points: Point[] = [
  { x: 0.2, y: 0.3 },
  { x: 0.5, y: 0.2 },
  { x: 0.8, y: 0.55 },
  { x: 0.6, y: 0.8 },
  { x: 0.3, y: 0.72 },
];

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

describe("starEdgeKey", () => {
  it("is order-independent and stable", () => {
    expect(starEdgeKey("star-b", "star-a")).toBe(
      starEdgeKey("star-a", "star-b"),
    );
  });
});

describe("removeEdgeByKey", () => {
  it("removes only the selected editor edge without mutating the input", () => {
    const edges = [
      { a: "star-b", b: "star-a" },
      { a: "star-a", b: "star-c" },
    ];
    const next = removeEdgeByKey(edges, starEdgeKey("star-a", "star-b"));
    expect(next).toEqual([{ a: "star-a", b: "star-c" }]);
    expect(edges).toHaveLength(2);
  });

  it("leaves the edges untouched when the key is unknown", () => {
    const edges = [{ a: "star-a", b: "star-b" }];
    expect(removeEdgeByKey(edges, starEdgeKey("star-b", "star-c"))).toEqual(
      edges,
    );
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

describe("analyzeSketch without lines", () => {
  it("reports every star as unconnected and adds nothing", () => {
    const topology = analyzeSketch([], points.length);
    expect(topology.hasLines).toBe(false);
    expect(topology.partCount).toBe(0);
    expect(topology.components).toEqual([]);
    expect(topology.isolated).toEqual([0, 1, 2, 3, 4]);
  });
});
