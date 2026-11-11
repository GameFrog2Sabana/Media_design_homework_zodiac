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

function promptText(sketchEdges: [number, number][]): string {
  return buildPrompt(
    {
      stars,
      sketchEdges,
      aspect: 1.6,
      theme: "灯台",
    },
    variant,
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

    expect(text).toContain("完全に同じ配列");
    expect(text).toContain("線を追加・削除・連結・張り替えしてはいけない");
    expect(text).toContain("2個のまとまり");
    expect(text).toContain("S0–S1、S2–S3");
    expect(text).toContain("線に含まれない星: S4");
    expect(text).toContain("閉路は必須ではない");
    expect(text).toContain("複数パーツなら");
    expect(text).toContain("主軸:");
    expect(text).toContain("線の本数: 2本");
  });

  it("keeps figureEdges empty when no lines exist", () => {
    const text = promptText([]);

    expect(text).toContain("線はまだ引かれていない");
    expect(text).toContain("figureEdges は必ず []");
    expect(text).toContain("星を勝手に結ばない");
    expect(text).toContain('"figureEdges": [],');
    expect(text).not.toContain("2〜9本");
  });

  it("puts an explicit shape reading before the name", () => {
    const text = promptText([
      [0, 1],
      [2, 3],
    ]);

    expect(text).toContain("【形の分析（名前より先に読む）】");
    expect(text).toContain("全体は横長");
    expect(text).toContain("視覚的な手がかり");
    expect(text).toContain("名前の着想候補");
    expect(text).toContain("最初に formReading");
    expect(text).toContain('"formReading"');
  });

  it("asks for graph-derived engraving instead of a fixed motif", () => {
    const text = promptText([
      [0, 1],
      [2, 3],
    ]);

    expect(text).toContain("【刻線の手がかり】");
    expect(text).toContain("固定の絵を回転・変形して当てはめるのではない");
    expect(text).toContain("平行エコー線");
    expect(text).toContain("破線ハロー");
    expect(text).toContain('"subject"');
    expect(text).toContain('"lineStyle"');
    expect(text).not.toContain("【モチーフ候補");
  });
});
