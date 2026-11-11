import { normalizeEdgePairs } from "./edges";
import { hashString, mulberry32 } from "./geometry";
import { DEFAULT_LINE_STYLE, isLineStyle } from "./lineStyle";
import type { FigureEdge, LineStyle, Point } from "./types";

const EPSILON = 1e-9;
const MAX_ENGRAVING_PATHS = 420;

export interface ArtBox {
  x: number;
  y: number;
  size: number;
  padding: number;
}

/** One fine line generated from the user's drawing, in art coordinates. */
export interface EngravingPath {
  d: string;
  opacity: number;
  width: number;
  dash?: string;
}

/** A dashed halo around a star that no line touches. */
export interface EngravingHalo {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
  dash?: string;
}

export interface Engraving {
  paths: EngravingPath[];
  halos: EngravingHalo[];
  /** Number of separate connected line groups. */
  parts: number;
  /** Star indices untouched by any line. */
  isolated: number[];
}

export interface ArtLayout {
  points: Point[];
  chartCenter: Point;
  chartRadius: number;
  /** Stars untouched by any line. When nothing was drawn, every star is here. */
  isolated: number[];
  /** Deterministic decoration seed. */
  seed: number;
  engraving: Engraving;
}

interface EngravingProfile {
  echoOffset: number;
  echoOpacity: number;
  echoWidth: number;
  echoBow: number;
  echoDash?: string;
  tickEvery: number;
  tickLength: number;
  tickOpacity: number;
  tickWidth: number;
  tickDash?: string;
  endpoint: "taper" | "cap" | "fan" | "leaf";
  ringDash?: string;
  haloDash: string;
  haloRadius: number;
  haloOpacity: number;
  rayCount: number;
  rayLength: number;
}

/**
 * The four line styles share the same graph reading. They differ only in the
 * marks drawn beside it: how echoes curve, how often ticks appear, how ends
 * close, and how isolated stars are haloed.
 */
const PROFILES: Record<LineStyle, EngravingProfile> = {
  flowing: {
    echoOffset: 6,
    echoOpacity: 0.42,
    echoWidth: 0.9,
    echoBow: 0.95,
    tickEvery: 3,
    tickLength: 2.6,
    tickOpacity: 0.32,
    tickWidth: 0.7,
    endpoint: "taper",
    haloDash: "1.4 4",
    haloRadius: 7,
    haloOpacity: 0.42,
    rayCount: 4,
    rayLength: 8,
  },
  hard: {
    echoOffset: 4,
    echoOpacity: 0.44,
    echoWidth: 0.85,
    echoBow: 0,
    tickEvery: 2,
    tickLength: 3.4,
    tickOpacity: 0.34,
    tickWidth: 0.72,
    endpoint: "cap",
    haloDash: "2 2.4",
    haloRadius: 6,
    haloOpacity: 0.4,
    rayCount: 4,
    rayLength: 6,
  },
  radial: {
    echoOffset: 3.6,
    echoOpacity: 0.4,
    echoWidth: 0.8,
    echoBow: 0.25,
    tickEvery: 2,
    tickLength: 4.4,
    tickOpacity: 0.34,
    tickWidth: 0.7,
    endpoint: "fan",
    ringDash: "1.8 3",
    haloDash: "1.2 3",
    haloRadius: 7.5,
    haloOpacity: 0.44,
    rayCount: 8,
    rayLength: 9,
  },
  delicate: {
    echoOffset: 5.2,
    echoOpacity: 0.34,
    echoWidth: 0.75,
    echoBow: 0.55,
    echoDash: "1.2 3.6",
    tickEvery: 4,
    tickLength: 2.2,
    tickOpacity: 0.28,
    tickWidth: 0.65,
    endpoint: "leaf",
    haloDash: "1 3.6",
    haloRadius: 6.4,
    haloOpacity: 0.36,
    rayCount: 4,
    rayLength: 7,
  },
};

