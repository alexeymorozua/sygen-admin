"use client";

import { useEffect, useRef, useState } from "react";
import { SygenAPI } from "./api";
import { useServer } from "@/context/ServerContext";

interface HealthCache {
  connected: boolean;
  timestamp: number;
  serverId: string;
}

let _healthCache: HealthCache | null = null;
const HEALTH_TTL = 30000;

export function useHealthStatus() {
  const { activeServer } = useServer();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (
        _healthCache &&
        _healthCache.serverId === activeServer.id &&
        Date.now() - _healthCache.timestamp < HEALTH_TTL
      ) {
        if (!cancelled) setConnected(_healthCache.connected);
        return;
      }

      const ok = await SygenAPI.checkHealth();
      _healthCache = { connected: ok, timestamp: Date.now(), serverId: activeServer.id };
      if (!cancelled) setConnected(ok);
    }

    check();
    const interval = setInterval(check, HEALTH_TTL);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeServer.id, activeServer.url]);

  return connected;
}

/**
 * Load an image from an authed API URL into an object URL.
 *
 * Fetches with the `Authorization: Bearer <token>` header so the token
 * never ends up in URLs, referrers, or server logs. Returns null until
 * the blob has been loaded (or if `url` is null/empty).
 */
export function useAuthedImage(url: string | null | undefined): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const activeUrl = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (activeUrl.current) {
      URL.revokeObjectURL(activeUrl.current);
      activeUrl.current = null;
    }
    setObjectUrl(null);

    if (!url) return;

    (async () => {
      try {
        const blob = await SygenAPI.downloadAuthedBlob(url);
        if (cancelled) return;
        const obj = URL.createObjectURL(blob);
        activeUrl.current = obj;
        setObjectUrl(obj);
      } catch {
        // Swallow — consumer shows a placeholder when objectUrl is null.
      }
    })();

    return () => {
      cancelled = true;
      if (activeUrl.current) {
        URL.revokeObjectURL(activeUrl.current);
        activeUrl.current = null;
      }
    };
  }, [url]);

  return objectUrl;
}
