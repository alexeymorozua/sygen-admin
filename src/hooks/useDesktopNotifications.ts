"use client";

import { useEffect } from "react";
import { useChat } from "@/context/ChatContext";
import { notify } from "@/lib/notifications";
import type { WSChatMessage } from "@/lib/websocket";

/**
 * Subscribes to the admin WS chat stream and surfaces OS-level notifications
 * for background tabs. Only meaningful deliveries trigger — text_delta /
 * tool_activity / system_status are intentionally skipped (handled by the
 * normal streaming UI).
 */
const NOTIFY_KINDS = new Set<string>([
  "text",
  "task_result",
  "task_question",
  "interagent",
]);

function formatTitle(msg: WSChatMessage): string {
  const agent = msg.agent?.trim();
  if (!agent) return "Sygen";
  // Capitalize single-word agent names for nicer OS display.
  return agent.charAt(0).toUpperCase() + agent.slice(1);
}

function formatBody(msg: WSChatMessage): string {
  if (msg.kind === "task_question") {
    return msg.content || "Task is waiting for your answer";
  }
  if (msg.kind === "task_result") {
    return msg.content || "Task finished";
  }
  if (msg.kind === "interagent") {
    return msg.content || "Incoming inter-agent message";
  }
  return msg.content || "New message";
}

export function useDesktopNotifications(): void {
  const { setChatMessageCallback } = useChat();

  useEffect(() => {
    setChatMessageCallback((msg: WSChatMessage) => {
      // Only surface server-originated agent deliveries. User echoes shouldn't
      // ping the admin about their own send.
      if (msg.role !== "agent") return;
      const kind = msg.kind || "text";
      if (!NOTIFY_KINDS.has(kind)) return;

      notify({
        title: formatTitle(msg),
        body: formatBody(msg),
        sessionId: msg.session_id,
        agent: msg.agent,
      });
    });

    return () => setChatMessageCallback(null);
  }, [setChatMessageCallback]);
}
