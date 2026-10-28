import {
  MAX_FIGURE_EDGES,
  normalizeEdgePairs,
  repairFigureEdges,
} from "./edges";
import { buildFallback, defaultPaletteForMotif } from "./fallback";
import { MOTIF_IDS } from "./motifs";
import { PALETTE_IDS } from "./palettes";
import { analyzeShape, bestMotifForShape, motifFitScore } from "./shape";
import type {
  ApiGenerateRequest,
  ApiRateRequest,
  ConstellationResult,
  FigureEdge,
  Point,
} from "./types";

export class ValidationError extends Error {
  status: number;

  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
  }
}

const SESSION_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

/** Real constellations we do not want an invented constellation to shadow. */
const REAL_CONSTELLATIONS = new Set(
  [
    "オリオン",
    "カシオペヤ",
    "おおぐま",
    "こぐま",
    "はくちょう",
    "わし",
    "さそり",
    "しし",
    "おとめ",
    "てんびん",
    "やぎ",
    "みずがめ",
    "うお",
    "おひつじ",
    "おうし",
    "かに",
    "ふたご",
    "きりん",
    "かみのけ",
    "りゅう",
    "ケフェウス",
    "アンドロメダ",
    "ペルセウス",
    "ペガスス",
    "ヘルクレス",
    "へびつかい",
    "へび",
    "こと",
    "いるか",
    "こうま",
    "うさぎ",
    "はと",
    "くじゃく",
    "ほうおう",
    "つる",
    "みなみじゅうじ",
    "ケンタウルス",
    "おおいぬ",
    "こいぬ",
    "うみへび",
    "ろくぶんぎ",
    "コンパス",
    "ぼうえんきょう",
    "けんびきょう",
    "がか",
    "とけい",
    "ネット",
    "レチクル",
    "テーブルさん",
    "とびうお",
    "さんかく",
    "や",
    "とかげ",
    // 漢字・別名でも実在の星座と衝突しないようにする。
    "鯨",
    "狐",
    "龍",
    "竜",
    "冠",
    "舟",
    "鹿",
    "猫",
    "山",
    "魚",
    "鳥",
    "蛇",
    "鷲",
    "白鳥",
    "小熊",
    "大熊",
    "琴",
    "南十字",
    "孔雀",
    "鳳凰",
    "鶴",
    "蠍",
    "蟹",
    "獅子",
    "乙女",
    "天秤",
    "山羊",
    "水瓶",
    "牡羊",
    "牡牛",
    "双子",
    "射手",
    "大犬",
    "小犬",
    "海蛇",
    "帆",
    "羅針盤",
    "望遠鏡",
    "顕微鏡",
    "画架",
    "時計",
    "網",
    "定規",
    "飛魚",
    "三角",
    "矢",
    "蜥蜴",
    "髪",
    "王",
    "后",
    "武仙",
    "蛇遣",
    "海豚",
    "仔馬",
    "兎",
    "鳩",
    "狼",
    "祭壇",
    "南の魚",
    "カメレオン",
    "ハエ",
    "コンパス",
    "テーブル山",
  ].map((name) => name.replace(/座$/, "")),
);

const KANA_PATTERN = /^[\u3040-\u30ff\u30fc\s・]+$/;

function clean(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanTheme(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/**
 * The generated name is always a constellation name, so the UI can read
 * naturally as「〜座」. If a model omits the suffix, add it when it still fits
 * the 12-character guardrail.
 */
export function ensureConstellationSuffix(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.endsWith("座")) return trimmed;
  return Array.from(trimmed).length < 12 ? `${trimmed}座` : trimmed;
}

export function isAcceptableName(name: string): boolean {
  const trimmed = name.trim();
  const length = Array.from(trimmed).length;
  if (length < 2 || length > 12) return false;
  if (!trimmed.endsWith("座")) return false;
  if (/[<>{}[\]\\/|]/.test(trimmed)) return false;
  const normalized = trimmed.replace(/\s+/g, "").replace(/座$/, "");
  return normalized.length > 0 && !REAL_CONSTELLATIONS.has(normalized);
}

export function isKanaReading(reading: string): boolean {
  const length = Array.from(reading).length;
  return length >= 2 && length <= 24 && KANA_PATTERN.test(reading);
}

function parseStars(raw: unknown): Point[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError("星の配置が正しくありません。");
  }
  if (raw.length < 3 || raw.length > 16) {
    throw new ValidationError("星は3個以上16個以下で配置してください。");
  }

  const stars: Point[] = raw.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new ValidationError(`星 ${index + 1} の座標が正しくありません。`);
    }
    const x = Number((entry as { x?: unknown }).x);
    const y = Number((entry as { y?: unknown }).y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
      throw new ValidationError(`星 ${index + 1} の座標が範囲外です。`);
    }
    return { x, y };
  });

  return stars;
}

