import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import React from "react";

// jsdom 29 under vitest 4 does not expose a working localStorage unless
// --localstorage-file is configured. Install a minimal in-memory polyfill so
// all tests that touch localStorage (i18n, server selection, etc.) work
// without per-test setup.
if (typeof window !== "undefined" && typeof window.localStorage?.getItem !== "function") {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
}

afterEach(() => {
  cleanup();
  if (typeof localStorage !== "undefined" && typeof localStorage.clear === "function") {
    localStorage.clear();
  }
  vi.restoreAllMocks();
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock lucide-react — create a component factory for any named export
function createIconMock(name: string) {
  const component = (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": `icon-${name}`, ...props });
  component.displayName = name;
  return component;
}

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  // Wrap every export that looks like a component (PascalCase) with a simple span
  const mocked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actual)) {
    if (/^[A-Z]/.test(key) && typeof value === "function") {
      mocked[key] = createIconMock(key);
    } else {
      mocked[key] = value;
    }
  }
  return mocked;
});
