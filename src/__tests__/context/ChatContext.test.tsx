import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import type {
  SygenWSCallbacks,
  WSChatMessage,
  WSStreamContext,
} from "@/lib/websocket";

// ---------------------------------------------------------------------------
// Mocks — capture WS callbacks so tests can fire synthetic events directly,
// and stub SygenAPI so chat-history fetches return controlled data.
//
// vi.mock factories are hoisted above all imports, so any state they need
// to share with tests must be wrapped in vi.hoisted().
// ---------------------------------------------------------------------------

const hoist = vi.hoisted(() => {
  const state: {
    captured: SygenWSCallbacks | null;
    historyResolve: (value: {
      messages: {
        id: string;
        sender: string;
        agentName?: string;
        content: string;
        timestamp: string;
      }[];
      has_more: boolean;
      total: number;
    }) => void;
  } = {
    captured: null,
    historyResolve: () => {},
  };
  return state;
});

vi.mock("@/lib/websocket", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  class MockSygenWebSocket {
    constructor(callbacks: SygenWSCallbacks, _opts: unknown) {
      hoist.captured = callbacks;
    }
    connect() {}
    disconnect() {}
    sendMessage() {}
    abort() {}
  }
  return { ...actual, SygenWebSocket: MockSygenWebSocket };
});

vi.mock("@/lib/api", () => ({
  SygenAPI: {
    getChatSessions: vi.fn(async () => []),
    getChatHistoryPage: vi.fn(
      (_sessionId: string, _opts: { limit: number; before?: string }) =>
        new Promise<{
          messages: {
            id: string;
            sender: string;
            agentName?: string;
            content: string;
            timestamp: string;
          }[];
          has_more: boolean;
          total: number;
        }>((resolve) => {
          hoist.historyResolve = resolve;
        }),
    ),
    saveChatHistory: vi.fn(async () => undefined),
    createChatSession: vi.fn(async (agentId: string, title?: string) => ({
      id: `sess-${Date.now()}`,
      agent: agentId,
      title: title || "",
      created_at: 0,
      updated_at: 0,
    })),
  },
  setActiveServerForApi: vi.fn(),
}));

// Provide minimal context replacements so ChatProvider can mount without
// pulling in the full ServerProvider/AuthProvider chains.
vi.mock("@/context/ServerContext", () => ({
  useServer: () => ({
    activeServer: { id: "default", url: "http://localhost", token: "", name: "default" },
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, refreshUser: vi.fn() }),
}));

import { ChatProvider, useChat } from "@/context/ChatContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChatProvider>{children}</ChatProvider>;
}

function fireConnected() {
  hoist.captured?.onConnected?.(["main"], "admin");
  hoist.captured?.onStatusChange?.("connected");
}

beforeEach(() => {
  hoist.captured = null;
  hoist.historyResolve = () => {};
});

describe("ChatContext.onResult — synthesized chat_message", () => {
  it("invokes the chat_message callback for desktop notifications", async () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(hoist.captured).not.toBeNull());

    const seen: WSChatMessage[] = [];
    act(() => {
      result.current.setChatMessageCallback((msg) => {
        seen.push(msg);
      });
    });

    const ctx: WSStreamContext = { sessionId: "sess-x", agent: "main" };
    act(() => {
      hoist.captured?.onResult?.("final answer", undefined, ctx);
    });

    // exactly one synthesized chat_message envelope per result
    const synthesized = seen.filter(
      (m) => m.kind === "text" && m.role === "agent",
    );
    expect(synthesized).toHaveLength(1);
    expect(synthesized[0].content).toBe("final answer");
    expect(synthesized[0].agent).toBe("main");
    expect(synthesized[0].session_id).toBe("sess-x");
  });

  it("does not synthesize when sessionId or text is missing", async () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(hoist.captured).not.toBeNull());

    const seen: WSChatMessage[] = [];
    act(() => {
      result.current.setChatMessageCallback((msg) => {
        seen.push(msg);
      });
    });

    act(() => {
      // no session id → skip
      hoist.captured?.onResult?.("answer", undefined, { agent: "main" });
      // empty text → skip
      hoist.captured?.onResult?.("", undefined, { sessionId: "s", agent: "main" });
    });

    expect(seen).toHaveLength(0);
  });
});

