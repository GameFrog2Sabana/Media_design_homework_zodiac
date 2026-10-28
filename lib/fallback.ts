import {
  MAX_FIGURE_EDGES,
  analyzeSketch,
  augmentEdges,
  mstEdges,
  normalizeEdgePairs,
  type SketchTopology,
} from "./edges";
import { hashString, mulberry32 } from "./geometry";
import { getMotif, MOTIFS, MOTIF_IDS } from "./motifs";
import { PALETTE_IDS } from "./palettes";
import { analyzeShape, type ShapeAnalysis } from "./shape";
import type { ConstellationResult, FigureEdge, Point } from "./types";

export interface FallbackInput {
  stars: Point[];
  sketchEdges?: FigureEdge[];
  aspect?: number;
  theme?: string;
  attempt?: number;
  motifId?: string;
}

const PREFIXES = [
  { text: "眠り", kana: "ねむり" },
  { text: "灯守り", kana: "ひもり" },
  { text: "遠雷", kana: "えんらい" },
  { text: "潮騒", kana: "しおさい" },
  { text: "星巡り", kana: "ほしめぐり" },
  { text: "黄昏", kana: "たそがれ" },
  { text: "白夜", kana: "びゃくや" },
  { text: "静寂", kana: "せいじゃく" },
  { text: "硝子", kana: "がらす" },
  { text: "夢渡り", kana: "ゆめわたり" },
  { text: "春待ち", kana: "はるまち" },
  { text: "月影", kana: "つきかげ" },
];

const SUFFIXES = [
  { text: "帰り", kana: "がえり" },
  { text: "記憶", kana: "きおく" },
  { text: "ゆりかご", kana: "ゆりかご" },
  { text: "航路", kana: "こうろ" },
  { text: "ひかり", kana: "ひかり" },
  { text: "しずく", kana: "しずく" },
  { text: "季節", kana: "きせつ" },
  { text: "まどろみ", kana: "まどろみ" },
  { text: "祈り", kana: "いのり" },
  { text: "抜け道", kana: "ぬけみち" },
];

const ADJECTIVES = [
  { text: "星待つ", kana: "ほしまつ" },
  { text: "灯る", kana: "ともる" },
  { text: "眠れない", kana: "ねむれない" },
  { text: "遠い", kana: "とおい" },
  { text: "白い", kana: "しろい" },
  { text: "小さな", kana: "ちいさな" },
  { text: "夜明けの", kana: "よあけの" },
];

const SEASONS = [
  { jp: "雪解けの朝", label: "雪解け" },
  { jp: "潮の引く夕べ", label: "潮騒" },
  { jp: "月のない夜", label: "無月" },
  { jp: "遠雷のあと", label: "遠雷" },
  { jp: "春の宵", label: "春宵" },
  { jp: "星が降る前", label: "星待ち" },
  { jp: "霧の晴れ間", label: "霧晴れ" },
  { jp: "秋の終わり", label: "晩秋" },
];

const MYTH_OPENINGS = [
  "古い神話では、",
  "星がまだ名を持たなかった頃、",
  "海と空の境がまだあいまいだった頃、",
  "遠い国の語り部が伝えるには、",
  "誰も知らない神の庭で、",
  "月がまだ空に上がったばかりの頃、",
];

const ACTIONS = [
  "灯りをともしていた",
  "遠い海を渡る舟を見送っていた",
  "誰かの帰りを待っていた",
  "名前のない歌を覚えていた",
  "星の順番を数えていた",
  "夢の在りかを測っていた",
  "夜の底で小さく息をしていた",
  "忘れられた道しるべを直していた",
];

const AFTERMATHS = [
  "その胸には小さな星座がひとつ、消えずに残った",
  "足あとは波にさらわれ、光だけが岸に残った",
  "遠くの窓がひとつだけ、同じリズムで瞬いた",
  "風が通るたび、星の順番が少しだけ入れ替わった",
  "誰も知らない名前が、そっと空に置かれた",
  "長い旅の途中で、いくつもの夜を数え直した",
];

const ENDINGS = [
  "同じ場所でまた瞬く",
  "静かにこちらの空を見ている",
  "小さな灯りをともしている",
  "名前を呼ばれるのを待っている",
  "見上げる人にだけ姿を変える",
  "遠い潮の音を運んでくる",
];

const EPITHETS = [
  "静かな航路を照らす星座",
  "遠い帰り道を覚えている星座",
  "小さな願いを預かる星座",
  "夜ごと名前を変える星座",
  "灯を絶やさない者の星座",
  "海と空のあわいに浮かぶ星座",
];

