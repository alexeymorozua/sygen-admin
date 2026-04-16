"use client";

import { useCallback, useMemo } from "react";
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

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return items.find((i) => getId(i) === selectedId) ?? null;
  }, [selectedId, items, getId]);

  const buildUrl = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  const select = useCallback(
    (item: T) => {
      const url = buildUrl((p) => p.set(key, getId(item)));
      router.push(url, { scroll: false });
    },
    [buildUrl, router, key, getId],
  );

  const clear = useCallback(() => {
    const url = buildUrl((p) => p.delete(key));
    router.push(url, { scroll: false });
  }, [buildUrl, router, key]);

  return { selected, selectedId, select, clear };
}
