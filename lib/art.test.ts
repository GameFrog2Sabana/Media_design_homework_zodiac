import { describe, expect, it } from "vitest";
import { engraveFigure, layoutStarMap } from "@/lib/art";
import type { FigureEdge } from "@/lib/types";

const box = { x: 18, y: 18, size: 324, padding: 42 };

const wide = [
  { x: 0.1, y: 0.5 },
  { x: 0.3, y: 0.55 },
  { x: 0.5, y: 0.45 },
  { x: 0.7, y: 0.55 },
  { x: 0.9, y: 0.5 },
];

const cycleStars = [
  { x: 0.3, y: 0.3 },
  { x: 0.7, y: 0.3 },
  { x: 0.7, y: 0.7 },
  { x: 0.3, y: 0.7 },
];

const cycleEdges: FigureEdge[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
];

describe("layoutStarMap", () => {
  it("maps the stage uniformly and preserves relative positions", () => {
    const layout = layoutStarMap(wide, 1, box, "seed", [], "delicate");
    expect(layout.points).toHaveLength(wide.length);
    expect(layout.points[0].x).toBeLessThan(layout.points[1].x);
    const scale = (layout.points[1].x - layout.points[0].x) / (0.3 - 0.1);
    expect((layout.points[2].x - layout.points[0].x) / (0.5 - 0.1)).toBeCloseTo(
      scale,
      5,
    );
    expect((layout.points[1].y - layout.points[0].y) / scale).toBeCloseTo(
      0.55 - 0.5,
      5,
    );
    expect((layout.points[2].y - layout.points[0].y) / scale).toBeCloseTo(
      0.45 - 0.5,
      5,
    );
  });

  it("is deterministic for the same drawing and seed", () => {
    const a = layoutStarMap(wide, 1.6, box, "same", [[0, 1]], "flowing");
    const b = layoutStarMap(wide, 1.6, box, "same", [[0, 1]], "flowing");
    expect(a).toEqual(b);
  });

  it("keeps decorations inside the artwork frame", () => {
    const layout = layoutStarMap(
      wide,
      1.6,
      box,
      "frame",
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
      ],
      "flowing",
    );
    for (const path of layout.engraving.paths) {
      const numbers = path.d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      for (const value of numbers) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(360);
      }
    }
  });
});

describe("engraveFigure", () => {
  it("keeps an empty figure empty and only haloes the untouched stars", () => {
    const points = wide.map((star) => ({ x: star.x * 100, y: star.y * 100 }));
    const engraving = engraveFigure(points, [], "delicate", 7);
    expect(engraving.parts).toBe(0);
    expect(engraving.isolated).toEqual([0, 1, 2, 3, 4]);
    expect(engraving.halos).toHaveLength(5);
    for (const halo of engraving.halos) {
      expect(halo.dash).toBe("1 3.6");
    }
    expect(engraving.paths.length).toBeGreaterThan(0);
  });

  it("draws marks for every hand-drawn edge without changing the graph", () => {
    const points = wide.map((star) => ({ x: star.x * 100, y: star.y * 100 }));
    const edges: FigureEdge[] = [
      [0, 1],
      [1, 2],
    ];
    const engraving = engraveFigure(points, edges, "flowing", 3);
    expect(engraving.parts).toBe(1);
    expect(engraving.paths.length).toBeGreaterThan(edges.length);
    expect(engraving.isolated).toEqual([3, 4]);
    expect(engraving.halos).toHaveLength(2);
  });

  it("treats separate connected groups as separate parts", () => {
    const points = wide.map((star) => ({ x: star.x * 100, y: star.y * 100 }));
    const engraving = engraveFigure(
      points,
      [
        [0, 1],
        [2, 3],
      ],
      "delicate",
      5,
    );
    expect(engraving.parts).toBe(2);
    expect(engraving.isolated).toEqual([4]);
    expect(engraving.halos).toHaveLength(1);
  });

  it("insets a ring inside a cycle rather than closing a new star path", () => {
    const points = cycleStars.map((star) => ({
      x: star.x * 100,
      y: star.y * 100,
    }));
    const engraving = engraveFigure(points, cycleEdges, "radial", 9);
    expect(engraving.parts).toBe(1);
    expect(engraving.paths.some((path) => path.d.includes("Z"))).toBe(true);
    expect(engraving.paths.some((path) => path.dash === "1.8 3")).toBe(true);
  });

  it("changes only the marks when the line style changes", () => {
    const points = wide.map((star) => ({ x: star.x * 100, y: star.y * 100 }));
    const edges: FigureEdge[] = [
      [0, 1],
      [1, 2],
    ];
    const flowing = engraveFigure(points, edges, "flowing", 11);
    const hard = engraveFigure(points, edges, "hard", 11);
    expect(flowing.parts).toBe(hard.parts);
    expect(flowing.isolated).toEqual(hard.isolated);
    expect(flowing.paths).not.toEqual(hard.paths);
  });

  it("falls back to a delicate engraving for an unknown style", () => {
    const points = wide.map((star) => ({ x: star.x * 100, y: star.y * 100 }));
    const fallback = engraveFigure(points, [[0, 1]], "unknown", 2);
    const delicate = engraveFigure(points, [[0, 1]], "delicate", 2);
    expect(fallback).toEqual(delicate);
  });

  it("haloes a star that no line touches even when other lines exist", () => {
    const points = wide.map((star) => ({ x: star.x * 100, y: star.y * 100 }));
    const engraving = engraveFigure(points, [[0, 1]], "hard", 4);
    expect(engraving.isolated).toEqual([2, 3, 4]);
    expect(engraving.halos.map((halo) => halo.cy)).toEqual(
      [2, 3, 4].map((index) => points[index].y),
    );
  });
});
