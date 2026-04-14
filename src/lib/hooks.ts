"use client";

import { useEffect, useState } from "react";
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