const QUALITIES = ["静謐", "遠景", "灯火", "潮", "余白", "気配", "夜想", "航路"];

const STRUCTURE_PREFIXES: Record<
  "twoParts" | "manyParts" | "isolated" | "cycle" | "branch" | "path",
  Array<{ text: string; kana: string }>
> = {
  twoParts: [
    { text: "ふたつの", kana: "ふたつの" },
    { text: "遠い", kana: "とおい" },
    { text: "群れの", kana: "むれの" },
  ],
  manyParts: [
    { text: "散り星の", kana: "ちりぼしの" },
    { text: "群れの", kana: "むれの" },
    { text: "星々の", kana: "ほしぼしの" },
  ],
  isolated: [
    { text: "余白の", kana: "よはくの" },
    { text: "孤星の", kana: "こぼしの" },
  ],
  cycle: [
    { text: "巡りの", kana: "めぐりの" },
    { text: "環の", kana: "わの" },
  ],
  branch: [
    { text: "三又の", kana: "みつまたの" },
    { text: "枝の", kana: "えだの" },
  ],
  path: [
    { text: "渡りの", kana: "わたりの" },
    { text: "鎖の", kana: "くさりの" },
  ],
};

const THEME_HINTS: Array<{ words: string[]; motif: string }> = [
  { words: ["海", "潮", "波", "船", "舟", "港", "灯台"], motif: "whale" },
  { words: ["旅", "舟", "航海", "出発", "港"], motif: "ship" },
  { words: ["森", "狐", "きつね", "秋", "実り"], motif: "fox" },
  { words: ["龍", "竜", "雨", "雷", "天"], motif: "dragon" },
  { words: ["鳥", "空", "風", "翼", "渡り"], motif: "bird" },
  { words: ["花", "春", "庭", "咲", "実"], motif: "bloom" },
  { words: ["王", "冠", "誓い", "勝利"], motif: "crown" },
  { words: ["鹿", "森", "山", "静けさ"], motif: "deer" },
  { words: ["灯", "火", "部屋", "窓", "夜"], motif: "lantern" },
  { words: ["鍵", "扉", "秘密", "記憶"], motif: "key" },
  { words: ["月", "夜", "満ち欠け", "銀"], motif: "moon" },
  { words: ["猫", "家", "窓辺", "眠り"], motif: "cat" },
  { words: ["蝶", "夢", "変身", "花"], motif: "butterfly" },
  { words: ["山", "峰", "谷", "遠景"], motif: "mountain" },
  { words: ["魚", "水", "川", "海"], motif: "fish" },
  { words: ["目", "眼", "見る", "瞳", "星"], motif: "eye" },
];

const MOTIF_PALETTE: Record<string, string> = {
  whale: "tide",
  fox: "ember",
  dragon: "violet",
  bird: "astral",
  bloom: "rose",
  crown: "astral",
  ship: "tide",
  deer: "jade",
  lantern: "ember",
  key: "jade",
  moon: "violet",
  cat: "astral",
  butterfly: "rose",
  mountain: "jade",
  fish: "tide",
  eye: "violet",
};

export function defaultPaletteForMotif(motifId: string): string {
  return MOTIF_PALETTE[motifId] ?? PALETTE_IDS[0];
}

const GROUP_MOTIFS = ["bird", "fish", "butterfly"];
const SOLITARY_MOTIFS = ["lantern", "moon", "eye"];

function chooseMotif(
  theme: string,
  rng: () => number,
  topology: SketchTopology,
  analysis: ShapeAnalysis,
): string {
  const ranked = analysis.motifMatches;
  if (ranked.length === 0) return MOTIF_IDS[0];
  const topScore = ranked[0].score;
  const shapeCandidate = (ids: string[]): string | null =>
    ranked.find(
      (match) => ids.includes(match.id) && match.score >= topScore - 2,
    )?.id ?? null;

  // Separate line groups read as a flock or a school. Prefer a motif that can
  // hold several bodies, but only when it still suits the silhouette.
  if (topology.hasLines && topology.partCount >= 2) {
    const group = shapeCandidate(GROUP_MOTIFS);
    if (group) return group;
  }
  const hint = THEME_HINTS.find((entry) =>
    entry.words.some((word) => theme.includes(word)),
  );
  if (hint) {
    const match = ranked.find((candidate) => candidate.id === hint.motif);
    if (match && match.score >= topScore - 3) return hint.motif;
  }
  if (topology.hasLines && topology.isolated.length > 0) {
    const solitary = shapeCandidate(SOLITARY_MOTIFS);
    if (solitary) return solitary;
  }

  // Keep a little variation among motifs that fit the shape equally well.
  const shortlist = ranked.filter((match) => match.score >= topScore - 1);
  return shortlist[Math.floor(rng() * shortlist.length)]?.id ?? ranked[0].id;
}