type ComponentKind = "chain" | "cycle" | "branch" | "mesh";

interface Component {
  members: number[];
  edges: FigureEdge[];
  degree: Map<number, number>;
  kind: ComponentKind;
  center: Point;
}

function number(value: number): string {
  return Number.isFinite(value)
    ? Number(value.toFixed(3)).toString()
    : "0";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

function pointAt(
  point: Point,
  ux: number,
  uy: number,
  distance: number,
): Point {
  return { x: point.x + ux * distance, y: point.y + uy * distance };
}

function unitVector(a: Point, b: Point): { x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return { x: 1, y: 0 };
  return { x: dx / length, y: dy / length };
}

function midpoint(a: Point, b: Point, t = 0.5): Point {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function linePath(a: Point, b: Point): string {
  return `M ${number(a.x)} ${number(a.y)} L ${number(b.x)} ${number(b.y)}`;
}

function quadPath(a: Point, control: Point, b: Point): string {
  return `M ${number(a.x)} ${number(a.y)} Q ${number(control.x)} ${number(
    control.y,
  )} ${number(b.x)} ${number(b.y)}`;
}

function polylinePath(points: Point[], close = false): string {
  if (points.length === 0) return "";
  const head = `M ${number(points[0].x)} ${number(points[0].y)}`;
  const tail = points
    .slice(1)
    .map((point) => `L ${number(point.x)} ${number(point.y)}`)
    .join(" ");
  return close ? `${head} ${tail} Z` : `${head} ${tail}`;
}

function rotateVector(
  vector: { x: number; y: number },
  degrees: number,
): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function graphComponents(
  starCount: number,
  edges: FigureEdge[],
): number[][] {
  const adjacency = Array.from({ length: starCount }, () => new Set<number>());
  for (const [a, b] of edges) {
    adjacency[a]?.add(b);
    adjacency[b]?.add(a);
  }

  const seen = new Set<number>();
  const components: number[][] = [];
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
    components.push(members);
  }
  return components;
}

function componentKind(
  members: number[],
  edges: FigureEdge[],
  degree: Map<number, number>,
): ComponentKind {
  const maxDegree = Math.max(
    ...members.map((member) => degree.get(member) ?? 0),
  );
  const isCycle =
    members.length >= 3 &&
    edges.length === members.length &&
    members.every((member) => degree.get(member) === 2);
  if (isCycle) return "cycle";
  if (edges.length === members.length - 1 && maxDegree <= 2) return "chain";
  if (maxDegree >= 3) return "branch";
  return "mesh";
}

function collectComponents(
  points: Point[],
  edges: FigureEdge[],
): Component[] {
  return graphComponents(points.length, edges)
    .map((members) => {
      const memberSet = new Set(members);
      const componentEdges = edges.filter(
        ([a, b]) => memberSet.has(a) && memberSet.has(b),
      );
      const degree = new Map<number, number>();
      for (const member of members) degree.set(member, 0);
      for (const [a, b] of componentEdges) {
        degree.set(a, (degree.get(a) ?? 0) + 1);
        degree.set(b, (degree.get(b) ?? 0) + 1);
      }
      return {
        members,
        edges: componentEdges,
        degree,
        kind: componentKind(members, componentEdges, degree),
        center: meanPoint(members.map((member) => points[member])),
      } satisfies Component;
    })
    .sort(
      (a, b) => b.members.length - a.members.length || a.members[0] - b.members[0],
    );
}

function addEndpointMark(
  node: Point,
  neighbor: Point,
  profile: EngravingProfile,
  emit: (
    path: string,
    opacity: number,
    width: number,
    dash?: string,
  ) => void,
  random: () => number,
  branchTip: boolean,
): void {
  if (!Number.isFinite(node.x) || !Number.isFinite(neighbor.x)) return;
  const direction = unitVector(neighbor, node);
  if (!Number.isFinite(direction.x)) return;
  const normal = { x: -direction.y, y: direction.x };
  const base = pointAt(node, direction.x, direction.y, 3.2);
  const tipDistance = branchTip ? 9 + random() * 3.4 : 7 + random() * 2.2;
  const tip = pointAt(node, direction.x, direction.y, tipDistance);

  if (branchTip || profile.endpoint === "leaf") {
    const spread = branchTip ? 2.4 + random() * 1.4 : 1.6 + random() * 0.8;
    const shoulder = pointAt(base, direction.x, direction.y, tipDistance * 0.42);
    const leftControl = pointAt(shoulder, normal.x, normal.y, spread);
    const rightControl = pointAt(shoulder, normal.x, normal.y, -spread);
    emit(
      quadPath(
        pointAt(base, normal.x, normal.y, spread * 0.62),
        leftControl,
        tip,
      ),
      0.38,
      0.8,
    );
    emit(
      quadPath(
        pointAt(base, normal.x, normal.y, -spread * 0.62),
        rightControl,
        tip,
      ),
      0.38,
      0.8,
    );
    return;
  }

  if (profile.endpoint === "cap") {
    const half = 3.1;
    emit(
      linePath(
        pointAt(base, normal.x, normal.y, half),
        pointAt(base, normal.x, normal.y, -half),
      ),
      0.4,
      0.82,
    );
    emit(
      linePath(
        pointAt(base, normal.x, normal.y, half),
        pointAt(tip, normal.x, normal.y, 0.9),
      ),
      0.3,
      0.62,
    );
    emit(
      linePath(
        pointAt(base, normal.x, normal.y, -half),
        pointAt(tip, normal.x, normal.y, -0.9),
      ),
      0.3,
      0.62,
    );
    return;
  }

  if (profile.endpoint === "fan") {
    for (const angle of [-26, 0, 26]) {
      const ray = rotateVector(direction, angle);
      emit(
        linePath(
          base,
          pointAt(base, ray.x, ray.y, 7 + random() * 2.4),
        ),
        0.34,
        0.7,
      );
    }
    return;
  }

  // A brush-like pair of converging strokes for flowing chains.
  emit(
    linePath(pointAt(base, normal.x, normal.y, 1.7), tip),
    0.36,
    0.76,
  );
  emit(
    linePath(pointAt(base, normal.x, normal.y, -1.7), tip),
    0.36,
    0.76,
  );
}

function addEdgeMarks(
  a: Point,
  b: Point,
  profile: EngravingProfile,
  side: number,
  edgeIndex: number,
  emit: (
    path: string,
    opacity: number,
    width: number,
    dash?: string,
  ) => void,
): void {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 7) return;
  const direction = unitVector(a, b);
  const normal = { x: -direction.y, y: direction.x };
  const trim = Math.min(length * 0.18, 9);
  if (length <= trim * 2 + 2) return;

  const start = pointAt(a, direction.x, direction.y, trim);
  const end = pointAt(b, direction.x, direction.y, -trim);
  const offset = Math.min(
    profile.echoOffset,
    Math.max(2.2, length * 0.12),
  );
  const center = midpoint(start, end);

  if (profile.echoDash) {
    const control = pointAt(
      center,
      normal.x,
      normal.y,
      side * offset * 1.15,
    );
    emit(
      quadPath(start, control, end),
      profile.echoOpacity,
      profile.echoWidth,
      profile.echoDash,
    );
  } else if (profile.echoBow > 0) {
    for (const directionSign of [1, -1]) {
      const bow =
        directionSign === side
          ? offset * profile.echoBow
          : offset * profile.echoBow * 0.4;
      const control = pointAt(
        center,
        normal.x,
        normal.y,
        directionSign * offset + bow,
      );
      emit(
        quadPath(start, control, end),
        profile.echoOpacity * (directionSign === 1 ? 1 : 0.8),
        profile.echoWidth,
      );
    }
  } else {
    for (const directionSign of [1, -1]) {
      emit(
        linePath(
          pointAt(start, normal.x, normal.y, directionSign * offset),
          pointAt(end, normal.x, normal.y, directionSign * offset),
        ),
        profile.echoOpacity * (directionSign === 1 ? 1 : 0.82),
        profile.echoWidth,
      );
    }
  }

  if (
    profile.tickEvery > 0 &&
    edgeIndex % profile.tickEvery === 0 &&
    length > 18
  ) {
    const count = Math.max(1, Math.min(4, Math.floor(length / 28)));
    for (let index = 1; index <= count; index += 1) {
      const t = index / (count + 1);
      const base = midpoint(start, end, t);
      const inner = pointAt(
        base,
        normal.x,
        normal.y,
        side * offset * 0.3,
      );
      const outer = pointAt(
        base,
        normal.x,
        normal.y,
        side * (offset * 0.3 + profile.tickLength),
      );
      emit(
        linePath(inner, outer),
        profile.tickOpacity,
        profile.tickWidth,
        profile.tickDash,
      );
    }
  }
}

