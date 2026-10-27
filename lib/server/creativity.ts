import rawConfig from "@/config/creativity.json";
import { hashString } from "@/lib/geometry";

export interface CreativityVariant {
  id: string;
  label: string;
  weight: number;
  temperature: number;
  style: string;
  naming: string;
  story: string;
  avoid: string[];
}

export interface CreativityGuardrails {
  minRatings: number;
  minGenerations: number;
  lookbackDays: number;
  minWeight: number;
  maxWeight: number;
  minEdges: number;
  maxEdges: number;
  nameMin: number;
  nameMax: number;
  storyMin: number;
  storyMax: number;
  temperatureMin: number;
  temperatureMax: number;
}

export interface LastImprovement {
  at: string;
  rationale: string;
  sampleSize: number;
}

export interface CreativityConfig {
  version: number;
  updatedAt: string;
  variants: CreativityVariant[];
  guardrails: CreativityGuardrails;
  lastImprovement?: LastImprovement | null;
}

export const creativityConfig = rawConfig as unknown as CreativityConfig;

/**
 * Stable between-subjects assignment: a browser session keeps the same
 * variant for the life of a config version, so repeated generations within a
 * session are not silently mixing experimental conditions.
 */
export function chooseVariant(
  sessionId: string,
  config: CreativityConfig = creativityConfig,
): CreativityVariant {
  const variants = config.variants.filter((variant) => variant.weight > 0);
  if (variants.length === 0) return config.variants[0];
  if (variants.length === 1) return variants[0];

  const total = variants.reduce((sum, variant) => sum + variant.weight, 0);
  const ticket =
    (hashString(`${sessionId}:${config.version}`) / 4294967296) * total;
  let running = 0;

  for (const variant of variants) {
    running += variant.weight;
    if (ticket <= running) return variant;
  }

  return variants[variants.length - 1];
}
