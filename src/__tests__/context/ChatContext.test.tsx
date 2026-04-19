import { describe, it, expect, vi, beforeEach } from "vitest";
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
