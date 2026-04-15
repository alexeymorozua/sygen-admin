/**
 * WebSocket client for the Sygen admin dashboard.
 *
 * Connects to the /ws/admin endpoint (no E2E encryption).
 * Handles JWT auth, message routing to agents, and streaming responses.
 */

export type WSStatus = "connecting" | "connected" | "disconnected" | "error";

export interface WSTextDelta {
  type: "text_delta";
  text: string;
}

export interface WSToolActivity {
  type: "tool_activity";
  tool: string;
}

export interface WSResult {
  type: "result";
  text: string;
  files?: { path: string; name: string; is_image: boolean }[];
}

export interface WSError {
  type: "error";
  message: string;
}

export interface WSAbortOk {
  type: "abort_ok";
  killed: number;
}

export interface WSSystemStatus {
  type: "system_status";
  data: string | null;
}

export type WSEvent =
  | WSTextDelta
  | WSToolActivity
  | WSResult
  | WSError
  | WSAbortOk
  | WSSystemStatus;

export interface SygenWSCallbacks {
  onConnected?: (agents: string[]) => void;
  onDisconnected?: () => void;
  onTextDelta?: (text: string) => void;
  onToolActivity?: (tool: string) => void;
  onResult?: (text: string, files?: WSResult["files"]) => void;
  onError?: (message: string) => void;
  onAbortOk?: (killed: number) => void;
  onSystemStatus?: (data: string | null) => void;
  onStatusChange?: (status: WSStatus) => void;
  onAuthFailed?: (message: string) => void;
}

const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_SYGEN_API_URL || "http://localhost:8080";
const DEFAULT_API_TOKEN = process.env.NEXT_PUBLIC_SYGEN_API_TOKEN || "";

function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sygen_access_token");
}

export interface SygenWSOptions {
  url?: string;
  token?: string;
}

export class SygenWebSocket {
  private ws: WebSocket | null = null;
  private callbacks: SygenWSCallbacks;
  private status: WSStatus = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private authFailed = false;
  private url: string;
  private token: string;

  constructor(callbacks: SygenWSCallbacks, options?: SygenWSOptions) {
    this.callbacks = callbacks;
    this.url = options?.url || DEFAULT_API_URL;
    this.token = options?.token || DEFAULT_API_TOKEN;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.setStatus("connecting");
    const wsUrl = this.url.replace(/^http/, "ws");
    this.ws = new WebSocket(`${wsUrl}/ws/admin`);

    this.ws.onopen = () => {
      // Prefer JWT access token from localStorage, fall back to legacy token
      const authToken = getStoredAccessToken() || this.token;
      this.ws!.send(JSON.stringify({ type: "auth", token: authToken }));
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch {
        // Ignore unparseable frames
      }
    };

    this.ws.onclose = () => {
      this.setStatus("disconnected");
      this.callbacks.onDisconnected?.();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.setStatus("error");
    };
  }

  disconnect(): void {
    this.clearReconnect();
    this.reconnectAttempts = 0;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  sendMessage(agent: string, text: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "message", agent, text }));
  }

  abort(agent?: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "abort", agent: agent || "main" }));
  }

  getStatus(): WSStatus {
    return this.status;
  }

  private setStatus(status: WSStatus): void {
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }

  private handleMessage(data: Record<string, unknown>): void {
    if (typeof data !== "object" || data === null) return;
    const type = typeof data.type === "string" ? data.type : "";

    switch (type) {
      case "auth_ok":
        this.setStatus("connected");
        this.reconnectAttempts = 0;
        this.callbacks.onConnected?.(
          Array.isArray(data.agents) ? (data.agents as string[]) : []
        );
        break;
      case "text_delta":
        if (typeof data.text === "string") {
          this.callbacks.onTextDelta?.(data.text);
        }
        break;
      case "tool_activity":
        if (typeof data.tool === "string") {
          this.callbacks.onToolActivity?.(data.tool);
        }
        break;
      case "result":
        this.callbacks.onResult?.(
          typeof data.text === "string" ? data.text : "",
          Array.isArray(data.files) ? (data.files as WSResult["files"]) : undefined
        );
        break;
      case "auth_error":
        this.authFailed = true;
        this.callbacks.onAuthFailed?.(
          typeof data.message === "string" ? data.message : "Authentication failed"
        );
        this.callbacks.onError?.(
          typeof data.message === "string" ? data.message : "Authentication failed"
        );
        this.disconnect();
        break;
      case "error":
        this.callbacks.onError?.(
          typeof data.message === "string" ? data.message : "Unknown error"
        );
        break;
      case "abort_ok":
        this.callbacks.onAbortOk?.(
          typeof data.killed === "number" ? data.killed : 0
        );
        break;
      case "system_status":
        this.callbacks.onSystemStatus?.(
          typeof data.data === "string" ? data.data : null
        );
        break;
      // Unknown message types are silently ignored
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    if (this.authFailed) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
