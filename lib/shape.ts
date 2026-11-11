import type { FigureEdge, LineStyle, Point } from "./types";

const EPSILON = 1e-9;

export type ShapeOrientation =
  | "horizontal"
  | "vertical"
  | "diagonal"
  | "compact"
  | "balanced";

export type ShapeDensity = "tight" | "balanced" | "scattered";

export type ComponentKind = "chain" | "cycle" | "branch" | "mesh";

export type ComponentPathShape =
  | "straight"
  | "arc"
  | "zigzag"
  | "ring"
  | "branch"
  | "mesh";

export interface ShapeBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export interface ShapeComponent {
  stars: number[];
  edges: FigureEdge[];
  kind: ComponentKind;
  bounds: ShapeBounds;
  center: Point;
  orientation: Exclude<ShapeOrientation, "compact">;
  /** Principal axis of this component, in degrees from the horizontal. */
  angleDeg: number;
  elongation: number;
  pathShape: ComponentPathShape;
  position: string;
  cycleShape: "三角形" | "四角形" | "丸い輪" | null;
}

export interface ShapeAnalysis {
  aspect: number;
  bounds: ShapeBounds;
  centroid: Point;
  orientation: ShapeOrientation;
  angleDeg: number;
  elongation: number;
  relativeExtent: number;
  coverage: number;
  density: ShapeDensity;
  components: ShapeComponent[];
  isolated: number[];
  /** Spatial groups of unconnected stars. Empty when a line defines the figure. */
  clusters: number[][];
  edgeCount: number;
  hasLines: boolean;
  gestures: string[];
  summary: string;
}