function addCycleMarks(
  component: Component,
  points: Point[],
  profile: EngravingProfile,
  emit: (
    path: string,
    opacity: number,
    width: number,
    dash?: string,
  ) => void,
): void {
  const { center, members } = component;
  const radii = members.map((member) =>
    Math.hypot(points[member].x - center.x, points[member].y - center.y),
  );
  const minimumRadius = Math.min(...radii.filter((radius) => radius > EPSILON));
  if (!Number.isFinite(minimumRadius)) return;
  const inset = clamp(minimumRadius * 0.24, 5, 17);

  const innerRing = members.map((member) => {
    const point = points[member];
    const direction = unitVector(center, point);
    return pointAt(
      point,
      -direction.x,
      -direction.y,
      Math.min(inset, minimumRadius * 0.42),
    );
  });
  if (innerRing.length >= 3) {
    emit(
      polylinePath(innerRing, true),
      0.32,
      0.72,
      profile.ringDash,
    );
  }

  for (const member of members) {
    const point = points[member];
    const direction = unitVector(point, center);
    const start = pointAt(
      point,
      direction.x,
      direction.y,
      Math.min(4.2, minimumRadius * 0.2),
    );
    const end = pointAt(
      point,
      direction.x,
      direction.y,
      Math.min(4.2 + profile.tickLength * 1.6, minimumRadius * 0.62),
    );
    emit(linePath(start, end), 0.34, 0.7);
  }

  if (profile.endpoint === "fan") {
    const ray = 3.2;
    emit(
      linePath(
        { x: center.x - ray, y: center.y },
        { x: center.x + ray, y: center.y },
      ),
      0.3,
      0.66,
    );
    emit(
      linePath(
        { x: center.x, y: center.y - ray },
        { x: center.x, y: center.y + ray },
      ),
      0.3,
      0.66,
    );
  }
}