describe("ChatContext.loadSessionHistory — force reload", () => {
  it("bypasses the once-per-session guard when force=true (Refresh button / iOS resume)", async () => {
    const { SygenAPI } = await import("@/lib/api");
    const getMock = SygenAPI.getChatHistoryPage as ReturnType<typeof vi.fn>;
    getMock.mockClear();

    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(hoist.captured).not.toBeNull());
    fireConnected();

    // First load.
    let p1!: Promise<void>;
    act(() => {
      p1 = result.current.loadSessionHistory("force-sess");
    });
    await act(async () => {
      hoist.historyResolve({ messages: [], has_more: false, total: 0 });
      await p1;
    });

    // Second call without force: early-return, no new fetch.
    let p2!: Promise<void>;
    act(() => {
      p2 = result.current.loadSessionHistory("force-sess");
    });
    await act(async () => {
      await p2;
    });
    // Exactly one REST call so far (the very first load).
    expect(getMock).toHaveBeenCalledTimes(1);

    // Third call WITH force: bypass guard → another fetch.
    let p3!: Promise<void>;
    act(() => {
      p3 = result.current.loadSessionHistory("force-sess", { force: true });
    });
    await act(async () => {
      hoist.historyResolve({
        messages: [
          {
            id: "late-msg",
            sender: "agent",
            agentName: "main",
            content: "missed while suspended",
            timestamp: "2026-04-19T17:00:00Z",
          },
        ],
        has_more: false,
        total: 1,
      });
      await p3;
    });

    expect(getMock).toHaveBeenCalledTimes(2);
    const msgs = result.current.messagesBySession["force-sess"];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe("late-msg");
  });
});

describe("ChatContext — cross-device save dedup", () => {
  it("does not persist sibling-mirror messages (cross-device duplication fix)", async () => {
    const { SygenAPI } = await import("@/lib/api");
    const saveMock = SygenAPI.saveChatHistory as ReturnType<typeof vi.fn>;
    saveMock.mockClear();

    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(hoist.captured).not.toBeNull());
    fireConnected();

    act(() => {
      result.current.setActiveSessionId("sib-sess");
    });
    await act(async () => {
      hoist.historyResolve({ messages: [], has_more: false, total: 0 });
    });

    // Sibling event (sent from another device, mirrored here via WS).
    act(() => {
      hoist.captured?.onChatMessage?.({
        type: "chat_message",
        role: "user",
        kind: "text",
        agent: "main",
        session_id: "sib-sess",
        content: "from other device",
        timestamp: Math.floor(Date.now() / 1000),
      });
    });

    // Wait past the 1s debounce.
    await new Promise((r) => setTimeout(r, 1200));

    // No save call — sibling messages are display-only on this tab.
    expect(saveMock).not.toHaveBeenCalled();
  }, 3000);
});

describe("ChatContext.loadSessionHistory — race with WS messages", () => {
  it("preserves WS messages that arrive while the REST fetch is in flight", async () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(hoist.captured).not.toBeNull());
    fireConnected();

    // 1) Start history load — Promise stays pending until we resolve it.
    let loadPromise!: Promise<void>;
    act(() => {
      loadPromise = result.current.loadSessionHistory("race-sess");
    });

    // 2) WS chat_message arrives mid-fetch (same session).
    act(() => {
      hoist.captured?.onChatMessage?.({
        type: "chat_message",
        role: "agent",
        kind: "interagent",
        agent: "main",
        session_id: "race-sess",
        content: "live event",
        timestamp: Math.floor(Date.parse("2026-04-19T12:00:30Z") / 1000),
      });
    });

    // Sanity: the live message landed in state before resolve.
    expect(result.current.messagesBySession["race-sess"]).toHaveLength(1);

    // 3) REST resolves with one historical message timestamped earlier.
    await act(async () => {
      hoist.historyResolve({
        messages: [
          {
            id: "rest-1",
            sender: "user",
            agentName: "main",
            content: "older",
            timestamp: "2026-04-19T12:00:00Z",
          },
        ],
        has_more: false,
        total: 1,
      });
      await loadPromise;
    });

    const merged = result.current.messagesBySession["race-sess"];
    // Both REST + live should be present; no overwrite.
    expect(merged).toHaveLength(2);
    // Sorted by timestamp ascending.
    expect(merged[0].id).toBe("rest-1");
    expect(merged[1].content).toBe("live event");
  });

  it("dedupes by id when REST and WS deliver the same message", async () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(hoist.captured).not.toBeNull());
    fireConnected();

    let loadPromise!: Promise<void>;
    act(() => {
      loadPromise = result.current.loadSessionHistory("dup-sess");
    });

    // Add a live message that we'll also include in the REST page.
    act(() => {
      result.current.addMessage("dup-sess", {
        id: "shared",
        sender: "agent",
        content: "shared",
        timestamp: "2026-04-19T12:00:10Z",
      });
    });

    await act(async () => {
      hoist.historyResolve({
        messages: [
          {
            id: "shared",
            sender: "agent",
            agentName: "main",
            content: "shared",
            timestamp: "2026-04-19T12:00:10Z",
          },
        ],
        has_more: false,
        total: 1,
      });
      await loadPromise;
    });

    const merged = result.current.messagesBySession["dup-sess"];
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("shared");
  });
});

