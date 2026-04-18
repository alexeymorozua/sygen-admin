"use client";

import { useEffect } from "react";

export default function ViewportLock() {
  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    if (!standalone) return;

    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      );
    }

    // iOS PWA standalone: on-screen keyboard does NOT resize the layout
    // viewport — it overlays the content. Track the gap as --kb-inset so
    // AppShell's main can shrink just enough for the focused input to
    // stay visible. Threshold avoids flip-flopping on tiny changes
    // (e.g. ResizeObserver noise during scroll).
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const isInputFocused = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };
    // If no input is focused, the keyboard cannot be up — reset to 0
    // regardless of vv.height. iOS PWA standalone keeps vv.height stale
    // after swipe-down dismiss (which doesn't fire blur on the textarea),
    // so we can't trust vv.height alone.
    const setKbInset = () => {
      if (!isInputFocused()) {
        root.style.setProperty("--kb-inset", "0px");
        // iOS PWA standalone shifts the layout viewport UP when the keyboard
        // appears and leaves it shifted after the keyboard dismisses. Force
        // the window back to origin so content isn't stuck in a scrolled
        // state with empty space below. overflow:hidden on html/body
        // prevents normal scrolling but iOS still tracks a scroll offset.
        if (window.scrollY !== 0 || window.scrollX !== 0) {
          window.scrollTo(0, 0);
        }
        return;
      }
      const diff = Math.max(0, window.innerHeight - vv.height);
      root.style.setProperty("--kb-inset", diff > 100 ? `${diff}px` : "0px");
    };
    setKbInset();
    vv.addEventListener("resize", setKbInset);
    vv.addEventListener("scroll", setKbInset);
    document.addEventListener("focusout", setKbInset);
    document.addEventListener("focusin", setKbInset);
    return () => {
      vv.removeEventListener("resize", setKbInset);
      vv.removeEventListener("scroll", setKbInset);
      document.removeEventListener("focusout", setKbInset);
      document.removeEventListener("focusin", setKbInset);
    };
  }, []);

  return null;
}
