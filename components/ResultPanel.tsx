"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { getMotif } from "@/lib/motifs";
import { getPalette } from "@/lib/palettes";
import { downloadConstellationPng } from "@/lib/share";
import type { GalleryItem } from "@/lib/types";
import MiniStarMap from "./MiniStarMap";
import {
  CloseIcon,
  DownloadIcon,
  GalleryIcon,
  SparkleIcon,
  StarRatingIcon,
} from "./Icons";
import { useDialogFocus } from "./useDialogFocus";

interface ResultPanelProps {
  item: GalleryItem;
  researchMode: boolean;
  isNew: boolean;
  ratingBusy: boolean;
  onRate: (score: number) => void;
  onClose: () => void;
  onRegenerate: () => void;
  onOpenGallery: () => void;
  onToast: (message: string, tone?: "info" | "success" | "error") => void;
}

const RATING_LABELS = [
  "",
  "星にならなかった",
  "少し気になる",
  "好き",
  "とても好き",
  "忘れられない",
];

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function sourceCopy(source: GalleryItem["source"]): string {
  if (source === "llm") return "Geminiによる生成";
  if (source === "fallback") return "AIの予備生成";
  return "端末内の生成";
}

export default function ResultPanel({
  item,
  researchMode,
  isNew,
  ratingBusy,
  onRate,
  onClose,
  onRegenerate,
  onOpenGallery,
  onToast,
}: ResultPanelProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [hoverRating, setHoverRating] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const palette = getPalette(item.result.paletteId);
  const motif = getMotif(item.result.motif);
  const rating = item.rating ?? 0;
  const activeRating = hoverRating || rating;
  const figureNumber = useMemo(
    () => item.id.replace(/-/g, "").slice(0, 6).toUpperCase(),
    [item.id],
  );

  useDialogFocus(panelRef, closeRef, onClose);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadConstellationPng(item);
      onToast("星図をPNGで保存しました。", "success");
    } catch (error) {
      console.error(error);
      onToast("画像を保存できませんでした。別のブラウザでお試しください。", "error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="modal-backdrop result-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        className="modal result-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={
          {
            "--result-primary": palette.primary,
            "--result-secondary": palette.secondary,
          } as CSSProperties
        }
      >
        <header className="result-head">
          <div className="result-head-title">
            <span className="eyebrow">
              {isNew ? "JUST BORN" : "FROM THE ATLAS"}
            </span>
            <span className="result-fig">FIG. {figureNumber}</span>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="生成結果を閉じる"
          >
            <CloseIcon size={19} />
          </button>
        </header>

        <div className="result-body">
          <div className="result-visual">
            <div className="result-artframe">
              <MiniStarMap
                stars={item.stars}
                aspect={item.aspect}
                figureEdges={item.result.figureEdges}
                paletteId={item.result.paletteId}
                motif={item.result.motif}
                seedKey={item.id}
                className="result-map"
              />
              <span className="artframe-corner corner-tl" aria-hidden="true" />
              <span className="artframe-corner corner-tr" aria-hidden="true" />
              <span className="artframe-corner corner-bl" aria-hidden="true" />
              <span className="artframe-corner corner-br" aria-hidden="true" />
            </div>
            <div className="result-visual-foot">
              <span>
                {item.stars.length} STARS / {item.result.figureEdges.length}{" "}
                {item.result.figureEdges.length === 1 ? "LINE" : "LINES"}
              </span>
              <span>MOTIF · {motif.label}</span>
            </div>
          </div>

          <div className="result-copy">
            <p className="eyebrow">CONSTELLATION ATELIER</p>
            <h2 id={titleId} className="result-name">
              {item.result.name}
            </h2>
            {item.result.reading ? (
              <p className="result-reading">{item.result.reading}</p>
            ) : null}
            <p className="result-epithet">{item.result.epithet}</p>

            <p className="story-kicker">MYTH / 神話</p>
            <p className="result-story">{item.result.story}</p>

            <div className="keyword-row" aria-label="キーワード">
              {item.result.keywords.map((keyword) => (
                <span key={keyword} className="keyword-chip">
                  {keyword}
                </span>
              ))}
            </div>

            <dl className="result-facts">
              <div>
                <dt>モチーフ</dt>
                <dd>{motif.label}</dd>
              </div>
              <div>
                <dt>配色</dt>
                <dd>{palette.label}</dd>
              </div>
              <div>
                <dt>生成</dt>
                <dd>
                  <span className={`source-badge source-${item.source}`}>
                    <i aria-hidden="true" />
                    {sourceCopy(item.source)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>日時</dt>
                <dd>{formatDate(item.createdAt)}</dd>
              </div>
            </dl>

            <div className="rating-block">
              <div className="rating-heading">
                <span>この星座は、あなたの夜に残りましたか？</span>
                <strong aria-live="polite">
                  {activeRating > 0 ? RATING_LABELS[activeRating] : "未評価"}
                </strong>
              </div>
              <div
                className="rating-stars"
                role="group"
                aria-label="星座の評価"
                onMouseLeave={() => setHoverRating(0)}
              >
                {[1, 2, 3, 4, 5].map((score) => (
                  <button
                    key={score}
                    type="button"
                    className={`rating-star ${
                      score <= activeRating ? "is-filled" : ""
                    }`}
                    onClick={() => onRate(score)}
                    onMouseEnter={() => setHoverRating(score)}
                    onFocus={() => setHoverRating(score)}
                    onBlur={() => setHoverRating(0)}
                    aria-label={`${score}点：${RATING_LABELS[score]}`}
                    aria-pressed={rating === score}
                    disabled={ratingBusy}
                  >
                    <StarRatingIcon size={27} filled={score <= activeRating} />
                  </button>
                ))}
              </div>
              <p className="rating-hint">
                {researchMode && item.source !== "offline"
                  ? "評価は匿名のセッションIDとともに保存され、星座生成の改善に使われます。"
                  : "評価はこの端末にのみ保存されます。どこにも送信されません。"}
              </p>
            </div>

            <div className="result-actions">
              <button
                type="button"
                className="button primary"
                onClick={onRegenerate}
              >
                <SparkleIcon size={18} />
                もう一度、星に名を
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={handleDownload}
                disabled={downloading}
              >
                <DownloadIcon size={18} />
                {downloading ? "描いています…" : "PNGで保存"}
              </button>
              <button
                type="button"
                className="button quiet"
                onClick={onOpenGallery}
              >
                <GalleryIcon size={18} />
                星図帳へ
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
