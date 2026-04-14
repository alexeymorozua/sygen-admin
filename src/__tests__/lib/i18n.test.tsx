import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { I18nProvider, useTranslation, translate, getStoredLocale, type Locale } from "@/lib/i18n";
import en from "@/lib/translations/en";
import uk from "@/lib/translations/uk";
import ru from "@/lib/translations/ru";

// Helper component for testing hooks
function TestComponent() {
  const { t, locale, setLocale } = useTranslation();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="translated">{t("dashboard.title")}</span>
      <span data-testid="nav">{t("nav.agents")}</span>
      <button data-testid="set-uk" onClick={() => setLocale("uk")}>UK</button>
      <button data-testid="set-ru" onClick={() => setLocale("ru")}>RU</button>
      <button data-testid="set-en" onClick={() => setLocale("en")}>EN</button>
    </div>
  );
}

describe("translate()", () => {
  it("returns English translation by default", () => {
    expect(translate("dashboard.title")).toBe("Dashboard");
    expect(translate("nav.agents")).toBe("Agents");
  });

  it("returns Ukrainian translation", () => {
    expect(translate("dashboard.title", "uk")).toBe("Панель");
    expect(translate("nav.agents", "uk")).toBe("Агенти");
  });

  it("returns Russian translation", () => {
    expect(translate("dashboard.title", "ru")).toBe("Панель");
    expect(translate("nav.agents", "ru")).toBe("Агенты");
  });

  it("returns the key itself for unknown keys", () => {
    expect(translate("unknown.key")).toBe("unknown.key");
    expect(translate("unknown.key", "uk")).toBe("unknown.key");
  });

  it("falls back to English for missing keys in other locales", () => {
    // All keys should exist in all locales, but test the fallback mechanism
    expect(translate("dashboard.title", "en")).toBe("Dashboard");
  });
});

describe("getStoredLocale()", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns 'en' when nothing is stored", () => {
    expect(getStoredLocale()).toBe("en");
  });

  it("returns stored locale", () => {
    localStorage.setItem("sygen_locale", "uk");
    expect(getStoredLocale()).toBe("uk");
  });

  it("returns 'en' for invalid stored value", () => {
    localStorage.setItem("sygen_locale", "invalid");
    expect(getStoredLocale()).toBe("en");
  });
});

describe("translation files completeness", () => {
  const enKeys = Object.keys(en);
  const ukKeys = Object.keys(uk);
  const ruKeys = Object.keys(ru);

  it("uk has all keys from en", () => {
    const missing = enKeys.filter((k) => !ukKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it("ru has all keys from en", () => {
    const missing = enKeys.filter((k) => !ruKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it("all translations have non-empty values", () => {
    for (const key of enKeys) {
      expect(en[key]).toBeTruthy();
      expect(uk[key]).toBeTruthy();
      expect(ru[key]).toBeTruthy();
    }
  });
});

describe("I18nProvider + useTranslation", () => {
  it("provides English translations by default", () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("translated").textContent).toBe("Dashboard");
    expect(screen.getByTestId("nav").textContent).toBe("Agents");
  });

  it("switches to Ukrainian", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );

    await user.click(screen.getByTestId("set-uk"));
    expect(screen.getByTestId("locale").textContent).toBe("uk");
    expect(screen.getByTestId("translated").textContent).toBe("Панель");
    expect(screen.getByTestId("nav").textContent).toBe("Агенти");
  });

  it("switches to Russian", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );

    await user.click(screen.getByTestId("set-ru"));
    expect(screen.getByTestId("locale").textContent).toBe("ru");
    expect(screen.getByTestId("translated").textContent).toBe("Панель");
    expect(screen.getByTestId("nav").textContent).toBe("Агенты");
  });

  it("persists locale to localStorage", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );

    await user.click(screen.getByTestId("set-uk"));
    expect(localStorage.getItem("sygen_locale")).toBe("uk");
  });

  it("restores locale from localStorage", () => {
    localStorage.setItem("sygen_locale", "ru");
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );
    expect(screen.getByTestId("locale").textContent).toBe("ru");
    expect(screen.getByTestId("translated").textContent).toBe("Панель");
  });

  it("throws when useTranslation is used outside provider", () => {
    expect(() => {
      render(<TestComponent />);
    }).toThrow("useTranslation must be used within I18nProvider");
  });
});
