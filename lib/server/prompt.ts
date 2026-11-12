import type { FigureEdge, Point } from "@/lib/types";
import { LINE_STYLES } from "@/lib/lineStyle";
import { PALETTES } from "@/lib/palettes";
import { analyzeShape, shapeNameHints, suggestLineStyle } from "@/lib/shape";
import type { CreativityVariant } from "./creativity";

export interface PromptInput {
  stars: Point[];
  sketchEdges: FigureEdge[];
  aspect: number;
  theme: string;
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

function starLines(input: PromptInput): string {
  return input.stars
    .map((star, index) => {
      const x = (star.x * input.aspect).toFixed(2);
      const y = (1 - star.y).toFixed(2);
      return `S${index}: (${x}, ${y})`;
    })
    .join("\n");
}

function sketchLines(edges: FigureEdge[]): string {
  if (edges.length === 0) return "なし（ユーザーはまだ線を引いていない）";
  return edges.map(([a, b]) => `S${a}–S${b}`).join("、");
}

function axisDescription(angleDeg: number): string {
  const rounded = Math.round(Math.abs(angleDeg));
  if (rounded <= 4) return "ほぼ水平（0°）";
  if (rounded >= 86) return "ほぼ垂直（90°）";
  return angleDeg > 0 ? `右上がり 約${rounded}°` : `右下がり 約${rounded}°`;
}

/**
 * A compact description of the user's actual line graph. The model should
 * name the shape it was given, not a shape it would rather draw.
 */
function connectivityDescription(input: PromptInput): string {
  const edges = input.sketchEdges;
  if (edges.length === 0) {
    return "線はまだ引かれていない。星の配置だけから形を読む。";
  }

  const adjacency = new Map<number, Set<number>>();
  for (const [a, b] of edges) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }

