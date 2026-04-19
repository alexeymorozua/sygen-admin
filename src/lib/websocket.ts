import type { SygenNotification } from "./api";

/**
 * WebSocket client for the Sygen admin dashboard.
 *
 * Connects to the /ws/admin endpoint (no E2E encryption).
 * Handles JWT auth, message routing to agents, and streaming responses.
 */

export type WSStatus = "connecting" | "connected" | "disconnected" | "error";

/**
 * Per-event routing context. Streaming payloads from the server are enriched
 * with `session_id` + `agent` so sibling admin tabs can route events to the
 * correct chat session even when the event was initiated by another device.
 */
export interface WSStreamContext {
  sessionId?: string;
  agent?: string;
}

export interface WSTextDelta {
  type: "text_delta";
  text: string;
  session_id?: string;
  agent?: string;
}

export interface WSToolActivity {
  type: "tool_activity";
  tool: string;
  session_id?: string;
  agent?: string;
}

export interface WSResult {
  type: "result";
  text: string;
  files?: { path: string; name: string; is_image: boolean }[];
  session_id?: string;
  agent?: string;
}

export interface WSError {
  type: "error";
  message: string;
  session_id?: string;
  agent?: string;
}

export interface WSAbortOk {
  type: "abort_ok";
  killed: number;
}

export interface WSSystemStatus {
  type: "system_status";
  data: string | null;
  session_id?: string;
  agent?: string;
}

/**
 * TASK_RESULT / TASK_QUESTION / INTERAGENT / BACKGROUND deliveries mirrored
 * from the Telegram transport into the admin chat.
 */
export interface WSChatMessage {
  type: "chat_message";
  kind: "task_result" | "task_question" | "interagent" | "text" | string;
  role: "agent" | "user";
  agent: string;
  session_id?: string;
  content: string;
  timestamp?: number;
  meta?: Record<string, unknown>;
}

export type WSEvent =
  | WSTextDelta
  | WSToolActivity
  | WSResult
  | WSError
  | WSAbortOk
  | WSSystemStatus
  | WSChatMessage;

export interface SygenWSCallbacks {
  onConnected?: (agents: string[], role?: string) => void;
  onDisconnected?: () => void;
  onTextDelta?: (text: string, ctx: WSStreamContext) => void;
  onToolActivity?: (tool: string, ctx: WSStreamContext) => void;
  onResult?: (
    text: string,
    files: WSResult["files"] | undefined,
    ctx: WSStreamContext
  ) => void;
  onError?: (message: string, ctx: WSStreamContext) => void;
  onAbortOk?: (killed: number) => void;
  onSystemStatus?: (data: string | null, ctx: WSStreamContext) => void;
  onChatMessage?: (msg: WSChatMessage) => void;
  onStatusChange?: (status: WSStatus) => void;
  onAuthFailed?: (message: string) => void;
  onNotification?: (notification: SygenNotification) => void;
}

const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_SYGEN_API_URL || "http://localhost:8741";
const DEFAULT_API_TOKEN = "";

// Access tokens live in an httpOnly cookie now and are sent automatically
// during the WebSocket handshake (same-origin). The auth frame still
// exists for remote-server flows that pass a Bearer token via options.

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
      // Cookies are sent automatically by the browser during the WS handshake.
      // The auth frame is still needed for remote-server flows that rely on
      // a Bearer token passed in via options.
      this.ws!.send(JSON.stringify({ type: "auth", token: this.token }));
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

  sendMessage(
    agent: string,
    text: string,
    sessionId?: string | null,
    ids?: { userMsgId?: string; assistantMsgId?: string },
  ): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const payload: Record<string, unknown> = { type: "message", agent, text };
    if (sessionId) payload.session_id = sessionId;
    if (ids?.userMsgId) payload.user_msg_id = ids.userMsgId;
    if (ids?.assistantMsgId) payload.assistant_msg_id = ids.assistantMsgId;
    this.ws.send(JSON.stringify(payload));
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
    const ctx: WSStreamContext = {
      sessionId:
        typeof data.session_id === "string" ? data.session_id : undefined,
      agent: typeof data.agent === "string" ? data.agent : undefined,
    };

    switch (type) {
      case "auth_ok": {
        this.setStatus("connected");
        this.reconnectAttempts = 0;
        const agents = Array.isArray(data.agents) ? (data.agents as string[]) : [];
        const role = typeof data.role === "string" ? data.role : undefined;
        if (role !== undefined) {
          this.callbacks.onConnected?.(agents, role);
        } else {
          this.callbacks.onConnected?.(agents);
        }
        break;
      }
      case "text_delta":
        if (typeof data.text === "string") {
          this.callbacks.onTextDelta?.(data.text, ctx);
        }
        break;
      case "tool_activity":
        if (typeof data.tool === "string") {
          this.callbacks.onToolActivity?.(data.tool, ctx);
        }
        break;
      case "result":
        this.callbacks.onResult?.(
          typeof data.text === "string" ? data.text : "",
          Array.isArray(data.files) ? (data.files as WSResult["files"]) : undefined,
          ctx
        );
        break;
      case "auth_error":
        this.authFailed = true;
        this.callbacks.onAuthFailed?.(
          typeof data.message === "string" ? data.message : "Authentication failed"
        );
        this.callbacks.onError?.(
          typeof data.message === "string" ? data.message : "Authentication failed",
          ctx
        );
        this.disconnect();
        break;
      case "error": {
        // Server rejects the handshake via ``_ws_reject`` with
        // ``{type:"error", code:"auth_failed"/"auth_required"/"auth_timeout"}``
        // before closing the socket. Treat those codes as an auth failure so
        // we actually redirect to /login instead of retrying forever with a
        // dead token.
        const code = typeof data.code === "string" ? data.code : "";
        if (code.startsWith("auth_")) {
          this.authFailed = true;
          this.callbacks.onAuthFailed?.(
            typeof data.message === "string" ? data.message : "Authentication failed"
          );
          this.disconnect();
          break;
        }
        this.callbacks.onError?.(
          typeof data.message === "string" ? data.message : "Unknown error",
          ctx
        );
        break;
      }
      case "abort_ok":
        this.callbacks.onAbortOk?.(
          typeof data.killed === "number" ? data.killed : 0
        );
        break;
      case "system_status":
        this.callbacks.onSystemStatus?.(
          typeof data.data === "string" ? data.data : null,
          ctx
        );
        break;
      case "chat_message": {
        const kind = typeof data.kind === "string" ? data.kind : "text";
        const role = data.role === "user" ? "user" : "agent";
        const agent = typeof data.agent === "string" ? data.agent : "";
        const content = typeof data.content === "string" ? data.content : "";
        const sessionId =
          typeof data.session_id === "string" ? data.session_id : undefined;
        const timestamp =
          typeof data.timestamp === "number" ? data.timestamp : undefined;
        const meta =
          data.meta && typeof data.meta === "object"
            ? (data.meta as Record<string, unknown>)
            : undefined;
        this.callbacks.onChatMessage?.({
          type: "chat_message",
          kind,
          role,
          agent,
          content,
          session_id: sessionId,
          timestamp,
          meta,
        });
        break;
      }
      case "notification":
        if (data.data && typeof data.data === "object") {
          this.callbacks.onNotification?.(data.data as SygenNotification);
        }
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
