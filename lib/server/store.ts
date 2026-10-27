import { neon } from "@neondatabase/serverless";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GenerationRecord, RatingRecord } from "@/lib/types";

export type StorageKind = "postgres" | "local" | "none";

const DATA_DIR = path.join(process.cwd(), ".data");
const GENERATIONS_FILE = path.join(DATA_DIR, "generations.jsonl");
const RATINGS_FILE = path.join(DATA_DIR, "ratings.jsonl");

const databaseUrl = process.env.DATABASE_URL?.trim();
const canUseLocalFiles = !process.env.VERCEL;
const hasDatabase = Boolean(databaseUrl);

type SqlClient = ReturnType<typeof neon>;

let sqlClient: SqlClient | null = null;
let schemaPromise: Promise<void> | null = null;
let localQueue: Promise<unknown> = Promise.resolve();

function getSql(): SqlClient {
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
  if (!sqlClient) {
    sqlClient = neon(databaseUrl);
  }
  return sqlClient;
}

export function getStorageKind(): StorageKind {
  if (hasDatabase) return "postgres";
  if (canUseLocalFiles) return "local";
  return "none";
}

async function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    const sql = getSql();
    await sql`
      create table if not exists generations (
        id uuid primary key,
        session_id text not null,
        created_at timestamptz not null,
        consent boolean not null default true,
        variant text not null,
        config_version integer not null,
        stars jsonb not null,
        edges jsonb not null,
        aspect double precision not null,
        theme text not null default '',
        attempt integer not null,
        result jsonb not null,
        source text not null,
        model text not null,
        latency_ms integer not null
      )
    `;
    await sql`
      create index if not exists generations_created_at_idx
      on generations (created_at desc)
    `;
    await sql`
      create index if not exists generations_session_idx
      on generations (session_id)
    `;
    await sql`
      create table if not exists ratings (
        generation_id uuid primary key references generations(id) on delete cascade,
        session_id text not null,
        score smallint not null check (score between 1 and 5),
        created_at timestamptz not null
      )
    `;
    await sql`
      create index if not exists ratings_created_at_idx
      on ratings (created_at desc)
    `;
  })();

  try {
    await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

function enqueueLocal<T>(task: () => Promise<T>): Promise<T> {
  const next = localQueue.then(task, task);
  localQueue = next.catch(() => undefined);
  return next;
}

async function ensureLocalFiles(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(GENERATIONS_FILE, "utf8");
  } catch {
    await writeFile(GENERATIONS_FILE, "", "utf8");
  }
  try {
    await readFile(RATINGS_FILE, "utf8");
  } catch {
    await writeFile(RATINGS_FILE, "", "utf8");
  }
}

async function appendLocalGeneration(record: GenerationRecord): Promise<void> {
  await enqueueLocal(async () => {
    await ensureLocalFiles();
    await appendFile(GENERATIONS_FILE, `${JSON.stringify(record)}\n`, "utf8");
  });
}

async function upsertLocalRating(record: RatingRecord): Promise<boolean> {
  return enqueueLocal(async () => {
    await ensureLocalFiles();
    const generationsRaw = await readFile(GENERATIONS_FILE, "utf8");
    const generation = generationsRaw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as GenerationRecord)
      .find((entry) => entry.id === record.generationId);

    if (!generation || generation.sessionId !== record.sessionId) {
      return false;
    }

    const ratingsRaw = await readFile(RATINGS_FILE, "utf8");
    const ratings = ratingsRaw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RatingRecord);
    const existingIndex = ratings.findIndex(
      (entry) => entry.generationId === record.generationId,
    );
    if (existingIndex >= 0) {
      ratings[existingIndex] = record;
    } else {
      ratings.push(record);
    }
    await writeFile(
      RATINGS_FILE,
      ratings.map((entry) => JSON.stringify(entry)).join("\n") +
        (ratings.length > 0 ? "\n" : ""),
      "utf8",
    );
    return true;
  });
}

export async function recordGeneration(
  record: GenerationRecord,
): Promise<boolean> {
  const storage = getStorageKind();
  if (storage === "none") return false;

  if (storage === "local") {
    await appendLocalGeneration(record);
    return true;
  }

  await ensureSchema();
  const sql = getSql();
  await sql`
    insert into generations (
      id, session_id, created_at, consent, variant, config_version, stars, edges,
      aspect, theme, attempt, result, source, model, latency_ms
    ) values (
      ${record.id},
      ${record.sessionId},
      ${record.createdAt},
      true,
      ${record.variant},
      ${record.configVersion},
      ${JSON.stringify(record.stars)}::jsonb,
      ${JSON.stringify(record.edges)}::jsonb,
      ${record.aspect},
      ${record.theme},
      ${record.attempt},
      ${JSON.stringify(record.result)}::jsonb,
      ${record.source},
      ${record.model},
      ${record.latencyMs}
    )
  `;
  return true;
}

export async function recordRating(record: RatingRecord): Promise<boolean> {
  const storage = getStorageKind();
  if (storage === "none") return false;

  if (storage === "local") {
    return upsertLocalRating(record);
  }

  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    insert into ratings (generation_id, session_id, score, created_at)
    select ${record.generationId}, ${record.sessionId}, ${record.score}, ${record.createdAt}
    where exists (
      select 1 from generations
      where id = ${record.generationId} and session_id = ${record.sessionId}
    )
    on conflict (generation_id) do update
      set score = excluded.score, created_at = excluded.created_at
    returning generation_id
  `;
  return Array.isArray(rows) && rows.length > 0;
}

export async function withStorageTimeout<T>(
  promise: Promise<T>,
  milliseconds = 4000,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