function charLength(value: string): number {
  return Array.from(value).length;
}

function structurePrefix(
  topology: SketchTopology,
  rng: () => number,
): { text: string; kana: string } | null {
  if (!topology.hasLines) return null;
  const pool =
    topology.partCount >= 3
      ? STRUCTURE_PREFIXES.manyParts
      : topology.partCount === 2
        ? STRUCTURE_PREFIXES.twoParts
        : topology.isolated.length > 0
          ? STRUCTURE_PREFIXES.isolated
          : topology.hasCycle
            ? STRUCTURE_PREFIXES.cycle
            : topology.hasBranch
              ? STRUCTURE_PREFIXES.branch
              : STRUCTURE_PREFIXES.path;
  return pool[Math.floor(rng() * pool.length)];
}

function topologyClause(topology: SketchTopology): string {
  if (!topology.hasLines) return "";
  if (topology.partCount >= 2) {
    const base = `空には${topology.partCount}つの離れたまとまりとして残った`;
    if (topology.isolated.length > 0) {
      return `${base}。線に連ならない${topology.isolated.length}つの星は、余白のようにそのそばで瞬いている。`;
    }
    return `${base}。`;
  }
  if (topology.isolated.length > 0) {
    return `線に連ならない${topology.isolated.length}つの星は、余白のようにそのそばで瞬いている。`;
  }
  if (topology.hasCycle) {
    return "星は輪になって、夜ごと同じ場所を巡っている。";
  }
  if (topology.hasBranch) {
    return "枝分かれした線の先で、星がいくつも別の夜を指している。";
  }
  return "星は長い鎖になって、遠い港へと続いている。";
}

function topologyEpithet(topology: SketchTopology): string | null {
  if (!topology.hasLines) return null;
  if (topology.partCount >= 2 && topology.isolated.length > 0) {
    return "離れた星々を抱く星座";
  }
  if (topology.partCount >= 2) {
    return `${topology.partCount}つのまとまりを結ぶ星座`;
  }
  if (topology.isolated.length > 0) return "余白の星を連れた星座";
  if (topology.hasCycle) return "輪を描いて巡る星座";
  if (topology.hasBranch) return "枝分かれの先を照らす星座";
  return "鎖のように連なる星座";
}

const GROUP_SUBJECTS: Record<string, string> = {
  bird: "鳥たち",
  fish: "魚たち",
  butterfly: "蝶たち",
};

function structureKeyword(topology: SketchTopology): string | null {
  if (!topology.hasLines) return null;
  if (topology.partCount >= 2) return "分かれ星";
  if (topology.isolated.length > 0) return "余白";
  if (topology.hasCycle) return "巡り";
  if (topology.hasBranch) return "枝分かれ";
  return "連なり";
}

function shapeKeyword(analysis: ShapeAnalysis): string | null {
  if (analysis.components.some((component) => component.pathShape === "arc")) {
    return "弧";
  }
  if (analysis.components.some((component) => component.kind === "cycle")) {
    return "環";
  }
  if (analysis.components.length >= 2) return "群れ";
  if (analysis.isolated.length > 0) return "孤星";
  if (analysis.orientation === "horizontal") return "横長";
  if (analysis.orientation === "vertical") return "縦長";
  if (analysis.orientation === "diagonal") return "斜行";
  if (analysis.orientation === "compact") return "小さな巣";
  return null;
}

function shapeEpithet(analysis: ShapeAnalysis): string | null {
  if (analysis.components.some((component) => component.pathShape === "arc")) {
    return "弧を描いて夜を渡る星座";
  }
  if (analysis.orientation === "horizontal") return "遠い岸へ横たわる星座";
  if (analysis.orientation === "vertical") return "空に立ちのぼる星座";
  if (analysis.orientation === "diagonal") return "斜めに夜を渡る星座";
  if (analysis.orientation === "compact") return "小さな巣に宿る星座";
  return null;
}

