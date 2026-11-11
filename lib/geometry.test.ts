import { describe, expect, it } from "vitest";
import { normalizeEdgePairs, sameEdgeSet } from "@/lib/edges";
import { buildFallback } from "@/lib/fallback";
import {
  edgesToIndices,
  generateDefaultStars,
  pointToSegmentDistance,
  screenToStar,
  starToScreen,
} from "@/lib/geometry";
import { LINE_STYLE_IDS } from "@/lib/lineStyle";
import { PALETTE_IDS } from "@/lib/palettes";

const stars = generateDefaultStars(7);

describe("generateDefaultStars", () => {
  it("creates the requested number of unique, in-bounds stars", () => {
    expect(stars).toHaveLength(7);
    expect(new Set(stars.map((star) => star.id)).size).toBe(7);
    for (const star of stars) {
      expect(star.x).toBeGreaterThanOrEqual(0.075);
      expect(star.x).toBeLessThanOrEqual(0.925);
      expect(star.y).toBeGreaterThanOrEqual(0.075);
      expect(star.y).toBeLessThanOrEqual(0.925);
    }
  });

  it("keeps stars apart", () => {
    for (let i = 0; i < stars.length; i += 1) {
      for (let j = i + 1; j < stars.length; j += 1) {
        expect(Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y)).toBeGreaterThan(0.09);
      }
    }
  });
});

describe("stage coordinate conversion", () => {
  const stage = { x: 100, y: 80, width: 1000, height: 600 };

  it("round-trips a normalized point", () => {
    const point = { x: 0.42, y: 0.61 };
    const screen = starToScreen(point, stage);
    const restored = screenToStar(screen, stage);
    expect(restored.x).toBeCloseTo(point.x, 8);
    expect(restored.y).toBeCloseTo(point.y, 8);
  });

  it("clamps points outside the stage", () => {
    expect(screenToStar({ x: 0, y: 0 }, stage)).toEqual({ x: 0, y: 0 });
    expect(screenToStar({ x: 5000, y: 5000 }, stage)).toEqual({ x: 1, y: 1 });
  });
});

describe("pointToSegmentDistance", () => {
  const start = { x: 0, y: 0 };
  const end = { x: 1, y: 0 };

  it("measures the perpendicular distance inside the segment", () => {
    expect(pointToSegmentDistance({ x: 0.5, y: 0.2 }, start, end)).toBeCloseTo(
      0.2,
      8,
    );
  });

  it("clamps to the nearest endpoint outside the segment", () => {
    expect(pointToSegmentDistance({ x: -0.3, y: 0 }, start, end)).toBeCloseTo(
      0.3,
      8,
    );
    expect(
      pointToSegmentDistance({ x: 1.3, y: 0.4 }, start, end),
    ).toBeCloseTo(0.5, 8);
  });

  it("handles a zero-length segment", () => {
    expect(
      pointToSegmentDistance({ x: 0.3, y: 0.4 }, start, start),
    ).toBeCloseTo(0.5, 8);
  });
});

describe("edgesToIndices", () => {
  const placed = [
    { id: "star-c", x: 0.2, y: 0.3 },
    { id: "star-a", x: 0.6, y: 0.2 },
    { id: "star-b", x: 0.8, y: 0.7 },
  ];

  it("maps every editor edge by star id without changing its endpoints", () => {
    expect(
      edgesToIndices(
        [
          { a: "star-c", b: "star-a" },
          { a: "star-a", b: "star-b" },
        ],
        placed,
      ),
    ).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });
});