function parseEdges(raw: unknown, starCount: number): FigureEdge[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length > 80) {
    throw new ValidationError("線分が多すぎます。");
  }
  const edges = normalizeEdgePairs(raw, starCount);
  if (edges.length > MAX_FIGURE_EDGES) {
    throw new ValidationError("線分が多すぎます。");
  }
  return edges;
}

export function parseGenerateRequest(value: unknown): ApiGenerateRequest {
  if (typeof value !== "object" || value === null) {
    throw new ValidationError("リクエストが空です。");
  }

  const body = value as Record<string, unknown>;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!SESSION_PATTERN.test(sessionId)) {
    throw new ValidationError("セッションIDが正しくありません。");
  }

  if (body.consent !== true) {
    throw new ValidationError("研究利用への同意が必要です。");
  }

  const stars = parseStars(body.stars);
  const edges = parseEdges(body.edges, stars.length);
  const aspect = Number(body.aspect);
  if (!Number.isFinite(aspect) || aspect < 0.2 || aspect > 5) {
    throw new ValidationError("画面比率が正しくありません。");
  }

  const attempt = Number(body.attempt);
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 999) {
    throw new ValidationError("試行回数が正しくありません。");
  }

  return {
    sessionId,
    consent: true,
    stars,
    edges,
    aspect: Math.min(5, Math.max(0.2, aspect)),
    theme: cleanTheme(body.theme),
    attempt,
  };
}

export function parseRateRequest(value: unknown): ApiRateRequest {
  if (typeof value !== "object" || value === null) {
    throw new ValidationError("リクエストが空です。");
  }
  const body = value as Record<string, unknown>;
  const generationId = typeof body.generationId === "string" ? body.generationId : "";
  if (!/^[a-f0-9-]{36}$/i.test(generationId)) {
    throw new ValidationError("星座IDが正しくありません。");
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!SESSION_PATTERN.test(sessionId)) {
    throw new ValidationError("セッションIDが正しくありません。");
  }
  const score = Number(body.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new ValidationError("評価は1〜5で指定してください。");
  }
  return { generationId, sessionId, score };
}

export interface CoerceContext {
  stars: Point[];
  sketchEdges: FigureEdge[];
  aspect: number;
  theme: string;
  attempt: number;
}

export interface CoerceOutcome {
  result: ConstellationResult;
  /** True when at least one LLM field had to be replaced by the local generator. */
  repaired: boolean;
  rejectedFields: string[];
}

/**
 * Coerce model output into a guaranteed-playable constellation. The result
 * remains primarily generative, but a bad field never breaks the experience.
 */