function buildName(
  motifId: string,
  rng: () => number,
  topology: SketchTopology,
): {
  name: string;
  reading: string;
} {
  const motif = getMotif(motifId);
  const pattern = Math.floor(rng() * 3);
  let candidate = { name: "", reading: "" };

  if (pattern === 0) {
    const prefix = PREFIXES[Math.floor(rng() * PREFIXES.length)];
    candidate = {
      name: `${prefix.text}の${motif.label}`,
      reading: `${prefix.kana}の${motif.reading}`,
    };
  } else if (pattern === 1) {
    const suffix = SUFFIXES[Math.floor(rng() * SUFFIXES.length)];
    candidate = {
      name: `${motif.label}の${suffix.text}`,
      reading: `${motif.reading}の${suffix.kana}`,
    };
  } else {
    const adjective = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)];
    candidate = {
      name: `${adjective.text}${motif.label}`,
      reading: `${adjective.kana}${motif.reading}`,
    };
  }

  const structure = structurePrefix(topology, rng);
  if (structure) {
    const withStructure = {
      name: `${structure.text}${candidate.name}`,
      reading: `${structure.kana}${candidate.reading}`,
    };
    if (charLength(withStructure.name) <= 11) candidate = withStructure;
  }

  if (charLength(candidate.name) < 2 || charLength(candidate.name) > 11) {
    const prefix = PREFIXES[Math.floor(rng() * PREFIXES.length)];
    candidate = {
      name: `${prefix.text}の${motif.label}`,
      reading: `${prefix.kana}の${motif.reading}`,
    };
  }

  return {
    name: `${candidate.name}座`,
    reading: `${candidate.reading}ざ`,
  };
}

/**
 * Deterministic, offline constellation generator. It is intentionally good
 * enough to stand on its own when no API key is configured, and it serves as
 * the safe repair path for malformed LLM output.
 */
export function buildFallback(input: FallbackInput): ConstellationResult {
  const stars = input.stars.length > 0 ? input.stars : [
    { x: 0.2, y: 0.4 },
    { x: 0.5, y: 0.2 },
    { x: 0.8, y: 0.45 },
    { x: 0.65, y: 0.75 },
    { x: 0.35, y: 0.72 },
    { x: 0.5, y: 0.5 },
  ];
  const theme = (input.theme ?? "").trim().slice(0, 60);
  const aspect = Number.isFinite(input.aspect) ? Number(input.aspect) : 1;
  const attempt = input.attempt ?? 1;
  const seed = hashString(
    `${stars
      .map((star) => `${star.x.toFixed(3)},${star.y.toFixed(3)}`)
      .join(";")}|${aspect.toFixed(2)}|${theme}|${attempt}`,
  );
  const rng = mulberry32(seed);

  const sketch = normalizeEdgePairs(input.sketchEdges ?? [], stars.length).slice(
    0,
    MAX_FIGURE_EDGES,
  );
  const topology = analyzeSketch(sketch, stars.length);
  const figureEdges =
    sketch.length > 0
      ? sketch
      : augmentEdges(
          mstEdges(stars),
          stars,
          Math.min(7, Math.max(4, stars.length - 1)),
          11,
        );
  const analysis = analyzeShape(stars, figureEdges, aspect);

  const motifId =
    input.motifId && MOTIF_IDS.includes(input.motifId)
      ? input.motifId
      : chooseMotif(theme, rng, topology, analysis);
  const motif = getMotif(motifId);
  const paletteId = defaultPaletteForMotif(motifId);

  const { name, reading } = buildName(motifId, rng, topology);
  const season = SEASONS[Math.floor(rng() * SEASONS.length)];
  const opening = MYTH_OPENINGS[Math.floor(rng() * MYTH_OPENINGS.length)];
  const action = ACTIONS[Math.floor(rng() * ACTIONS.length)];
  const aftermath = AFTERMATHS[Math.floor(rng() * AFTERMATHS.length)];
  const ending = ENDINGS[Math.floor(rng() * ENDINGS.length)];
  const quality = QUALITIES[Math.floor(rng() * QUALITIES.length)];

  const lead = theme
    ? `「${theme}」の気配が満ちる${season.jp}`
    : season.jp;
  const subject =
    topology.partCount >= 2
      ? GROUP_SUBJECTS[motifId] ?? motif.subject
      : motif.subject;
  const story = `${opening}${lead}、${subject}は${action}。${topologyClause(topology)}${aftermath}。${stars.length}つの星をたどると、今夜も${ending}という。`;

  const epithet =
    topologyEpithet(topology) ??
    shapeEpithet(analysis) ??
    (theme ? `${theme}を待つ星座` : EPITHETS[Math.floor(rng() * EPITHETS.length)]);

  const keywords = Array.from(
    new Set([
      motif.label,
      shapeKeyword(analysis) ?? season.label,
      structureKeyword(topology) ?? quality,
    ]),
  ).slice(0, 3);

  return {
    name,
    reading,
    motif: motifId,
    paletteId,
    epithet,
    story,
    figureEdges,
    keywords,
    formReading: analysis.summary,
  };
}

export function motifDisplayName(motifId: string): string {
  return MOTIFS.find((motif) => motif.id === motifId)?.label ?? "星";
}
