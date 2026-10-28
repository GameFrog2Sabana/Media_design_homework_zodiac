import { describe, expect, it } from "vitest";
import { creativityConfig } from "@/lib/server/creativity";
import { buildPrompt } from "@/lib/server/prompt";

const stars = [
  { x: 0.2, y: 0.3 },
  { x: 0.5, y: 0.2 },
  { x: 0.8, y: 0.55 },
  { x: 0.45, y: 0.75 },
  { x: 0.25, y: 0.65 },
];

const variant = creativityConfig.variants[0];
const guardrails = creativityConfig.guardrails;

function promptText(sketchEdges: [number, number][]): string {
  return buildPrompt(
    {
      stars,
      sketchEdges,
      aspect: 1.6,
      theme: "灯台",
    },
    variant,
    guardrails,
  )
    .map((message) => message.content)
    .join("\n");
}

describe("buildPrompt", () => {
  it("tells the model to preserve every hand-drawn line", () => {
    const text = promptText([
      [0, 1],
      [2, 3],
    ]);

    expect(text).toContain("その線を一本も欠かさず");
    expect(text).toContain("2個のまとまり");
    expect(text).toContain("S0–S1、S2–S3");
    expect(text).toContain("線に含まれない星: S4");
    expect(text).toContain("閉路は必須ではない");
    expect(text).toContain("複数パーツなら");
  });

  it("does not ask for a connected figure when no lines exist", () => {
    const text = promptText([]);

    expect(text).toContain("線はまだ引かれていない");
    expect(text).toContain("全ての星を使う必要はない");
    expect(text).toContain("複数のまとまり、孤立した星もそのまま受け入れる");
  });

  it("puts an explicit shape reading before the name and motif", () => {
    const text = promptText([
      [0, 1],
      [2, 3],
    ]);

    expect(text).toContain("【形の分析（名前より先に読む）】");
    expect(text).toContain("全体は横長");
    expect(text).toContain("視覚的な手がかり");
    expect(text).toContain("名前の着想候補");
    expect(text).toContain("【モチーフ候補（この形との相性順）】");
    expect(text).toContain("最初に formReading");
    expect(text).toContain('"formReading"');
  });
});
