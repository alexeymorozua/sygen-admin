"use client";

import { useCallback, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface UrlSelection<T> {
  selected: T | null;
  selectedId: string | null;
  select: (item: T) => void;
  clear: () => void;
}

export function useUrlSelection<T>(
  key: string,
  items: T[],
  getId: (item: T) => string,
): UrlSelection<T> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get(key);

  // Call sites usually pass an inline `(a) => a.name` lambda. Treat it as
  // a ref so neither `selected` nor `select` get a new identity on every
  // parent render — that was cascading into full list re-renders.
  const getIdRef = useRef(getId);
  getIdRef.current = getId;

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return items.find((i) => getIdRef.current(i) === selectedId) ?? null;
  }, [selectedId, items]);

  const select = useCallback(
    (item: T) => {
      const params = new URLSearchParams(window.location.search);
      params.set(key, getIdRef.current(item));
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, key],
  );

  const clear = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete(key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, key]);

  return { selected, selectedId, select, clear };
}
