"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_COLORS: Record<Theme, string> = {
  dark: "#0a0a14",
  light: "#f5f5f9",
};

function syncThemeColorMeta(theme: Theme): void {
  // PWA title/status bars read <meta name="theme-color"> at runtime. The
  // Viewport API only handles OS-level prefers-color-scheme, so we override
  // the single-color meta tag when the user toggles theme in-app.
  const existing = document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  existing.forEach((m) => m.remove());
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = THEME_COLORS[theme];
  document.head.appendChild(meta);
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("sygen_theme") as Theme | null;
    const effective: Theme = stored === "light" || stored === "dark" ? stored : "dark";
    setTheme(effective);
    document.documentElement.setAttribute("data-theme", effective);
    syncThemeColorMeta(effective);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("sygen_theme", next);
      document.documentElement.setAttribute("data-theme", next);
      syncThemeColorMeta(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
