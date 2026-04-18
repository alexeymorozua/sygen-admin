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

    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const setAppHeight = () => {
      root.style.setProperty("--app-height", `${vv.height}px`);
    };
    setAppHeight();
    vv.addEventListener("resize", setAppHeight);
    vv.addEventListener("scroll", setAppHeight);
    return () => {
      vv.removeEventListener("resize", setAppHeight);
      vv.removeEventListener("scroll", setAppHeight);
    };
  }, []);

  return null;
}
