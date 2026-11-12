import { describe, expect, it } from "vitest";
import {
  analyzeShape,
  shapeNameHints,
  suggestLineStyle,
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

  it("reads spatial star groups even when no lines connect them", () => {
    const stars = [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.12 },
      { x: 0.15, y: 0.2 },
      { x: 0.78, y: 0.76 },
      { x: 0.88, y: 0.8 },
      { x: 0.82, y: 0.88 },
    ];
    const analysis = analyzeShape(stars, [], 1);
    expect(analysis.hasLines).toBe(false);
    expect(analysis.edgeCount).toBe(0);
    expect(analysis.clusters).toHaveLength(2);
    expect(analysis.summary).toContain("2つのまとまりに分かれている");
    expect(analysis.gestures).toContain("複数の星群");
    expect(analysis.gestures).not.toContain("孤立星");
  });
});

describe("suggestLineStyle", () => {
  it("suggests a flowing line for a soft arc", () => {
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
    expect(suggestLineStyle(analysis)).toBe("flowing");
  });

  it("suggests a radial line for a closed cycle", () => {
    const analysis = analyzeShape(
      compact,
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ],
      1,
    );
    expect(suggestLineStyle(analysis)).toBe("radial");
  });

  it("suggests a flowing line for a branch", () => {
    const stars = [
      { x: 0.2, y: 0.5 },
      { x: 0.45, y: 0.5 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.75 },
    ];
    const analysis = analyzeShape(
      stars,
      [
        [0, 1],
        [1, 2],
        [1, 3],
      ],
      1,
    );
    expect(analysis.components[0].kind).toBe("branch");
    expect(suggestLineStyle(analysis)).toBe("flowing");
  });

  it("suggests a delicate line when the drawing has separate parts", () => {
    const analysis = analyzeShape(
      horizontal,
      [
        [0, 1],
        [2, 3],
      ],
      1,
    );
    expect(suggestLineStyle(analysis)).toBe("delicate");
  });

  it("suggests a delicate line for a compact cluster without lines", () => {
    const analysis = analyzeShape(compact, [], 1);
    expect(suggestLineStyle(analysis)).toBe("delicate");
  });

  it("suggests a radial line when a chain leaves an isolated star", () => {
    const analysis = analyzeShape(horizontal, [[0, 1]], 1);
    expect(suggestLineStyle(analysis)).toBe("radial");
  });

  it("offers shape-derived name hints", () => {
    const analysis = analyzeShape(horizontal, [], 1);
    expect(shapeNameHints(analysis)).toContain("帆");
    expect(shapeNameHints(analysis).length).toBeGreaterThan(0);
  });

  it("offers concrete metaphors instead of structural words", () => {
    const branch = analyzeShape(
      [
        { x: 0.2, y: 0.5 },
        { x: 0.45, y: 0.5 },
        { x: 0.75, y: 0.25 },
        { x: 0.75, y: 0.75 },
      ],
      [
        [0, 1],
        [1, 2],
        [1, 3],
      ],
      1,
    );
    const branchHints = shapeNameHints(branch);
    expect(branchHints).toContain("鹿");
    expect(branchHints).toContain("梟");
    expect(branchHints).not.toContain("枝");
    expect(branchHints).not.toContain("群れ");

    const cycle = analyzeShape(
      compact,
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ],
      1,
    );
    const cycleHints = shapeNameHints(cycle);
    expect(cycleHints).toContain("冠");
    expect(cycleHints).not.toContain("環");
  });
});