function addBranchMarks(
  component: Component,
  points: Point[],
  profile: EngravingProfile,
  emit: (
    path: string,
    opacity: number,
    width: number,
    dash?: string,
  ) => void,
  random: () => number,
): void {
  const { members, degree } = component;
  for (const member of members) {
    const point = points[member];
    const degreeValue = degree.get(member) ?? 0;
    if (degreeValue >= 3) {
      const spokes = Math.min(7, 4 + degreeValue);
      const startRadius = 4.1 + random() * 0.8;
      for (let index = 0; index < spokes; index += 1) {
        const angle =
          (Math.PI * 2 * index) / spokes + random() * 0.16 - 0.08;
        const direction = { x: Math.cos(angle), y: Math.sin(angle) };
        emit(
          linePath(
            pointAt(point, direction.x, direction.y, startRadius),
            pointAt(
              point,
              direction.x,
              direction.y,
              startRadius + profile.tickLength + 1.2,
            ),
          ),
          0.3,
          0.66,
        );
      }
    }
    if (degreeValue === 1) {
      const neighborIndex = component.edges.find(
        ([a, b]) => a === member || b === member,
      );
      if (neighborIndex) {
        const otherIndex =
          neighborIndex[0] === member ? neighborIndex[1] : neighborIndex[0];
        addEndpointMark(
          point,
          points[otherIndex],
          profile,
          emit,
          random,
          true,
        );
      }
    }
  }
}

