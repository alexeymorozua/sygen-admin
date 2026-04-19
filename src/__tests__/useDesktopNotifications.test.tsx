import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { WSChatMessage } from "@/lib/websocket";

// `useChat` exposes a callback registry — we capture the registered cb and
// fire it with synthetic WSChatMessage envelopes to verify the hook decides
// correctly when to call `notify()`.
const setChatMessageCallback = vi.fn();
let captured: ((msg: WSChatMessage) => void) | null = null;

setChatMessageCallback.mockImplementation(
  (cb: ((msg: WSChatMessage) => void) | null) => {
    captured = cb;
  },
);

vi.mock("@/context/ChatContext", () => ({
  useChat: () => ({ setChatMessageCallback }),
}));

const notifyMock = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

import { useDesktopNotifications } from "@/hooks/useDesktopNotifications";

function fire(msg: WSChatMessage) {
  if (!captured) throw new Error("callback was not registered");
  captured(msg);
}

describe("useDesktopNotifications", () => {
  beforeEach(() => {
    notifyMock.mockReset();
    captured = null;
    setChatMessageCallback.mockClear();
  });

  it("notifies on agent text deliveries (synthesized chat_message)", () => {
    renderHook(() => useDesktopNotifications());
    fire({
      type: "chat_message",
      role: "agent",
      kind: "text",
      agent: "main",
      session_id: "sess-1",
      content: "Hello back",
      timestamp: 1_700_000_000,
    });
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const args = notifyMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.body).toBe("Hello back");
    expect(args.sessionId).toBe("sess-1");
    expect(args.agent).toBe("main");
  });

  it("notifies on task_result / task_question / interagent kinds", () => {
    renderHook(() => useDesktopNotifications());
    fire({
      type: "chat_message",
      role: "agent",
      kind: "task_result",
      agent: "main",
      content: "done",
    });
    fire({
      type: "chat_message",
      role: "agent",
      kind: "task_question",
      agent: "main",
      content: "?",
    });
    fire({
      type: "chat_message",
      role: "agent",
      kind: "interagent",
      agent: "sonic",
      content: "ping",
    });
    expect(notifyMock).toHaveBeenCalledTimes(3);
  });

  it("does not notify on user-role messages (own echo)", () => {
    renderHook(() => useDesktopNotifications());
    fire({
      type: "chat_message",
      role: "user",
      kind: "text",
      agent: "main",
      content: "my own message",
    });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("does not notify on unknown kinds", () => {
    renderHook(() => useDesktopNotifications());
    fire({
      type: "chat_message",
      role: "agent",
      kind: "tool_activity",
      agent: "main",
      content: "ignored",
    });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("clears the callback on unmount", () => {
    const { unmount } = renderHook(() => useDesktopNotifications());
    unmount();
    // Last call should be the unmount cleanup with null.
    const calls = setChatMessageCallback.mock.calls;
    expect(calls[calls.length - 1][0]).toBeNull();
  });
});
