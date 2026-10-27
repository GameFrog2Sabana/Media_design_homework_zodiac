import type { FigureEdge, Point } from "@/lib/types";
import { MOTIFS } from "@/lib/motifs";
import { PALETTES } from "@/lib/palettes";
import type {
  CreativityGuardrails,
  CreativityVariant,
} from "./creativity";

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

function shapeDescription(input: PromptInput): string {
  const xs = input.stars.map((star) => star.x * input.aspect);
  const ys = input.stars.map((star) => 1 - star.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  if (width > height * 1.45) return "横に大きく広がる構図";
  if (height > width * 1.45) return "縦に伸びる構図";
  if (width < 0.45 && height < 0.45) return "中心に寄り集まった構図";
  return "横と縦がほどよく均衡した構図";
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
  guardrails: CreativityGuardrails,
): ChatMessage[] {
  const motifList = MOTIFS.map((motif) => `${motif.id}（${motif.label}）`).join(
    "、",
  );
  const paletteList = PALETTES.map(
    (palette) => `${palette.id}（${palette.label}）`,
  ).join("、");

  const system = [
    "あなたは「星座アトリエ」の星座キュレーター兼詩人です。",
    "ユーザーが星を配置し、必要なら線で下書きした星図を読み、この世に一つだけの架空の星座を創ります。",
    "ユーザーが引いた線のつながりは、星座名・モチーフ・神話を決める最重要の手がかりです。線を勝手に連結したり、閉路を作ったりしないでください。",
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
    "・name は2〜12文字で、必ず「〜座」で終わる。実在の星座名（「〜座」を含む）は使わない。",
    "・reading は name のひらがな読み。ひらがなのみ（長音「ー」可）で、末尾は「ざ」。",
    "・ユーザーの下書き線がある場合、figureEdges はその線を一本も欠かさず、同じ星番号のペアでそのまま返す。追加・削除・張り替えをしてはいけない。",
    "・下書き線がない場合のみ、figureEdges を2〜9本で提案してよい。",
    "・星座は連結である必要はなく、閉路も不要。複数のまとまりや、線に含まれない星があってよい。",
    "・name・epithet・story は、線のまとまりの数、輪・鎖・枝分かれ、孤立した星を読み取って発想する。複数パーツなら、その離れ方や群れを名前と神話に織り込む。",
    "・figureEdges はモチーフの輪郭を感じさせる形にすること。ただし下書き線がある場合は形を変えず、モチーフの選び方で響き合わせる。",
    "・motif は、複数パーツなら群れ・渡り・島影・遠い灯りを感じさせるものを優先する。",
    "・story は90〜160字。改行なし。神話のエピソードとして、誰が、何をして、なぜ空に置かれたのかを一つ描く。神や精霊、獣、旅人の小さな事件でよい。",
    "・keywords は2〜3個、各12文字以内。",
    "・motif と paletteId は必ず候補から選ぶ。",
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
    `構図の印象: ${shapeDescription(input)}（星 ${input.stars.length}個）`,
    `ユーザーの下書き線: ${sketchLines(input.sketchEdges)}`,
    `線のつながり: ${connectivityDescription(input)}`,
    `ユーザーが添えたことば: ${
      input.theme ? `「${input.theme}」` : "なし"
    }`,
    "",
    "【モチーフ候補】",
    motifList,
    "モチーフの線画は完成した星図の背景に薄く描かれます。星の並びと線のまとまりから自然に連想できるものを選んでください。",
    "",
    "【配色候補】",
    paletteList,
    "",
    "【figureEdges の作り方】",
    input.sketchEdges.length > 0
      ? "・ユーザーの下書き線がそのまま完成図になる。figureEdges には下書き線をすべて、同じ星番号のペアで入れる。"
      : `・${guardrails.minEdges}〜9本。星が3〜4個しかない場合は、使える範囲でよい。`,
    input.sketchEdges.length > 0
      ? "・線を足したり消したりして形を整えてはいけない。"
      : "・全ての星を使う必要はない。主役になる4〜7個を選ぶと形が締まる。",
    "・閉路は必須ではない。1本だけの線、複数のまとまり、孤立した星もそのまま受け入れる。",
    "・線が交差しすぎると読みにくくなる。交差は最小限に。",
    "・名前と神話は、完成図のまとまり方を最初に読んでから決める。",
    "",
    "【出力JSON】",
    "{",
    '  "name": "灯待ちの狐座",',
    '  "reading": "ひまちのきつねざ",',
    `  "motif": "上記候補のid (${motifList})",`,
    `  "paletteId": "上記候補のid (${paletteList})",`,
    '  "epithet": "24文字以内の短い二つ名",',
    '  "story": "90〜160字の神話エピソード",',
    input.sketchEdges.length > 0
      ? `  "figureEdges": ${JSON.stringify(input.sketchEdges)},`
      : '  "figureEdges": [[0, 2], [2, 4]],',
    '  "keywords": ["灯", "待つ", "夜"]',
    "}",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
