import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getServers,
  getActiveServer,
  setActiveServer,
  addServer,
  removeServer,
} from "@/lib/servers";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SYGEN_API_URL", "http://localhost:8080");
  vi.stubEnv("NEXT_PUBLIC_SYGEN_API_TOKEN", "test-token");
});

describe("getServers", () => {
  it("returns default server from env on first launch", () => {
    const servers = getServers();
    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      id: "default",
      name: "Default Server",
      url: "http://localhost:8080",
      isDefault: true,
    });
    // Should also persist to localStorage
    expect(localStorage.getItem("sygen-servers")).toBeTruthy();
  });

  it("returns servers from localStorage when available", () => {
    const stored = [
      { id: "srv-1", name: "Server 1", url: "http://s1:8080", token: "t1", color: "#f00", isDefault: true },
      { id: "srv-2", name: "Server 2", url: "http://s2:8080", token: "t2", color: "#0f0", isDefault: false },
    ];
    localStorage.setItem("sygen-servers", JSON.stringify(stored));

    const servers = getServers();
    expect(servers).toHaveLength(2);
    expect(servers[0].name).toBe("Server 1");
    expect(servers[1].name).toBe("Server 2");
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("sygen-servers", "not-valid-json{{{");

    const servers = getServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].id).toBe("default");
    // Corrupted data should be removed
    expect(localStorage.getItem("sygen-servers")).toBeNull();
  });

  it("returns default if localStorage has empty array", () => {
    localStorage.setItem("sygen-servers", "[]");

    const servers = getServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].id).toBe("default");
  });
});

describe("addServer", () => {
  it("persists new server to localStorage", () => {
    // Initialize with default
    getServers();

    const newServer = addServer({
      name: "Production",
      url: "http://prod:8080",
      token: "prod-token",
      color: "#00f",
      isDefault: false,
    });

    expect(newServer.id).toMatch(/^srv-/);
    expect(newServer.name).toBe("Production");

    const servers = getServers();
    expect(servers).toHaveLength(2);
    expect(servers[1].name).toBe("Production");
  });

  it("sets other servers as non-default when adding a default server", () => {
    getServers(); // Initialize with default

    addServer({
      name: "New Default",
      url: "http://new:8080",
      token: "token",
      color: "#f0f",
      isDefault: true,
    });

    const servers = getServers();
    const defaults = servers.filter((s) => s.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe("New Default");
  });
});

describe("removeServer", () => {
  it("removes server from localStorage", () => {
    const stored = [
      { id: "srv-1", name: "S1", url: "http://s1:8080", token: "t1", color: "#f00", isDefault: true },
      { id: "srv-2", name: "S2", url: "http://s2:8080", token: "t2", color: "#0f0", isDefault: false },
    ];
    localStorage.setItem("sygen-servers", JSON.stringify(stored));

    const result = removeServer("srv-2");
    expect(result).toBe(true);

    const servers = getServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].id).toBe("srv-1");
  });

  it("prevents removing the last server", () => {
    getServers(); // Initialize with single default

    const result = removeServer("default");
    expect(result).toBe(false);

    const servers = getServers();
    expect(servers).toHaveLength(1);
  });

  it("reassigns default when removing the default server", () => {
    const stored = [
      { id: "srv-1", name: "S1", url: "http://s1:8080", token: "t1", color: "#f00", isDefault: true },
      { id: "srv-2", name: "S2", url: "http://s2:8080", token: "t2", color: "#0f0", isDefault: false },
    ];
    localStorage.setItem("sygen-servers", JSON.stringify(stored));

    removeServer("srv-1");

    const servers = getServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].isDefault).toBe(true);
  });
});

describe("getActiveServer / setActiveServer", () => {
  it("returns default server when no active is set", () => {
    getServers(); // Initialize

    const active = getActiveServer();
    expect(active.id).toBe("default");
  });

  it("switches active server", () => {
    const stored = [
      { id: "srv-1", name: "S1", url: "http://s1:8080", token: "t1", color: "#f00", isDefault: true },
      { id: "srv-2", name: "S2", url: "http://s2:8080", token: "t2", color: "#0f0", isDefault: false },
    ];
    localStorage.setItem("sygen-servers", JSON.stringify(stored));

    setActiveServer("srv-2");
    const active = getActiveServer();
    expect(active.id).toBe("srv-2");
    expect(active.name).toBe("S2");
  });

  it("falls back to default when active ID is invalid", () => {
    const stored = [
      { id: "srv-1", name: "S1", url: "http://s1:8080", token: "t1", color: "#f00", isDefault: true },
    ];
    localStorage.setItem("sygen-servers", JSON.stringify(stored));
    localStorage.setItem("sygen-active-server", "nonexistent");

    const active = getActiveServer();
    expect(active.id).toBe("srv-1");
  });
});
