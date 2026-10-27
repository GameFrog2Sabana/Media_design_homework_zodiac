"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "audio[controls]",
  "video[controls]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    if (element.hasAttribute("hidden")) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    return element.getClientRects().length > 0;
  });
}

/**
 * Keep keyboard focus inside a modal dialog, move it to the first meaningful
 * control on open, and return it to the trigger on close. Pass no onEscape
 * when the dialog must be answered (the consent gate).
 */
export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
  onEscape?: () => void,
): void {
  const escapeRef = useRef(onEscape);

  useEffect(() => {
    escapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previous = document.activeElement as HTMLElement | null;
    const initial = initialFocusRef?.current ?? container;
    initial.focus?.();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const handler = escapeRef.current;
        if (!handler) return;
        event.preventDefault();
        // Keep the shortcut from also reaching the canvas handler.
        event.stopPropagation();
        handler();
        return;
      }

      if (event.key !== "Tab") return;

      const nodes = focusableWithin(container);
      if (nodes.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const contained = active !== null && container.contains(active);

      if (event.shiftKey) {
        if (!contained || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!contained || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus?.();
    };
  }, [containerRef, initialFocusRef]);
}
