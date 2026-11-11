import {
  analyzeSketch,
  normalizeEdgePairs,
  type SketchTopology,
} from "./edges";
import { hashString, mulberry32 } from "./geometry";
import {
  analyzeShape,
  suggestLineStyle,
  type ShapeAnalysis,
} from "./shape";
import { PALETTE_IDS } from "./palettes";
import type {
  ConstellationResult,
  FigureEdge,
  LineStyle,
  Point,
} from "./types";

export interface FallbackInput {
  stars: Point[];
  sketchEdges?: FigureEdge[];
  aspect?: number;
  theme?: string;
  attempt?: number;
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

interface SubjectNoun {
  /** Short noun used in the generated name. */
  text: string;
  kana: string;
  /** A concrete, free-form subject handed to the figure renderer. */
  subject: string;
  paletteId: string;
  /** Theme words that make this noun a natural fit. */
  words: string[];
}

const SUBJECT_NOUNS: SubjectNoun[] = [
  {
    text: "灯台",
    kana: "とうだい",
    subject: "灯台を守る小さな火",
    paletteId: "ember",
    words: ["灯台", "灯", "火", "港", "窓", "夜"],
  },
  {
    text: "鯨",
    kana: "くじら",
    subject: "海を渡る若い鯨",
    paletteId: "tide",
    words: ["鯨", "海", "潮", "波", "遠洋"],
  },
  {
    text: "舟",
    kana: "ふね",
    subject: "星を積んだ小舟",
    paletteId: "tide",
    words: ["舟", "船", "航海", "旅", "出発"],
  },
  {
    text: "狐",
    kana: "きつね",
    subject: "秋の森を抜ける狐",
    paletteId: "ember",
    words: ["狐", "きつね", "森", "秋", "実り"],
  },
  {
    text: "龍",
    kana: "りゅう",
    subject: "雨を呼ぶ細い龍",
    paletteId: "violet",
    words: ["龍", "竜", "雨", "雷", "天"],
  },
  {
    text: "鳥",
    kana: "とり",
    subject: "夜を渡る鳥",
    paletteId: "astral",
    words: ["鳥", "空", "風", "翼", "渡り"],
  },
  {
    text: "花",
    kana: "はな",
    subject: "庭に咲く宵の花",
    paletteId: "rose",
    words: ["花", "春", "庭", "咲", "実"],
  },
  {
    text: "冠",
    kana: "かんむり",
    subject: "誓いを宿す冠",
    paletteId: "astral",
    words: ["王", "冠", "誓い", "勝利"],
  },
  {
    text: "鹿",
    kana: "しか",
    subject: "静かな森の鹿",
    paletteId: "jade",
    words: ["鹿", "森", "山", "静けさ"],
  },
  {
    text: "鍵",
    kana: "かぎ",
    subject: "記憶を開く鍵",
    paletteId: "jade",
    words: ["鍵", "扉", "秘密", "記憶"],
  },
  {
    text: "月",
    kana: "つき",
    subject: "欠けた月を待つ者",
    paletteId: "violet",
    words: ["月", "夜", "満ち欠け", "銀"],
  },
  {
    text: "猫",
    kana: "ねこ",
    subject: "窓辺で眠る猫",
    paletteId: "astral",
    words: ["猫", "家", "窓辺", "眠り"],
  },
  {
    text: "蝶",
    kana: "ちょう",
    subject: "夢を運ぶ蝶",
    paletteId: "rose",
    words: ["蝶", "夢", "変身"],
  },
  {
    text: "山",
    kana: "やま",
    subject: "遠い峰の稜線",
    paletteId: "jade",
    words: ["山", "峰", "谷", "遠景"],
  },
  {
    text: "魚",
    kana: "さかな",
    subject: "水底を光る魚",
    paletteId: "tide",
    words: ["魚", "水", "川", "海"],
  },
  {
    text: "瞳",
    kana: "ひとみ",
    subject: "星を見つめる瞳",
    paletteId: "violet",
    words: ["目", "眼", "見る", "瞳", "星"],
  },
  {
    text: "鏡",
    kana: "かがみ",
    subject: "夜を映す古い鏡",
    paletteId: "astral",
    words: ["鏡", "映す", "秘密"],
  },
  {
    text: "真珠",
    kana: "しんじゅ",
    subject: "余白に落ちた真珠",
    paletteId: "rose",
    words: ["真珠", "貝", "海", "光"],
  },
  {
    text: "種",
    kana: "たね",
    subject: "次の春を待つ種",
    paletteId: "jade",
    words: ["種", "芽", "春", "実り"],
  },
  {
    text: "窓",
    kana: "まど",
    subject: "遠い家の窓",
    paletteId: "ember",
    words: ["窓", "家", "灯", "帰り"],
  },
  {
    text: "木",
    kana: "き",
    subject: "芽吹きはじめた古い木",
    paletteId: "jade",
    words: ["木", "樹", "森", "芽"],
  },
  {
    text: "天秤",
    kana: "てんびん",
    subject: "星を量る古い天秤",
    paletteId: "astral",
    words: ["天秤", "量る", "均衡", "誓い"],
  },
  {
    text: "珊瑚",
    kana: "さんご",
    subject: "夜の海に育つ珊瑚",
    paletteId: "rose",
    words: ["珊瑚", "海", "潮", "島"],
  },
  {
    text: "蛍",
    kana: "ほたる",
    subject: "岸辺を巡る蛍",
    paletteId: "ember",
    words: ["蛍", "夏", "岸", "光"],
  },
  {
    text: "貝",
    kana: "かい",
    subject: "潮騒を閉じ込めた貝",
    paletteId: "rose",
    words: ["貝", "海", "潮", "真珠"],
  },
  {
    text: "梯子",
    kana: "はしご",
    subject: "星へかかる梯子",
    paletteId: "jade",
    words: ["梯子", "空", "登る", "塔"],
  },
  {
    text: "橋",
    kana: "はし",
    subject: "夜を渡る細い橋",
    paletteId: "jade",
    words: ["橋", "渡る", "岸", "川"],
  },
  {
    text: "矢",
    kana: "や",
    subject: "空を切る一本の矢",
    paletteId: "ember",
    words: ["矢", "弓", "射る", "的"],
  },
  {
    text: "槍",
    kana: "やり",
    subject: "夜を貫く銀の槍",
    paletteId: "violet",
    words: ["槍", "騎士", "銀", "夜"],
  },
  {
    text: "実",
    kana: "み",
    subject: "秋に熟す小さな実",
    paletteId: "rose",
    words: ["実", "秋", "実り", "森"],
  },
  {
    text: "鈴",
    kana: "すず",
    subject: "遠くで鳴る小さな鈴",
    paletteId: "astral",
    words: ["鈴", "音", "鳴る", "祈り"],
  },
  {
    text: "帆",
    kana: "ほ",
    subject: "風を待つ帆",
    paletteId: "tide",
    words: ["帆", "舟", "風", "港"],
  },
  {
    text: "弓",
    kana: "ゆみ",
    subject: "弧を描く古い弓",
    paletteId: "ember",
    words: ["弓", "矢", "射る", "月"],
  },
  {
    text: "釣り針",
    kana: "つりばり",
    subject: "星を釣る銀の針",
    paletteId: "tide",
    words: ["釣り", "針", "海", "月"],
  },
  {
    text: "三日月",
    kana: "みかづき",
    subject: "空に引かれた三日月",
    paletteId: "violet",
    words: ["三日月", "月", "欠け", "夜"],
  },
  {
    text: "灯",
    kana: "あかり",
    subject: "遠くで守られる灯",
    paletteId: "ember",
    words: ["灯", "火", "窓", "帰り"],
  },
  {
    text: "島",
    kana: "しま",
    subject: "海に浮かぶ小さな島",
    paletteId: "tide",
    words: ["島", "海", "孤", "岸"],
  },
  {
    text: "砂時計",
    kana: "すなどけい",
    subject: "夜を量る砂時計",
    paletteId: "violet",
    words: ["砂時計", "時間", "夜", "砂"],
  },
  {
    text: "翼",
    kana: "つばさ",
    subject: "夜を滑る翼",
    paletteId: "astral",
    words: ["翼", "鳥", "風", "空"],
  },
  {
    text: "岸",
    kana: "きし",
    subject: "遠い岸辺",
    paletteId: "tide",
    words: ["岸", "海", "波", "帰り"],
  },
  {
    text: "柱",
    kana: "はしら",
    subject: "天を支える柱",
    paletteId: "violet",
    words: ["柱", "塔", "支える", "天"],
  },
  {
    text: "雨",
    kana: "あめ",
    subject: "静かに降る雨",
    paletteId: "tide",
    words: ["雨", "雲", "雷", "しずく"],
  },
  {
    text: "坂",
    kana: "さか",
    subject: "星へ続く坂",
    paletteId: "jade",
    words: ["坂", "道", "登る", "丘"],
  },
  {
    text: "舵",
    kana: "かじ",
    subject: "斜めに進む舵",
    paletteId: "tide",
    words: ["舵", "舟", "航海", "進む"],
  },
  {
    text: "巣",
    kana: "す",
    subject: "小さな星の巣",
    paletteId: "rose",
    words: ["巣", "鳥", "卵", "家"],
  },
  {
    text: "玉",
    kana: "たま",
    subject: "手のひらに残る玉",
    paletteId: "astral",
    words: ["玉", "光", "手", "宝"],
  },
  {
    text: "流星",
    kana: "りゅうせい",
    subject: "夜を走る流星",
    paletteId: "violet",
    words: ["流星", "夜", "走る", "光"],
  },
];

type ShapeNounKey =
  | "cycle"
  | "branch"
  | "manyParts"
  | "isolated"
  | "arc"
  | "horizontal"
  | "vertical"
  | "diagonal"
  | "compact"
  | "default";

const NOUN_BY_TEXT = new Map(
  SUBJECT_NOUNS.map((noun) => [noun.text, noun] as const),
);

function nounPool(...texts: string[]): SubjectNoun[] {
  return texts
    .map((text) => NOUN_BY_TEXT.get(text))
    .filter((noun): noun is SubjectNoun => Boolean(noun));
}

/**
 * Concrete things each drawing gesture can resemble. Every pool is made of
 * animals, plants, natural objects or tools, so a branch never becomes
 * "枝座" and a separate group never becomes "群れ座".
 */
const SHAPE_NOUN_POOLS: Record<ShapeNounKey, SubjectNoun[]> = {
  cycle: nounPool("冠", "月", "花", "瞳", "鏡", "貝", "鈴"),
  branch: nounPool("鹿", "龍", "木", "鍵", "天秤", "珊瑚", "狐"),
  manyParts: nounPool("鳥", "魚", "蝶", "島", "蛍", "鯨", "舟", "珊瑚", "猫"),
  isolated: nounPool("灯", "真珠", "種", "窓", "月", "猫"),
  arc: nounPool("弓", "三日月", "釣り針", "橋", "帆", "鯨", "龍"),
  horizontal: nounPool("帆", "橋", "舟", "翼", "岸", "鯨", "山", "魚"),
  vertical: nounPool("塔", "灯", "柱", "梯子", "雨", "木", "槍", "窓", "砂時計"),
  diagonal: nounPool("矢", "坂", "舵", "槍", "流星", "鳥"),
  compact: nounPool("巣", "実", "玉", "瞳", "貝", "真珠", "種", "鈴", "砂時計"),
  default: nounPool("灯", "種", "貝", "蝶", "鹿", "魚", "月", "舟", "鍵", "花", "猫", "鳥"),
};

function pickNoun(
  pool: SubjectNoun[],
  rng: () => number,
): SubjectNoun | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)] ?? null;
}