function addMeshMarks(
  component: Component,
  points: Point[],
  profile: EngravingProfile,
  emit: (
    path: string,
    opacity: number,
    width: number,
    dash?: string,
  ) => void,
): void {
  const { edges, members, degree } = component;
  for (let index = 0; index < edges.length; index += 2) {
    const [a, b] = edges[index];
    const start = points[a];
    const end = points[b];
    if (!start || !end) continue;
    const center = midpoint(start, end);
    const direction = unitVector(start, end);
    const normal = { x: -direction.y, y: direction.x };
    const size = 2.2;
    emit(
      linePath(
        pointAt(center, normal.x, normal.y, size),
        pointAt(center, normal.x, normal.y, -size),
      ),
      profile.tickOpacity * 0.9,
      profile.tickWidth,
    );
    emit(
      linePath(
        pointAt(center, direction.x, direction.y, size),
        pointAt(center, direction.x, direction.y, -size),
      ),
      profile.tickOpacity * 0.7,
      profile.tickWidth,
    );
  }

  for (const member of members) {
    if ((degree.get(member) ?? 0) < 4) continue;
    const point = points[member];
    const size = 2.6;
    emit(
      polylinePath(
        [
          { x: point.x, y: point.y - size },
          { x: point.x + size, y: point.y },
          { x: point.x, y: point.y + size },
          { x: point.x - size, y: point.y },
        ],
        true,
      ),
      0.3,
      0.66,
    );
  }
}

function addChainMarks(
  component: Component,
  points: Point[],
  profile: EngravingProfile,
  emit: (
    path: string,
    opacity: number,
    width: number,
    dash?: string,
  ) => void,
  random: () => number,
): void {
  for (const member of component.members) {
    if ((component.degree.get(member) ?? 0) !== 1) continue;
    const edge = component.edges.find(
      ([a, b]) => a === member || b === member,
    );
    if (!edge) continue;
    const other = edge[0] === member ? edge[1] : edge[0];
    addEndpointMark(
      points[member],
      points[other],
      profile,
      emit,
      random,
      false,
    );
  }
}

function addIsolatedMark(
  point: Point,
  profile: EngravingProfile,
  hasLines: boolean,
  emit: (
    path: string,
    opacity: number,
    width: number,
    dash?: string,
  ) => void,
  halos: EngravingHalo[],
  random: () => number,
): void {
  const scale = hasLines ? 1 : 0.86;
  const radius = profile.haloRadius * scale + random() * 1.2;
  halos.push({
    cx: point.x,
    cy: point.y,
    r: radius,
    opacity: profile.haloOpacity * (hasLines ? 1 : 0.78),
    dash: profile.haloDash,
  });

  const rays = hasLines ? profile.rayCount : 4;
  const offset = random() * (Math.PI / 4);
  for (let index = 0; index < rays; index += 1) {
    const angle = offset + (Math.PI * 2 * index) / rays;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const inner = pointAt(
      point,
      direction.x,
      direction.y,
      radius + 1.1,
    );
    const outer = pointAt(
      point,
      direction.x,
      direction.y,
      radius + 1.1 + profile.rayLength * (0.66 + random() * 0.5),
    );
    emit(
      linePath(inner, outer),
      profile.haloOpacity * 0.85,
      0.62,
    );
  }
}

/**
 * Turn the user's line graph into engraving marks. The graph itself is never
 * changed: every echo is offset beside an existing segment, every ring is
 * inset inside an existing cycle, and every halo belongs to one star. No mark
 * ever joins two stars that the user did not join.
 */
