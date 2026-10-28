export type Tool = "move" | "star" | "line";

export type ConsentMode = "research" | "local";

export interface Point {
  x: number;
  y: number;
}

/** A star in normalized stage coordinates. (0,0) is top-left, (1,1) bottom-right. */
export interface Star extends Point {
  id: string;
}

/** An edge between two stars, stored as star ids while editing. */
export interface Edge {
  a: string;
  b: string;
}

/** An edge between two stars, stored as indices for generated artwork. */
export type FigureEdge = [number, number];

export interface ConstellationResult {
  name: string;
  reading: string;
  motif: string;
  paletteId: string;
  epithet: string;
  story: string;
  figureEdges: FigureEdge[];
  keywords: string[];
  /** A short, geometry-grounded reading of the drawing. */
  formReading?: string;
}

export type GenerationSource = "llm" | "fallback" | "offline";

export interface GenerationResponse {
  id: string;
  result: ConstellationResult;
  source: GenerationSource;
  model: string;
  variant: string;
  configVersion: number;
  latencyMs: number;
  createdAt: string;
}

export interface GalleryItem {
  id: string;
  result: ConstellationResult;
  stars: Point[];
  edges: FigureEdge[];
  aspect: number;
  createdAt: string;
  source: GenerationSource;
  rating?: number;
}

export interface ApiGenerateRequest {
  sessionId: string;
  /** The generation endpoint is research-only; local play never calls it. */
  consent: true;
  stars: Point[];
  edges: FigureEdge[];
  aspect: number;
  theme: string;
  attempt: number;
}

export interface ApiRateRequest {
  generationId: string;
  sessionId: string;
  score: number;
}

export interface GenerationRecord {
  id: string;
  sessionId: string;
  createdAt: string;
  variant: string;
  configVersion: number;
  stars: Point[];
  edges: FigureEdge[];
  aspect: number;
  theme: string;
  attempt: number;
  result: ConstellationResult;
  source: GenerationSource;
  model: string;
  latencyMs: number;
}

export interface RatingRecord {
  generationId: string;
  sessionId: string;
  score: number;
  createdAt: string;
}
