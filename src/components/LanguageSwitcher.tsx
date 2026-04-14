"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LOCALES: Locale[] = ["en", "uk", "ru"];
const LOCALE_CODES: Record<Locale, string> = { en: "EN", uk: "UK", ru: "RU" };

export default function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative px-4 py-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 border border-border transition-colors"
      >
        <span>{LOCALE_CODES[locale]}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-4 mb-1 bg-bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden min-w-[140px]">
          {LOCALES.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => {
                setLocale(loc);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-white/5",
                loc === locale && "bg-accent/30 text-text-primary"
              )}
            >
              <span className="font-mono text-xs w-6">{LOCALE_CODES[loc]}</span>
              <span className="text-xs">{LOCALE_LABELS[loc]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
