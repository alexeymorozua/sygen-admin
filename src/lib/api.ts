import {
  type Agent,
  type CronJob,
  type Webhook,
  type Task,
  type ChatMessage,
  type MemoryModule,
  type ActivityEvent,
  type SystemHealth,
  mockAgents,
  mockCronJobs,
  mockWebhooks,
  mockTasks,
  mockChatMessages,
  mockActivityEvents,
  mockSystemHealth,
  mockMemoryModules,
  mockConfig,
} from "./mock-data";
import type { SygenServer } from "./servers";

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";
const API_URL = process.env.NEXT_PUBLIC_SYGEN_API_URL || "http://localhost:8741";

// ---------------------------------------------------------------------------
// Active server override (set by ServerContext)
// ---------------------------------------------------------------------------

let _activeServer: SygenServer | null = null;

export function setActiveServerForApi(server: SygenServer | null) {
  _activeServer = server;
}

function getApiUrl(): string {
  return _activeServer?.url || API_URL;
}

function getApiToken(): string {
  return _activeServer?.token || "";
}

// ---------------------------------------------------------------------------
// Token storage helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserInfo {
  username: string;
  role: "admin" | "operator" | "viewer";
  display_name: string;
  allowed_agents: string[];
  active?: boolean;
  created_at?: number;
  totp_enabled?: boolean;
  avatar?: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: UserInfo;
  requires_2fa?: boolean;
  temp_token?: string;
}

export interface TwoFactorSetupResponse {
  secret: string;
  otpauth_uri: string;
  qr_data: string;
}

export interface SygenNotification {
  id: string;
  type: "cron" | "webhook" | "task" | "system";
  agent: string;
  title: string;
  body: string;
  status: string;
  source_id: string;
  created_at: number;
  read: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  size: number;
  mime: string;
  modified: number;
  isDir: boolean;
}

export interface AuditEntry {
  ts: string;
  user: string;
  action: string;
  target: string;
  details: string;
}

export interface ChatSession {
  id: string;
  agent: string;
  title: string;
  created_at: number;
  updated_at: number;
  provider_override?: string | null;
  model_override?: string | null;
}

export interface AvailableProvider {
  name: string;
  authenticated: boolean;
  models: string[];
  default_model: string | null;
  display_name?: string | null;
  color?: string | null;
}

export interface AvailableProvidersResponse {
  providers: AvailableProvider[];
  agent_default_model: string | null;
  agent_default_provider: string | null;
}

export interface SessionProviderInfo {
  session_id: string;
  provider: string | null;
  model: string | null;
}

export interface ChatSessionMessage {
  id: string;
  sender: "user" | "agent";
  agentName?: string;
  content: string;
  timestamp: string;
  files?: { path: string; name: string; size?: number; mime?: string }[];
}

export interface RagStatus {
  enabled: boolean;
  embedding_model: string;
  reranker_enabled: boolean;
  reranker_model: string;
  index_workspace: boolean;
  index_memory: boolean;
  top_k_retrieval: number;
  top_k_final: number;
  vector_db_path: string;
  vector_db_exists: boolean;
  vector_db_size_bytes: number;
  chunk_count: number;
  memory_fact_count: number | null;
}

export interface Skill {
  name: string;
  description: string;
  path: string;
  mtime: number;
  size: number;
  has_doc: boolean;
  doc_filename: string | null;
}

export interface RagConfigUpdate {
  enabled: boolean;
  reranker_enabled: boolean;
  index_workspace: boolean;
  index_memory: boolean;
  top_k_retrieval: number;
  top_k_final: number;
}

// ---------------------------------------------------------------------------
// Token & user storage helpers
// ---------------------------------------------------------------------------

function getStoredTokens(): { accessToken: string | null; refreshToken: string | null } {
  if (typeof window === "undefined") return { accessToken: null, refreshToken: null };
  return {
    accessToken: localStorage.getItem("sygen_access_token"),
    refreshToken: localStorage.getItem("sygen_refresh_token"),
  };
}

function storeTokens(access: string, refresh?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("sygen_access_token", access);
  if (refresh) localStorage.setItem("sygen_refresh_token", refresh);
}

function storeUser(user: UserInfo) {
  if (typeof window === "undefined") return;
  localStorage.setItem("sygen_user", JSON.stringify(user));
}

export function getStoredUser(): UserInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("sygen_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("sygen_access_token");
  localStorage.removeItem("sygen_refresh_token");
  localStorage.removeItem("sygen_user");
}

// ---------------------------------------------------------------------------
// Core fetch with JWT handling
// ---------------------------------------------------------------------------

