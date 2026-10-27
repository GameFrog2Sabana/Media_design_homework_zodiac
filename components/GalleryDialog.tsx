"use client";

import { useCallback, useId, useRef, useState } from "react";
import { getMotif } from "@/lib/motifs";
import type { GalleryItem } from "@/lib/types";
import MiniStarMap from "./MiniStarMap";
import {
  BrandMark,
  CloseIcon,
  GalleryIcon,
  StarRatingIcon,
  TrashIcon,
} from "./Icons";
import { useDialogFocus } from "./useDialogFocus";

interface GalleryDialogProps {
  items: GalleryItem[];
  onOpen: (item: GalleryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export default function GalleryDialog({
  items,
  onOpen,
  onDelete,
  onClear,
  onClose,
}: GalleryDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleEscape = useCallback(() => {
    if (deleteTarget) {
      setDeleteTarget(null);
      return;
    }
    if (confirmClear) {
      setConfirmClear(false);
      return;
    }
    onClose();
  }, [confirmClear, deleteTarget, onClose]);

  useDialogFocus(panelRef, closeRef, handleEscape);

  return (
    <div
      className="modal-backdrop gallery-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        className="modal gallery-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="gallery-head">
          <div>
            <span className="eyebrow">YOUR NIGHT SKY</span>
            <h2 id={titleId} className="gallery-title">
              星図帳
              <span className="gallery-count">{items.length} / 30</span>
            </h2>
            <p className="gallery-lead">
              生まれた星座は、この端末に静かに残ります。画像にして持ち出すこともできます。
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="星図帳を閉じる"
          >
            <CloseIcon size={20} />
          </button>
        </header>

        {items.length === 0 ? (
          <div className="gallery-empty">
            <span className="gallery-empty-mark">
              <BrandMark size={54} />
            </span>
            <p className="eyebrow">NO CONSTELLATIONS YET</p>
            <h3>まだ、名前のない空です。</h3>
            <p>
              星をいくつか動かし、線を引いてから「星座を生む」を押すと、最初の星座がここに並びます。
            </p>
            <button type="button" className="button ghost" onClick={onClose}>
              <GalleryIcon size={18} />
              空に戻る
            </button>
          </div>
        ) : (
          <>
            <div className="gallery-toolbar">
              <span>新しい順に表示しています</span>
              {confirmClear ? (
                <span className="gallery-clear-confirm">
                  すべて消しますか？
                  <button
                    type="button"
                    className="small-danger-button"
                    onClick={() => {
                      onClear();
                      setConfirmClear(false);
                    }}
                  >
                    消す
                  </button>
                  <button
                    type="button"
                    className="small-text-button"
                    onClick={() => setConfirmClear(false)}
                  >
                    やめる
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="small-text-button"
                  onClick={() => setConfirmClear(true)}
                >
                  すべて消す
                </button>
              )}
            </div>

            <div className="gallery-scroll">
              <div className="gallery-grid">
                {items.map((item) => {
                  const motif = getMotif(item.result.motif);
                  const isDeleting = deleteTarget === item.id;
                  return (
                    <article className="gallery-card" key={item.id}>
                      <button
                        type="button"
                        className="gallery-open"
                        onClick={() => onOpen(item)}
                        aria-label={`${item.result.name}の星座を見る`}
                      >
                        <span className="gallery-thumb">
                          <MiniStarMap
                            stars={item.stars}
                            aspect={item.aspect}
                            figureEdges={item.result.figureEdges}
                            paletteId={item.result.paletteId}
                            motif={item.result.motif}
                            seedKey={item.id}
                            className="gallery-map"
                            compact
                          />
                        </span>
                        <span className="gallery-info">
                          <span className="gallery-name">
                            {item.result.name}
                          </span>
                          <span className="gallery-meta">
                            {formatDate(item.createdAt)} · {motif.label}
                          </span>
                          <span className="gallery-rating">
                            {[1, 2, 3, 4, 5].map((score) => (
                              <StarRatingIcon
                                key={score}
                                size={12}
                                filled={score <= (item.rating ?? 0)}
                                className={
                                  score <= (item.rating ?? 0)
                                    ? "is-filled"
                                    : "is-empty"
                                }
                              />
                            ))}
                            {item.rating ? (
                              <em>{item.rating}</em>
                            ) : (
                              <em className="is-unrated">未評価</em>
                            )}
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        className="gallery-delete icon-button tiny"
                        onClick={() => setDeleteTarget(item.id)}
                        aria-label={`${item.result.name}を星図帳から削除`}
                        title="星図帳から削除"
                      >
                        <TrashIcon size={15} />
                      </button>

                      {isDeleting ? (
                        <div className="gallery-delete-confirm">
                          <p>この星図を消しますか？</p>
                          <span>研究用に保存された匿名ログは消えません。</span>
                          <div>
                            <button
                              type="button"
                              className="small-danger-button"
                              onClick={() => {
                                onDelete(item.id);
                                setDeleteTarget(null);
                              }}
                            >
                              消す
                            </button>
                            <button
                              type="button"
                              className="small-text-button"
                              onClick={() => setDeleteTarget(null)}
                            >
                              やめる
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
            <footer className="gallery-foot">
              <span>
                星図帳はブラウザ内（localStorage）に保存されます。端末を変えると引き継がれません。
              </span>
              <button type="button" className="button ghost compact" onClick={onClose}>
                空に戻る
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
