"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Keyboard } from "lucide-react";

const SHORTCUTS = [
  { keys: ["Ctrl", "K"], description: "Open search" },
  { keys: ["G", "D"], description: "Go to Dashboard" },
  { keys: ["G", "A"], description: "Go to Agents" },
  { keys: ["G", "C"], description: "Go to Chat" },
  { keys: ["G", "R"], description: "Go to Cron Jobs" },
  { keys: ["G", "W"], description: "Go to Webhooks" },
  { keys: ["G", "T"], description: "Go to Tasks" },
  { keys: ["G", "M"], description: "Go to Memory" },
  { keys: ["?"], description: "Show shortcuts" },
];

const NAV_MAP: Record<string, string> = {
  d: "/",
  a: "/agents",
  c: "/chat",
  r: "/cron",
  w: "/webhooks",
  t: "/tasks",
  m: "/memory",
};

export default function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false);
  const gPending = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const isInputFocused = useCallback(() => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement).isContentEditable;
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return;
      // Don't interfere with modifier combos (except Ctrl+K which is handled by CommandPalette)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // ? to show help
      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }

      // G+X two-key shortcuts
      if (key === "g") {
        e.preventDefault();
        gPending.current = true;
        if (gTimer.current) clearTimeout(gTimer.current);
        gTimer.current = setTimeout(() => { gPending.current = false; }, 500);
        return;
      }

      if (gPending.current) {
        gPending.current = false;
        if (gTimer.current) {
          clearTimeout(gTimer.current);
          gTimer.current = null;
        }
        const target = NAV_MAP[key];
        if (target) {
          e.preventDefault();
          router.push(target);
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (gTimer.current) clearTimeout(gTimer.current);
    };
  }, [router, isInputFocused]);

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center" onClick={() => setShowHelp(false)}>
      <div className="fixed inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-sm mx-4 bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-text-secondary" />
            <h3 className="font-semibold">Keyboard Shortcuts</h3>
          </div>
          <button type="button" onClick={() => setShowHelp(false)} className="p-1 hover:bg-bg-primary rounded-lg">
            <X size={16} className="text-text-secondary" />
          </button>
        </div>
        <div className="p-4 space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.description} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-text-secondary">{s.description}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 text-xs border border-border rounded font-mono text-text-primary bg-bg-primary"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