function chooseSubjectNoun(
  theme: string,
  topology: SketchTopology,
  analysis: ShapeAnalysis,
  rng: () => number,
): SubjectNoun {
  const themed = SUBJECT_NOUNS.find((noun) =>
    noun.words.some((word) => theme.includes(word)),
  );
  if (themed) return themed;

  const keys: ShapeNounKey[] = [];
  if (topology.hasLines) {
    if (topology.partCount >= 2) keys.push("manyParts");
    if (topology.hasCycle) keys.push("cycle");
    if (topology.hasBranch) keys.push("branch");
    if (analysis.components.some((component) => component.pathShape === "arc")) {
      keys.push("arc");
    }
    if (topology.isolated.length > 0) keys.push("isolated");
  } else if (analysis.clusters.length >= 2) {
    keys.push("manyParts");
  }

  if (keys.length === 0) {
    if (analysis.orientation === "horizontal") keys.push("horizontal");
    else if (analysis.orientation === "vertical") keys.push("vertical");
    else if (analysis.orientation === "diagonal") keys.push("diagonal");
    else if (analysis.orientation === "compact") keys.push("compact");
    else keys.push("default");
  }

  const candidates = [...new Set(keys.flatMap((key) => SHAPE_NOUN_POOLS[key]))];
  return (
    pickNoun(candidates, rng) ??
    pickNoun(SHAPE_NOUN_POOLS.default, rng) ??
    SUBJECT_NOUNS[0]
  );
}

