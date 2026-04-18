"use client";

import { useEffect } from "react";

export default function ViewportLock() {
  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    if (!standalone) return;

    // interactive-widget=resizes-content is NOT implemented in WebKit
    // (bug #259770). Keep it out of the meta — on iOS it does nothing,
    // and leaving it creates the illusion that the keyboard will be
    // handled for us.
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      );
    }

    // iOS standalone quirk: instead of shrinking the layout viewport on
    // keyboard open, WebKit pans it via visualViewport.offsetTop.
    // Anything without position:fixed gets dragged up with the document.
    // Locking html+body with position:fixed + touch-action:none removes
    // the "document" that iOS can pan — only vv.height shrinks. main is
    // then sized to var(--app-vh) and stays pinned to the visible area.
    const html = document.documentElement;
    const body = document.body;
    const saved = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyInset: body.style.inset,
      bodyHeight: body.style.height,
      bodyTouchAction: body.style.touchAction,
    };
    html.style.overflow = "hidden";
    html.style.height = "100%";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.inset = "0";
    body.style.height = "100%";
    body.style.touchAction = "none";

    const vv = window.visualViewport;
    if (!vv) {
      return () => {
        Object.assign(html.style, { overflow: saved.htmlOverflow, height: saved.htmlHeight });
        Object.assign(body.style, {
          overflow: saved.bodyOverflow,
          position: saved.bodyPosition,
          inset: saved.bodyInset,
          height: saved.bodyHeight,
          touchAction: saved.bodyTouchAction,
        });
      };
    }

    // Double rAF works around WebKit bug #237851 where vv.offsetTop /
    // vv.height lag by one frame on focus/blur.
    //
    // Keyboard-open state is gated on document.activeElement being an
    // input/textarea — NOT on vv.height vs innerHeight, because in iOS
    // standalone PWA innerHeight can also shrink with the keyboard, so
    // the diff-based check misfires.
    //
    // When no input is focused we force vv-top=0 + vh=innerHeight to
    // sidestep iOS 26 bug FB19889436 (vv.offsetTop sticks non-zero after
    // swipe-dismiss until a scroll happens) — main returns flush to the
    // screen immediately on blur.
    const isInputFocused = () => {
      const ae = document.activeElement as HTMLElement | null;
      if (!ae) return false;
      const tag = ae.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || ae.isContentEditable;
    };
    const apply = () => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const focused = isInputFocused();
          const h = focused ? vv.height : window.innerHeight;
          const t = focused ? vv.offsetTop : 0;
          html.style.setProperty("--app-vh", `${h}px`);
          html.style.setProperty("--app-vv-top", `${t}px`);
        }),
      );
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    window.addEventListener("orientationchange", apply);
    window.addEventListener("focusin", apply);
    window.addEventListener("focusout", apply);

    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      window.removeEventListener("orientationchange", apply);
      window.removeEventListener("focusin", apply);
      window.removeEventListener("focusout", apply);
      Object.assign(html.style, { overflow: saved.htmlOverflow, height: saved.htmlHeight });
      Object.assign(body.style, {
        overflow: saved.bodyOverflow,
        position: saved.bodyPosition,
        inset: saved.bodyInset,
        height: saved.bodyHeight,
        touchAction: saved.bodyTouchAction,
      });
    };
  }, []);

  return null;
}
