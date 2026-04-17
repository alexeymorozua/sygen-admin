"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCw } from "lucide-react";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(window.navigator.userAgent);
}

export default function PwaTopBar() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setVisible(isStandalone() && !isMobile());
    setCanGoBack(window.history.length > 1);
    const onPop = () => setCanGoBack(window.history.length > 1);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-10 flex items-center gap-1 px-2 bg-bg-sidebar/95 backdrop-blur-sm border-b border-border pl-14">
      <button
        type="button"
        onClick={() => router.back()}
        disabled={!canGoBack}
        aria-label="Назад"
        className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
      >
        <ArrowLeft size={18} />
      </button>
      <button
        type="button"
        onClick={() => window.location.reload()}
        aria-label="Обновить"
        className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
      >
        <RotateCw size={18} />
      </button>
    </div>
  );
}