function toWorld(star: Point, aspect: number): Point {
  return { x: star.x * aspect, y: 1 - star.y };
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

function boundsOf(points: Point[]): ShapeBounds {
  if (points.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, cx: 0, cy: 0 };
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function normalizeAngle(degrees: number): number {
  let angle = degrees % 180;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  return angle;
}

/** Principal axis of the point cloud, in degrees from the horizontal. */
function pca(points: Point[]): { angleDeg: number; elongation: number } {
  if (points.length < 2) return { angleDeg: 0, elongation: 1 };
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
  const n = points.length;
  xx /= n;
  yy /= n;
  xy /= n;

  const trace = xx + yy;
  const spread = Math.sqrt(Math.max(0, (xx - yy) * (xx - yy) + 4 * xy * xy));
  const major = (trace + spread) / 2;
  const minor = Math.max(EPSILON, (trace - spread) / 2);
  const angleDeg = normalizeAngle(
    (0.5 * Math.atan2(2 * xy, xx - yy) * 180) / Math.PI,
  );
  return { angleDeg, elongation: Math.sqrt(Math.max(0, major) / minor) };
}

function isDiagonal(angleDeg: number, elongation: number): boolean {
  return (
    elongation >= 1.45 &&
    Math.abs(angleDeg) >= 18 &&
    Math.abs(angleDeg) <= 72
  );
}

function classifyOrientation(
  bounds: ShapeBounds,
  angleDeg: number,
  elongation: number,
  relativeExtent: number,
): ShapeOrientation {
  const ratio = bounds.width / Math.max(EPSILON, bounds.height);
  if (relativeExtent < 0.4 && ratio > 0.72 && ratio < 1.38) return "compact";
  if (ratio >= 1.3) return "horizontal";
  if (ratio <= 0.77) return "vertical";
  if (isDiagonal(angleDeg, elongation)) return "diagonal";
  if (relativeExtent < 0.48) return "compact";
  return "balanced";
}

function positionOf(point: Point, bounds: ShapeBounds): string {
  if (bounds.width < 0.04 && bounds.height < 0.04) return "中央";
  const column =
    point.x < bounds.minX + bounds.width / 3
      ? "左"
      : point.x > bounds.maxX - bounds.width / 3
        ? "右"
        : "";
  const row =
    point.y > bounds.maxY - bounds.height / 3
      ? "上"
      : point.y < bounds.minY + bounds.height / 3
        ? "下"
        : "";
  if (column && row) return `${column}${row}`;
  return column || row || "中央";
}

function orientationWord(orientation: ShapeOrientation): string {
  switch (orientation) {
    case "horizontal":
      return "横長";
    case "vertical":
      return "縦長";
    case "diagonal":
      return "斜め";
    case "compact":
      return "小さくまとまった";
    default:
      return "横と縦が均衡した";
  }
}

function densityPhrase(density: ShapeDensity): string {
  switch (density) {
    case "tight":
      return "星は近い範囲に寄り集まっている";
    case "scattered":
      return "星は画面全体に広がっている";
    default:
      return "星はほどよく散らばっている";
  }
}

function graphComponents(starCount: number, edges: FigureEdge[]): number[][] {
  const adjacency = Array.from({ length: starCount }, () => new Set<number>());
  for (const [a, b] of edges) {
    adjacency[a].add(b);
    adjacency[b].add(a);
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

function orderPath(
  members: number[],
  adjacency: Set<number>[],
): number[] {
  if (members.length <= 2) return members;
  const endpoint = members.find((index) => adjacency[index].size === 1);
  if (endpoint === undefined) return [];
  const order = [endpoint];
  const visited = new Set([endpoint]);
  while (order.length < members.length) {
    const current = order[order.length - 1];
    const next = [...adjacency[current]].find((index) => !visited.has(index));
    if (next === undefined) break;
    order.push(next);
    visited.add(next);
  }
  return order.length === members.length ? order : [];
}

function pathShapeOf(
  order: number[],
  worldPoints: Point[],
  kind: ComponentKind,
): ComponentPathShape {
  if (kind === "cycle") return "ring";
  if (kind === "branch") return "branch";
  if (kind === "mesh") return "mesh";
  if (order.length < 3) return "straight";

  const turns: number[] = [];
  for (let index = 1; index < order.length - 1; index += 1) {
    const a = worldPoints[order[index - 1]];
    const b = worldPoints[order[index]];
    const c = worldPoints[order[index + 1]];
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const cross = v1x * v2y - v1y * v2x;
    const dot = v1x * v2x + v1y * v2y;
    turns.push((Math.atan2(cross, dot) * 180) / Math.PI);
  }

  const absolute = turns.reduce((sum, turn) => sum + Math.abs(turn), 0);
  const positive = turns.filter((turn) => turn > 4).length;
  const negative = turns.filter((turn) => turn < -4).length;
  const consistent =
    positive >= Math.ceil(turns.length * 0.7) ||
    negative >= Math.ceil(turns.length * 0.7);

  if (absolute < 22) return "straight";
  if (absolute > 55 && consistent) return "arc";
  if (absolute > 55) return "zigzag";
  return "straight";
}

function componentKind(degree: number[], members: number[], edges: number): ComponentKind {
  const maxDegree = Math.max(...members.map((index) => degree[index]));
  const isCycle =
    members.length >= 3 &&
    edges === members.length &&
    members.every((index) => degree[index] === 2);
  if (isCycle) return "cycle";
  if (edges === members.length - 1 && maxDegree <= 2) return "chain";
  if (maxDegree >= 3) return "branch";
  return "mesh";
}

function cycleShapeOf(members: number[]): ShapeComponent["cycleShape"] {
  if (members.length === 3) return "三角形";
  if (members.length === 4) return "四角形";
  return "丸い輪";
}

function componentDirection(component: ShapeComponent): string {
  if (component.kind === "cycle") {
    return component.orientation === "horizontal"
      ? "横長"
      : component.orientation === "vertical"
        ? "縦長"
        : "丸い";
  }
  if (component.orientation === "horizontal") return "横に伸びる";
  if (component.orientation === "vertical") return "縦に伸びる";
  if (component.orientation === "diagonal") return "斜めに伸びる";
  return "小さくまとまる";
}

function curveWord(pathShape: ComponentPathShape): string {
  if (pathShape === "arc") return "緩やかな弧";
  if (pathShape === "zigzag") return "折れ線";
  return "直線";
}

function componentClause(component: ShapeComponent): string {
  const count = component.stars.length;
  if (component.kind === "cycle") {
    return `${component.position}の${component.cycleShape ?? "輪"}（${count}星）`;
  }
  if (component.kind === "branch") {
    return `${component.position}の${count}星の枝分かれ`;
  }
  if (component.kind === "mesh") {
    return `${component.position}の${count}星の網`;
  }
  return `${component.position}の${count}星の鎖（${componentDirection(component)}・${curveWord(component.pathShape)}）`;
}

function analyzeComponents(
  stars: Point[],
  edges: FigureEdge[],
  aspect: number,
  overallBounds: ShapeBounds,
): ShapeComponent[] {
  const world = stars.map((star) => toWorld(star, aspect));
  const adjacency = Array.from({ length: stars.length }, () => new Set<number>());
  const degree = new Array<number>(stars.length).fill(0);
  for (const [a, b] of edges) {
    adjacency[a].add(b);
    adjacency[b].add(a);
    degree[a] += 1;
    degree[b] += 1;
  }

  const raw = graphComponents(stars.length, edges).map((members) => {
    const memberSet = new Set(members);
    const componentEdges = edges.filter(
      ([a, b]) => memberSet.has(a) && memberSet.has(b),
    );
    const points = members.map((index) => world[index]);
    const bounds = boundsOf(points);
    const center = meanPoint(points);
    const kind = componentKind(degree, members, componentEdges.length);
    const order =
      kind === "chain" ? orderPath(members, adjacency) : [];
    const pathShape = pathShapeOf(order, world, kind);
    const { angleDeg, elongation } = pca(points);
    const ratio = bounds.width / Math.max(EPSILON, bounds.height);
    const orientation: ShapeComponent["orientation"] =
      isDiagonal(angleDeg, elongation)
        ? "diagonal"
        : ratio >= 1.35
          ? "horizontal"
          : ratio <= 0.74
            ? "vertical"
            : "balanced";

    const coversMost =
      bounds.width > overallBounds.width * 0.72 &&
      bounds.height > overallBounds.height * 0.72;

    return {
      stars: members,
      edges: componentEdges,
      kind,
      bounds,
      center,
      orientation,
      angleDeg,
      elongation,
      pathShape,
      cycleShape: kind === "cycle" ? cycleShapeOf(members) : null,
      position: coversMost ? "中央" : positionOf(center, overallBounds),
    } satisfies ShapeComponent;
  });

  return raw.sort(
    (a, b) => b.stars.length - a.stars.length || a.stars[0] - b.stars[0],
  );
}

function isolatedClause(stars: Point[], isolated: number[], aspect: number, bounds: ShapeBounds): string {
  if (isolated.length === 0) return "";
  const groups = new Map<string, number>();
  for (const index of isolated) {
    const position = positionOf(toWorld(stars[index], aspect), bounds);
    groups.set(position, (groups.get(position) ?? 0) + 1);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([position, count]) => `${position}に孤立星が${count}つ`)
    .join("、");
}

function separationPhrase(components: ShapeComponent[], bounds: ShapeBounds): string {
  if (components.length < 2) return "";
  const diagonal = Math.hypot(bounds.width, bounds.height);
  if (diagonal < EPSILON) return "";
  let farthest = 0;
  for (let a = 0; a < components.length; a += 1) {
    for (let b = a + 1; b < components.length; b += 1) {
      farthest = Math.max(
        farthest,
        Math.hypot(
          components[a].center.x - components[b].center.x,
          components[a].center.y - components[b].center.y,
        ) / diagonal,
      );
    }
  }
  if (farthest > 0.5) return "まとまり同士は遠く離れている";
  if (farthest > 0.27) return "まとまり同士は離れている";
  return "まとまり同士は近くにある";
}

/**
 * Group unconnected stars by proximity. When no lines exist these spatial
 * groups are the only "parts" the drawing has, so the line-style suggestion
 * can read a tight cluster differently from a scattered field.
 */
function spatialClusters(points: Point[], bounds: ShapeBounds): number[][] {
  if (points.length < 2) return [];
  const diagonal = Math.hypot(bounds.width, bounds.height);
  const threshold = Math.max(0.055, Math.min(0.24, diagonal * 0.16));
  const parent = points.map((_, index) => index);

  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let current = index;
    while (parent[current] !== current) {
      const next = parent[current];
      parent[current] = root;
      current = next;
    }
    return root;
  };

  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      if (Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) <= threshold) {
        union(a, b);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let index = 0; index < points.length; index += 1) {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(index);
    else groups.set(root, [index]);
  }

  return [...groups.values()]
    .filter((group) => group.length >= 2)
    .sort((a, b) => b.length - a.length || a[0] - b[0]);
}

function farthestStarClause(
  stars: Point[],
  world: Point[],
  centroid: Point,
  bounds: ShapeBounds,
): string {
  if (stars.length < 3) return "";
  const distances = world.map((point) =>
    Math.hypot(point.x - centroid.x, point.y - centroid.y),
  );
  const mean =
    distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
  if (mean < EPSILON) return "";
  let index = 0;
  for (let i = 1; i < distances.length; i += 1) {
    if (distances[i] > distances[index]) index = i;
  }
  if (distances[index] < mean * 1.8) return "";
  const position = positionOf(world[index], bounds);
  if (position === "中央") return "";
  return `${position}に一つだけ離れた星がある`;
}

function gesturesOf(
  analysis: Omit<ShapeAnalysis, "gestures" | "summary">,
  separation: string,
): string[] {
  const gestures = new Set<string>();
  gestures.add(orientationWord(analysis.orientation));

  if (analysis.density === "tight") gestures.add("密集");
  if (analysis.density === "scattered") gestures.add("広がり");

  const chains = analysis.components.filter((component) => component.kind === "chain");
  const cycles = analysis.components.filter((component) => component.kind === "cycle");
  const branches = analysis.components.filter((component) => component.kind === "branch");

  if (chains.some((component) => component.pathShape === "arc")) gestures.add("弧を描く鎖");
  if (chains.some((component) => component.pathShape === "zigzag")) gestures.add("折れ線");
  if (chains.some((component) => component.orientation === "diagonal")) gestures.add("斜めの鎖");
  if (cycles.length > 0) gestures.add("輪");
  if (cycles.some((component) => component.cycleShape === "三角形")) gestures.add("三角形");
  if (branches.length > 0) gestures.add("枝分かれ");
  if (analysis.components.length >= 2) gestures.add("複数のまとまり");
  if (analysis.components.length >= 3) gestures.add("散らばる群れ");
  if (analysis.hasLines && analysis.isolated.length > 0) gestures.add("孤立星");
  if (!analysis.hasLines && analysis.clusters.length >= 2) {
    gestures.add("複数の星群");
  }
  if (separation.includes("遠く")) gestures.add("遠い群れ");

  return [...gestures].slice(0, 7);
}

/**
 * Suggest the engraving character that fits the graph. This is only a hint for
 * offline generation and for repairing an invalid model choice; the model may
 * choose another style when its reading of the drawing supports it.
 */
export function suggestLineStyle(analysis: ShapeAnalysis): LineStyle {
  const hasKind = (kind: ComponentKind) =>
    analysis.components.some((component) => component.kind === kind);
  const hasPathShape = (shape: ComponentPathShape) =>
    analysis.components.some((component) => component.pathShape === shape);

  if (hasKind("cycle")) return "radial";
  if (hasKind("mesh")) return "hard";
  if (hasKind("branch")) return "flowing";
  if (hasPathShape("arc")) return "flowing";
  if (hasPathShape("zigzag")) return "hard";
  if (analysis.components.length >= 2) return "delicate";
  if (analysis.orientation === "compact") return "delicate";
  if (analysis.hasLines && analysis.isolated.length > 0) return "radial";
  return "flowing";
}

/** Concrete visual nouns the model may transform into a name. */
export function shapeNameHints(analysis: ShapeAnalysis): string[] {
  const hints = new Set<string>();
  const add = (...words: string[]) => words.forEach((word) => hints.add(word));
  const hasKind = (kind: ComponentKind) =>
    analysis.components.some((component) => component.kind === kind);
  const hasPath = (shape: ComponentPathShape) =>
    analysis.components.some((component) => component.pathShape === shape);

  // Read the specific gesture first so its concrete metaphor survives the
  // hint limit even when the drawing also has a strong orientation.
  if (hasKind("branch")) add("鹿", "龍", "木", "鍵", "天秤", "珊瑚");
  if (hasKind("cycle")) add("冠", "月", "花", "瞳", "鏡", "貝");
  if (hasPath("arc")) add("弓", "三日月", "釣り針", "橋", "帆");
  if (analysis.hasLines && analysis.isolated.length > 0) {
    add("灯", "真珠", "種", "窓");
  }
  if (
    analysis.components.length >= 2 ||
    (!analysis.hasLines && analysis.clusters.length >= 2)
  ) {
    add("鳥", "魚", "蝶", "島", "蛍");
  }

  if (analysis.orientation === "horizontal") {
    add("帆", "橋", "舟", "翼", "岸", "鯨");
  }
  if (analysis.orientation === "vertical") {
    add("塔", "灯", "柱", "梯子", "木", "槍");
  }
  if (analysis.orientation === "diagonal") {
    add("矢", "坂", "舵", "槍", "流星", "鳥");
  }
  if (analysis.orientation === "compact") {
    add("巣", "実", "玉", "瞳", "貝", "鈴");
  }
  if (analysis.orientation === "balanced") {
    add("鏡", "鈴", "鍵", "庭", "門");
  }
  if (analysis.density === "tight") add("巣", "実", "真珠");
  if (analysis.density === "scattered") add("野", "海", "島", "蛍");

  return [...hints].slice(0, 10);
}

/**
 * Read the actual geometry of the constellation: orientation, density,
 * separate groups, isolated stars, chains/cycles/branches and curvature.
 * The summary is written for the LLM prompt and for the result panel.
 */
export function analyzeShape(
  stars: Point[],
  edges: FigureEdge[],
  aspect: number,
): ShapeAnalysis {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const world = stars.map((star) => toWorld(star, safeAspect));
  const bounds = boundsOf(world);
  const centroid = meanPoint(world);
  const { angleDeg, elongation } = pca(world);
  const relativeExtent = Math.max(
    bounds.width / safeAspect,
    bounds.height,
  );
  const coverage = (bounds.width * bounds.height) / safeAspect;
  const orientation = classifyOrientation(
    bounds,
    angleDeg,
    elongation,
    relativeExtent,
  );
  const density: ShapeDensity =
    relativeExtent > 0.82
      ? "scattered"
      : relativeExtent < 0.48 || coverage < 0.1
        ? "tight"
        : "balanced";

  const components = analyzeComponents(stars, edges, safeAspect, bounds);
  const hasLines = edges.length > 0;
  const connected = new Set(components.flatMap((component) => component.stars));
  const isolated = stars
    .map((_, index) => index)
    .filter((index) => !connected.has(index));
  const clusters = hasLines ? [] : spatialClusters(world, bounds);
  const separation = separationPhrase(components, bounds);

  const parts: string[] = [];
  const ratio = bounds.width / Math.max(EPSILON, bounds.height);
  parts.push(`全体は${orientationWord(orientation)}${
    orientation === "horizontal"
      ? `（幅:高さ ≒ ${ratio.toFixed(1)}:1）`
      : orientation === "vertical"
        ? `（高さ:幅 ≒ ${(1 / Math.max(EPSILON, ratio)).toFixed(1)}:1）`
        : ""
  }`);
  parts.push(densityPhrase(density));

  const centroidPosition = positionOf(centroid, bounds);
  if (centroidPosition !== "中央") {
    parts.push(`星の重心は${centroidPosition}寄り`);
  }

  if (components.length === 0) {
    const far = farthestStarClause(stars, world, centroid, bounds);
    if (clusters.length >= 2) {
      parts.push(
        `星は${clusters.length}つのまとまりに分かれている${
          far ? `。${far}` : ""
        }。線はまだ引かれていない`,
      );
    } else {
      parts.push(
        far
          ? `${far}。線はまだ引かれていない`
          : "線はまだ引かれていない。星の配置だけで形を読む",
      );
    }
  } else {
    for (const component of components.slice(0, 3)) {
      parts.push(componentClause(component));
    }
    if (components.length > 3) {
      parts.push(`ほか${components.length - 3}群`);
    }
    if (separation) parts.push(separation);
    const isolatedText = isolatedClause(stars, isolated, safeAspect, bounds);
    if (isolatedText) parts.push(isolatedText);
  }

  const base = {
    aspect: safeAspect,
    bounds,
    centroid,
    orientation,
    angleDeg,
    elongation,
    relativeExtent,
    coverage,
    density,
    components,
    isolated,
    clusters,
    edgeCount: edges.length,
    hasLines,
  };
  const gestures = gesturesOf(base, separation);
  return {
    ...base,
    gestures,
    summary: `${parts.join("。")}。`,
  };
}
