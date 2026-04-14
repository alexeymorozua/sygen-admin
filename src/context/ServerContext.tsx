"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SygenServer } from "@/lib/servers";
import {
  getServers,
  getActiveServer,
  setActiveServer as persistActiveServer,
  addServer as addServerToStorage,
  updateServer as updateServerInStorage,
  removeServer as removeServerFromStorage,
} from "@/lib/servers";
import { setActiveServerForApi } from "@/lib/api";

interface ServerContextValue {
  servers: SygenServer[];
  activeServer: SygenServer;
  switchServer: (id: string) => void;
  addServer: (server: Omit<SygenServer, "id">) => SygenServer;
  updateServer: (id: string, data: Partial<Omit<SygenServer, "id">>) => void;
  removeServer: (id: string) => boolean;
  refreshKey: number;
}

const ServerContext = createContext<ServerContextValue | null>(null);

export function ServerProvider({ children }: { children: React.ReactNode }) {
  const [servers, setServers] = useState<SygenServer[]>([]);
  const [activeServer, setActive] = useState<SygenServer | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Initialize from localStorage
  useEffect(() => {
    const s = getServers();
    setServers(s);
    const active = getActiveServer();
    setActive(active);
    setActiveServerForApi(active);
  }, []);

  const switchServer = useCallback((id: string) => {
    persistActiveServer(id);
    const s = getServers();
    setServers(s);
    const active = s.find((srv) => srv.id === id) || s[0];
    setActive(active);
    setActiveServerForApi(active);
    setRefreshKey((k) => k + 1);
  }, []);

  const addServer = useCallback((server: Omit<SygenServer, "id">) => {
    const created = addServerToStorage(server);
    setServers(getServers());
    return created;
  }, []);

  const updateServer = useCallback((id: string, data: Partial<Omit<SygenServer, "id">>) => {
    updateServerInStorage(id, data);
    const s = getServers();
    setServers(s);
    if (activeServer?.id === id) {
      const updated = s.find((srv) => srv.id === id);
      if (updated) {
        setActive(updated);
        setActiveServerForApi(updated);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServer?.id]);

  const removeServerCb = useCallback((id: string) => {
    const ok = removeServerFromStorage(id);
    if (ok) {
      const s = getServers();
      setServers(s);
      if (activeServer?.id === id) {
        const newActive = s.find((srv) => srv.isDefault) || s[0];
        setActive(newActive);
        setActiveServerForApi(newActive);
        setRefreshKey((k) => k + 1);
      }
    }
    return ok;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServer?.id]);

  const value = useMemo(
    () => ({
      servers,
      activeServer: activeServer || servers[0] || {
        id: "default",
        name: "Default",
        url: "http://localhost:8080",
        token: "",
        color: "#e94560",
        isDefault: true,
      },
      switchServer,
      addServer,
      updateServer,
      removeServer: removeServerCb,
      refreshKey,
    }),
    [servers, activeServer, switchServer, addServer, updateServer, removeServerCb, refreshKey]
  );

  // Don't render children until initialized
  if (!activeServer && servers.length === 0) {
    return null;
  }

  return (
    <ServerContext.Provider value={value}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServer(): ServerContextValue {
  const ctx = useContext(ServerContext);
  if (!ctx) {
    throw new Error("useServer must be used within ServerProvider");
  }
  return ctx;
}
