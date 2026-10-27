#!/usr/bin/env node
/**
 * Export research logs for the self-improvement loop.
 *
 * Default output is an anonymized aggregate: no session ids, no generation ids,
 * no IP addresses. Pass --raw to write the detailed records to exports/ (which
 * is gitignored) for manual analysis.
 *
 * Usage:
 *   node --env-file-if-exists=.env.local scripts/export-logs.mjs
 *   node --env-file-if-exists=.env.local scripts/export-logs.mjs --days 14
 *   node --env-file-if-exists=.env.local scripts/export-logs.mjs --raw
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATA_DIR = path.join(ROOT, ".data");
const IMPROVEMENTS_DIR = path.join(ROOT, "improvements");
const EXPORTS_DIR = path.join(ROOT, "exports");

function dateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function parseJsonColumn(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function numericRating(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

async function readJsonl(file) {
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }

  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // A partially written line at the tail should not break an export.
    }
  }
  return entries;
}

async function loadLocalRecords(days) {
  const [generations, ratings] = await Promise.all([
    readJsonl(path.join(DATA_DIR, "generations.jsonl")),
    readJsonl(path.join(DATA_DIR, "ratings.jsonl")),
  ]);
  const ratingById = new Map(
    ratings
      .filter((rating) => typeof rating.generationId === "string")
      .map((rating) => [rating.generationId, rating]),
  );
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  return generations
    .filter((record) => {
      const time = Date.parse(record.createdAt);
      return Number.isFinite(time) && time >= cutoff;
    })
    .map((record) => {
      const rating = ratingById.get(record.id);
      return {
        ...record,
        rating: rating ? numericRating(rating.score) : null,
      };
    });
}

async function loadPostgresRecords(days) {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await sql`
    select
      g.id,
      g.session_id,
      g.created_at,
      g.variant,
      g.config_version,
      g.stars,
      g.edges,
      g.aspect,
      g.theme,
      g.attempt,
      g.result,
      g.source,
      g.model,
      g.latency_ms,
      r.score
    from generations g
    left join ratings r on r.generation_id = g.id
    where g.created_at >= ${cutoff}::timestamptz
    order by g.created_at desc
  `;

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    variant: row.variant,
    configVersion: Number(row.config_version),
    stars: parseJsonColumn(row.stars) ?? [],
    edges: parseJsonColumn(row.edges) ?? [],
    aspect: Number(row.aspect),
    theme: row.theme ?? "",
    attempt: Number(row.attempt),
    result: parseJsonColumn(row.result) ?? {},
    source: row.source,
    model: row.model,
    latencyMs: Number(row.latency_ms),
    rating: numericRating(row.score),
  }));
}

export async function loadRecords({ days = 30 } = {}) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    const records = await loadPostgresRecords(days);
    return { records, storage: "postgres" };
  }
  const records = await loadLocalRecords(days);
  return { records, storage: "local" };
}

function distribution(ratings) {
  const result = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const score of ratings) result[score] += 1;
  return result;
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index];
}

function baseStats(records) {
  const ratings = records
    .map((record) => record.rating)
    .filter((rating) => typeof rating === "number");
  const sum = ratings.reduce((total, score) => total + score, 0);
  const latencies = records
    .map((record) => Number(record.latencyMs))
    .filter((value) => Number.isFinite(value));
  return {
    generations: records.length,
    ratings: ratings.length,
    meanRating: ratings.length > 0 ? round(sum / ratings.length) : null,
    positiveRate:
      ratings.length > 0
        ? round(ratings.filter((score) => score >= 4).length / ratings.length, 3)
        : null,
    ratingDistribution: distribution(ratings),
    fallbackRate:
      records.length > 0
        ? round(
            records.filter((record) => record.source !== "llm").length /
              records.length,
            3,
          )
        : null,
    meanLatencyMs:
      latencies.length > 0
        ? Math.round(latencies.reduce((total, value) => total + value, 0) / latencies.length)
        : null,
    p95LatencyMs: percentile(latencies, 0.95),
  };
}

function groupBy(records, keyFn) {
  const groups = new Map();
  for (const record of records) {
    const key = keyFn(record);
    const list = groups.get(key);
    if (list) list.push(record);
    else groups.set(key, [record]);
  }
  return groups;
}

function groupedStats(records, keyFn) {
  const result = {};
  for (const [key, list] of groupBy(records, keyFn)) {
    result[key] = baseStats(list);
  }
  return result;
}

function motifStats(records) {
  const groups = groupBy(records, (record) => record.result?.motif ?? "unknown");
  return [...groups.entries()]
    .map(([motif, list]) => ({
      motif,
      ...baseStats(list),
    }))
    .sort((a, b) => b.generations - a.generations)
    .slice(0, 10);
}

function paletteStats(records) {
  const groups = groupBy(records, (record) => record.result?.paletteId ?? "unknown");
  return [...groups.entries()]
    .map(([paletteId, list]) => ({
      paletteId,
      ...baseStats(list),
    }))
    .sort((a, b) => b.generations - a.generations)
    .slice(0, 10);
}

function starBucket(record) {
  const count = Array.isArray(record.stars) ? record.stars.length : 0;
  if (count <= 4) return "3-4";
  if (count <= 6) return "5-6";
  if (count <= 8) return "7-8";
  return "9+";
}

export function summarize(records, config, days = 30) {
  const rated = records.filter((record) => typeof record.rating === "number");
  const variantLabels = new Map(
    (config.variants ?? []).map((variant) => [variant.id, variant.label]),
  );
  const recentThemes = [];
  const seenThemes = new Set();
  for (const record of records) {
    const theme = String(record.theme ?? "").trim();
    if (!theme || seenThemes.has(theme)) continue;
    seenThemes.add(theme);
    recentThemes.push(Array.from(theme).slice(0, 40).join(""));
    if (recentThemes.length >= 30) break;
  }

  const total = baseStats(records);
  const guardrails = config.guardrails ?? {};
  const sufficient =
    total.generations >= (guardrails.minGenerations ?? 0) &&
    total.ratings >= (guardrails.minRatings ?? 0);

  return {
    generatedAt: new Date().toISOString(),
    lookbackDays: days,
    storage: process.env.DATABASE_URL?.trim() ? "postgres" : "local",
    sufficient,
    minimums: {
      generations: guardrails.minGenerations ?? null,
      ratings: guardrails.minRatings ?? null,
    },
    total,
    ratedTotal: baseStats(rated),
    byVariant: Object.fromEntries(
      [...groupBy(records, (record) => record.variant ?? "unknown").entries()].map(
        ([variant, list]) => [
          variant,
          {
            label: variantLabels.get(variant) ?? variant,
            ...baseStats(list),
          },
        ],
      ),
    ),
    bySource: groupedStats(records, (record) => record.source ?? "unknown"),
    byModel: groupedStats(records, (record) => record.model ?? "unknown"),
    byStarCount: groupedStats(records, starBucket),
    byThemePresence: groupedStats(records, (record) =>
      String(record.theme ?? "").trim() ? "with-theme" : "without-theme",
    ),
    byAttempt: groupedStats(records, (record) =>
      Number(record.attempt) <= 1 ? "first" : "regenerated",
    ),
    byMotif: motifStats(records),
    byPalette: paletteStats(records),
    recentThemes,
    currentConfig: {
      version: config.version,
      variants: (config.variants ?? []).map((variant) => ({
        id: variant.id,
        label: variant.label,
        weight: variant.weight,
        temperature: variant.temperature,
      })),
      guardrails,
      lastImprovement: config.lastImprovement ?? null,
    },
  };
}

export async function exportLogs({
  days = 30,
  out,
  raw = false,
  quiet = false,
} = {}) {
  const configPath = path.join(ROOT, "config", "creativity.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const { records, storage } = await loadRecords({ days });
  const summary = summarize(records, config, days);
  summary.storage = storage;

  const stamp = dateStamp();
  const outPath = path.resolve(
    ROOT,
    out ?? path.join("improvements", `summary-${stamp}.json`),
  );
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  let rawPath = null;
  if (raw) {
    rawPath = path.join(EXPORTS_DIR, `raw-${stamp}.json`);
    await mkdir(EXPORTS_DIR, { recursive: true });
    await writeFile(
      rawPath,
      `${JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          lookbackDays: days,
          storage,
          records,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  if (!quiet) {
    console.log(`storage: ${storage}`);
    console.log(
      `generations: ${summary.total.generations}, ratings: ${summary.total.ratings}, mean: ${summary.total.meanRating ?? "n/a"}, sufficient: ${summary.sufficient}`,
    );
    console.log(`summary: ${path.relative(ROOT, outPath)}`);
    if (rawPath) console.log(`raw (gitignored): ${path.relative(ROOT, rawPath)}`);
  }

  return { summary, outPath, rawPath, storage };
}

function parseArgs(argv) {
  const options = { days: 30, raw: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--raw") {
      options.raw = true;
    } else if (argument === "--days") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) {
        options.days = Math.floor(value);
        index += 1;
      }
    } else if (argument.startsWith("--days=")) {
      const value = Number(argument.slice("--days=".length));
      if (Number.isFinite(value) && value > 0) options.days = Math.floor(value);
    } else if (argument === "--out") {
      options.out = argv[index + 1];
      index += 1;
    } else if (argument.startsWith("--out=")) {
      options.out = argument.slice("--out=".length);
    }
  }
  return options;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  exportLogs(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error("export-logs failed:", error);
    process.exitCode = 1;
  });
}