export function coerceConstellationResult(
  raw: unknown,
  context: CoerceContext,
): CoerceOutcome {
  const rejectedFields: string[] = [];
  const source = typeof raw === "object" && raw !== null
    ? (raw as Record<string, unknown>)
    : {};

  const rawMotif = typeof source.motif === "string" ? source.motif : "";
  const motif = MOTIF_IDS.includes(rawMotif) ? rawMotif : "";
  if (!motif) rejectedFields.push("motif");

  const fallback = buildFallback({
    stars: context.stars,
    sketchEdges: context.sketchEdges,
    aspect: context.aspect,
    theme: context.theme,
    attempt: context.attempt,
    motifId: motif || undefined,
  });

  let paletteId =
    typeof source.paletteId === "string" && PALETTE_IDS.includes(source.paletteId)
      ? source.paletteId
      : "";
  if (!paletteId) {
    paletteId = motif ? defaultPaletteForMotif(motif) : fallback.paletteId;
    rejectedFields.push("paletteId");
  }

  const rawName = clean(source.name, 24);
  const nameWithSuffix = ensureConstellationSuffix(rawName);
  const nameNormalized = nameWithSuffix !== rawName;
  const usableName = isAcceptableName(nameWithSuffix);
  if (!usableName || nameNormalized) rejectedFields.push("name");

  const rawReading = clean(source.reading, 24);
  const readingCandidate =
    rawReading && !rawReading.endsWith("ざ") && Array.from(rawReading).length < 24
      ? `${rawReading}ざ`
      : rawReading;
  const usableReading = usableName && isKanaReading(readingCandidate);
  if (usableName && !usableReading) rejectedFields.push("reading");

  const name = usableName ? nameWithSuffix : fallback.name;
  const reading = usableName
    ? usableReading
      ? readingCandidate
      : ""
    : fallback.reading;

  const rawStory = clean(source.story, 320);
  const storyLength = Array.from(rawStory).length;
  let story = fallback.story;
  if (storyLength >= 30) {
    story = Array.from(rawStory).slice(0, 220).join("");
  } else {
    rejectedFields.push("story");
  }

  const rawEpithet = clean(source.epithet, 40);
  const epithet = rawEpithet.length >= 2 ? rawEpithet : fallback.epithet;
  if (rawEpithet.length < 2) rejectedFields.push("epithet");

  const rawKeywords = Array.isArray(source.keywords)
    ? source.keywords
        .map((keyword) => clean(keyword, 12))
        .filter((keyword) => keyword.length > 0)
        .slice(0, 4)
    : [];
  const keywords = rawKeywords.length > 0 ? rawKeywords : fallback.keywords;
  if (rawKeywords.length === 0) rejectedFields.push("keywords");

  // The hand-drawn figure is the composition, not a suggestion. If the user
  // drew lines, every one of them is kept exactly as drawn, including
  // separate groups and stars that were left untouched. The public endpoint
  // enforces the 60-line limit explicitly; this layer never truncates silently.
  const sketchEdges = normalizeEdgePairs(
    context.sketchEdges,
    context.stars.length,
  );
  let figureEdges: FigureEdge[];
  if (sketchEdges.length > 0) {
    figureEdges = sketchEdges;
  } else {
    const repairedEdges = repairFigureEdges(source.figureEdges, context.stars);
    if (repairedEdges) {
      figureEdges = repairedEdges;
    } else {
      figureEdges = fallback.figureEdges;
      rejectedFields.push("figureEdges");
    }
  }

  // Read the final drawing — the user's lines when present, otherwise the
  // proposed figure — and let the silhouette gently correct a motif that
  // clearly contradicts it. A merely unusual motif is left untouched.
  const analysis = analyzeShape(context.stars, figureEdges, context.aspect);
  const bestMotif = bestMotifForShape(analysis);
  let finalMotif = motif || fallback.motif;
  if (motif) {
    const fit = motifFitScore(motif, analysis);
    if (fit <= -1 && bestMotif.score >= 3 && bestMotif.score - fit >= 4) {
      finalMotif = bestMotif.id;
      rejectedFields.push("motifShape");
    }
  }

  const rawFormReading = clean(source.formReading, 260);
  const formLength = Array.from(rawFormReading).length;
  const geometryWords = [
    "横",
    "縦",
    "斜め",
    "弧",
    "曲",
    "輪",
    "鎖",
    "枝",
    "孤立",
    "離れ",
    "密集",
    "密",
    "広が",
    "重心",
    "まとま",
    "上",
    "下",
    "左",
    "右",
  ];
  let formReading = analysis.summary;
  if (formLength >= 8) {
    const grounded = geometryWords.some((word) => rawFormReading.includes(word));
    if (grounded) {
      formReading = Array.from(rawFormReading).slice(0, 180).join("");
    } else {
      rejectedFields.push("formReading");
    }
  } else {
    rejectedFields.push("formReading");
  }

  return {
    result: {
      name,
      reading,
      motif: finalMotif,
      paletteId,
      epithet,
      story,
      figureEdges,
      keywords,
      formReading,
    },
    repaired: rejectedFields.length > 0,
    rejectedFields,
  };
}