// ---------------------------------------------------------------------------
// Reconnect + stuck-streaming watchdog (0.3.10)
// ---------------------------------------------------------------------------

describe("ChatContext — WS reconnect refetch", () => {
  it("force-replaces history when WS transitions connected → disconnected → connected", async () => {
    const { SygenAPI } = await import("@/lib/api");
    const getMock = SygenAPI.getChatHistoryPage as ReturnType<typeof vi.fn>;
    getMock.mockClear();

    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(hoist.captured).not.toBeNull());

    // Initial connect + select session (fires the default non-force load).
    fireConnected();
    act(() => {
      result.current.setActiveSessionId("reconn-sess");
    });
    await act(async () => {
      hoist.historyResolve({ messages: [], has_more: false, total: 0 });
    });
    expect(getMock).toHaveBeenCalledTimes(1);

    // Simulate WS hiccup: disconnected → connected (a real reconnect).
    act(() => {
      hoist.captured?.onDisconnected?.();
      hoist.captured?.onStatusChange?.("disconnected");
    });
    act(() => {
      hoist.captured?.onStatusChange?.("connected");
    });
    await act(async () => {
      hoist.historyResolve({ messages: [], has_more: false, total: 0 });
    });

    // A second REST call must have been dispatched for the active session.
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(getMock.mock.calls[1][0]).toBe("reconn-sess");
  });

  it("drops streaming placeholder on reconnect and rehydrates with server state", async () => {
    const { SygenAPI } = await import("@/lib/api");
    const getMock = SygenAPI.getChatHistoryPage as ReturnType<typeof vi.fn>;
    getMock.mockClear();

    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(hoist.captured).not.toBeNull());
    fireConnected();

    act(() => {
      result.current.setActiveSessionId("stale-sess");
    });
    await act(async () => {
      hoist.historyResolve({ messages: [], has_more: false, total: 0 });
    });

    // Start a stream: adds a user msg + agent placeholder with isStreaming=true.
    await act(async () => {
      await result.current.sendMessage("hello");
    });
    expect(result.current.isStreaming).toBe(true);
    const pre = result.current.messagesBySession["stale-sess"] || [];
    expect(pre.some((m) => m.isStreaming)).toBe(true);

    // WS dies mid-stream — isStreaming must stay true so the Stop button
    // stays visible while the auto-reconnect is in flight.
    act(() => {
      hoist.captured?.onDisconnected?.();
      hoist.captured?.onStatusChange?.("disconnected");
    });
    expect(result.current.isStreaming).toBe(true);

    // WS comes back; the reconnect refetch lands with the canonical pair
    // of server-saved messages.
    act(() => {
      hoist.captured?.onStatusChange?.("connected");
    });
    await act(async () => {
      hoist.historyResolve({
        messages: [
          {
            id: "srv-user",
            sender: "user",
            content: "hello",
            timestamp: "2026-04-19T12:00:00Z",
          },
          {
            id: "srv-agent",
            sender: "agent",
            agentName: "main",
            content: "hi back",
            timestamp: "2026-04-19T12:00:05Z",
          },
        ],
        has_more: false,
        total: 2,
      });
    });
    await waitFor(() => {
      const post = result.current.messagesBySession["stale-sess"] || [];
      // Placeholder (isStreaming=true) gone, server messages present.
      expect(post.some((m) => m.isStreaming)).toBe(false);
      expect(post.some((m) => m.id === "srv-user")).toBe(true);
      expect(post.some((m) => m.id === "srv-agent")).toBe(true);
    });
    expect(result.current.isStreaming).toBe(false);
  });
});

