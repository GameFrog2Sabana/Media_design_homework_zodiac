export interface Palette {
  id: string;
  label: string;
  /** Main constellation line color. */
  primary: string;
  /** Secondary glow / accent color. */
  secondary: string;
  /** Star core tint. */
  star: string;
  /** Dark card background gradient. */
  bg: [string, string];
}

export const PALETTES: Palette[] = [
  {
    id: "astral",
    label: "星白",
    primary: "#F6E5B2",
    secondary: "#9BD7FF",
    star: "#FFF7DD",
    bg: ["#0A1226", "#15203D"],
  },
  {
    id: "tide",
    label: "潮青",
    primary: "#9BE9E3",
    secondary: "#78A8FF",
    star: "#E9FFFF",
    bg: ["#061822", "#0A2A38"],
  },
  {
    id: "ember",
    label: "残火",
    primary: "#FFD08A",
    secondary: "#FF8C72",
    star: "#FFF0D2",
    bg: ["#1A1018", "#2C1720"],
  },
  {
    id: "violet",
    label: "宵紫",
    primary: "#D8B8FF",
    secondary: "#FFA8D8",
    star: "#F7ECFF",
    bg: ["#130B24", "#25133A"],
  },
  {
    id: "jade",
    label: "翡翠",
    primary: "#A9F0C8",
    secondary: "#F5E7A3",
    star: "#EFFFF5",
    bg: ["#071A16", "#0E2D25"],
  },
  {
    id: "rose",
    label: "薔薇",
    primary: "#FFC2D1",
    secondary: "#FFD9A0",
    star: "#FFF0F4",
    bg: ["#1B0B16", "#2E1322"],
  },
];

export function getPalette(id: string): Palette {
  return PALETTES.find((palette) => palette.id === id) ?? PALETTES[0];
}

export const PALETTE_IDS = PALETTES.map((palette) => palette.id);
