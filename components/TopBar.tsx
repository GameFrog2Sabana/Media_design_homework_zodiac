"use client";

import { useEffect, useRef, useState } from "react";
import {
  BrandMark,
  CloseIcon,
  FeatherIcon,
  GalleryIcon,
  HelpIcon,
  RedoIcon,
  UndoIcon,
} from "./Icons";

interface TopBarProps {
  starCount: number;
  edgeCount: number;
  canUndo: boolean;
  canRedo: boolean;
  theme: string;
  onThemeChange: (value: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenGallery: () => void;
  onOpenHelp: () => void;
}

export default function TopBar({
  starCount,
  edgeCount,
  canUndo,
  canRedo,
  theme,
  onThemeChange,
  onUndo,
  onRedo,
  onOpenGallery,
  onOpenHelp,
}: TopBarProps) {
  const [inspirationOpen, setInspirationOpen] = useState(false);
  const inspirationRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!inspirationOpen) return;
    inputRef.current?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (
        inspirationRef.current &&
        !inspirationRef.current.contains(event.target as Node)
      ) {
        setInspirationOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInspirationOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [inspirationOpen]);

  return (
    <header className="topbar">
      <div className="brand" aria-label="星座アトリエ">
        <span className="brand-mark">
          <BrandMark size={31} />
        </span>
        <span className="brand-copy">
          <span className="brand-title">星座アトリエ</span>
          <span className="brand-sub">CONSTELLATION ATELIER</span>
        </span>
      </div>

      <div className="topbar-center">
        <div className="count-chip" aria-live="polite">
          <span>
            <b>{starCount}</b> 星
          </span>
          <i aria-hidden="true" />
          <span>
            <b>{edgeCount}</b> 線
          </span>
        </div>
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className="icon-button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="元に戻す"
          title="元に戻す (Ctrl+Z)"
        >
          <UndoIcon size={19} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="やり直す"
          title="やり直す (Ctrl+Shift+Z)"
        >
          <RedoIcon size={19} />
        </button>

        <span className="topbar-divider" aria-hidden="true" />

        <div className="inspiration-wrap" ref={inspirationRef}>
          <button
            type="button"
            className={`text-button inspiration-button ${
              theme ? "has-value" : ""
            }`}
            onClick={() => setInspirationOpen((open) => !open)}
            aria-expanded={inspirationOpen}
            aria-haspopup="dialog"
            title="星に込めることば（任意）"
          >
            <FeatherIcon size={18} />
            <span className="action-label">ことば</span>
            {theme ? <span className="value-dot" aria-hidden="true" /> : null}
          </button>

          {inspirationOpen ? (
            <div
              className="inspiration-popover"
              role="dialog"
              aria-label="星に込めることば"
            >
              <div className="popover-heading">
                <span className="eyebrow">WORD FOR THE SKY</span>
                <button
                  type="button"
                  className="icon-button tiny"
                  onClick={() => setInspirationOpen(false)}
                  aria-label="閉じる"
                >
                  <CloseIcon size={15} />
                </button>
              </div>
              <label htmlFor="inspiration-input">
                星に込めることば <span>任意</span>
              </label>
              <input
                id="inspiration-input"
                ref={inputRef}
                type="text"
                maxLength={40}
                value={theme}
                placeholder="例：灯台、渡り鳥、眠れない夜"
                onChange={(event) => onThemeChange(event.target.value)}
              />
              <p className="popover-hint">
                AIが名前と神話の手がかりにします。空欄のままでも神話は生まれます。
              </p>
              <div className="popover-footer">
                <button
                  type="button"
                  className="small-text-button"
                  onClick={() => onThemeChange("")}
                  disabled={!theme}
                >
                  クリア
                </button>
                <span>{Array.from(theme).length} / 40</span>
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="text-button"
          onClick={onOpenGallery}
          title="星図帳を開く"
        >
          <GalleryIcon size={18} />
          <span className="action-label">星図帳</span>
        </button>

        <span className="topbar-divider" aria-hidden="true" />

        <button
          type="button"
          className="icon-button"
          onClick={onOpenHelp}
          aria-label="遊び方と研究について"
          title="遊び方と研究について"
        >
          <HelpIcon size={19} />
        </button>
      </div>
    </header>
  );
}
