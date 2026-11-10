import { hashString, mulberry32 } from "./geometry";
import { getMotif, type Motif } from "./motifs";
import type { FigureEdge, Point } from "./types";

const EPSILON = 1e-9;
const DEG = Math.PI / 180;

export interface ArtBox {
  x: number;
  y: number;
  size: number;
  padding: number;
}

export interface MotifBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/**
 * One placement of the engraved motif. The transform maps the motif's own
 * path coordinates around the centre of its measured bounds, then rotates the
 * drawing to the constellation's principal axis. `scaleX`/`scaleY` are in
 * motif-viewBox units, not stage units.
 */
export interface MotifPlacement {
  cx: number;
  cy: number;
  /** Clockwise SVG rotation in degrees. */
  rotation: number;
  scaleX: number;
  scaleY: number;
  bounds: MotifBounds;
  /** 1 for the main figure, below 1 for the echoes of separate parts. */
  opacity: number;
}

export interface ArtLayout {
  points: Point[];
  chartCenter: Point;
  chartRadius: number;
  /** Primary motif placement (the largest connected part). */
  motif: MotifPlacement;
  /** One placement per connected part. Isolated stars get no motif. */
  motifs: MotifPlacement[];
  /** Stars untouched by any line, when at least one line exists. */
  isolated: number[];
  /** Deterministic decoration seed. */
  seed: number;
}

const DEFAULT_BOUNDS: MotifBounds = {
  minX: 0,
  minY: 0,
  width: 100,
  height: 100,
};

const PATH_ARG_COUNTS: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

/**
 * Measure the real extent of the curated path art. The old renderer assumed
 * every motif filled the whole 0..100 viewBox; several do not, which made the
 * engraving float away from the stars. Arc flags and radii are not coordinates,
 * so they are handled explicitly instead of treating every number as a point.
 */
export function svgPathBounds(paths: string[]): MotifBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const d of paths) {
    const tokens = d.match(
      /[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g,
    );
    if (!tokens) continue;

    let index = 0;
    let command = "";
    let cx = 0;
    let cy = 0;
    let subpathX = 0;
    let subpathY = 0;

    const include = (x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      found = true;
    };

    while (index < tokens.length) {
      const token = tokens[index];
      if (/^[A-Za-z]$/.test(token)) {
        command = token;
        index += 1;
        if (command === "Z" || command === "z") {
          cx = subpathX;
          cy = subpathY;
          include(cx, cy);
        }
        continue;
      }

      if (!command) {
        index += 1;
        continue;
      }

      const upper = command.toUpperCase();
      const count = PATH_ARG_COUNTS[upper] ?? 0;
      if (count === 0) {
        index += 1;
        continue;
      }

      const args = tokens.slice(index, index + count).map(Number);
      if (args.length < count || args.some((value) => !Number.isFinite(value))) {
        break;
      }
      index += count;

      const relative = command !== upper;
      const x = (value: number) => (relative ? cx + value : value);
      const y = (value: number) => (relative ? cy + value : value);

      switch (upper) {
        case "M":
        case "L": {
          cx = x(args[0]);
          cy = y(args[1]);
          include(cx, cy);
          if (upper === "M") {
            subpathX = cx;
            subpathY = cy;
            // Additional coordinate pairs after a move are implicit lines.
            command = relative ? "l" : "L";
          }
          break;
        }
        case "H": {
          cx = relative ? cx + args[0] : args[0];
          include(cx, cy);
          break;
        }
        case "V": {
          cy = relative ? cy + args[0] : args[0];
          include(cx, cy);
          break;
        }
        case "C": {
          const c1x = x(args[0]);
          const c1y = y(args[1]);
          const c2x = x(args[2]);
          const c2y = y(args[3]);
          cx = x(args[4]);
          cy = y(args[5]);
          include(c1x, c1y);
          include(c2x, c2y);
          include(cx, cy);
          break;
        }
        case "S":
        case "Q": {
          const c1x = x(args[0]);
          const c1y = y(args[1]);
          cx = x(args[2]);
          cy = y(args[3]);
          include(c1x, c1y);
          include(cx, cy);
          break;
        }
        case "T": {
          cx = x(args[0]);
          cy = y(args[1]);
          include(cx, cy);
          break;
        }
        case "A": {
          const rx = Math.abs(args[0]);
          const ry = Math.abs(args[1]);
          const endX = x(args[5]);
          const endY = y(args[6]);
          // A conservative ellipse box around both endpoints is enough for
          // layout: it never underestimates an arc's reach.
          include(cx - rx, cy - ry);
          include(cx + rx, cy + ry);
          include(endX - rx, endY - ry);
          include(endX + rx, endY + ry);
          include(endX, endY);
          cx = endX;
          cy = endY;
          break;
        }
        default:
          break;
      }
    }
  }

  if (!found) return DEFAULT_BOUNDS;

  // Include a little room for the stroke itself.
  const pad = 1.5;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;

  return {
    minX,
    minY,
    width: Math.max(EPSILON, maxX - minX),
    height: Math.max(EPSILON, maxY - minY),
  };
}

