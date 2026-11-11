"use client";

import { useId } from "react";
import { decorativeStars, layoutStarMap } from "@/lib/art";
import { getLineStyle } from "@/lib/lineStyle";
import { getPalette } from "@/lib/palettes";
import type { FigureEdge, Point } from "@/lib/types";

interface MiniStarMapProps {
  stars: Point[];
  aspect: number;
  figureEdges: FigureEdge[];
  paletteId: string;
  lineStyle?: string;
  seedKey?: string;
  className?: string;
  compact?: boolean;
}

export default function MiniStarMap({
  stars,
  aspect,
  figureEdges,
  paletteId,
  lineStyle,
  seedKey = "",
  className,
  compact = false,
}: MiniStarMapProps) {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const palette = getPalette(paletteId);
  const style = getLineStyle(lineStyle);
  const box = { x: 18, y: 18, size: 324, padding: 42 };
  const layout = layoutStarMap(
    stars,
    aspect,
    box,
    seedKey,
    figureEdges,
    style.id,
  );
  const dust = decorativeStars(box, layout.seed + 11, compact ? 26 : 46);

  return (
    <svg
      className={className}
      viewBox="0 0 360 360"
      role="img"
      aria-label={`${style.label}の刻線で描いた星座図`}
    >
      <defs>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.bg[0]} />
          <stop offset="100%" stopColor={palette.bg[1]} />
        </linearGradient>
        <radialGradient id={`glow-${id}`} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor={palette.primary} stopOpacity="0.16" />
          <stop offset="65%" stopColor={palette.primary} stopOpacity="0.03" />
          <stop offset="100%" stopColor={palette.primary} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`clip-${id}`}>
          <rect x="0" y="0" width="360" height="360" rx="18" />
        </clipPath>
      </defs>

      <g clipPath={`url(#clip-${id})`}>
        <rect width="360" height="360" fill={`url(#bg-${id})`} />
        <rect width="360" height="360" fill={`url(#glow-${id})`} />

        <circle
          cx={layout.chartCenter.x}
          cy={layout.chartCenter.y}
          r={layout.chartRadius}
          fill="none"
          stroke={palette.primary}
          strokeWidth="0.7"
          strokeDasharray="1.5 7"
          opacity="0.24"
        />
        <circle
          cx={layout.chartCenter.x}
          cy={layout.chartCenter.y}
          r={layout.chartRadius + 10}
          fill="none"
          stroke={palette.primary}
          strokeWidth="0.5"
          opacity="0.1"
        />

        {dust.map((star, index) => (
          <circle
            key={`d-${index}`}
            cx={star.x}
            cy={star.y}
            r={star.r}
            fill={palette.star}
            opacity={star.opacity}
          />
        ))}

        <g
          fill="none"
          stroke={palette.secondary}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        >
          {layout.engraving.paths.map((path, index) => (
            <path
              key={`g-${index}`}
              d={path.d}
              strokeWidth={path.width}
              strokeDasharray={path.dash}
              opacity={path.opacity}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>

        {layout.engraving.halos.map((halo, index) => (
          <circle
            key={`h-${index}`}
            cx={halo.cx}
            cy={halo.cy}
            r={halo.r}
            fill="none"
            stroke={palette.secondary}
            strokeWidth="0.7"
            strokeDasharray={halo.dash}
            opacity={halo.opacity}
          />
        ))}

        {figureEdges.map(([a, b], index) => {
          const start = layout.points[a];
          const end = layout.points[b];
          if (!start || !end) return null;
          return (
            <g key={`e-${index}`}>
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={palette.primary}
                strokeWidth="4.5"
                opacity="0.1"
              />
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={palette.primary}
                strokeWidth="1.35"
                opacity="0.9"
              />
            </g>
          );
        })}

        {layout.points.map((point, index) => (
          <g key={`s-${index}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r="7"
              fill={palette.primary}
              opacity="0.1"
            />
            <circle cx={point.x} cy={point.y} r="2.4" fill={palette.star} />
            <circle cx={point.x} cy={point.y} r="0.9" fill="#ffffff" />
          </g>
        ))}

        {!compact ? (
          <>
            <text
              x="24"
              y="34"
              fill={palette.primary}
              opacity="0.62"
              fontFamily="Inter, Helvetica Neue, sans-serif"
              fontSize="7"
              letterSpacing="2.4"
            >
              CONSTELLATION ATELIER
            </text>
            <text
              x="336"
              y="34"
              textAnchor="end"
              fill={palette.star}
              opacity="0.42"
              fontFamily="Inter, Helvetica Neue, sans-serif"
              fontSize="7"
              letterSpacing="2"
            >
              FIGURE / {style.label}
            </text>
            <path
              d="M 18 36 L 18 18 L 36 18"
              fill="none"
              stroke={palette.primary}
              strokeWidth="0.7"
              opacity="0.4"
            />
            <path
              d="M 324 18 L 342 18 L 342 36"
              fill="none"
              stroke={palette.primary}
              strokeWidth="0.7"
              opacity="0.4"
            />
            <path
              d="M 18 324 L 18 342 L 36 342"
              fill="none"
              stroke={palette.primary}
              strokeWidth="0.7"
              opacity="0.4"
            />
            <path
              d="M 324 342 L 342 342 L 342 324"
              fill="none"
              stroke={palette.primary}
              strokeWidth="0.7"
              opacity="0.4"
            />
          </>
        ) : null}
      </g>
      <rect
        x="0.5"
        y="0.5"
        width="359"
        height="359"
        rx="18"
        fill="none"
        stroke={palette.primary}
        strokeOpacity="0.17"
      />
    </svg>
  );
}
