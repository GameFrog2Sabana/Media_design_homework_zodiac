import { describe, expect, it } from "vitest";
import { layoutStarMap } from "@/lib/art";

const box = { x: 18, y: 18, size: 324, padding: 42 };

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

describe("layoutStarMap motif placement", () => {
  it("stretches the motif across a wide constellation", () => {
    const layout = layoutStarMap(wide, 1.6, box, "wide");
    expect(layout.motif.scaleX).toBeGreaterThan(layout.motif.scaleY);
  });

  it("stretches the motif along a tall constellation", () => {
    const layout = layoutStarMap(tall, 1, box, "tall");
    expect(layout.motif.scaleY).toBeGreaterThan(layout.motif.scaleX);
  });

  it("keeps a compact constellation's motif legible", () => {
    const layout = layoutStarMap(compact, 1, box, "compact");
    expect(layout.motif.scaleX * 100).toBeGreaterThanOrEqual(box.size * 0.34);
    expect(layout.motif.scaleY * 100).toBeGreaterThanOrEqual(box.size * 0.34);
  });

  it("keeps the motif inside the artwork frame", () => {
    for (const [stars, aspect] of [
      [wide, 1.6],
      [tall, 1],
      [compact, 1],
    ] as const) {
      const layout = layoutStarMap(stars, aspect, box, "frame");
      const width = layout.motif.scaleX * 100;
      const height = layout.motif.scaleY * 100;
      expect(layout.motif.x).toBeGreaterThanOrEqual(box.x);
      expect(layout.motif.y).toBeGreaterThanOrEqual(box.y);
      expect(layout.motif.x + width).toBeLessThanOrEqual(box.x + box.size);
      expect(layout.motif.y + height).toBeLessThanOrEqual(box.y + box.size);
    }
  });

  it("centers the motif near the constellation, not the sheet", () => {
    const layout = layoutStarMap(wide, 1.6, box, "center");
    const xs = layout.points.map((point) => point.x);
    const ys = layout.points.map((point) => point.y);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const motifCenterX = layout.motif.x + (layout.motif.scaleX * 100) / 2;
    const motifCenterY = layout.motif.y + (layout.motif.scaleY * 100) / 2;
    expect(motifCenterX).toBeCloseTo(centerX, 5);
    expect(motifCenterY).toBeCloseTo(centerY, 5);
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
    const inner = box.size - box.padding * 2;
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
    const expectedScale =
      (box.size - box.padding * 2) / Math.max(aspect, 1);
    expect(layoutDistance / sourceDistance).toBeCloseTo(expectedScale, 6);
  });
});
