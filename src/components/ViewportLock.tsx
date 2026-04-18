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
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content",
      );
    }

    // iOS 17/18 standalone: after keyboard dismiss `100dvh` sometimes stays
    // at the reduced (keyboard-open) value until the user scrolls. We track
    // visualViewport.height into --app-vh — vv.resize fires *after* iOS has
    // committed the new height, so there is no focusin race. Fallback to
    // 100dvh via CSS var default.
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty("--app-vh", `${vv.height}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, []);

  return null;
}