function charLength(value: string): number {
  return Array.from(value).length;
}

function topologyClause(topology: SketchTopology): string {
  if (!topology.hasLines) return "";
  if (topology.partCount >= 2) {
    const base = `空には${topology.partCount}つの離れたまとまりとして残った`;
    if (topology.isolated.length > 0) {
      return `${base}。線につながらない${topology.isolated.length}つの星は、余白のようにそのそばで瞬いている。`;
    }
    return `${base}。`;
  }
  if (topology.isolated.length > 0) {
    return `線につながらない${topology.isolated.length}つの星は、余白のようにそのそばで瞬いている。`;
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
  noun: SubjectNoun,
  rng: () => number,
): {
  name: string;
  reading: string;
} {
  const pattern = Math.floor(rng() * 3);
  let candidate = { name: "", reading: "" };

  if (pattern === 0) {
    const prefix = PREFIXES[Math.floor(rng() * PREFIXES.length)];
    candidate = {
      name: `${prefix.text}の${noun.text}`,
      reading: `${prefix.kana}の${noun.kana}`,
    };
  } else if (pattern === 1) {
    const suffix = SUFFIXES[Math.floor(rng() * SUFFIXES.length)];
    candidate = {
      name: `${noun.text}の${suffix.text}`,
      reading: `${noun.kana}の${suffix.kana}`,
    };
  } else {
    const adjective = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)];
    candidate = {
      name: `${adjective.text}${noun.text}`,
      reading: `${adjective.kana}${noun.kana}`,
    };
  }

  if (charLength(candidate.name) < 2 || charLength(candidate.name) > 11) {
    const prefix = PREFIXES[Math.floor(rng() * PREFIXES.length)];
    candidate = {
      name: `${prefix.text}の${noun.text}`,
      reading: `${prefix.kana}の${noun.kana}`,
    };
  }

  return {
    name: `${candidate.name}座`,
    reading: `${candidate.reading}ざ`,
  };
}

