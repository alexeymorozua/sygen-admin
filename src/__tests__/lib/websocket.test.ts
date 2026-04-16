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
    expect(onTextDelta).toHaveBeenCalledWith("Hello");

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
    expect(onResult).toHaveBeenCalledWith("Done", [
      { path: "/tmp/f.txt", name: "f.txt", is_image: false },
    ]);

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