let _refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = getStoredTokens();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${getApiUrl()}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const newAccess = data.access_token;
    if (newAccess) {
      storeTokens(newAccess);
      return newAccess;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const { accessToken } = getStoredTokens();
  const token = accessToken || getApiToken();
  const baseUrl = getApiUrl();

  const res = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (res.status === 401 && accessToken) {
    // Try refresh once (deduplicated)
    if (!_refreshPromise) {
      _refreshPromise = refreshAccessToken().finally(() => { _refreshPromise = null; });
    }
    const newToken = await _refreshPromise;
    if (newToken) {
      const retry = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${newToken}`,
          ...options?.headers,
        },
      });
      if (retry.ok) {
        const json = await retry.json();
        return json.data !== undefined ? json.data : json;
      }
    }
    // Refresh failed — clear tokens and redirect to login
    clearTokens();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `API Error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

// ---------------------------------------------------------------------------
// API class
// ---------------------------------------------------------------------------

export class SygenAPI {
  // ---- Auth ----

  static async login(credentials: { username: string; password: string } | { token: string }): Promise<LoginResponse> {
    let res: Response;

    if ("token" in credentials) {
      // Token login goes through the server-side proxy to avoid
      // exposing secrets in the client bundle.
      res = await fetch("/api/auth/token-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: credentials.token }),
      });
    } else {
      // Username/password login hits Sygen Core directly — no secrets involved.
      res = await fetch(`${getApiUrl()}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
    }

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Login failed");
    }
    const data = await res.json();
    // If 2FA is required, don't store tokens yet — return early
    if (data.requires_2fa) {
      return data;
    }
    storeTokens(data.access_token, data.refresh_token);
    if (data.user) {
      storeUser(data.user);
    }
    return data;
  }

  static async login2FA(tempToken: string, code: string): Promise<LoginResponse> {
    const res = await fetch(`${getApiUrl()}/api/auth/2fa/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temp_token: tempToken, code }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "2FA verification failed");
    }
    const data = await res.json();
    storeTokens(data.access_token, data.refresh_token);
    if (data.user) {
      storeUser(data.user);
    }
    return data;
  }

  static async logout(): Promise<void> {
    const { refreshToken } = getStoredTokens();
    if (refreshToken) {
      try {
        await fetch(`${getApiUrl()}/api/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch { /* ignore */ }
    }
    clearTokens();
  }

  static isAuthenticated(): boolean {
    if (USE_MOCK) return true;
    const { accessToken } = getStoredTokens();
    return !!accessToken;
  }

  // ---- Auto-login: validate existing stored JWT ----

  static async autoLogin(): Promise<boolean> {
    const { accessToken } = getStoredTokens();
    if (!accessToken) return false;
    // We already have a stored JWT — consider authenticated.
    // Token refresh on 401 is handled by fetchAPI.
    return true;
  }

  // ---- Agents ----

  static async getAgents(): Promise<Agent[]> {
    if (USE_MOCK) return mockAgents;
    const data = await fetchAPI<Record<string, unknown>[]>("/api/agents");
    return data.map(mapAgent);
  }

  static async getAgent(name: string): Promise<Agent | undefined> {
    if (USE_MOCK) return mockAgents.find((a) => a.id === name || a.name === name);
    try {
      const data = await fetchAPI<Record<string, unknown>>(`/api/agents/${name}`);
      return mapAgent(data);
    } catch {
      return undefined;
    }
  }

  // ---- Agent Metrics ----

  static async getAgentMetrics(
    name: string,
    period: "24h" | "7d" = "24h",
  ): Promise<{
    total_executions: number;
    avg_duration_seconds: number;
    error_count: number;
    success_rate: number;
    last_active: string | null;
    tokens_used: number | null;
    period: string;
  }> {
    if (USE_MOCK) {
      return {
        total_executions: 0,
        avg_duration_seconds: 0,
        error_count: 0,
        success_rate: 100,
        last_active: null,
        tokens_used: null,
        period,
      };
    }
    return fetchAPI(`/api/agents/${name}/metrics?period=${period}`);
  }

  static async getAgentMetricsHistory(
    name: string,
    period: "24h" | "7d" = "24h",
  ): Promise<
    { timestamp: string; executions: number; errors: number; avg_duration: number }[]
  > {
    if (USE_MOCK) return [];
    return fetchAPI(`/api/agents/${name}/metrics/history?period=${period}`);
  }

  // ---- Cron Jobs ----

  static async getCronJobs(): Promise<CronJob[]> {
    if (USE_MOCK) return mockCronJobs;
    const data = await fetchAPI<Record<string, unknown>[]>("/api/cron");
    return data.map(mapCronJob);
  }

  static async createCronJob(job: Partial<CronJob>): Promise<CronJob> {
    if (USE_MOCK) {
      const newJob: CronJob = {
        id: `cron-${Date.now()}`,
        name: job.name || "New Job",
        schedule: job.schedule || "* * * * *",
        agent: job.agent || "main",
        status: "active",
        lastRun: "-",
        nextRun: "-",
        description: job.description || "",
        executionCount: 0,
        avgDuration: "0s",
        ...job,
      };
      return newJob;
    }
    const body = {
      id: job.id || `cron-${Date.now()}`,
      title: job.name,
      schedule: job.schedule,
      agent: job.agent,
      description: job.description,
      ...job,
    };
    const data = await fetchAPI<Record<string, unknown>>("/api/cron", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return mapCronJob(data);
  }

  static async updateCronJob(id: string, data: Partial<CronJob>): Promise<CronJob> {
    if (USE_MOCK) {
      const job = mockCronJobs.find((j) => j.id === id);
      return { ...job!, ...data };
    }
    const result = await fetchAPI<Record<string, unknown>>(`/api/cron/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return mapCronJob(result);
  }

  static async deleteCronJob(id: string): Promise<void> {
    if (USE_MOCK) return;
    await fetchAPI(`/api/cron/${id}`, { method: "DELETE" });
  }

  static async runCronJob(id: string): Promise<void> {
    if (USE_MOCK) return;
    await fetchAPI(`/api/cron/${id}/run`, { method: "POST" });
  }

  // ---- Webhooks ----

  static async getWebhooks(): Promise<Webhook[]> {
    if (USE_MOCK) return mockWebhooks;
    const data = await fetchAPI<Record<string, unknown>[]>("/api/webhooks");
    return data.map(mapWebhook);
  }

  static async createWebhook(wh: Partial<Webhook>): Promise<Webhook> {
    if (USE_MOCK) {
      return {
        id: `wh-${Date.now()}`,
        name: wh.name || "New Webhook",
        url: wh.url || "/webhooks/new",
        method: wh.method || "POST",
        agent: wh.agent || "main",
        status: "active",
        lastTriggered: "-",
        triggerCount: 0,
        description: wh.description || "",
        ...wh,
      } as Webhook;
    }
    const body = {
      id: wh.id || `wh-${Date.now()}`,
      ...wh,
    };
    const data = await fetchAPI<Record<string, unknown>>("/api/webhooks", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return mapWebhook(data);
  }

  static async updateWebhook(id: string, data: Partial<Webhook>): Promise<Webhook> {
    if (USE_MOCK) {
      const wh = mockWebhooks.find((w) => w.id === id);
      return { ...wh!, ...data };
    }
    const result = await fetchAPI<Record<string, unknown>>(`/api/webhooks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return mapWebhook(result);
  }

  static async deleteWebhook(id: string): Promise<void> {
    if (USE_MOCK) return;
    await fetchAPI(`/api/webhooks/${id}`, { method: "DELETE" });
  }

  // ---- Tasks ----

  static async getTasks(filters?: { status?: string; limit?: number }): Promise<Task[]> {
    if (USE_MOCK) return mockTasks;
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.limit) params.set("limit", String(filters.limit));
    const qs = params.toString();
    const data = await fetchAPI<Record<string, unknown>[]>(`/api/tasks${qs ? `?${qs}` : ""}`);
    return data.map(mapTask);
  }

  static async getTask(id: string): Promise<Task | undefined> {
    if (USE_MOCK) return mockTasks.find((t) => t.id === id);
    try {
      const data = await fetchAPI<Record<string, unknown>>(`/api/tasks/${id}`);
      return mapTask(data);
    } catch {
      return undefined;
    }
  }

  static async createTask(data: { name: string; agent?: string; prompt?: string; provider?: string }): Promise<Task> {
    if (USE_MOCK) {
      return {
        id: `task-${Date.now().toString(16)}`,
        name: data.name,
        status: "running",
        agent: data.agent || "main",
        provider: data.provider || "claude",
        startedAt: new Date().toISOString(),
        duration: "0s",
        description: data.prompt || "",
      };
    }
    const raw = await fetchAPI<Record<string, unknown>>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return mapTask(raw);
  }

  static async cancelTask(id: string): Promise<void> {
    if (USE_MOCK) return;
    await fetchAPI(`/api/tasks/${id}/cancel`, { method: "POST" });
  }

  // ---- Webhook test ----

  static async testWebhook(url: string): Promise<{ status: number; body: string }> {
    if (USE_MOCK) {
      return { status: 200, body: '{"ok": true}' };
    }
    // Validate the URL to prevent SSRF via client-side fetch to internal networks
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Only HTTP(S) URLs are allowed");
      }
      // Block requests to common internal/private addresses
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "0.0.0.0" ||
        hostname.startsWith("10.") ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("172.") ||
        hostname === "[::1]" ||
        hostname.endsWith(".internal") ||
        hostname.endsWith(".local")
      ) {
        throw new Error("Cannot test webhooks against internal/private addresses");
      }
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error("Invalid URL");
      }
      throw err;
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true, timestamp: new Date().toISOString() }),
        signal: AbortSignal.timeout(10000),
        credentials: "omit",
      });
      const text = await res.text();
      return { status: res.status, body: text.slice(0, 500) };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Request failed");
    }
  }

  // ---- Sessions ----

  static async getSessions(): Promise<Record<string, unknown>> {
    if (USE_MOCK) return {};
    return fetchAPI<Record<string, unknown>>("/api/sessions");
  }

  static async deleteSession(id: string): Promise<void> {
    if (USE_MOCK) return;
    await fetchAPI(`/api/sessions/${id}`, { method: "DELETE" });
  }

  // ---- Memory ----

  static async getMemory(): Promise<{ content: string }> {
    if (USE_MOCK) {
      const main = mockMemoryModules.find((m) => m.type === "main");
      return { content: main?.content || "" };
    }
    return fetchAPI<{ content: string }>("/api/memory");
  }

  static async updateMemory(content: string): Promise<void> {
    if (USE_MOCK) return;
    await fetchAPI("/api/memory", {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  }

  static async getMemoryModules(agent?: string): Promise<MemoryModule[]> {
    if (USE_MOCK) return mockMemoryModules;
    const qs = agent ? `?agent=${encodeURIComponent(agent)}` : "";
    const data = await fetchAPI<{ name: string; filename: string; size: number; lines?: number }[]>(`/api/memory/modules${qs}`);
    return data.map((m, i) => ({
      id: `mem-${i}`,
      name: m.name,
      filename: m.filename,
      type: m.filename === "MAINMEMORY.md" ? "main" as const
        : m.filename === "SHAREDMEMORY.md" ? "shared" as const
        : "agent" as const,
      lastModified: new Date().toISOString(),
      size: formatSize(m.size),
      lines: m.lines,
      content: "",
    }));
  }

  static async getMemoryModuleContent(filename: string, agent?: string): Promise<string> {
    if (USE_MOCK) {
      const mod = mockMemoryModules.find((m) => m.filename === filename);
      return mod?.content || "";
    }
    const qs = agent ? `?agent=${encodeURIComponent(agent)}` : "";
    const data = await fetchAPI<{ filename: string; content: string }>(`/api/memory/modules/${encodeURIComponent(filename)}${qs}`);
    return data.content;
  }

  static async updateMemoryModule(filename: string, content: string, agent?: string): Promise<void> {
    if (USE_MOCK) return;
    const qs = agent ? `?agent=${encodeURIComponent(agent)}` : "";
    await fetchAPI(`/api/memory/modules/${encodeURIComponent(filename)}${qs}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  }

  // ---- Skills ----

  static async getSkills(agent: string): Promise<Skill[]> {
    if (USE_MOCK) return [];
    return fetchAPI<Skill[]>(`/api/agents/${encodeURIComponent(agent)}/skills`);
  }

  static async getSkill(agent: string, skill: string): Promise<{ name: string; filename: string | null; content: string }> {
    if (USE_MOCK) return { name: skill, filename: "SKILL.md", content: "" };
    return fetchAPI<{ name: string; filename: string | null; content: string }>(
      `/api/agents/${encodeURIComponent(agent)}/skills/${encodeURIComponent(skill)}`,
    );
  }

  static async updateSkill(agent: string, skill: string, content: string): Promise<void> {
    if (USE_MOCK) return;
    await fetchAPI(`/api/agents/${encodeURIComponent(agent)}/skills/${encodeURIComponent(skill)}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  }

  static async createSkill(agent: string, name: string, content: string): Promise<Skill> {
    if (USE_MOCK) {
      return {
        name,
        description: "",
        path: "",
        mtime: Date.now() / 1000,
        size: content.length,
        has_doc: true,
        doc_filename: "SKILL.md",
      };
    }
    return fetchAPI<Skill>(`/api/agents/${encodeURIComponent(agent)}/skills`, {
      method: "POST",
      body: JSON.stringify({ name, content }),
    });
  }

  static async deleteSkill(agent: string, skill: string): Promise<void> {
    if (USE_MOCK) return;
    await fetchAPI(`/api/agents/${encodeURIComponent(agent)}/skills/${encodeURIComponent(skill)}`, {
      method: "DELETE",
    });
  }

  // ---- RAG ----

  static async getRagStatus(): Promise<RagStatus> {
    if (USE_MOCK) {
      return {
        enabled: false,
        embedding_model: "paraphrase-multilingual-MiniLM-L12-v2",
        reranker_enabled: false,
        reranker_model: "antoinelouis/colbert-xm",
        index_workspace: true,
        index_memory: true,
        top_k_retrieval: 20,
        top_k_final: 5,
        vector_db_path: "/mock/vector_db",
        vector_db_exists: false,
        vector_db_size_bytes: 0,
        chunk_count: 0,
        memory_fact_count: 0,
      };
    }
    return fetchAPI<RagStatus>("/api/rag/status");
  }

  static async updateRagConfig(updates: Partial<RagConfigUpdate>): Promise<void> {
    if (USE_MOCK) return;
    await fetchAPI("/api/rag/config", {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  // ---- System ----

  static async getSystemStatus(): Promise<SystemHealth> {
    if (USE_MOCK) return mockSystemHealth;
    const data = await fetchAPI<Record<string, unknown>>("/api/system/status");
    return {
      instanceName: String(data.instance_name || ""),
      cpu: Number(data.cpu_percent) || 0,
      ram: Number(data.ram_percent) || 0,
      disk: Number(data.disk_percent) || 0,
      uptime: formatUptime(Number(data.uptime_seconds) || 0),
      agents: Number(data.agents) || 0,
      sessions: Number(data.sessions) || 0,
      cronJobs: Number(data.cron_jobs) || 0,
      tasksTotal: Number(data.tasks_total) || 0,
      tasksActive: Number(data.tasks_active) || 0,
    } as SystemHealth & Record<string, unknown>;
  }

  static async updateInstanceName(name: string): Promise<void> {
    await fetchAPI("/api/system/instance-name", {
      method: "PUT",
      body: JSON.stringify({ instance_name: name }),
    });
  }

  static async getLogs(lines?: number, agent?: string): Promise<{ agent: string; lines: string[] }> {
    if (USE_MOCK) return { agent: agent || "main", lines: ["[mock] No real logs available"] };
    const params = new URLSearchParams();
    if (lines) params.set("lines", String(lines));
    if (agent) params.set("agent", agent);
    const qs = params.toString();
    return fetchAPI<{ agent: string; lines: string[] }>(`/api/logs${qs ? `?${qs}` : ""}`);
  }

  static async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${getApiUrl()}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  // ---- Chat Sessions ----

  static async getChatSessions(agentId?: string): Promise<ChatSession[]> {
    if (USE_MOCK) return [];
    const params = agentId ? `?agent=${encodeURIComponent(agentId)}` : "";
    return fetchAPI<ChatSession[]>(`/api/chat/sessions${params}`);
  }

  static async createChatSession(agentId: string, title?: string): Promise<ChatSession> {
    if (USE_MOCK) {
      return {
        id: `session-${Date.now()}`,
        agent: agentId,
        title: title || `Chat ${new Date().toLocaleString()}`,
        created_at: Date.now() / 1000,
        updated_at: Date.now() / 1000,
      };
    }
    return fetchAPI<ChatSession>("/api/chat/sessions", {
      method: "POST",
      body: JSON.stringify({ agent: agentId, title }),
    });
  }

  static async updateChatSession(sessionId: string, data: { title?: string }): Promise<ChatSession> {
    if (USE_MOCK) {
      return { id: sessionId, agent: "main", title: data.title || "", created_at: 0, updated_at: Date.now() / 1000 };
    }
    return fetchAPI<ChatSession>(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  static async deleteChatSession(sessionId: string): Promise<void> {
    if (USE_MOCK) return;
    await fetchAPI(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  }

  static async getChatHistory(sessionId: string): Promise<ChatSessionMessage[]> {
    if (USE_MOCK) return [];
    return fetchAPI<ChatSessionMessage[]>(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`);
  }

  static async saveChatHistory(sessionId: string, messages: ChatSessionMessage[]): Promise<void> {
    if (USE_MOCK) return;
    await fetchAPI(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: "PUT",
      body: JSON.stringify({ messages }),
    });
  }

  // ---- Provider switching ----

  static async getAvailableProviders(): Promise<AvailableProvidersResponse> {
    if (USE_MOCK) {
      return {
        providers: [
          { name: "claude", authenticated: true, models: ["haiku", "sonnet", "opus"], default_model: "sonnet" },
          { name: "gemini", authenticated: true, models: ["flash", "pro"], default_model: "flash" },
          { name: "codex", authenticated: false, models: [], default_model: null },
        ],
        agent_default_model: "sonnet",
        agent_default_provider: "claude",
      };
    }
    return fetchAPI<AvailableProvidersResponse>("/api/providers/available");
  }

  static async setSessionProvider(
    sessionId: string,
    provider: string,
    model: string
  ): Promise<SessionProviderInfo> {
    if (USE_MOCK) {
      return { session_id: sessionId, provider, model };
    }
    return fetchAPI<SessionProviderInfo>(
      `/api/chat/sessions/${encodeURIComponent(sessionId)}/provider`,
      {
        method: "POST",
        body: JSON.stringify({ provider, model }),
      }
    );
  }

  static async resetSessionProvider(sessionId: string): Promise<SessionProviderInfo> {
    if (USE_MOCK) {
      return { session_id: sessionId, provider: null, model: null };
    }
    return fetchAPI<SessionProviderInfo>(
      `/api/chat/sessions/${encodeURIComponent(sessionId)}/provider`,
      {
        method: "POST",
        body: JSON.stringify({ provider: null, model: null }),
      }
    );
  }

  static async transcribeAudio(filePath: string): Promise<string> {
    if (USE_MOCK) return "(mock transcript)";
    const data = await fetchAPI<{ transcript: string }>("/api/transcribe", {
      method: "POST",
      body: JSON.stringify({ path: filePath }),
    });
    return data.transcript;
  }

  // ---- Chat (kept for compatibility) ----

  static async getChatMessages(agentId?: string): Promise<ChatMessage[]> {
    if (USE_MOCK) {
      if (agentId) {
        return mockChatMessages.filter(
          (m) => m.agentId === agentId || m.sender === "user"
        );
      }
      return mockChatMessages;
    }
    const query = agentId ? `?agent=${agentId}` : "";
    return fetchAPI<ChatMessage[]>(`/api/chat${query}`);
  }

  static async sendMessage(agentId: string, content: string): Promise<ChatMessage> {
    if (USE_MOCK) {
      return {
        id: `msg-${Date.now()}`,
        sender: "user",
        content,
        timestamp: new Date().toISOString(),
      };
    }
    return fetchAPI<ChatMessage>(`/api/chat/${agentId}`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  }

  // ---- Activity (dashboard, uses mock fallback) ----

  static async getActivity(): Promise<ActivityEvent[]> {
    if (USE_MOCK) return mockActivityEvents;
    const data = await fetchAPI<Record<string, unknown>[]>("/api/activity");
    return data.map((item, i) => ({
      id: String(item.id || `activity-${i}`),
      type: (item.type as ActivityEvent["type"]) || "system",
      message: String(item.message || ""),
      timestamp: String(item.timestamp || ""),
      agent: item.agent ? String(item.agent) : undefined,
      details: item.details ? String(item.details) : undefined,
    }));
  }

  // ---- Commands (slash menu) ----

  static async getCommands(): Promise<{
    commands: { command: string; description: string }[];
    multiagent: { command: string; description: string }[];
  }> {
    return fetchAPI("/api/commands");
  }

  // ---- Config (settings page) ----

  static async getConfig(): Promise<typeof mockConfig> {
    if (USE_MOCK) return mockConfig;
    const raw = await fetchAPI<Record<string, unknown>>("/api/config");
    return mapConfig(raw) as typeof mockConfig;
  }

  // ---- Users (RBAC) ----

  static async getUsers(): Promise<UserInfo[]> {
    return fetchAPI<UserInfo[]>("/api/users");
  }

  static async createUser(data: {
    username: string;
    password: string;
    role: string;
    display_name?: string;
    allowed_agents?: string[];
  }): Promise<UserInfo> {
    return fetchAPI<UserInfo>("/api/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  static async updateUser(
    username: string,
    data: Partial<{
      role: string;
      display_name: string;
      allowed_agents: string[];
      active: boolean;
      password: string;
    }>,
  ): Promise<UserInfo> {
    return fetchAPI<UserInfo>(`/api/users/${encodeURIComponent(username)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  static async deleteUser(username: string): Promise<void> {
    await fetchAPI(`/api/users/${encodeURIComponent(username)}`, {
      method: "DELETE",
    });
  }

  // ---- Audit log ----

  static async getAuditLog(limit?: number): Promise<AuditEntry[]> {
    const qs = limit ? `?limit=${limit}` : "";
    return fetchAPI<AuditEntry[]>(`/api/audit${qs}`);
  }

  // ---- Notifications ----

  static async getNotifications(limit = 50, unreadOnly = false): Promise<SygenNotification[]> {
    if (USE_MOCK) return [];
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (unreadOnly) params.set("unread_only", "true");
    return fetchAPI<SygenNotification[]>(`/api/notifications?${params.toString()}`);
  }

  static async getUnreadCount(): Promise<number> {
    if (USE_MOCK) return 0;
    const data = await fetchAPI<{ count: number }>("/api/notifications/unread-count");
    return data.count;
  }

  static async markNotificationRead(id: string): Promise<void> {
    if (USE_MOCK) return;
    await fetchAPI(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "PUT" });
  }

  static async markAllNotificationsRead(): Promise<void> {
    if (USE_MOCK) return;
    await fetchAPI("/api/notifications/read-all", { method: "POST" });
  }

  // ---- Profile ----

  static async updateProfile(data: {
    display_name?: string;
    old_password?: string;
    new_password?: string;
    avatar?: string;
  }): Promise<UserInfo> {
    const result = await fetchAPI<UserInfo>("/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    });
    if (result.username) storeUser(result);
    return result;
  }

  // ---- Current user ----

  static async getMe(): Promise<UserInfo> {
    return fetchAPI<UserInfo>("/api/auth/me");
  }

  // ---- 2FA ----

  static async setup2FA(): Promise<TwoFactorSetupResponse> {
    return fetchAPI<TwoFactorSetupResponse>("/api/auth/2fa/setup", { method: "POST" });
  }

  static async verify2FA(code: string): Promise<{ status: string; totp_enabled: boolean }> {
    return fetchAPI<{ status: string; totp_enabled: boolean }>("/api/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  static async disable2FA(code: string): Promise<{ status: string; totp_enabled: boolean }> {
    return fetchAPI<{ status: string; totp_enabled: boolean }>("/api/auth/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  // ---- Avatar ----

  static async uploadAvatar(file: File): Promise<{ path: string }> {
    const { accessToken } = getStoredTokens();
    const token = accessToken || getApiToken();
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${getApiUrl()}/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Avatar upload failed");
    }
    const data = await res.json();
    const path = data.path as string;

    const updated = await SygenAPI.updateProfile({ avatar: path });
    return { path: updated.avatar || path };
  }

  static getAvatarUrl(path: string): string {
    return `${getApiUrl()}/api/files/download?path=${encodeURIComponent(path)}`;
  }

  // ---- Webhook signature verify ----

  static async verifyWebhookSignature(
    id: string,
    payload: string,
    signature: string,
  ): Promise<{ valid: boolean }> {
    return fetchAPI<{ valid: boolean }>(`/api/webhooks/${encodeURIComponent(id)}/verify`, {
      method: "POST",
      body: JSON.stringify({ payload, signature }),
    });
  }

  // ---- Export / Import ----

  static async exportConfig(): Promise<{
    version: number;
    exported_at: string;
    cron_jobs: Record<string, unknown>[];
    webhooks: Record<string, unknown>[];
    users: Record<string, unknown>[];
  }> {
    if (USE_MOCK) {
      return { version: 1, exported_at: new Date().toISOString(), cron_jobs: [], webhooks: [], users: [] };
    }
    return fetchAPI("/api/export");
  }

  static async importConfig(data: Record<string, unknown>): Promise<{
    cron_jobs_added: number;
    webhooks_added: number;
    users_added: number;
    skipped: number;
  }> {
    if (USE_MOCK) {
      return { cron_jobs_added: 0, webhooks_added: 0, users_added: 0, skipped: 0 };
    }
    return fetchAPI("/api/import", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ---- Live log polling ----

  static async getLogsPoll(
    agent?: string,
    after?: number,
    lines?: number,
  ): Promise<{ agent: string; lines: string[]; timestamp: number }> {
    if (USE_MOCK) return { agent: agent || "main", lines: [], timestamp: Date.now() / 1000 };
    const params = new URLSearchParams();
    if (agent) params.set("agent", agent);
    if (after) params.set("after", String(after));
    if (lines) params.set("lines", String(lines));
    const qs = params.toString();
    return fetchAPI(`/api/logs/poll${qs ? `?${qs}` : ""}`);
  }

  // ---- WebSocket for chat ----

  static connectChat(agentId: string, onMessage: (msg: ChatMessage) => void): () => void {
    if (USE_MOCK) {
      const timer = setTimeout(() => {
        onMessage({
          id: `msg-ws-${Date.now()}`,
          sender: "agent",
          agentId,
          content: "WebSocket connection simulated. Real-time messaging will be available when the API is connected.",
          timestamp: new Date().toISOString(),
        });
      }, 2000);
      return () => clearTimeout(timer);
    }

    const { accessToken } = getStoredTokens();
    const token = accessToken || getApiToken();
    const wsUrl = getApiUrl().replace(/^http/, "ws");
    const ws = new WebSocket(`${wsUrl}/ws/chat/${agentId}`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token }));
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ChatMessage;
        onMessage(msg);
      } catch {
        // Ignore unparseable frames
      }
    };
    return () => ws.close();
  }

  static async uploadAgentAvatar(agentName: string, file: File): Promise<void> {
    const { accessToken } = getStoredTokens();
    const token = accessToken || getApiToken();
    const formData = new FormData();
    formData.append("avatar", file, file.name);

    const res = await fetch(
      `${getApiUrl()}/api/agents/${encodeURIComponent(agentName)}/avatar`,
      {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Avatar upload failed");
    }
  }

  static async deleteAgentAvatar(agentName: string): Promise<void> {
    await fetchAPI(`/api/agents/${encodeURIComponent(agentName)}/avatar`, {
      method: "DELETE",
    });
  }

  static getAgentAvatarUrl(agentName: string): string {
    return `${getApiUrl()}/api/agents/${encodeURIComponent(agentName)}/avatar`;
  }

  // ---- File Manager ----

  static async listFiles(params: {
    agent?: string;
    path?: string;
    type?: string;
    sort?: string;
  }): Promise<FileEntry[]> {
    const qs = new URLSearchParams();
    if (params.agent) qs.set("agent", params.agent);
    if (params.path) qs.set("path", params.path);
    if (params.type) qs.set("type", params.type);
    if (params.sort) qs.set("sort", params.sort);
    const query = qs.toString();
    return fetchAPI<FileEntry[]>(`/api/files/list${query ? `?${query}` : ""}`);
  }

  static async deleteFile(
    agentOrPath: string,
    relativePath?: string,
  ): Promise<void> {
    const body =
      relativePath !== undefined
        ? { agent: agentOrPath, relative_path: relativePath }
        : { path: agentOrPath };
    await fetchAPI("/api/files", {
      method: "DELETE",
      body: JSON.stringify(body),
    });
  }

  static async createFolder(agent: string, name: string): Promise<void> {
    await fetchAPI("/api/files/mkdir", {
      method: "POST",
      body: JSON.stringify({ agent, name }),
    });
  }

  static async uploadFile(agent: string, subPath: string, file: File): Promise<{ path: string }> {
    const { accessToken } = getStoredTokens();
    const token = accessToken || getApiToken();
    const formData = new FormData();
    formData.append("file", file, file.name);
    if (subPath) formData.append("subpath", subPath);
    formData.append("agent", agent);

    const res = await fetch(`${getApiUrl()}/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Upload failed");
    }
    const data = await res.json();
    return { path: data.path as string };
  }

  static getFileDownloadUrl(agent: string, relativePath: string): string {
    const qs = new URLSearchParams({
      agent,
      relative_path: relativePath,
    });
    return `${getApiUrl()}/api/files/download?${qs.toString()}`;
  }

  static async downloadAuthedBlob(url: string): Promise<Blob> {
    const { accessToken } = getStoredTokens();
    const token = accessToken || getApiToken();
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `Download failed: ${res.status}`);
    }
    return res.blob();
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers: API response → frontend types
// ---------------------------------------------------------------------------

/** Group flat config into sections for the settings page. */
function mapConfig(raw: Record<string, unknown>): Record<string, Record<string, unknown>> {
  // Keys that are already nested objects → become their own sections
  const sectionKeys = new Set([
    "streaming", "docker", "heartbeat", "cleanup", "memory", "webhooks",
    "api", "mcp", "image", "scene", "timeouts", "tasks", "transcription",
    "matrix", "rag", "workflow", "interagent", "fileshare",
    "skill_marketplace", "cli_parameters", "topic_defaults",
  ]);
  // Keys to hide (secrets, internal, redundant)
  const hideKeys = new Set([
    "_comment", "telegram_token", "gemini_api_key",
  ]);
  const core: Record<string, unknown> = {};
  const telegram: Record<string, unknown> = {};
  const sections: Record<string, Record<string, unknown>> = {};

  const telegramKeys = new Set([
    "transport", "transports", "allowed_user_ids", "allowed_group_ids",
    "group_mention_only",
  ]);

  for (const [key, value] of Object.entries(raw)) {
    if (hideKeys.has(key)) continue;
    if (sectionKeys.has(key) && typeof value === "object" && value !== null && !Array.isArray(value)) {
      sections[key] = value as Record<string, unknown>;
    } else if (telegramKeys.has(key)) {
      telegram[key] = value;
    } else {
      core[key] = value;
    }
  }

  return { core, telegram, ...sections };
}

function mapAgent(raw: Record<string, unknown>): Agent {
  return {
    id: String(raw.name || raw.id || ""),
    name: String(raw.name || ""),
    displayName: String(raw.display_name || raw.displayName || raw.name || ""),
    model: String(raw.model || ""),
    provider: String(raw.provider || ""),
    status: raw.online === true ? "online" : (raw.status as Agent["status"]) || "offline",
    sessions: Number(raw.active_sessions || raw.sessions || 0),
    lastActive: raw.last_active || raw.lastActive ? String(raw.last_active || raw.lastActive) : "-",
    description: String(raw.description || ""),
    allowedUsers: (raw.allowed_users || raw.allowedUsers || []) as string[],
    hasAvatar: raw.has_avatar === true,
  };
}

function mapCronJob(raw: Record<string, unknown>): CronJob {
  // API returns "enabled" boolean, frontend expects "active"/"paused" status
  const status: CronJob["status"] = raw.status
    ? (raw.status as CronJob["status"])
    : raw.enabled === false ? "paused" : "active";
  return {
    id: String(raw.id || ""),
    name: String(raw.title || raw.name || ""),
    schedule: String(raw.schedule || ""),
    agent: String(raw.agent || "main"),
    status,
    lastRun: String(raw.last_run_at || raw.last_run || raw.lastRun || "-"),
    nextRun: String(raw.next_run || raw.nextRun || "-"),
    description: String(raw.description || ""),
    executionCount: Number(raw.execution_count || raw.executionCount || 0),
    avgDuration: String(raw.avg_duration || raw.avgDuration || "0s"),
  };
}

function mapWebhook(raw: Record<string, unknown>): Webhook {
  return {
    id: String(raw.id || ""),
    name: String(raw.name || ""),
    url: String(raw.url || raw.path || ""),
    method: String(raw.method || "POST"),
    agent: String(raw.agent || "main"),
    status: (raw.status as Webhook["status"]) || "active",
    lastTriggered: String(raw.last_triggered || raw.lastTriggered || "-"),
    triggerCount: Number(raw.trigger_count || raw.triggerCount || 0),
    description: String(raw.description || ""),
    secret: raw.secret ? String(raw.secret) : undefined,
  };
}

function mapTask(raw: Record<string, unknown>): Task {
  const startTs = raw.started_at || raw.startedAt || raw.created_at;
  let startedAt = "";
  if (startTs) {
    const n = Number(startTs);
    startedAt = !isNaN(n) && n > 1e9 ? new Date(n * 1000).toISOString() : String(startTs);
  }

  let duration = "0s";
  const elapsed = Number(raw.elapsed_seconds);
  if (!isNaN(elapsed) && elapsed > 0) {
    if (elapsed >= 3600) duration = `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
    else if (elapsed >= 60) duration = `${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s`;
    else duration = `${Math.floor(elapsed)}s`;
  } else if (raw.duration) {
    duration = String(raw.duration);
  }

  return {
    id: String(raw.task_id || raw.id || ""),
    name: String(raw.name || raw.title || ""),
    status: mapTaskStatus(String(raw.status || "running")),
    agent: String(raw.parent_agent || raw.agent || "main"),
    provider: String(raw.provider || "unknown"),
    startedAt,
    duration,
    description: String(raw.description || raw.prompt || ""),
    result: raw.result ? String(raw.result) : undefined,
  };
}

function mapTaskStatus(status: string): Task["status"] {
  const map: Record<string, Task["status"]> = {
    running: "running",
    pending: "running",
    waiting: "running",
    done: "completed",
    completed: "completed",
    success: "completed",
    failed: "failed",
    cancelled: "cancelled",
    error: "failed",
  };
  return map[status] || "running";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Server-specific API instance factory
// ---------------------------------------------------------------------------

export function createApiForServer(server: SygenServer): {
  getAgents: () => Promise<Agent[]>;
  getSystemHealth: () => Promise<SystemHealth>;
  checkHealth: () => Promise<boolean>;
} {
  async function serverFetch<T>(endpoint: string): Promise<T> {
    const res = await fetch(`${server.url}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${server.token}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    const json = await res.json();
    return json.data !== undefined ? json.data : json;
  }

  return {
    async getAgents(): Promise<Agent[]> {
      if (USE_MOCK) return mockAgents;
      const data = await serverFetch<Record<string, unknown>[]>("/api/agents");
      return data.map(mapAgent);
    },
    async getSystemHealth(): Promise<SystemHealth> {
      if (USE_MOCK) return mockSystemHealth;
      return serverFetch<SystemHealth>("/api/health");
    },
    async checkHealth(): Promise<boolean> {
      try {
        const res = await fetch(`${server.url}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
