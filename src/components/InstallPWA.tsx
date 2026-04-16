"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, X } from "lucide-react";

const DISMISS_KEY = "pwa-install-dismissed";
const DISMISS_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    const ageMs = Date.now() - ts;
    return ageMs < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

export default function InstallPWA() {
  const pathname = usePathname();
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (isDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      setPrompt(null);
      setVisible(false);
      try {
        window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        // ignore
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    setPrompt(null);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  };

  const install = async () => {
    if (!prompt) return;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted" || choice.outcome === "dismissed") {
        dismiss();
      }
    } catch {
      dismiss();
    }
  };

  if (!visible || !prompt) return null;
  if (pathname === "/login") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[90] -translate-x-1/2 w-[calc(100%-2rem)] max-w-md">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-bg-card/95 px-4 py-3 shadow-lg backdrop-blur-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-400">
          <Download size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            Установить Sygen Admin
          </p>
          <p className="text-xs text-text-secondary">
            Откроется как приложение, без браузера
          </p>
        </div>
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-400 hover:bg-brand-500/20 transition-colors"
        >
          Установить
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Закрыть"
          className="shrink-0 rounded-md p-1 text-text-secondary hover:text-text-primary hover:bg-bg-sidebar transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
