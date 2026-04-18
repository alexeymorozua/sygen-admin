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
    const setKbInset = () => {
      const diff = Math.max(0, window.innerHeight - vv.height);
      root.style.setProperty("--kb-inset", diff > 100 ? `${diff}px` : "0px");
    };
    setKbInset();
    vv.addEventListener("resize", setKbInset);
    return () => {
      vv.removeEventListener("resize", setKbInset);
    };
  }, []);

  return null;
}