export function engraveFigure(
  points: Point[],
  rawEdges: FigureEdge[],
  lineStyle: unknown = DEFAULT_LINE_STYLE,
  seed = 0,
): Engraving {
  const style = isLineStyle(lineStyle) ? lineStyle : DEFAULT_LINE_STYLE;
  const profile = PROFILES[style];
  const edges = normalizeEdgePairs(rawEdges, points.length);
  const components = collectComponents(points, edges);
  const isolated = points
    .map((_, index) => index)
    .filter(
      (index) =>
        !components.some((component) => component.members.includes(index)),
    );

  const paths: EngravingPath[] = [];
  const halos: EngravingHalo[] = [];
  const emit = (
    path: string,
    opacity: number,
    width: number,
    dash?: string,
  ) => {
    if (!path || paths.length >= MAX_ENGRAVING_PATHS) return;
    paths.push({ d: path, opacity, width, dash });
  };

  components.forEach((component, componentIndex) => {
    const random = mulberry32(
      (seed ^
        hashString(
          `${style}|${componentIndex}|${component.members.join(",")}`,
        )) >>>
        0,
    );
    const weight = componentIndex === 0 ? 1 : 0.86;
    const componentEmit = (
      path: string,
      opacity: number,
      width: number,
      dash?: string,
    ) => emit(path, opacity * weight, width, dash);
    const side = random() < 0.5 ? 1 : -1;

    component.edges.forEach(([a, b], edgeIndex) => {
      addEdgeMarks(
        points[a],
        points[b],
        profile,
        side,
        edgeIndex,
        componentEmit,
      );
    });

    if (component.kind === "cycle") {
      addCycleMarks(component, points, profile, componentEmit);
    } else if (component.kind === "branch") {
      addBranchMarks(component, points, profile, componentEmit, random);
    } else if (component.kind === "mesh") {
      addMeshMarks(component, points, profile, componentEmit);
    } else {
      addChainMarks(component, points, profile, componentEmit, random);
    }
  });

  const hasLines = edges.length > 0;
  for (const index of isolated) {
    const random = mulberry32(
      (seed ^ hashString(`${style}|isolated|${index}`)) >>> 0,
    );
    addIsolatedMark(
      points[index],
      profile,
      hasLines,
      emit,
      halos,
      random,
    );
  }

  return {
    paths,
    halos,
    parts: components.length,
    isolated,
  };
}

/**
 * Map the normalized stage onto a square artwork area. The full stage is
 * scaled uniformly and letterboxed, so a star's position relative to the
 * original frame, every distance between stars, and the drawing's orientation
 * are preserved. The engraving is generated from that mapped graph.
 */
export function layoutStarMap(
  stars: Point[],
  aspect: number,
  box: ArtBox,
  seedKey = "",
  figureEdges: FigureEdge[] = [],
  lineStyle: unknown = DEFAULT_LINE_STYLE,
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

  const chartCenter = {
    x: box.x + box.size / 2,
    y: box.y + box.size / 2,
  };
  const seed = hashString(
    seedKey ||
      stars
        .map((star) => `${star.x.toFixed(3)},${star.y.toFixed(3)}`)
        .join(";"),
  );
  const engraving = engraveFigure(
    points,
    figureEdges,
    lineStyle,
    seed,
  );

  return {
    points,
    chartCenter,
    chartRadius: box.size * 0.455,
    isolated: engraving.isolated,
    seed,
    engraving,
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
      x:
        box.x +
        box.padding * 0.3 +
        random() * (box.size - box.padding * 0.6),
      y:
        box.y +
        box.padding * 0.3 +
        random() * (box.size - box.padding * 0.6),
      r: 0.5 + random() * 1.2,
      opacity: 0.12 + random() * 0.34,
    });
  }
  return stars;
}