function number(value: number): string {
  return Number.isFinite(value)
    ? Number(value.toFixed(3)).toString()
    : "0";
}

/** SVG transform for a placement, in the same coordinate space as the paths. */
export function motifTransform(placement: MotifPlacement): string {
  const { bounds } = placement;
  const centerX = bounds.minX + bounds.width / 2;
  const centerY = bounds.minY + bounds.height / 2;
  return [
    `translate(${number(placement.cx)} ${number(placement.cy)})`,
    `rotate(${number(placement.rotation)})`,
    `scale(${number(placement.scaleX)} ${number(placement.scaleY)})`,
    `translate(${number(-centerX)} ${number(-centerY)})`,
  ].join(" ");
}

/** Axis-aligned on-screen bounds after the placement's rotation and scale. */
export function motifScreenBounds(placement: MotifPlacement): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const c = Math.abs(Math.cos(placement.rotation * DEG));
  const s = Math.abs(Math.sin(placement.rotation * DEG));
  const width =
    placement.bounds.width * placement.scaleX * c +
    placement.bounds.height * placement.scaleY * s;
  const height =
    placement.bounds.width * placement.scaleX * s +
    placement.bounds.height * placement.scaleY * c;
  return {
    x: placement.cx - width / 2,
    y: placement.cy - height / 2,
    width,
    height,
  };
}

function meanPoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function normalizeAngle(degrees: number): number {
  let angle = degrees % 180;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  return angle;
}

/**
 * Principal axis of the drawing in SVG coordinates. Star positions and the
 * directions of the user's segments both contribute; long segments count more
 * than short ones. Returns an undirected axis in -90..90 degrees.
 */
function principalAxis(
  points: Point[],
  edges: FigureEdge[],
): { angle: number; elongation: number } {
  if (points.length < 2) return { angle: 0, elongation: 1 };

  const center = meanPoint(points);
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of points) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  let trace = xx + yy;
  if (trace > EPSILON) {
    xx /= trace;
    yy /= trace;
    xy /= trace;
  } else {
    xx = 0.5;
    yy = 0.5;
    xy = 0;
  }

  if (edges.length > 0) {
    let exx = 0;
    let eyy = 0;
    let exy = 0;
    let weight = 0;
    for (const [a, b] of edges) {
      const start = points[a];
      const end = points[b];
      if (!start || !end) continue;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      if (length < EPSILON) continue;
      const ux = dx / length;
      const uy = dy / length;
      exx += ux * ux * length;
      eyy += uy * uy * length;
      exy += ux * uy * length;
      weight += length;
    }
    if (weight > EPSILON) {
      exx /= weight;
      eyy /= weight;
      exy /= weight;
      xx = xx * 0.4 + exx * 0.6;
      yy = yy * 0.4 + eyy * 0.6;
      xy = xy * 0.4 + exy * 0.6;
      trace = xx + yy;
      if (trace > EPSILON) {
        xx /= trace;
        yy /= trace;
        xy /= trace;
      }
    }
  }

  const spread = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy * xy));
  const major = (xx + yy) / 2 + spread / 2;
  const minor = Math.max(EPSILON, (xx + yy) / 2 - spread / 2);
  return {
    angle: normalizeAngle((0.5 * Math.atan2(2 * xy, xx - yy) * 180) / Math.PI),
    elongation: Math.sqrt(Math.max(0, major / minor)),
  };
}

interface Frame {
  cx: number;
  cy: number;
  angle: number;
  along: number;
  across: number;
  elongation: number;
}

