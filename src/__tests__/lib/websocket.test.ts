import { describe, it, expect, vi, beforeEach } from "vitest";
import { SygenWebSocket, type SygenWSCallbacks } from "@/lib/websocket";

// Mock WebSocket as a proper class
let mockWsInstance: MockWebSocket;

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;
  static CLOSING = 2;

  url: string;
  readyState = 1; // OPEN
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    mockWsInstance = this;
    // Simulate async open
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  // Test helpers
  simulateMessage(data: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateError() {
    this.onerror?.();
  }

  simulateClose() {
    this.onclose?.();
  }
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", MockWebSocket);
});

describe("connect", () => {
  it("sends the remote-server fallback token in the auth frame", async () => {
    // Primary-server auth now rides on the browser's cookie jar; the
    // explicit token is only used for remote-server flows.
    const callbacks: SygenWSCallbacks = {};
    const ws = new SygenWebSocket(callbacks, {
      url: "http://test:8080",
      token: "fallback-token",
    });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    expect(mockWsInstance.sent).toHaveLength(1);
    const sent = JSON.parse(mockWsInstance.sent[0]);
    expect(sent.type).toBe("auth");
    expect(sent.token).toBe("fallback-token");

    ws.disconnect();
  });
});

describe("callbacks", () => {
  it("onTextDelta fires on text_delta message", async () => {
    const onTextDelta = vi.fn();
    const ws = new SygenWebSocket({ onTextDelta }, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    mockWsInstance.simulateMessage({ type: "text_delta", text: "Hello" });
    expect(onTextDelta).toHaveBeenCalledWith("Hello", {
      sessionId: undefined,
      agent: undefined,
    });

    ws.disconnect();
  });

  it("onResult fires on result message", async () => {
    const onResult = vi.fn();
    const ws = new SygenWebSocket({ onResult }, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    mockWsInstance.simulateMessage({
      type: "result",
      text: "Done",
      files: [{ path: "/tmp/f.txt", name: "f.txt", is_image: false }],
    });
    expect(onResult).toHaveBeenCalledWith(
      "Done",
      [{ path: "/tmp/f.txt", name: "f.txt", is_image: false }],
      { sessionId: undefined, agent: undefined },
    );

    ws.disconnect();
  });

  it("onConnected fires on auth_ok", async () => {
    const onConnected = vi.fn();
    const onStatusChange = vi.fn();
    const ws = new SygenWebSocket(
      { onConnected, onStatusChange },
      { url: "http://test:8080" }
    );

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    mockWsInstance.simulateMessage({ type: "auth_ok", agents: ["main", "prism"] });
    expect(onConnected).toHaveBeenCalledWith(["main", "prism"]);
    expect(ws.getStatus()).toBe("connected");

    ws.disconnect();
  });
});

describe("enriched streaming events", () => {
  it("passes session_id/agent in context to onTextDelta", async () => {
    const onTextDelta = vi.fn();
    const ws = new SygenWebSocket({ onTextDelta }, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    mockWsInstance.simulateMessage({
      type: "text_delta",
      text: "Part",
      session_id: "sess-1",
      agent: "main",
    });
    expect(onTextDelta).toHaveBeenCalledWith("Part", {
      sessionId: "sess-1",
      agent: "main",
    });

    ws.disconnect();
  });

  it("passes session_id/agent in context to onResult", async () => {
    const onResult = vi.fn();
    const ws = new SygenWebSocket({ onResult }, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    mockWsInstance.simulateMessage({
      type: "result",
      text: "Done",
      session_id: "sess-1",
      agent: "sonic",
    });
    expect(onResult).toHaveBeenCalledWith("Done", undefined, {
      sessionId: "sess-1",
      agent: "sonic",
    });

    ws.disconnect();
  });
});

describe("chat_message events", () => {
  it("fires onChatMessage for mirrored task_result", async () => {
    const onChatMessage = vi.fn();
    const ws = new SygenWebSocket({ onChatMessage }, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    mockWsInstance.simulateMessage({
      type: "chat_message",
      kind: "task_result",
      role: "agent",
      agent: "main",
      session_id: "sess-1",
      content: "Task done",
      timestamp: 1_700_000_000,
      meta: { task_id: "t-1", task_name: "myjob" },
    });

    expect(onChatMessage).toHaveBeenCalledWith({
      type: "chat_message",
      kind: "task_result",
      role: "agent",
      agent: "main",
      session_id: "sess-1",
      content: "Task done",
      timestamp: 1_700_000_000,
      meta: { task_id: "t-1", task_name: "myjob" },
    });

    ws.disconnect();
  });

  it("defaults missing fields on chat_message", async () => {
    const onChatMessage = vi.fn();
    const ws = new SygenWebSocket({ onChatMessage }, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    mockWsInstance.simulateMessage({
      type: "chat_message",
      agent: "main",
      content: "Plain",
    });

    expect(onChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "text",
        role: "agent",
        agent: "main",
        content: "Plain",
      }),
    );

    ws.disconnect();
  });
});

describe("enriched events — system_status + error routing context", () => {
  it("passes session_id/agent context to onSystemStatus", async () => {
    const onSystemStatus = vi.fn();
    const ws = new SygenWebSocket({ onSystemStatus }, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    mockWsInstance.simulateMessage({
      type: "system_status",
      data: "Thinking…",
      session_id: "sess-7",
      agent: "sonic",
    });
    expect(onSystemStatus).toHaveBeenCalledWith("Thinking…", {
      sessionId: "sess-7",
      agent: "sonic",
    });

    ws.disconnect();
  });

  it("passes session_id/agent context to onError", async () => {
    const onError = vi.fn();
    const ws = new SygenWebSocket({ onError }, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    mockWsInstance.simulateMessage({
      type: "error",
      message: "boom",
      session_id: "sess-9",
      agent: "main",
    });
    expect(onError).toHaveBeenCalledWith("boom", {
      sessionId: "sess-9",
      agent: "main",
    });

    ws.disconnect();
  });

  it("passes null system_status data through onSystemStatus", async () => {
    const onSystemStatus = vi.fn();
    const ws = new SygenWebSocket({ onSystemStatus }, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    mockWsInstance.simulateMessage({ type: "system_status", data: null });
    expect(onSystemStatus).toHaveBeenCalledWith(null, {
      sessionId: undefined,
      agent: undefined,
    });

    ws.disconnect();
  });
});

describe("chat_message — unknown kind + edge cases", () => {
  it("preserves unknown kind strings on the payload", async () => {
    const onChatMessage = vi.fn();
    const ws = new SygenWebSocket({ onChatMessage }, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    mockWsInstance.simulateMessage({
      type: "chat_message",
      kind: "future_kind_v2",
      role: "agent",
      agent: "main",
      content: "preview",
    });
    expect(onChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "future_kind_v2", agent: "main" }),
    );

    ws.disconnect();
  });

  it("coerces non-string role to 'agent'", async () => {
    const onChatMessage = vi.fn();
    const ws = new SygenWebSocket({ onChatMessage }, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    mockWsInstance.simulateMessage({
      type: "chat_message",
      agent: "main",
      content: "x",
      role: 42,
    });
    expect(onChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: "agent" }),
    );

    ws.disconnect();
  });

  it("drops non-object meta payloads", async () => {
    const onChatMessage = vi.fn();
    const ws = new SygenWebSocket({ onChatMessage }, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    mockWsInstance.simulateMessage({
      type: "chat_message",
      agent: "main",
      content: "x",
      meta: "not-an-object",
    });
    expect(onChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ meta: undefined }),
    );

    ws.disconnect();
  });
});

describe("reconnection", () => {
  it("schedules reconnect on network close", async () => {
    vi.useFakeTimers();
    const onDisconnected = vi.fn();
    const ws = new SygenWebSocket({ onDisconnected }, { url: "http://test:8080" });

    ws.connect();
    await vi.advanceTimersByTimeAsync(10);

    // Simulate close (network error)
    mockWsInstance.simulateClose();
    expect(onDisconnected).toHaveBeenCalled();
    expect(ws.getStatus()).toBe("disconnected");

    // After 1s, it should attempt to reconnect
    await vi.advanceTimersByTimeAsync(1100);

    ws.disconnect();
    vi.useRealTimers();
  });

  it("does not reconnect on auth error", async () => {
    vi.useFakeTimers();
    const onAuthFailed = vi.fn();
    const ws = new SygenWebSocket({ onAuthFailed }, { url: "http://test:8080" });

    ws.connect();
    await vi.advanceTimersByTimeAsync(10);
    const firstInstance = mockWsInstance;

    mockWsInstance.simulateMessage({ type: "auth_error", message: "Bad token" });
    expect(onAuthFailed).toHaveBeenCalledWith("Bad token");

    // Wait long enough for any reconnect to trigger
    await vi.advanceTimersByTimeAsync(35000);

    // Status should remain disconnected (disconnect was called by auth_error handler)
    expect(ws.getStatus()).toBe("disconnected");

    vi.useRealTimers();
  });

  it("treats {type:error, code:auth_failed} as auth failure (handshake reject)", async () => {
    // The server's ``_ws_reject`` helper sends
    // ``{type:"error", code:"auth_failed"/"auth_required"/"auth_timeout"}``
    // before closing the socket. Before this fix the client routed it to
    // the generic error handler and kept retrying with a dead token.
    vi.useFakeTimers();
    const onAuthFailed = vi.fn();
    const onError = vi.fn();
    const ws = new SygenWebSocket(
      { onAuthFailed, onError },
      { url: "http://test:8080" },
    );

    ws.connect();
    await vi.advanceTimersByTimeAsync(10);

    mockWsInstance.simulateMessage({
      type: "error",
      code: "auth_failed",
      message: "Invalid token",
    });

    expect(onAuthFailed).toHaveBeenCalledWith("Invalid token");
    // Should not fall through to the generic error path.
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(35000);
    expect(ws.getStatus()).toBe("disconnected");

    vi.useRealTimers();
  });

  it("still routes non-auth error frames to onError", async () => {
    vi.useFakeTimers();
    const onAuthFailed = vi.fn();
    const onError = vi.fn();
    const ws = new SygenWebSocket(
      { onAuthFailed, onError },
      { url: "http://test:8080" },
    );

    ws.connect();
    await vi.advanceTimersByTimeAsync(10);

    mockWsInstance.simulateMessage({
      type: "error",
      message: "Agent 'main' not found",
    });

    expect(onError).toHaveBeenCalledWith("Agent 'main' not found", expect.anything());
    expect(onAuthFailed).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

describe("abort", () => {
  it("sends abort message", async () => {
    const ws = new SygenWebSocket({}, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    // Auth message is sent[0]
    ws.abort("main");
    expect(mockWsInstance.sent).toHaveLength(2);
    const sent = JSON.parse(mockWsInstance.sent[1]);
    expect(sent.type).toBe("abort");
    expect(sent.agent).toBe("main");

    ws.disconnect();
  });

  it("sends abort with default agent when none specified", async () => {
    const ws = new SygenWebSocket({}, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    ws.abort();
    const sent = JSON.parse(mockWsInstance.sent[1]);
    expect(sent.agent).toBe("main");

    ws.disconnect();
  });
});

describe("disconnect", () => {
  it("cleans up WebSocket and resets state", async () => {
    const onStatusChange = vi.fn();
    const ws = new SygenWebSocket({ onStatusChange }, { url: "http://test:8080" });

    ws.connect();
    await new Promise((r) => setTimeout(r, 10));

    ws.disconnect();
    expect(ws.getStatus()).toBe("disconnected");
  });
});
