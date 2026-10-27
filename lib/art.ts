import { hashString, mulberry32 } from "./geometry";
import type { Point } from "./types";

export interface ArtBox {
  x: number;
  y: number;
  size: number;
  padding: number;
}

export interface ArtLayout {
  points: Point[];
  chartCenter: Point;
  chartRadius: number;
  /** Transform for the 100x100 motif SVG. */
  motif: {
    x: number;
    y: number;
    scale: number;
  };
  /** Deterministic decoration seed. */
  seed: number;
}

/**
 * Fit the normalized constellation into a square artwork area while keeping
 * the on-screen aspect ratio (so a wide drawing remains wide).
 */
export function layoutStarMap(
  stars: Point[],
  aspect: number,
  box: ArtBox,
  seedKey = "",
): ArtLayout {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const inner = Math.max(1, box.size - box.padding * 2);
  const world = stars.map((star) => ({
    x: star.x * safeAspect,
    y: 1 - star.y,
  }));

  const xs = world.map((point) => point.x);
  const ys = world.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(0.001, maxX - minX);
  const height = Math.max(0.001, maxY - minY);
  const scale = inner / Math.max(width, height);

  const offsetX = box.x + box.padding + (inner - width * scale) / 2;
  const offsetY = box.y + box.padding + (inner - height * scale) / 2;

  const points = world.map((point) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (maxY - point.y) * scale,
  }));

  const motifSize = box.size * 0.78;
  const motifScale = motifSize / 100;

  return {
    points,
    chartCenter: {
      x: box.x + box.size / 2,
      y: box.y + box.size / 2,
    },
    chartRadius: box.size * 0.455,
    motif: {
      x: box.x + (box.size - motifSize) / 2,
      y: box.y + (box.size - motifSize) / 2,
      scale: motifScale,
    },
    seed: hashString(
      seedKey ||
        stars.map((star) => `${star.x.toFixed(3)},${star.y.toFixed(3)}`).join(";"),
    ),
  };
}

export interface DecorativeStar {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

export function decorativeStars(
  box: ArtBox,
  seed: number,
  count = 44,
): DecorativeStar[] {
  const random = mulberry32(seed);
  const stars: DecorativeStar[] = [];
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: box.x + box.padding * 0.3 + random() * (box.size - box.padding * 0.6),
      y: box.y + box.padding * 0.3 + random() * (box.size - box.padding * 0.6),
      r: 0.5 + random() * 1.2,
      opacity: 0.12 + random() * 0.34,
    });
  }
  return stars;
}