function frameOf(points: Point[], edges: FigureEdge[]): Frame {
  if (points.length === 0) {
    return {
      cx: 0,
      cy: 0,
      angle: 0,
      along: 0,
      across: 0,
      elongation: 1,
    };
  }

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const { angle, elongation } = principalAxis(points, edges);
  // A round cluster has no meaningful direction; keeping it upright avoids a
  // random-looking tilt.
  const theta = elongation >= 1.22 ? angle : 0;
  const cos = Math.cos(theta * DEG);
  const sin = Math.sin(theta * DEG);

  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const dx = point.x - cx;
    const dy = point.y - cy;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }

  return {
    cx,
    cy,
    angle: theta,
    along: maxU - minU,
    across: maxV - minV,
    elongation,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function placementFor(
  frame: Frame,
  motif: Motif,
  bounds: MotifBounds,
  box: ArtBox,
  inner: number,
  opacity: number,
): MotifPlacement {
  const elongated =
    frame.elongation >= 1.22 && Math.max(frame.along, frame.across) > 1;
  let rotation = 0;
  let scaleX = 1;
  let scaleY = 1;

  if (elongated) {
    // Rotate the artwork's own long axis onto the constellation's main axis.
    rotation = normalizeAngle(frame.angle - motif.axisAngle);

    const padAlong = Math.max(inner * 0.055, frame.along * 0.14);
    const padAcross = Math.max(inner * 0.055, frame.across * 0.24);
    const targetAlong = Math.max(inner * 0.3, frame.along + padAlong * 2);
    const targetAcross = Math.max(inner * 0.2, frame.across + padAcross * 2);

    // The target rectangle is measured in the figure frame. In the motif's
    // local frame its long side sits at `motif.axisAngle`, so project the
    // target rectangle onto the motif's x/y axes before scaling.
    const c = Math.abs(Math.cos(motif.axisAngle * DEG));
    const s = Math.abs(Math.sin(motif.axisAngle * DEG));
    const localWidth = targetAlong * c + targetAcross * s;
    const localHeight = targetAlong * s + targetAcross * c;

    scaleX = localWidth / bounds.width;
    scaleY = localHeight / bounds.height;

    // Extreme drawings should follow the figure without turning the artwork
    // into an unreadable smear.
    const maxRatio = 5;
    const ratio = scaleX / scaleY;
    const geometric = Math.sqrt(scaleX * scaleY);
    if (ratio > maxRatio) {
      scaleX = geometric * Math.sqrt(maxRatio);
      scaleY = geometric / Math.sqrt(maxRatio);
    } else if (ratio < 1 / maxRatio) {
      scaleX = geometric / Math.sqrt(maxRatio);
      scaleY = geometric * Math.sqrt(maxRatio);
    }
  } else {
    // Round / compact figures keep the motif upright and preserve its aspect.
    const target = Math.max(
      inner * 0.4,
      Math.max(frame.along, frame.across) * 1.8,
    );
    const scale = target / Math.max(bounds.width, bounds.height);
    scaleX = scale;
    scaleY = scale;
  }

  const c = Math.abs(Math.cos(rotation * DEG));
  const s = Math.abs(Math.sin(rotation * DEG));
  let rotatedWidth = bounds.width * scaleX * c + bounds.height * scaleY * s;
  let rotatedHeight = bounds.width * scaleX * s + bounds.height * scaleY * c;
  const fit = Math.min(
    1,
    inner / Math.max(EPSILON, rotatedWidth, rotatedHeight),
  );
  scaleX *= fit;
  scaleY *= fit;
  rotatedWidth *= fit;
  rotatedHeight *= fit;

  const outerMin = box.x + 6;
  const outerMax = box.x + box.size - 6;
  const halfWidth = rotatedWidth / 2;
  const halfHeight = rotatedHeight / 2;
  const cx =
    rotatedWidth <= outerMax - outerMin
      ? clamp(frame.cx, outerMin + halfWidth, outerMax - halfWidth)
      : box.x + box.size / 2;
  const cy =
    rotatedHeight <= outerMax - outerMin
      ? clamp(frame.cy, outerMin + halfHeight, outerMax - halfHeight)
      : box.y + box.size / 2;

  return {
    cx,
    cy,
    rotation,
    scaleX,
    scaleY,
    bounds,
    opacity,
  };
}

function connectedGroups(starCount: number, edges: FigureEdge[]): number[][] {
  const adjacency = Array.from({ length: starCount }, () => new Set<number>());
  for (const [a, b] of edges) {
    adjacency[a]?.add(b);
    adjacency[b]?.add(a);
  }

  const seen = new Set<number>();
  const groups: number[][] = [];
  for (let start = 0; start < starCount; start += 1) {
    if (seen.has(start) || adjacency[start].size === 0) continue;
    const stack = [start];
    const members: number[] = [];
    seen.add(start);
    while (stack.length > 0) {
      const current = stack.pop() as number;
      members.push(current);
      for (const next of adjacency[current]) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    members.sort((a, b) => a - b);
    groups.push(members);
  }
  return groups;
}

function edgesWithin(members: number[], edges: FigureEdge[]): FigureEdge[] {
  const set = new Set(members);
  return edges.filter(([a, b]) => set.has(a) && set.has(b));
}

/**
 * Map the normalized stage onto a square artwork area. The full stage is
 * scaled uniformly and letterboxed, so a star's position relative to the
 * original frame, every distance between stars, and the drawing's orientation
 * are preserved. We deliberately do not re-fit the bounding box: a constellation
 * drawn in the upper-left stays in the upper-left instead of being recentered
 * and enlarged.
 *
 * The motif is placed per connected part. Its measured path bounds are aligned
 * with that part's principal axis and its stars, so the illustration follows
 * the actual drawing instead of sitting in a generic centred frame. Stars that
 * the user left unconnected are never included in a motif's frame.
 */
export function layoutStarMap(
  stars: Point[],
  aspect: number,
  box: ArtBox,
  seedKey = "",
  figureEdges: FigureEdge[] = [],
  motifId = "whale",
): ArtLayout {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const inner = Math.max(1, box.size - box.padding * 2);
  const stageWidth = Math.max(0.001, safeAspect);
  const stageHeight = 1;
  const scale = inner / Math.max(stageWidth, stageHeight);
  const drawnWidth = stageWidth * scale;
  const drawnHeight = stageHeight * scale;

  const offsetX = box.x + box.padding + (inner - drawnWidth) / 2;
  const offsetY = box.y + box.padding + (inner - drawnHeight) / 2;

  // Stage coordinates are already y-down, like SVG. A uniform scale plus a
  // single translation is the only transform applied to the user's points.
  const points = stars.map((star) => ({
    x: offsetX + star.x * drawnWidth,
    y: offsetY + star.y * drawnHeight,
  }));

  const motif = getMotif(motifId);
  const motifBounds = svgPathBounds(motif.paths);
  const chartCenter = {
    x: box.x + box.size / 2,
    y: box.y + box.size / 2,
  };

  if (points.length === 0) {
    const motifScale =
      (inner * 0.55) / Math.max(motifBounds.width, motifBounds.height);
    const placement: MotifPlacement = {
      cx: chartCenter.x,
      cy: chartCenter.y,
      rotation: 0,
      scaleX: motifScale,
      scaleY: motifScale,
      bounds: motifBounds,
      opacity: 1,
    };
    return {
      points,
      chartCenter,
      chartRadius: box.size * 0.455,
      motif: placement,
      motifs: [placement],
      isolated: [],
      seed: hashString(seedKey || "empty"),
    };
  }

  const edges = figureEdges.filter(
    ([a, b]) =>
      Number.isInteger(a) &&
      Number.isInteger(b) &&
      a >= 0 &&
      b >= 0 &&
      a < points.length &&
      b < points.length &&
      a !== b,
  );

  const groups = connectedGroups(points.length, edges);
  const targets =
    groups.length > 0
      ? groups
          .map((members) => ({
            members,
            edges: edgesWithin(members, edges),
          }))
          .sort(
            (a, b) =>
              b.members.length - a.members.length ||
              b.edges.length - a.edges.length ||
              a.members[0] - b.members[0],
          )
      : [
          {
            members: points.map((_, index) => index),
            edges: [] as FigureEdge[],
          },
        ];

  const isolated =
    edges.length > 0
      ? points
          .map((_, index) => index)
          .filter(
            (index) =>
              !targets.some((target) => target.members.includes(index)),
          )
      : [];

  const placements = targets.map((target, index) =>
    placementFor(
      frameOf(
        target.members.map((member) => points[member]),
        target.edges,
      ),
      motif,
      motifBounds,
      box,
      inner,
      index === 0 ? 1 : 0.55,
    ),
  );

  return {
    points,
    chartCenter,
    chartRadius: box.size * 0.455,
    motif: placements[0],
    motifs: placements,
    isolated,
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
