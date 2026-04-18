"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export interface UrlSelection<T> {
  selected: T | null;
  selectedId: string | null;
  select: (item: T) => void;
  clear: () => void;
}

// Local state is the source of truth — URL is synced via history.replaceState
// as a shareable bookmark. Earlier the hook derived selection from
// useSearchParams + router.push, but Next.js 16 (webpack) sometimes skipped
// re-rendering consumers on same-pathname pushes, leaving the detail panel
// stuck on the previous item.
export function useUrlSelection<T>(
  key: string,
  items: T[],
  getId: (item: T) => string,
): UrlSelection<T> {
  const pathname = usePathname();

  const getIdRef = useRef(getId);
  getIdRef.current = getId;

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get(key);
  });

  useEffect(() => {
    const sync = () => {
      setSelectedId(new URLSearchParams(window.location.search).get(key));
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [key]);

  const writeUrl = useCallback(
    (id: string | null) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (id) params.set(key, id);
      else params.delete(key);
      const qs = params.toString();
      const next = qs ? `${pathname}?${qs}` : pathname;
      window.history.replaceState(null, "", next);
    },
    [pathname, key],
  );

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return items.find((i) => getIdRef.current(i) === selectedId) ?? null;
  }, [selectedId, items]);

  const select = useCallback(
    (item: T) => {
      const id = getIdRef.current(item);
      setSelectedId(id);
      writeUrl(id);
    },
    [writeUrl],
  );

  const clear = useCallback(() => {
    setSelectedId(null);
    writeUrl(null);
  }, [writeUrl]);

  return { selected, selectedId, select, clear };
}
