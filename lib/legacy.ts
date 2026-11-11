/**
 * Display-only compatibility for gallery entries created before the engraving
 * refactor. Older entries stored a fixed `motif` id and have no `subject`.
 * Nothing here affects artwork generation.
 */
const LEGACY_MOTIF_LABELS: Record<string, string> = {
  whale: "鯨",
  fox: "狐",
  dragon: "龍",
  bird: "鳥",
  bloom: "花",
  crown: "冠",
  ship: "舟",
  deer: "鹿",
  lantern: "灯",
  key: "鍵",
  moon: "月",
  cat: "猫",
  butterfly: "蝶",
  mountain: "山",
  fish: "魚",
  eye: "瞳",
};

export function legacyMotifLabel(id: string | undefined): string | null {
  if (!id) return null;
  return LEGACY_MOTIF_LABELS[id] ?? null;
}

/**
 * A legacy gallery entry has no subject. Keep its old picture noun as a quiet
 * memory rather than showing an empty field.
 */
export function displaySubject(
  subject: string | undefined,
  motif: string | undefined,
): string {
  const trimmed = subject?.trim();
  if (trimmed) return trimmed;
  const label = legacyMotifLabel(motif);
  return label ? `${label}の記憶` : "名もない星々";
}