  const seen = new Set<number>();
  const components: number[][] = [];
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    const stack = [start];
    const component: number[] = [];
    seen.add(start);
    while (stack.length > 0) {
      const node = stack.pop()!;
      component.push(node);
      for (const next of adjacency.get(node) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    components.push(component.sort((a, b) => a - b));
  }

  const isolated = input.stars
    .map((_, index) => index)
    .filter((index) => !adjacency.has(index));

  const summaries = components.map((component) => {
    const members = new Set(component);
    const componentEdges = edges.filter(
      ([a, b]) => members.has(a) && members.has(b),
    );
    const degree = (index: number) => adjacency.get(index)?.size ?? 0;
    const maxDegree = Math.max(...component.map(degree));
    const branches = component.filter((index) => degree(index) >= 3).length;
    const isCycle =
      component.length >= 3 &&
      componentEdges.length === component.length &&
      component.every((index) => degree(index) === 2);
    const isPath =
      componentEdges.length === component.length - 1 && maxDegree <= 2;
    const shape = isCycle
      ? "輪"
      : isPath
        ? "一本の鎖"
        : branches > 0
          ? "枝分かれ"
          : "網";
    return `S${component.join("・S")} が${shape}（線${componentEdges.length}本）`;
  });

  const parts = [`${components.length}個のまとまり`, ...summaries];
  if (isolated.length > 0) {
    parts.push(`線に含まれない星: ${isolated.map((index) => `S${index}`).join("・")}`);
  }
  return `${parts.join("。")}。`;
}

export function buildPrompt(
  input: PromptInput,
  variant: CreativityVariant,
): ChatMessage[] {
  const shape = analyzeShape(input.stars, input.sketchEdges, input.aspect);
  const suggestedStyle = suggestLineStyle(shape);
  const lineStyleList = LINE_STYLES.map(
    (style) => `${style.id}（${style.label}）`,
  ).join("、");
  const lineStyleLines = LINE_STYLES.map(
    (style) =>
      `${style.id}（${style.label}）— ${style.description}${
        style.id === suggestedStyle ? "／この図との相性が良い" : ""
      }`,
  ).join("\n");
  const hints = shapeNameHints(shape).join("、");
  const paletteList = PALETTES.map(
    (palette) => `${palette.id}（${palette.label}）`,
  ).join("、");

  const system = [
    "あなたは「星座アトリエ」の星座キュレーター兼詩人です。",
    "ユーザーが星を配置し、必要なら線で下書きした星図を読み、この世に一つだけの架空の星座を創ります。",
    "ユーザーが引いた線のつながりは、星座名・情景・神話を決める最重要の手がかりです。線を勝手に連結したり、閉路を作ったりしないでください。",
    "実在の星座の説明や天文学の事実を述べてはいけません。占い・医療・差別的な表現も禁止です。",
    "美的で具体的な日本語を使い、既視感のない組み合わせを選んでください。",
    "",
    "【今回のスタイル】",
    `雰囲気: ${variant.style}`,
    `命名: ${variant.naming}`,
    `物語: ${variant.story}`,
    `避けること: ${variant.avoid.join(" / ")}`,
    "",
    "【出力の絶対条件】",
    "・JSONオブジェクトのみを出力する。前後に文章、Markdown、コードフェンスを付けない。",
    "・最初に formReading を書く。formReading は、星の向き・重心・密度・まとまり・孤立星・線の曲がりについて、実際に観測できる形だけを60〜120字の詩的な一文で説明する。文体は常体（〜だ／〜ている）に揃える。",
    "・formReading に書いた形と、name・subject・lineStyle・epithet・story を必ず響き合わせる。形を無視した既製の星座名や情景を選ばない。",
    "・name は2〜12文字で、必ず「〜座」で終わる。実在の星座名（「〜座」を含む）は使わない。",
    "・name は、線の形を動物・植物・自然物・道具など具体的なものに見立てて決める。枝分かれなら鹿の角・龍・木・鍵・梟・蔦、輪なら冠・月・花・瞳・鏡、長い鎖なら鯨・舟・魚・橋、複数のまとまりなら鳥・魚・蝶・島・蛍、孤立星なら灯・真珠・種・窓を手がかりにする。",
    "・「枝」「環」「群れ」「孤星」「線」「形」「まとまり」など、図形の構造を表す語をそのまま名前にしない。構造は formReading と story で説明し、name は具体的な見立てにする。",
    "・reading は name のひらがな読み。ひらがなのみ（長音「ー」可）で、末尾は「ざ」。",
    "・figureEdges は、ユーザーの下書き線と完全に同じ配列にする。線を追加・削除・連結・張り替えしてはいけない。",
    "・下書き線がない場合、figureEdges は必ず空配列 [] にする。星を勝手に結ばない。",
    "・星座は連結である必要はなく、閉路も不要。複数のまとまりや、線に含まれない星があってよい。",
    "・epithet・story は、星の配置、線のまとまりの数、輪・鎖・枝分かれ、孤立した星を読み取って発想する。複数パーツなら、その離れ方や群れを神話に織り込む。",
    "・figureEdges はユーザーが引いた線そのもの。完成図の絵柄は、その線分グラフから「刻線」として決定的に生成される。固定の絵を回転・変形して当てはめるのではない。",
    "・subject は、星の配置と線のまとまりから見える具体的な情景を、40字以内の自由記述で書く。例:「枝分かれした角を持つ若い鹿」「灯台を守る鯨」。動物・植物・自然物・道具のいずれかに寄せ、形の読みに根ざす。既製の星座名は使わない。",
    "・lineStyle は、線の性格を4種から選ぶ。鎖には flowing か delicate、折れ線や網には hard、輪には radial がよく合う。formReading の言葉と矛盾させない。",
    "・story は90〜160字。改行なし。神話のエピソードとして、誰が、何をして、なぜ空に置かれたのかを一つ描く。神や精霊、獣、旅人の小さな事件でよい。",
    "・keywords は2〜3個、各12文字以内。",
    "・lineStyle と paletteId は必ず候補から選ぶ。",
  ].join("\n");

  const user = [
    "以下の星図から、架空の星座をひとつ創ってください。",
    "",
    "【星図】",
    `座標系: xは右方向、yは上方向。画面の縦横比を反映しており、xの範囲は0〜${input.aspect.toFixed(
      2,
    )}、yの範囲は0〜1。`,
    starLines(input),
    "",
    "【形の分析（名前より先に読む）】",
    shape.summary,
    `視覚的な手がかり: ${shape.gestures.join(" / ")}`,
    `主軸: ${axisDescription(shape.angleDeg)}（水平を0°とする）`,
    `線の本数: ${shape.edgeCount}本`,
    `名前の着想候補（動物・植物・自然物・道具。必要な場合だけ使う）: ${hints}`,
    `星の数: ${input.stars.length}個`,
    `ユーザーの下書き線: ${sketchLines(input.sketchEdges)}`,
    `線のつながり: ${connectivityDescription(input)}`,
    `ユーザーが添えたことば: ${
      input.theme ? `「${input.theme}」` : "なし"
    }`,
    "",
    "【命名の見立て】",
    "構造語を名前にせず、線の形を具体的なものに見立てる。枝分かれ→鹿の角・龍・木・鍵、輪→冠・月・花・瞳・鏡、鎖→鯨・舟・魚・橋、複数のまとまり→鳥・魚・蝶・島、孤立星→灯・真珠・種。",
    "",
    "【刻線の手がかり】",
    "完成図では、ユーザーの線分そのものは動かさず、そのグラフのまわりに細い刻線だけを加える。鎖には平行エコー線と目盛り、輪には内側の同心リングと放射目盛り、枝分かれには末端の葉、網には辺の中点のハッチ、孤立星には破線ハローと光条が付く。線のない星は勝手に結ばない。",
    `この図に合う線の性格の目安: ${suggestedStyle}`,
    lineStyleLines,
    "",
    "【配色候補】",
    paletteList,
    "",
    "【figureEdges の作り方】",
    input.sketchEdges.length > 0
      ? "・ユーザーの下書き線がそのまま完成図になる。figureEdges には下書き線をすべて、同じ星番号のペアで入れる。"
      : "・下書き線はない。figureEdges は必ず [] にする。",
    input.sketchEdges.length > 0
      ? "・線を足したり消したりして形を整えてはいけない。"
      : "・星を勝手に結ばない。星の配置だけを形の読みに使う。",
    "・閉路は必須ではない。1本だけの線、複数のまとまり、孤立した星もそのまま受け入れる。",
    "・ユーザーの線を交差させ直したり、読みやすい形に作り替えたりしない。",
    "・名前と神話は、星の配置と線のまとまりを最初に読んでから決める。",
    "",
    "【出力JSON】",
    "{",
    '  "formReading": "横に長く伸びた星々が、右へ緩やかな弧を描いている。左手前ほど星が密で、右下に一つだけ離れた星が残る。",',
    '  "name": "灯待ちの狐座",',
    '  "reading": "ひまちのきつねざ",',
    '  "subject": "灯台を守りながら夜を渡る若い狐",',
    `  "lineStyle": "上記候補のid (${lineStyleList})",`,
    `  "paletteId": "上記候補のid (${paletteList})",`,
    '  "epithet": "24文字以内の短い二つ名",',
    '  "story": "90〜160字の神話エピソード",',
    input.sketchEdges.length > 0
      ? `  "figureEdges": ${JSON.stringify(input.sketchEdges)},`
      : '  "figureEdges": [],',
    '  "keywords": ["灯", "待つ", "夜"]',
    "}",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
