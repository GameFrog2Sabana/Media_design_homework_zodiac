import type { LineStyle } from "./types";

export interface LineStyleInfo {
  id: LineStyle;
  label: string;
  description: string;
}

/**
 * The four engraving characters. These are not fixed pictures: they only
 * change how the renderer turns the user's line graph into fine construction
 * marks (parallel echoes, ticks, rings, leaves and halos).
 */
export const LINE_STYLES: LineStyleInfo[] = [
  {
    id: "flowing",
    label: "流麗",
    description: "弧をなぞる平行線と先細りの端。長い鎖や曲線に向く。",
  },
  {
    id: "hard",
    label: "硬質",
    description: "直線の平行線と目盛り、角のある端。折れ線や網に向く。",
  },
  {
    id: "radial",
    label: "放射",
    description: "輪の内側の同心リングと、星から放射する目盛り。閉じた形に向く。",
  },
  {
    id: "delicate",
    label: "繊細",
    description: "細い破線のエコーと小さな点。小さなまとまりや余白に向く。",
  },
];

export const LINE_STYLE_IDS = LINE_STYLES.map((style) => style.id);

export const DEFAULT_LINE_STYLE: LineStyle = "delicate";

export function isLineStyle(value: unknown): value is LineStyle {
  return (
    typeof value === "string" &&
    LINE_STYLE_IDS.includes(value as LineStyle)
  );
}

export function getLineStyle(id: unknown): LineStyleInfo {
  return (
    LINE_STYLES.find((style) => style.id === id) ??
    LINE_STYLES.find((style) => style.id === DEFAULT_LINE_STYLE) ??
    LINE_STYLES[0]
  );
}

export function lineStyleLabel(id: unknown): string {
  return getLineStyle(id).label;
}
