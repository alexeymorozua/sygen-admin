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

describe("fetchAPI — cookie auth", () => {
  it("sends credentials: 'include' on every request (cookies are source of truth)", async () => {
    const fetchSpy = mockFetch({ data: [] });
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.getAgents();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test-api:8080/api/agents",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("omits Authorization header by default (primary server uses cookie)", async () => {
    const fetchSpy = mockFetch({ data: [] });
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.getAgents();

    const callHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders.Authorization).toBeUndefined();
  });

  it("attaches X-CSRF-Token on unsafe methods when cookie is present", async () => {
    // Simulate server-issued CSRF cookie
    document.cookie = "sygen_csrf=csrf-abc; path=/";

    const fetchSpy = mockFetch({ data: {} });
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.deleteCronJob("cron-1");

    const callHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders["X-CSRF-Token"]).toBe("csrf-abc");

    // Cleanup cookie
    document.cookie = "sygen_csrf=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("does not send X-CSRF-Token on GET requests", async () => {
    document.cookie = "sygen_csrf=csrf-abc; path=/";

    const fetchSpy = mockFetch({ data: [] });
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.getAgents();

    const callHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders["X-CSRF-Token"]).toBeUndefined();

    document.cookie = "sygen_csrf=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });
});

describe("fetchAPI — 401 retry with cookie refresh", () => {
  it("calls /api/auth/refresh and retries on 401 without inspecting tokens", async () => {
    let authCalls = 0;
    let refreshCalled = false;
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/auth/refresh")) {
        refreshCalled = true;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true }),
        });
      }
      authCalls++;
      if (authCalls === 1) {
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: () => Promise.resolve({ error: "Unauthorized" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [{ name: "main", status: "online" }] }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const agents = await SygenAPI.getAgents();
    expect(refreshCalled).toBe(true);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("main");
  });

  it("redirects to /login when refresh fails", async () => {
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

    const locationSpy = { href: "", pathname: "/" };
    Object.defineProperty(window, "location", { value: locationSpy, writable: true });

    await expect(SygenAPI.getAgents()).rejects.toThrow("Session expired");
    expect(locationSpy.href).toBe("/login");
  });

  it("does NOT redirect to /login when core is unreachable (5xx / network)", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/auth/refresh")) {
        return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: () => Promise.resolve({ error: "Unauthorized" }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const locationSpy = { href: "", pathname: "/" };
    Object.defineProperty(window, "location", { value: locationSpy, writable: true });

    await expect(SygenAPI.getAgents()).rejects.toThrow("Backend unavailable");
    expect(locationSpy.href).toBe("");
  });

  it("does NOT redirect to /login when refresh fetch throws (network error)", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/auth/refresh")) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: () => Promise.resolve({ error: "Unauthorized" }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const locationSpy = { href: "", pathname: "/" };
    Object.defineProperty(window, "location", { value: locationSpy, writable: true });

    await expect(SygenAPI.getAgents()).rejects.toThrow("Backend unavailable");
    expect(locationSpy.href).toBe("");
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
  it("login calls server with credentials:'include' and caches the user profile", async () => {
    const fetchSpy = mockFetch({
      access_token: "ignored",
      refresh_token: "ignored",
      user: { username: "admin", role: "admin", display_name: "Admin", allowed_agents: [] },
    });
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.login({ username: "admin", password: "secret" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test-api:8080/api/auth/login",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    // Tokens are set by the server as httpOnly cookies — admin never touches them
    expect(localStorage.getItem("sygen_access_token")).toBeNull();
    expect(localStorage.getItem("sygen_refresh_token")).toBeNull();
    // Only the user profile is cached
    const cached = localStorage.getItem("sygen_user");
    expect(cached).toContain("admin");
  });

  it("logout clears the cached user and POSTs to /api/auth/logout", async () => {
    localStorage.setItem("sygen_user", JSON.stringify({ username: "admin" }));
    const fetchSpy = mockFetch({});
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.logout();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test-api:8080/api/auth/logout",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    expect(localStorage.getItem("sygen_user")).toBeNull();
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

describe("Accept-Language header (v1.3.29 localized endpoints)", () => {
  it("defaults to 'ru' when no locale is stored", async () => {
    const fetchSpy = mockFetch({ data: [] });
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.getAgents();

    const callHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders["Accept-Language"]).toBe("ru");
  });

  it("sends 'en' when locale is stored as 'en'", async () => {
    localStorage.setItem("sygen_locale", "en");
    const fetchSpy = mockFetch({ data: [] });
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.getAgents();

    const callHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders["Accept-Language"]).toBe("en");
  });

  it("falls back to uk→ru→en quality list when locale is 'uk' (backend only knows ru+en)", async () => {
    localStorage.setItem("sygen_locale", "uk");
    const fetchSpy = mockFetch({ data: [] });
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.getAgents();

    const callHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders["Accept-Language"]).toBe("uk, ru;q=0.9, en;q=0.8");
  });

  it("defaults to 'ru' for unknown locale values", async () => {
    localStorage.setItem("sygen_locale", "fr");
    const fetchSpy = mockFetch({ data: [] });
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.getAgents();

    const callHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders["Accept-Language"]).toBe("ru");
  });
});

describe("getDashboardSummary / getActivityRecent (v1.3.29)", () => {
  it("getDashboardSummary hits /api/dashboard/summary and unwraps data", async () => {
    const summary = {
      system: { cpu_percent: 1, ram_percent: 2, disk_percent: 3, uptime_seconds: 10, uptime_human: "10s" },
      counters: { agents_total: 1, agents_online: 1, active_tasks: 0, running_crons: 0, failed_last_24h: 0 },
      recent_activity: [],
    };
    const fetchSpy = mockFetch({ data: summary });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await SygenAPI.getDashboardSummary();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test-api:8080/api/dashboard/summary",
      expect.anything(),
    );
    expect(result).toEqual(summary);
  });

  it("getActivityRecent forwards limit query", async () => {
    const fetchSpy = mockFetch({ data: [] });
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.getActivityRecent(5);

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test-api:8080/api/activity/recent?limit=5",
      expect.anything(),
    );
  });

  it("getActivityRecent defaults to limit=20 when not specified", async () => {
    const fetchSpy = mockFetch({ data: [] });
    vi.stubGlobal("fetch", fetchSpy);

    await SygenAPI.getActivityRecent();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test-api:8080/api/activity/recent?limit=20",
      expect.anything(),
    );
  });

  it("getSystemStatus no longer reads removed counter fields", async () => {
    const fetchSpy = mockFetch({
      data: {
        instance_name: "primary",
        uptime_seconds: 7200,
        uptime_human: "2h",
        cpu_percent: 12,
        ram_percent: 34,
        disk_percent: 56,
      },
    });
    vi.stubGlobal("fetch", fetchSpy);

    const health = (await SygenAPI.getSystemStatus()) as Record<string, unknown>;
    expect(health.cpu).toBe(12);
    expect(health.ram).toBe(34);
    expect(health.disk).toBe(56);
    expect(health.uptime).toBe("2h");
    // Removed fields must not be present on the slim health probe.
    expect(health.agents).toBeUndefined();
    expect(health.sessions).toBeUndefined();
    expect(health.cronJobs).toBeUndefined();
    expect(health.tasksActive).toBeUndefined();
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
