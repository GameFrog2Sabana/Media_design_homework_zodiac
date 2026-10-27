import { decorativeStars, layoutStarMap } from "./art";
import { getMotif } from "./motifs";
import { getPalette } from "./palettes";
import type { GalleryItem } from "./types";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapJapanese(text: string, charsPerLine: number): string[] {
  const chars = Array.from(text.replace(/\s+/g, " "));
  const lines: string[] = [];
  for (let index = 0; index < chars.length; index += charsPerLine) {
    lines.push(chars.slice(index, index + charsPerLine).join(""));
  }
  return lines;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/**
 * Build a self-contained 1080x1600 SVG poster. No external images or fonts are
 * referenced, so it can be rasterized safely in the browser.
 */
export function createShareSvg(item: GalleryItem): string {
  const palette = getPalette(item.result.paletteId);
  const motif = getMotif(item.result.motif);
  const mapBox = { x: 120, y: 160, size: 840, padding: 76 };
  const layout = layoutStarMap(item.stars, item.aspect, mapBox, item.id);
  const dust = decorativeStars(mapBox, layout.seed + 7, 70);
  const story = Array.from(item.result.story).slice(0, 200).join("");
  const storyLines = wrapJapanese(story, 35);
  const epithetLines = wrapJapanese(item.result.epithet, 24).slice(0, 2);
  const number = item.id.replace(/-/g, "").slice(0, 4).toUpperCase();
  const nameLength = Array.from(item.result.name).length;
  const nameSize = nameLength > 9 ? 60 : nameLength > 7 ? 68 : 78;

  const dustSvg = dust
    .map(
      (star) =>
        `<circle cx="${star.x.toFixed(1)}" cy="${star.y.toFixed(
          1,
        )}" r="${star.r.toFixed(2)}" fill="${palette.star}" opacity="${star.opacity.toFixed(
          2,
        )}"/>`,
    )
    .join("");

  const motifSvg = motif.paths
    .map(
      (path) =>
        `<path d="${path}" fill="none" stroke="${palette.primary}" stroke-width="0.55" stroke-linecap="round" stroke-linejoin="round" opacity="0.25"/>`,
    )
    .join("");

  const edgeSvg = item.result.figureEdges
    .map(([a, b]) => {
      const start = layout.points[a];
      const end = layout.points[b];
      if (!start || !end) return "";
      return [
        `<line x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(
          1,
        )}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(
          1,
        )}" stroke="${palette.primary}" stroke-width="5" opacity="0.12"/>`,
        `<line x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(
          1,
        )}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(
          1,
        )}" stroke="${palette.primary}" stroke-width="1.5" opacity="0.92"/>`,
      ].join("");
    })
    .join("");

  const starSvg = layout.points
    .map(
      (point) => `
        <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(
          1,
        )}" r="9" fill="${palette.primary}" opacity="0.10"/>
        <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(
          1,
        )}" r="3.1" fill="${palette.star}"/>
        <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(
          1,
        )}" r="1.2" fill="#ffffff"/>`,
    )
    .join("");

  const storySvg = storyLines
    .slice(0, 7)
    .map(
      (line, index) =>
        `<text x="120" y="${1270 + index * 38}" font-size="23" fill="#EFE9DC" opacity="0.88">${escapeXml(
          line,
        )}</text>`,
    )
    .join("");

  const epithetSvg = epithetLines
    .map(
      (line, index) =>
        `<text x="120" y="${1200 + index * 34}" font-family="'Yu Mincho','Hiragino Mincho ProN','Noto Serif JP',serif" font-size="27" fill="${palette.primary}" opacity="0.92">${escapeXml(
          line,
        )}</text>`,
    )
    .join("");

  const date = formatDate(item.createdAt);
  const motifLabel = escapeXml(motif.label);
  const keywords = item.result.keywords
    .slice(0, 3)
    .map((keyword) => escapeXml(keyword))
    .join("  /  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1600" viewBox="0 0 1080 1600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.bg[0]}"/>
      <stop offset="100%" stop-color="${palette.bg[1]}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="38%" r="60%">
      <stop offset="0%" stop-color="${palette.primary}" stop-opacity="0.15"/>
      <stop offset="70%" stop-color="${palette.primary}" stop-opacity="0.02"/>
      <stop offset="100%" stop-color="${palette.primary}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1600" fill="url(#bg)"/>
  <rect width="1080" height="1600" fill="url(#glow)"/>

  <text x="84" y="92" font-family="'Inter','Helvetica Neue',sans-serif" font-size="17" letter-spacing="6" fill="${palette.primary}" opacity="0.78">CONSTELLATION ATELIER</text>
  <text x="996" y="92" text-anchor="end" font-family="'Inter','Helvetica Neue',sans-serif" font-size="17" letter-spacing="3" fill="${palette.star}" opacity="0.55">FIG. ${number}</text>
  <line x1="84" y1="120" x2="996" y2="120" stroke="${palette.primary}" stroke-width="1" opacity="0.18"/>

  <rect x="${mapBox.x}" y="${mapBox.y}" width="${mapBox.size}" height="${
    mapBox.size
  }" fill="${palette.bg[0]}" opacity="0.34" stroke="${palette.primary}" stroke-width="1" stroke-opacity="0.14"/>
  <circle cx="${layout.chartCenter.x}" cy="${layout.chartCenter.y}" r="${
    layout.chartRadius
  }" fill="none" stroke="${palette.primary}" stroke-width="1" stroke-dasharray="2 10" opacity="0.22"/>
  <circle cx="${layout.chartCenter.x}" cy="${layout.chartCenter.y}" r="${
    layout.chartRadius + 26
  }" fill="none" stroke="${palette.primary}" stroke-width="1" opacity="0.08"/>
  <g transform="translate(${layout.motif.x} ${layout.motif.y}) scale(${layout.motif.scale})">
    ${motifSvg}
  </g>
  ${dustSvg}
  ${edgeSvg}
  ${starSvg}
  <path d="M ${mapBox.x + 20} ${mapBox.y + 38} L ${mapBox.x + 20} ${
    mapBox.y + 20
  } L ${mapBox.x + 38} ${mapBox.y + 20}" fill="none" stroke="${
    palette.primary
  }" stroke-width="1.2" opacity="0.5"/>
  <path d="M ${mapBox.x + mapBox.size - 38} ${mapBox.y + 20} L ${
    mapBox.x + mapBox.size - 20
  } ${mapBox.y + 20} L ${mapBox.x + mapBox.size - 20} ${
    mapBox.y + 38
  }" fill="none" stroke="${palette.primary}" stroke-width="1.2" opacity="0.5"/>
  <path d="M ${mapBox.x + 20} ${mapBox.y + mapBox.size - 38} L ${
    mapBox.x + 20
  } ${mapBox.y + mapBox.size - 20} L ${mapBox.x + 38} ${
    mapBox.y + mapBox.size - 20
  }" fill="none" stroke="${palette.primary}" stroke-width="1.2" opacity="0.5"/>
  <path d="M ${mapBox.x + mapBox.size - 38} ${
    mapBox.y + mapBox.size - 20
  } L ${mapBox.x + mapBox.size - 20} ${mapBox.y + mapBox.size - 20} L ${
    mapBox.x + mapBox.size - 20
  } ${mapBox.y + mapBox.size - 38}" fill="none" stroke="${
    palette.primary
  }" stroke-width="1.2" opacity="0.5"/>

  <text x="120" y="1100" font-family="'Yu Mincho','Hiragino Mincho ProN','Noto Serif JP',serif" font-size="${nameSize}" fill="${
    palette.star
  }" letter-spacing="4">${escapeXml(item.result.name)}</text>
  <text x="124" y="1146" font-family="'Yu Mincho','Hiragino Mincho ProN','Noto Serif JP',serif" font-size="23" letter-spacing="7" fill="${
    palette.primary
  }" opacity="0.72">${escapeXml(item.result.reading)}</text>
  <text x="120" y="1200" font-family="'Yu Mincho','Hiragino Mincho ProN','Noto Serif JP',serif" font-size="27" fill="${
    palette.primary
  }" opacity="0.92">${escapeXml(item.result.epithet)}</text>
  ${storySvg}

  <line x1="120" y1="1520" x2="960" y2="1520" stroke="${
    palette.primary
  }" stroke-width="1" opacity="0.16"/>
  <text x="120" y="1558" font-family="'Inter','Helvetica Neue',sans-serif" font-size="17" letter-spacing="3" fill="${
    palette.star
  }" opacity="0.56">MOTIF / ${motifLabel.toUpperCase()}　　${keywords}</text>
  <text x="960" y="1558" text-anchor="end" font-family="'Inter','Helvetica Neue',sans-serif" font-size="17" letter-spacing="2" fill="${
    palette.star
  }" opacity="0.42">${escapeXml(date)}</text>
</svg>`;
}

export function downloadConstellationPng(item: GalleryItem): Promise<void> {
  return new Promise((resolve, reject) => {
    const svg = createShareSvg(item);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1600;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((png) => {
          URL.revokeObjectURL(url);
          if (!png) {
            reject(new Error("PNG could not be created."));
            return;
          }
          const objectUrl = URL.createObjectURL(png);
          const link = document.createElement("a");
          const safeName = item.result.name.replace(/[\\/:*?"<>|]/g, "_");
          link.href = objectUrl;
          link.download = `${safeName || "constellation"}-星図.png`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
          resolve();
        }, "image/png");
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The SVG poster could not be loaded."));
    };

    image.src = url;
  });
}