describe("ChatContext — stuck-streaming 120s watchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires a notice and force-refetches when no streaming event arrives for 120s", async () => {
    const { SygenAPI } = await import("@/lib/api");
    const getMock = SygenAPI.getChatHistoryPage as ReturnType<typeof vi.fn>;
    getMock.mockClear();

    const { result } = renderHook(() => useChat(), { wrapper });
    // Use vi.waitFor so fake timers don't block the initial mount polls.
    await vi.waitFor(() => expect(hoist.captured).not.toBeNull());
    act(() => {
      hoist.captured?.onConnected?.(["main"], "admin");
      hoist.captured?.onStatusChange?.("connected");
    });

    const notices: { msg: string; type: string }[] = [];
    act(() => {
      result.current.setChatNoticeCallback((msg, type) => {
        notices.push({ msg, type });
      });
      result.current.setActiveSessionId("stuck-sess");
    });
    // Initial session load.
    await act(async () => {
      hoist.historyResolve({ messages: [], has_more: false, total: 0 });
    });
    getMock.mockClear();

    // Kick off a stream.
    await act(async () => {
      await result.current.sendMessage("work");
    });
    expect(result.current.isStreaming).toBe(true);

    // Advance 125s with NO streaming events arriving. Watchdog polls at 5s;
    // at the first tick past 120s it recovers.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(125_000);
    });

    expect(result.current.isStreaming).toBe(false);
    const placeholderStillStreaming = (
      result.current.messagesBySession["stuck-sess"] || []
    ).some((m) => m.isStreaming);
    expect(placeholderStillStreaming).toBe(false);

    // Watchdog triggered both a force-replace refetch and a toast notice.
    expect(getMock).toHaveBeenCalled();
    const [, lastOpts] = getMock.mock.calls.at(-1) || [];
    expect(lastOpts?.limit).toBe(50);
    expect(notices.some((n) => n.type === "warning")).toBe(true);
  });

  it("does not fire the watchdog when streaming events keep arriving", async () => {
    const { SygenAPI } = await import("@/lib/api");
    const getMock = SygenAPI.getChatHistoryPage as ReturnType<typeof vi.fn>;
    getMock.mockClear();

    const { result } = renderHook(() => useChat(), { wrapper });
    await vi.waitFor(() => expect(hoist.captured).not.toBeNull());
    act(() => {
      hoist.captured?.onConnected?.(["main"], "admin");
      hoist.captured?.onStatusChange?.("connected");
    });
    act(() => {
      result.current.setActiveSessionId("live-sess");
    });
    await act(async () => {
      hoist.historyResolve({ messages: [], has_more: false, total: 0 });
    });
    getMock.mockClear();

    await act(async () => {
      await result.current.sendMessage("work");
    });
    expect(result.current.isStreaming).toBe(true);

    // Fire a text_delta every ~60s for 200s total. Each one resets the
    // last-event timestamp, so the 120s threshold is never crossed.
    for (let t = 60; t <= 200; t += 60) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
        hoist.captured?.onTextDelta?.("chunk", {
          sessionId: "live-sess",
          agent: "main",
        });
      });
    }

    expect(result.current.isStreaming).toBe(true);
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("ChatContext — Stop button state contract", () => {
  it("keeps isStreaming=true across a WS disconnect so the Stop button stays rendered", async () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(hoist.captured).not.toBeNull());
    fireConnected();
    act(() => {
      result.current.setActiveSessionId("stop-sess");
    });
    await act(async () => {
      hoist.historyResolve({ messages: [], has_more: false, total: 0 });
    });

    await act(async () => {
      await result.current.sendMessage("streaming test");
    });
    // Stop button in chat/page.tsx:1021 renders iff isStreaming===true.
    expect(result.current.isStreaming).toBe(true);

    // WS drops while the stream is in flight. The old behavior reset
    // isStreaming here, which hid the Stop button and made the send field
    // look idle. The fix: keep it until the reconnect refetch (or the 120s
    // watchdog) has authoritative info to decide.
    act(() => {
      hoist.captured?.onDisconnected?.();
      hoist.captured?.onStatusChange?.("disconnected");
    });
    expect(result.current.isStreaming).toBe(true);
  });
});
