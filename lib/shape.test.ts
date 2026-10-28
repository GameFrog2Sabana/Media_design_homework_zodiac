import { describe, expect, it } from "vitest";
import {
  analyzeShape,
  bestMotifForShape,
  motifFitScore,
  shapeNameHints,
} from "@/lib/shape";

const horizontal = [
  { x: 0.1, y: 0.55 },
  { x: 0.3, y: 0.6 },
  { x: 0.5, y: 0.5 },
  { x: 0.7, y: 0.55 },
  { x: 0.9, y: 0.5 },
];

const vertical = [
  { x: 0.5, y: 0.1 },
  { x: 0.5, y: 0.35 },
  { x: 0.5, y: 0.6 },
  { x: 0.5, y: 0.85 },
];

const compact = [
  { x: 0.45, y: 0.55 },
  { x: 0.55, y: 0.55 },
  { x: 0.45, y: 0.45 },
  { x: 0.55, y: 0.45 },
];

const diagonal = [
  { x: 0.1, y: 0.9 },
  { x: 0.3, y: 0.7 },
  { x: 0.5, y: 0.5 },
  { x: 0.7, y: 0.3 },
  { x: 0.9, y: 0.1 },
];

describe("analyzeShape", () => {
  it("reads a wide drawing as horizontal", () => {
    const analysis = analyzeShape(horizontal, [], 1);
    expect(analysis.orientation).toBe("horizontal");
    expect(analysis.summary).toContain("横長");
    expect(analysis.motifMatches.length).toBeGreaterThan(0);
  });

  it("reads a tall drawing as vertical", () => {
    const analysis = analyzeShape(vertical, [], 1);
    expect(analysis.orientation).toBe("vertical");
    expect(analysis.summary).toContain("縦長");
  });

  it("reads a small cluster as compact", () => {
    const analysis = analyzeShape(compact, [], 1);
    expect(analysis.orientation).toBe("compact");
    expect(analysis.summary).toContain("小さくまとまった");
  });

  it("reads a diagonal line as diagonal", () => {
    const analysis = analyzeShape(diagonal, [], 1);
    expect(analysis.orientation).toBe("diagonal");
    expect(analysis.summary).toContain("斜め");
  });

  it("keeps separate groups and isolated stars in the reading", () => {
    const analysis = analyzeShape(
      horizontal,
      [
        [0, 1],
        [2, 3],
      ],
      1,
    );
    expect(analysis.components).toHaveLength(2);
    expect(analysis.isolated).toEqual([4]);
    expect(analysis.summary).toContain("2星の鎖");
    expect(analysis.summary).toContain("孤立星");
    expect(analysis.gestures).toContain("孤立星");
  });

  it("recognizes an arc drawn through the stars", () => {
    const stars = [
      { x: 0.2, y: 0.8 },
      { x: 0.3, y: 0.65 },
      { x: 0.5, y: 0.58 },
      { x: 0.7, y: 0.65 },
      { x: 0.8, y: 0.8 },
    ];
    const analysis = analyzeShape(
      stars,
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
      ],
      1,
    );
    expect(analysis.components[0].pathShape).toBe("arc");
    expect(analysis.gestures).toContain("弧を描く鎖");
  });
});

describe("motif ranking", () => {
  it("ranks a wide motif above a tall one for a horizontal drawing", () => {
    const analysis = analyzeShape(horizontal, [], 1);
    expect(motifFitScore("whale", analysis)).toBeGreaterThan(
      motifFitScore("ship", analysis),
    );
    expect(bestMotifForShape(analysis).score).toBeGreaterThanOrEqual(3);
  });

  it("ranks a tall motif above a wide one for a vertical drawing", () => {
    const analysis = analyzeShape(vertical, [], 1);
    expect(motifFitScore("ship", analysis)).toBeGreaterThan(
      motifFitScore("whale", analysis),
    );
  });

  it("offers shape-derived name hints", () => {
    const analysis = analyzeShape(horizontal, [], 1);
    expect(shapeNameHints(analysis)).toContain("帆");
    expect(shapeNameHints(analysis).length).toBeGreaterThan(0);
  });
});
