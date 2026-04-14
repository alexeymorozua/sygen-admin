/**
 * Persistent chat history via localStorage.
 * Keyed per-server + per-agent, capped at 100 messages.
 */

import type { StreamingMessageProps } from "@/components/StreamingMessage";

const MAX_MESSAGES = 100;
const PREFIX = "sygen_chat_";

function storageKey(serverId: string, agent: string): string {
  return `${PREFIX}${serverId}_${agent}`;
}

export function loadHistory(
  serverId: string,
  agent: string
): StreamingMessageProps[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(serverId, agent));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

export function saveHistory(
  serverId: string,
  agent: string,
  messages: StreamingMessageProps[]
): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = messages
      .filter((m) => !m.isStreaming)
      .slice(-MAX_MESSAGES);
    localStorage.setItem(storageKey(serverId, agent), JSON.stringify(trimmed));
  } catch {
    // localStorage full — silently ignore
  }
}

export function clearHistory(serverId: string, agent: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey(serverId, agent));
}

export function clearAllHistory(serverId: string): void {
  if (typeof window === "undefined") return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(`${PREFIX}${serverId}_`)) {
      toRemove.push(key);
    }
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

export function getMessageCount(serverId: string, agent: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(storageKey(serverId, agent));
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
