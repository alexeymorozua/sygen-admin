/**
 * Local desktop Notification API wrapper.
 *
 * Pure browser Notifications (no Service Worker, no Web Push). Fires only
 * when the admin tab is in the background so active chats aren't spammed.
 */

export interface NotifyPayload {
  title: string;
  body: string;
  tag?: string;
  sessionId?: string;
  agent?: string;
  url?: string;
}

const PREF_KEY = "sygen.notifications.enabled";
const MAX_BODY = 120;
const ICON = "/icon-192x192.png";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isIOSSafari(): boolean {
  if (!isBrowser()) return false;
  const ua = navigator.userAgent;
  // iOS Safari / iOS PWA — Notification constructor exists in newer builds
  // but only works via ServiceWorkerRegistration.showNotification. Skip.
  const iOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
  const iPadOSpretendingMac =
    ua.includes("Macintosh") &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1;
  return iOS || iPadOSpretendingMac;
}

export function isSupported(): boolean {
  if (!isBrowser()) return false;
  if (!("Notification" in window)) return false;
  if (isIOSSafari()) return false;
  return true;
}

export function getPermission(): NotificationPermission | "unsupported" {
  if (!isSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    const result = await Notification.requestPermission();
    if (result === "granted") setEnabled(true);
    return result;
  } catch {
    return Notification.permission;
  }
}

export function isEnabled(): boolean {
  if (!isSupported()) return false;
  if (Notification.permission !== "granted") return false;
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    if (raw === null) return true; // default on when permission granted
    return raw === "true";
  } catch {
    return true;
  }
}

export function setEnabled(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREF_KEY, value ? "true" : "false");
  } catch {
    // storage disabled — ignore
  }
}

function tabIsForeground(): boolean {
  if (!isBrowser()) return true;
  if (document.hidden) return false;
  if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
  return true;
}

function truncate(text: string, max = MAX_BODY): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max - 1).trimEnd() + "…";
}

export function notify(payload: NotifyPayload): Notification | null {
  if (!isSupported()) return null;
  if (Notification.permission !== "granted") return null;
  if (!isEnabled()) return null;
  if (tabIsForeground()) return null;

  const tag = payload.tag ?? (payload.sessionId ? `sygen-session-${payload.sessionId}` : undefined);
  const body = truncate(payload.body);

  try {
    const n = new Notification(payload.title || "Sygen", {
      body,
      tag,
      icon: ICON,
      requireInteraction: false,
      silent: false,
    });

    n.onclick = (event) => {
      event.preventDefault();
      if (typeof window !== "undefined") {
        try {
          window.focus();
        } catch {
          // no-op
        }
        const target =
          payload.url ??
          (payload.agent
            ? `/chat?agent=${encodeURIComponent(payload.agent)}${
                payload.sessionId ? `&session=${encodeURIComponent(payload.sessionId)}` : ""
              }`
            : "/chat");
        try {
          window.location.href = target;
        } catch {
          // no-op
        }
      }
      n.close();
    };

    return n;
  } catch {
    return null;
  }
}

export const NOTIFICATION_PREF_KEY = PREF_KEY;