describe("buildFallback", () => {
  // Fixed coordinates keep the fallback assertions deterministic. The random
  // default scatter is exercised separately above.
  const fixedStars = [
    { x: 0.1, y: 0.55 },
    { x: 0.25, y: 0.6 },
    { x: 0.4, y: 0.5 },
    { x: 0.55, y: 0.58 },
    { x: 0.7, y: 0.48 },
    { x: 0.85, y: 0.55 },
    { x: 0.5, y: 0.68 },
  ];
  const input = {
    stars: fixedStars,
    sketchEdges: normalizeEdgePairs([[0, 1]], fixedStars.length),
    aspect: 1.7,
    theme: "灯台",
    attempt: 1,
  };

  it("is deterministic for the same input", () => {
    expect(buildFallback(input)).toEqual(buildFallback(input));
  });

  it("produces a playable, in-vocabulary constellation", () => {
    const result = buildFallback(input);
    expect(Array.from(result.name).length).toBeGreaterThanOrEqual(2);
    expect(Array.from(result.name).length).toBeLessThanOrEqual(12);
    expect(result.name.endsWith("座")).toBe(true);
    expect(result.reading.endsWith("ざ")).toBe(true);
    expect(result.subject.length).toBeGreaterThan(1);
    expect(LINE_STYLE_IDS).toContain(result.lineStyle);
    expect(PALETTE_IDS).toContain(result.paletteId);
    // The drawn line is preserved exactly; the fallback does not connect it
    // to the remaining stars on its own.
    expect(result.figureEdges).toEqual([[0, 1]]);
    expect(result.story).toContain("灯台");
    expect(result.keywords.length).toBeGreaterThan(0);
    for (const [a, b] of result.figureEdges) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(stars.length);
      expect(b).toBeLessThan(stars.length);
      expect(a).not.toBe(b);
    }
  });

  it("keeps separate parts and isolated stars in the user's figure", () => {
    const result = buildFallback({
      ...input,
      sketchEdges: normalizeEdgePairs(
        [
          [0, 1],
          [2, 3],
        ],
        fixedStars.length,
      ),
    });
    expect(result.figureEdges).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(result.name.endsWith("座")).toBe(true);
    expect(Array.from(result.name).length).toBeLessThanOrEqual(12);
    expect(result.story.length).toBeGreaterThan(30);
  });

  it("keeps the myth grammatical when the display subject is a clause", () => {
    const result = buildFallback({
      stars: fixedStars,
      sketchEdges: normalizeEdgePairs(
        [
          [0, 1],
          [2, 3],
          [4, 5],
        ],
        fixedStars.length,
      ),
      aspect: 1.7,
      theme: "",
      attempt: 1,
    });
    const storySubject = result.subject.replace(/が、.*$/, "");
    expect(result.subject.endsWith("夜")).toBe(true);
    expect(storySubject).not.toBe(result.subject);
    expect(result.story).toContain(`${storySubject}は`);
    expect(result.story).not.toMatch(/瞬くは/);
  });

  it("names a branching figure with a concrete metaphor that changes on regeneration", () => {
    const branchStars = [
      { x: 0.1, y: 0.55 },
      { x: 0.35, y: 0.5 },
      { x: 0.6, y: 0.25 },
      { x: 0.6, y: 0.75 },
      { x: 0.85, y: 0.1 },
      { x: 0.85, y: 0.4 },
    ];
    const branchEdges = normalizeEdgePairs(
      [
        [0, 1],
        [1, 2],
        [1, 3],
        [2, 4],
        [2, 5],
      ],
      branchStars.length,
    );
    const branchNouns = ["鹿", "龍", "木", "鍵", "天秤", "珊瑚", "狐"];
    const names = Array.from({ length: 18 }, (_, index) => {
      const result = buildFallback({
        stars: branchStars,
        sketchEdges: branchEdges,
        aspect: 1.7,
        theme: "",
        attempt: index + 1,
      });
      expect(result.figureEdges).toEqual(branchEdges);
      return result.name;
    });

    const usedNouns = new Set(
      names.flatMap((name) =>
        branchNouns.filter((noun) => name.includes(noun)),
      ),
    );
    expect(usedNouns.size).toBeGreaterThan(1);
    for (const name of names) {
      expect(name.endsWith("座")).toBe(true);
      expect(name).not.toMatch(/(枝|群れ|孤星|連なり|まとまり|線|形)座$/);
      expect(branchNouns.some((noun) => name.includes(noun))).toBe(true);
    }
  });

  it("keeps all 60 drawn segments without adding a connecting line", () => {
    const placed = Array.from({ length: 16 }, (_, index) => ({
      x: 0.05 + (index % 4) * 0.3,
      y: 0.05 + Math.floor(index / 4) * 0.3,
    }));
    const drawn: [number, number][] = [];
    for (let a = 0; a < 16 && drawn.length < 60; a += 1) {
      for (let b = a + 1; b < 16 && drawn.length < 60; b += 1) {
        drawn.push([a, b]);
      }
    }

    const result = buildFallback({
      ...input,
      stars: placed,
      sketchEdges: drawn,
    });

    expect(result.figureEdges).toHaveLength(60);
    expect(sameEdgeSet(result.figureEdges, drawn)).toBe(true);
  });

  it("does not truncate a direct sketch either", () => {
    const placed = Array.from({ length: 16 }, (_, index) => ({
      x: 0.05 + (index % 4) * 0.3,
      y: 0.05 + Math.floor(index / 4) * 0.3,
    }));
    const drawn: [number, number][] = [];
    for (let a = 0; a < 16 && drawn.length < 61; a += 1) {
      for (let b = a + 1; b < 16 && drawn.length < 61; b += 1) {
        drawn.push([a, b]);
      }
    }

    const result = buildFallback({
      ...input,
      stars: placed,
      sketchEdges: drawn,
    });

    expect(result.figureEdges).toHaveLength(61);
    expect(sameEdgeSet(result.figureEdges, drawn)).toBe(true);
  });

  it("grounds the free-form subject in the user's theme", () => {
    expect(buildFallback(input).subject).toContain("灯台");
  });

  it("keeps the figure empty when the user drew no lines", () => {
    const result = buildFallback({ ...input, sketchEdges: [] });
    expect(result.figureEdges).toEqual([]);
    expect(result.name.endsWith("座")).toBe(true);
    expect(result.subject.length).toBeGreaterThan(1);
    expect(LINE_STYLE_IDS).toContain(result.lineStyle);
  });
});
