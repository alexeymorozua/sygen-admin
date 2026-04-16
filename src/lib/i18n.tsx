"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { en, uk, ru } from "./translations";

export type Locale = "en" | "uk" | "ru";

const STORAGE_KEY = "sygen_locale";
const DEFAULT_LOCALE: Locale = "en";

const translations: Record<Locale, Record<string, string>> = { en, uk, ru };

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  uk: "Українська",
  ru: "Русский",
};

export function getStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && (stored === "en" || stored === "uk" || stored === "ru")) {
    return stored as Locale;
  }
  return DEFAULT_LOCALE;
}

export function translate(key: string, locale: Locale = DEFAULT_LOCALE): string {
  return translations[locale]?.[key] ?? translations[DEFAULT_LOCALE]?.[key] ?? key;
}

type TParams = Record<string, string | number>;

function applyParams(text: string, params?: TParams): string {
  if (!params) return text;
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    text,
  );
}

interface I18nContextValue {
  t: (key: string, params?: TParams) => string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within I18nProvider");
  return ctx;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getStoredLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
  }, []);

  const t = useCallback(
    (key: string, params?: TParams) => applyParams(translate(key, locale), params),
    [locale]
  );

  return (
    <I18nContext.Provider value={{ t, locale, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}
