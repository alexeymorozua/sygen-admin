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

interface UseAuthedImageOptions {
  /**
   * When true, try to request a short-lived HMAC-signed URL from
   * `POST /api/files/sign-url` instead of streaming the file as a blob.
   * The returned string is a direct image URL the browser can put in
   * `<img src>`, so caching and lazy-loading work naturally.
   *
   * Only works for URLs that carry an `agent` + `relative_path`
   * query — the legacy `?path=...` avatar form silently falls back
   * to blob mode.
   */
  preferSigned?: boolean;
}

function parseSignable(url: string): { agent: string; relativePath: string } | null {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : undefined);
    const agent = parsed.searchParams.get("agent");
    const rel = parsed.searchParams.get("relative_path");
    if (!agent || !rel) return null;
    if (!parsed.pathname.endsWith("/api/files/download")) return null;
    return { agent, relativePath: rel };
  } catch {
    return null;
  }
}

/**
 * Load an image from an authed API URL.
 *
 * Default mode streams the file with `credentials: "include"` into an
 * object URL. In `preferSigned` mode we ask the server for a short-lived
 * HMAC-signed URL and hand that to the `<img>` tag — lets the browser
 * cache and lazy-load natively.
 */
export function useAuthedImage(
  url: string | null | undefined,
  options: UseAuthedImageOptions = {},
): string | null {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const activeObjectUrl = useRef<string | null>(null);
  const { preferSigned } = options;

  useEffect(() => {
    let cancelled = false;
    if (activeObjectUrl.current) {
      URL.revokeObjectURL(activeObjectUrl.current);
      activeObjectUrl.current = null;
    }
    setResolvedUrl(null);

    if (!url) return;

    (async () => {
      if (preferSigned) {
        const parsed = parseSignable(url);
        if (parsed) {
          try {
            const signed = await SygenAPI.signFileUrl(parsed.agent, parsed.relativePath, 60);
            if (cancelled) return;
            setResolvedUrl(signed);
            return;
          } catch {
            // Fall through to blob mode on sign-url failure.
          }
        }
      }
      try {
        const blob = await SygenAPI.downloadAuthedBlob(url);
        if (cancelled) return;
        const obj = URL.createObjectURL(blob);
        activeObjectUrl.current = obj;
        setResolvedUrl(obj);
      } catch {
        // Swallow — consumer shows a placeholder when resolvedUrl is null.
      }
    })();

    return () => {
      cancelled = true;
      if (activeObjectUrl.current) {
        URL.revokeObjectURL(activeObjectUrl.current);
        activeObjectUrl.current = null;
      }
    };
  }, [url, preferSigned]);

  return resolvedUrl;
}