function buildSubject(
  noun: SubjectNoun,
  topology: SketchTopology,
): string {
  if (topology.hasLines && topology.partCount >= 2) {
    return `${noun.subject}が、離れた${topology.partCount}つのまとまりに分かれて瞬く夜`;
  }
  if (topology.hasLines && topology.isolated.length > 0) {
    return `${noun.subject}と、線の届かない星々`;
  }
  return noun.subject;
}

/**
 * Deterministic, offline constellation generator. It is intentionally good
 * enough to stand on its own when no API key is configured, and it serves as
 * the safe repair path for malformed LLM output. It never selects a fixed
 * picture: it chooses a free-form subject and a line character, while the
 * artwork itself is engraved from the user's graph.
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

  const sketch = normalizeEdgePairs(input.sketchEdges ?? [], stars.length);
  const topology = analyzeSketch(sketch, stars.length);
  // The user's lines are the whole figure. When nothing was drawn, the figure
  // stays empty: unconnected stars must never be auto-joined into a shape the
  // user did not draw.
  const figureEdges = sketch;
  const analysis = analyzeShape(stars, figureEdges, aspect);

  const noun = chooseSubjectNoun(theme, topology, analysis, rng);
  const lineStyle: LineStyle = suggestLineStyle(analysis);
  const paletteId = PALETTE_IDS.includes(noun.paletteId)
    ? noun.paletteId
    : PALETTE_IDS[0];

  const { name, reading } = buildName(noun, rng);
  const season = SEASONS[Math.floor(rng() * SEASONS.length)];
  const opening = MYTH_OPENINGS[Math.floor(rng() * MYTH_OPENINGS.length)];
  const action = ACTIONS[Math.floor(rng() * ACTIONS.length)];
  const aftermath = AFTERMATHS[Math.floor(rng() * AFTERMATHS.length)];
  const ending = ENDINGS[Math.floor(rng() * ENDINGS.length)];
  const quality = QUALITIES[Math.floor(rng() * QUALITIES.length)];

  const lead = theme
    ? `「${theme}」の気配が満ちる${season.jp}`
    : season.jp;
  const subject = buildSubject(noun, topology);
  // The display subject may be a full clause. The myth needs a plain noun
  // phrase before "は", otherwise it reads "...分かれて瞬くは数えていた".
  const story = `${opening}${lead}、${noun.subject}は${action}。${topologyClause(topology)}${aftermath}。${stars.length}つの星をたどると、今夜も${ending}という。`;

  const epithet =
    topologyEpithet(topology) ??
    shapeEpithet(analysis) ??
    (theme ? `${theme}を待つ星座` : EPITHETS[Math.floor(rng() * EPITHETS.length)]);

  const keywords = Array.from(
    new Set([
      noun.text,
      shapeKeyword(analysis) ?? season.label,
      structureKeyword(topology) ?? quality,
    ]),
  ).slice(0, 3);

  return {
    name,
    reading,
    subject,
    lineStyle,
    paletteId,
    epithet,
    story,
    figureEdges,
    keywords,
    formReading: analysis.summary,
  };
}
