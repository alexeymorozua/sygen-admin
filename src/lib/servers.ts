export interface SygenServer {
  id: string;
  name: string;
  url: string;
  token: string;
  color: string;
  isDefault: boolean;
}

const STORAGE_KEY = "sygen-servers";
const ACTIVE_KEY = "sygen-active-server";

function generateId(): string {
  return "srv-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function getDefaultServerFromEnv(): SygenServer {
  return {
    id: "default",
    name: "Default Server",
    url: process.env.NEXT_PUBLIC_SYGEN_API_URL || "http://localhost:8741",
    token: "",
    color: "#e94560",
    isDefault: true,
  };
}

export function getServers(): SygenServer[] {
  if (typeof window === "undefined") return [getDefaultServerFromEnv()];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const defaultServer = getDefaultServerFromEnv();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([defaultServer]));
    localStorage.setItem(ACTIVE_KEY, defaultServer.id);
    return [defaultServer];
  }
  let servers: SygenServer[];
  try {
    servers = JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [getDefaultServerFromEnv()];
  }
  return servers.length > 0 ? servers : [getDefaultServerFromEnv()];
}

export function getActiveServer(): SygenServer {
  const servers = getServers();
  if (typeof window === "undefined") return servers[0];
  const activeId = localStorage.getItem(ACTIVE_KEY);
  return servers.find((s) => s.id === activeId) || servers.find((s) => s.isDefault) || servers[0];
}

export function setActiveServer(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_KEY, id);
}

export function addServer(server: Omit<SygenServer, "id">): SygenServer {
  const servers = getServers();
  const newServer: SygenServer = { ...server, id: generateId() };
  if (newServer.isDefault) {
    servers.forEach((s) => (s.isDefault = false));
  }
  servers.push(newServer);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
  return newServer;
}

export function updateServer(id: string, data: Partial<Omit<SygenServer, "id">>): SygenServer | null {
  const servers = getServers();
  const idx = servers.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  if (data.isDefault) {
    servers.forEach((s) => (s.isDefault = false));
  }
  servers[idx] = { ...servers[idx], ...data };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
  return servers[idx];
}

export function removeServer(id: string): boolean {
  const servers = getServers();
  if (servers.length <= 1) return false;
  const filtered = servers.filter((s) => s.id !== id);
  if (filtered.length === servers.length) return false;
  if (!filtered.some((s) => s.isDefault)) {
    filtered[0].isDefault = true;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  const activeId = localStorage.getItem(ACTIVE_KEY);
  if (activeId === id) {
    const def = filtered.find((s) => s.isDefault) || filtered[0];
    localStorage.setItem(ACTIVE_KEY, def.id);
  }
  return true;
}

export async function checkServerHealth(server: SygenServer): Promise<{ online: boolean; latency: number }> {
  const start = Date.now();
  try {
    const res = await fetch(`${server.url}/health`, {
      headers: { Authorization: `Bearer ${server.token}` },
      signal: AbortSignal.timeout(5000),
    });
    return { online: res.ok, latency: Date.now() - start };
  } catch {
    return { online: false, latency: Date.now() - start };
  }
}

export async function testServerConnection(
  server: SygenServer
): Promise<{ online: boolean; latency: number; version?: string; agents?: number; uptime?: string }> {
  const start = Date.now();
  try {
    const healthRes = await fetch(`${server.url}/health`, {
      headers: { Authorization: `Bearer ${server.token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!healthRes.ok) return { online: false, latency: Date.now() - start };

    try {
      const statusRes = await fetch(`${server.url}/api/system/status`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${server.token}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      if (statusRes.ok) {
        const data = await statusRes.json();
        return {
          online: true,
          latency: Date.now() - start,
          version: data.version,
          agents: data.agents,
          uptime: data.uptime,
        };
      }
    } catch {
      // status endpoint optional
    }

    return { online: true, latency: Date.now() - start };
  } catch {
    return { online: false, latency: Date.now() - start };
  }
}
