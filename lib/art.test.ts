import { describe, expect, it } from "vitest";
import {
  layoutStarMap,
  motifScreenBounds,
  motifTransform,
  svgPathBounds,
  type MotifPlacement,
} from "@/lib/art";
import { getMotif } from "@/lib/motifs";

const box = { x: 18, y: 18, size: 324, padding: 42 };
const inner = box.size - box.padding * 2;

const wide = [
  { x: 0.1, y: 0.5 },
  { x: 0.3, y: 0.55 },
  { x: 0.5, y: 0.45 },
  { x: 0.7, y: 0.55 },
  { x: 0.9, y: 0.5 },
];

const tall = [
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

describe("svgPathBounds", () => {
  it("measures the real extent of path data, not the whole viewBox", () => {
    const bounds = svgPathBounds(["M10 20 L30 40"]);
    expect(bounds.minX).toBeCloseTo(8.5, 5);
    expect(bounds.minY).toBeCloseTo(18.5, 5);
    expect(bounds.width).toBeCloseTo(23, 5);
    expect(bounds.height).toBeCloseTo(23, 5);
  });

  it("handles relative commands", () => {
    const bounds = svgPathBounds(["m 10 10 l 20 0"]);
    expect(bounds.width).toBeCloseTo(23, 5);
    expect(bounds.height).toBeCloseTo(3, 5);
  });

  it("falls back to the full viewBox when there is no path data", () => {
    expect(svgPathBounds([])).toEqual({
      minX: 0,
      minY: 0,
      width: 100,
      height: 100,
    });
  });
});

describe("motifTransform", () => {
  it("rotates and scales around the measured centre", () => {
    const placement: MotifPlacement = {
      cx: 100,
      cy: 80,
      rotation: 90,
      scaleX: 2,
      scaleY: 1,
      bounds: { minX: 10, minY: 20, width: 100, height: 50 },
      opacity: 1,
    };
    expect(motifTransform(placement)).toBe(
      "translate(100 80) rotate(90) scale(2 1) translate(-60 -45)",
    );
  });
});

describe("motifScreenBounds", () => {
  it("swaps width and height after a quarter turn", () => {
    const placement: MotifPlacement = {
      cx: 100,
      cy: 100,
      rotation: 90,
      scaleX: 2,
      scaleY: 1,
      bounds: { minX: 0, minY: 0, width: 100, height: 50 },
      opacity: 1,
    };
    const bounds = motifScreenBounds(placement);
    expect(bounds.width).toBeCloseTo(50, 5);
    expect(bounds.height).toBeCloseTo(200, 5);
    expect(bounds.x).toBeCloseTo(75, 5);
    expect(bounds.y).toBeCloseTo(0, 5);
  });
});

describe("layoutStarMap motif placement", () => {
  it("turns the motif's long axis onto a wide constellation", () => {
    const layout = layoutStarMap(wide, 1, box, "wide", [], "whale");
    const bounds = motifScreenBounds(layout.motif);
    expect(bounds.width).toBeGreaterThan(bounds.height);
  });

  it("turns the motif upright along a tall constellation", () => {
    const layout = layoutStarMap(tall, 1, box, "tall", [], "whale");
    const bounds = motifScreenBounds(layout.motif);
    expect(bounds.height).toBeGreaterThan(bounds.width);
  });

  it("rotates the artwork onto a diagonal drawing", () => {
    const diagonal = [
      { x: 0.1, y: 0.2 },
      { x: 0.3, y: 0.4 },
      { x: 0.5, y: 0.6 },
      { x: 0.7, y: 0.8 },
    ];
    const layout = layoutStarMap(diagonal, 1, box, "diagonal", [], "whale");
    expect(Math.abs(layout.motif.rotation - 45)).toBeLessThan(0.5);
  });

  it("accounts for the motif's own long axis when rotating", () => {
    const flower = getMotif("flower");
    const layout = layoutStarMap(wide, 1, box, "flower", [], "flower");
    const finalAxis = ((layout.motif.rotation + flower.axisAngle) % 180 + 180) % 180;
    expect(Math.min(finalAxis, 180 - finalAxis)).toBeLessThan(0.5);
  });

  it("keeps a compact constellation's motif legible", () => {
    const layout = layoutStarMap(compact, 1, box, "compact", [], "whale");
    const bounds = motifScreenBounds(layout.motif);
    expect(Math.max(bounds.width, bounds.height)).toBeGreaterThanOrEqual(
      inner * 0.4 - 1e-6,
    );
  });

  it("keeps the motif inside the artwork frame", () => {
    for (const [stars, aspect] of [
      [wide, 1.6],
      [tall, 1],
      [compact, 1],
    ] as const) {
      const layout = layoutStarMap(stars, aspect, box, "frame", [], "whale");
      for (const placement of layout.motifs) {
        const bounds = motifScreenBounds(placement);
        expect(bounds.x).toBeGreaterThanOrEqual(box.x);
        expect(bounds.y).toBeGreaterThanOrEqual(box.y);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(box.x + box.size);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(box.y + box.size);
      }
    }
  });

  it("centers the motif near the constellation, not the sheet", () => {
    const layout = layoutStarMap(wide, 1.6, box, "center", [], "whale");
    const xs = layout.points.map((point) => point.x);
    const ys = layout.points.map((point) => point.y);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(layout.motif.cx).toBeCloseTo(centerX, 5);
    expect(layout.motif.cy).toBeCloseTo(centerY, 5);
  });

  it("draws one motif per connected part and leaves isolated stars bare", () => {
    const stars = [
      { x: 0.2, y: 0.2 },
      { x: 0.3, y: 0.2 },
      { x: 0.7, y: 0.3 },
      { x: 0.8, y: 0.3 },
      { x: 0.5, y: 0.9 },
    ];
    const edges: [number, number][] = [
      [0, 1],
      [2, 3],
    ];
    const layout = layoutStarMap(stars, 1, box, "parts", edges, "whale");

    expect(layout.motifs).toHaveLength(2);
    expect(layout.isolated).toEqual([4]);
    expect(layout.motif.opacity).toBe(1);
    expect(layout.motifs[1].opacity).toBeLessThan(1);

    const isolatedPoint = layout.points[4];
    for (const placement of layout.motifs) {
      expect(
        Math.hypot(placement.cx - isolatedPoint.x, placement.cy - isolatedPoint.y),
      ).toBeGreaterThan(40);
    }
  });

  it("uses one motif for all stars when no lines were drawn", () => {
    const layout = layoutStarMap(wide, 1.6, box, "empty-lines", [], "whale");
    expect(layout.motifs).toHaveLength(1);
    expect(layout.isolated).toEqual([]);
  });

  it("maps the full stage without recentering the drawing", () => {
    const layout = layoutStarMap(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      2,
      box,
      "frame",
    );
    const scale = inner / 2;
    const offsetY = box.y + box.padding + (inner - scale) / 2;
    expect(layout.points[0].x).toBeCloseTo(box.x + box.padding, 6);
    expect(layout.points[0].y).toBeCloseTo(offsetY, 6);
    expect(layout.points[1].x).toBeCloseTo(box.x + box.padding + inner, 6);
    expect(layout.points[1].y).toBeCloseTo(offsetY + scale, 6);
  });

  it("keeps a corner cluster in the same corner", () => {
    const layout = layoutStarMap(
      [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.15 },
      ],
      1,
      box,
      "corner",
    );
    const centerX =
      layout.points.reduce((sum, point) => sum + point.x, 0) /
      layout.points.length;
    const centerY =
      layout.points.reduce((sum, point) => sum + point.y, 0) /
      layout.points.length;
    expect(centerX).toBeLessThan(box.x + box.size / 2);
    expect(centerY).toBeLessThan(box.y + box.size / 2);
  });

  it("applies one uniform scale to every distance", () => {
    const source = [
      { x: 0.1, y: 0.2 },
      { x: 0.7, y: 0.8 },
    ];
    const aspect = 1.6;
    const layout = layoutStarMap(source, aspect, box, "distance");
    const sourceDistance = Math.hypot(
      (source[1].x - source[0].x) * aspect,
      source[1].y - source[0].y,
    );
    const layoutDistance = Math.hypot(
      layout.points[1].x - layout.points[0].x,
      layout.points[1].y - layout.points[0].y,
    );
    const expectedScale = inner / Math.max(aspect, 1);
    expect(layoutDistance / sourceDistance).toBeCloseTo(expectedScale, 6);
  });
});
