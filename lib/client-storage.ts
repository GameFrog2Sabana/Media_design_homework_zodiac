import type { ConsentMode, GalleryItem } from "./types";

const SESSION_KEY = "constellation-atelier.session.v1";
const CONSENT_KEY = "constellation-atelier.consent.v1";
const GALLERY_KEY = "constellation-atelier.gallery.v1";
const THEME_KEY = "constellation-atelier.theme.v1";
const GALLERY_LIMIT = 30;

let memorySession = "";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readRaw(key: string): string | null {
  if (!canUseStorage()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string | null): void {
  if (!canUseStorage()) return;
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Private browsing or a full quota should never block the game.
  }
}

function makeUUID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getSessionId(): string {
  const existing = readRaw(SESSION_KEY);
  if (existing && /^[A-Za-z0-9_-]{8,80}$/.test(existing)) return existing;

  if (!memorySession) {
    memorySession = `anon_${makeUUID().replace(/-/g, "")}`;
  }
  writeRaw(SESSION_KEY, memorySession);
  return memorySession;
}

export function getConsent(): ConsentMode | null {
  const value = readRaw(CONSENT_KEY);
  return value === "research" || value === "local" ? value : null;
}

export function setConsent(mode: ConsentMode): void {
  writeRaw(CONSENT_KEY, mode);
}

function isGalleryItem(value: unknown): value is GalleryItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<GalleryItem>;
  return (
    typeof item.id === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.aspect === "number" &&
    Array.isArray(item.stars) &&
    Array.isArray(item.edges) &&
    typeof item.result === "object" &&
    item.result !== null &&
    typeof item.result.name === "string"
  );
}

export function loadGallery(): GalleryItem[] {
  const raw = readRaw(GALLERY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isGalleryItem).slice(0, GALLERY_LIMIT);
  } catch {
    return [];
  }
}

function saveGallery(items: GalleryItem[]): GalleryItem[] {
  const trimmed = items.slice(0, GALLERY_LIMIT);
  writeRaw(GALLERY_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function addGalleryItem(item: GalleryItem): GalleryItem[] {
  const current = loadGallery().filter((entry) => entry.id !== item.id);
  return saveGallery([item, ...current]);
}

export function removeGalleryItem(id: string): GalleryItem[] {
  return saveGallery(loadGallery().filter((item) => item.id !== id));
}

export function updateGalleryRating(id: string, rating: number): GalleryItem[] {
  return saveGallery(
    loadGallery().map((item) =>
      item.id === id ? { ...item, rating } : item,
    ),
  );
}

export function clearGallery(): void {
  writeRaw(GALLERY_KEY, null);
}

export function getThemeWord(): string {
  return (readRaw(THEME_KEY) ?? "").slice(0, 40);
}

export function setThemeWord(theme: string): void {
  writeRaw(THEME_KEY, theme.slice(0, 40));
}

export function stopResearchMode(): void {
  writeRaw(CONSENT_KEY, "local");
}
