import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to control USE_MOCK per test, so we mock the module dynamically
let SygenAPI: typeof import("@/lib/api").SygenAPI;
let setActiveServerForApi: typeof import("@/lib/api").setActiveServerForApi;
let createApiForServer: typeof import("@/lib/api").createApiForServer;

function mockFetch(response: unknown, options?: { ok?: boolean; status?: number }) {
  const ok = options?.ok ?? true;
  const status = options?.status ?? (ok ? 200 : 400);
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: () => Promise.resolve(response),
  });
}

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
  vi.stubEnv("NEXT_PUBLIC_SYGEN_API_URL", "http://test-api:8080");
  // NEXT_PUBLIC_SYGEN_API_TOKEN removed — token login now uses server-side proxy

  // Re-import fresh module each time
  vi.resetModules();
  const mod = await import("@/lib/api");
  SygenAPI = mod.SygenAPI;
  setActiveServerForApi = mod.setActiveServerForApi;
  createApiForServer = mod.createApiForServer;
});

describe("fetchAPI — auth header", () => {
  it("adds Authorization header from localStorage token", async () => {
    localStorage.setItem("sygen_access_token", "my-jwt");
    const fetchSpy = mockFetch({ data: [] });
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.getAgents();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test-api:8080/api/agents",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer my-jwt",
        }),
      })
    );
  });

  it("sends no Authorization when no localStorage token and no active server", async () => {
    const fetchSpy = mockFetch({ data: [] });
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.getAgents();

    const callHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    // No token available → empty bearer or no header
    expect(callHeaders.Authorization).toBeUndefined();
  });
});

describe("fetchAPI — 401 retry with refresh", () => {
  it("retries on 401 after successful token refresh", async () => {
    localStorage.setItem("sygen_access_token", "old-jwt");
    localStorage.setItem("sygen_refresh_token", "my-refresh");

    let callCount = 0;
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      // First call to /api/agents → 401
      if (url.includes("/api/agents") && callCount === 0) {
        callCount++;
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: () => Promise.resolve({ error: "Unauthorized" }),
        });
      }
      // Token refresh
      if (url.includes("/api/auth/refresh")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: "new-jwt" }),
        });
      }
      // Retry call to /api/agents → success
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [{ name: "main", status: "online" }] }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const agents = await SygenAPI.getAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("main");
    expect(localStorage.getItem("sygen_access_token")).toBe("new-jwt");
  });

  it("redirects to /login on refresh failure", async () => {
    localStorage.setItem("sygen_access_token", "old-jwt");
    localStorage.setItem("sygen_refresh_token", "bad-refresh");

    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/auth/refresh")) {
        return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: () => Promise.resolve({ error: "Unauthorized" }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    // Mock window.location
    const locationSpy = { href: "" };
    Object.defineProperty(window, "location", { value: locationSpy, writable: true });

    await expect(SygenAPI.getAgents()).rejects.toThrow("Session expired");
    expect(locationSpy.href).toBe("/login");
    expect(localStorage.getItem("sygen_access_token")).toBeNull();
  });
});

describe("getAgents / getCronJobs — data mapping", () => {
  it("getAgents maps raw API data to Agent type", async () => {
    const fetchSpy = mockFetch({
      data: [
        {
          name: "prism",
          display_name: "Prism",
          model: "claude-4",
          provider: "anthropic",
          status: "online",
          active_sessions: 3,
          last_active: "2025-01-01",
          description: "Research agent",
          allowed_users: ["alice"],
        },
      ],
    });
    vi.stubGlobal("fetch", fetchSpy);

    const agents = await SygenAPI.getAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      id: "prism",
      name: "prism",
      displayName: "Prism",
      model: "claude-4",
      provider: "anthropic",
      status: "online",
      sessions: 3,
      description: "Research agent",
      allowedUsers: ["alice"],
    });
  });

  it("getCronJobs maps raw API data to CronJob type", async () => {
    const fetchSpy = mockFetch({
      data: [
        {
          id: "cron-1",
          title: "Daily Digest",
          schedule: "0 9 * * *",
          agent: "main",
          status: "active",
          last_run: "2025-01-01",
          next_run: "2025-01-02",
          description: "Sends daily digest",
          execution_count: 42,
          avg_duration: "5s",
        },
      ],
    });
    vi.stubGlobal("fetch", fetchSpy);

    const jobs = await SygenAPI.getCronJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: "cron-1",
      name: "Daily Digest",
      schedule: "0 9 * * *",
      agent: "main",
      status: "active",
      executionCount: 42,
      avgDuration: "5s",
    });
  });
});

describe("login / logout", () => {
  it("login stores tokens", async () => {
    const fetchSpy = mockFetch({
      access_token: "new-access",
      refresh_token: "new-refresh",
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await SygenAPI.login({ username: "admin", password: "secret" });
    expect(result.access_token).toBe("new-access");
    expect(localStorage.getItem("sygen_access_token")).toBe("new-access");
    expect(localStorage.getItem("sygen_refresh_token")).toBe("new-refresh");
  });

  it("logout clears tokens", async () => {
    localStorage.setItem("sygen_access_token", "some-token");
    localStorage.setItem("sygen_refresh_token", "some-refresh");

    const fetchSpy = mockFetch({});
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.logout();
    expect(localStorage.getItem("sygen_access_token")).toBeNull();
    expect(localStorage.getItem("sygen_refresh_token")).toBeNull();
  });
});

describe("mock fallback", () => {
  it("returns mock data when USE_MOCK is true", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "true");
    vi.resetModules();
    const mod = await import("@/lib/api");

    const agents = await mod.SygenAPI.getAgents();
    // Mock data has 6 agents
    expect(agents.length).toBeGreaterThan(0);
    expect(agents[0]).toHaveProperty("id");
    expect(agents[0]).toHaveProperty("name");
  });
});

describe("setActiveServerForApi", () => {
  it("changes base URL for API requests", async () => {
    setActiveServerForApi({
      id: "srv-1",
      name: "Custom",
      url: "http://custom-server:9090",
      token: "custom-token",
      color: "#fff",
      isDefault: false,
    });

    const fetchSpy = mockFetch({ data: [] });
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.getAgents();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://custom-server:9090/api/agents",
      expect.anything()
    );

    // Cleanup
    setActiveServerForApi(null);
  });
});

describe("createApiForServer", () => {
  it("creates isolated API instance with server URL and token", async () => {
    const server = {
      id: "srv-2",
      name: "Isolated",
      url: "http://isolated:7070",
      token: "iso-token",
      color: "#000",
      isDefault: false,
    };

    const fetchSpy = mockFetch({ data: [{ name: "agent1", status: "online" }] });
    vi.stubGlobal("fetch", fetchSpy);

    const api = createApiForServer(server);
    const health = await api.checkHealth();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://isolated:7070/health",
      expect.anything()
    );
  });
});
