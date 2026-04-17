"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SygenAPI, type NotificationSeverity, type SygenNotification } from "@/lib/api";
import { useChat } from "@/context/ChatContext";

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const ALL_SEVERITIES: NotificationSeverity[] = ["critical", "warning", "info", "silent"];
const DEFAULT_SEVERITIES: NotificationSeverity[] = ["critical", "warning", "info"];
const STORAGE_KEY = "sygen.notif.severities.v1";
const UNREAD_SEVERITIES = new Set<NotificationSeverity>(["critical", "warning", "info"]);

function loadStoredSeverities(): NotificationSeverity[] {
  if (typeof window === "undefined") return DEFAULT_SEVERITIES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SEVERITIES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SEVERITIES;
    const filtered = parsed.filter(
      (s): s is NotificationSeverity =>
        typeof s === "string" && (ALL_SEVERITIES as string[]).includes(s),
    );
    return filtered.length > 0 ? filtered : DEFAULT_SEVERITIES;
  } catch {
    return DEFAULT_SEVERITIES;
  }
}

function persistSeverities(severities: NotificationSeverity[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(severities));
  } catch {
    // localStorage disabled — silently ignore.
  }
}

// ---------------------------------------------------------------------------
// Context interface
// ---------------------------------------------------------------------------

interface NotificationContextValue {
  notifications: SygenNotification[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  loading: boolean;
  enabledSeverities: NotificationSeverity[];
  toggleSeverity: (sev: NotificationSeverity) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { setNotificationCallback, wsStatus } = useChat();

  const [notifications, setNotifications] = useState<SygenNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [enabledSeverities, setEnabledSeverities] =
    useState<NotificationSeverity[]>(DEFAULT_SEVERITIES);
  const initializedRef = useRef(false);

  // Hydrate severity selection from localStorage (client-only).
  useEffect(() => {
    setEnabledSeverities(loadStoredSeverities());
  }, []);

  // Load notifications from server
  const loadNotifications = useCallback(async () => {
    try {
      const [notifs, count] = await Promise.all([
        SygenAPI.getNotifications(50, false, enabledSeverities),
        SygenAPI.getUnreadCount(),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch {
      // Non-critical — keep existing state
    } finally {
      setLoading(false);
    }
  }, [enabledSeverities]);

  // Initial load when WS connects
  useEffect(() => {
    if (wsStatus !== "connected") return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    loadNotifications();
  }, [wsStatus, loadNotifications]);

  // Re-fetch list whenever the severity filter changes (after initial load).
  useEffect(() => {
    if (!initializedRef.current) return;
    loadNotifications();
  }, [enabledSeverities, loadNotifications]);

  // Reset on disconnect
  useEffect(() => {
    if (wsStatus === "disconnected") {
      initializedRef.current = false;
    }
  }, [wsStatus]);

  // Register WS notification callback
  useEffect(() => {
    setNotificationCallback((notification: SygenNotification) => {
      const sev: NotificationSeverity = notification.severity ?? "info";
      // Only insert into the list if the severity is currently enabled.
      if (enabledSeverities.includes(sev)) {
        setNotifications((prev) => [notification, ...prev]);
      }
      // Unread badge: only increment for non-silent severities and when unread.
      if (!notification.read && UNREAD_SEVERITIES.has(sev)) {
        setUnreadCount((prev) => prev + 1);
      }

      // Browser notification when tab is not focused — skip silent.
      if (
        sev !== "silent" &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted" &&
        !document.hasFocus()
      ) {
        new Notification("Sygen Admin", {
          body: notification.title,
          tag: `sygen-${notification.id}`,
        });
      }
    });

    return () => setNotificationCallback(null);
  }, [setNotificationCallback, enabledSeverities]);

  // Mark single notification as read
  const markRead = useCallback(async (id: string) => {
    let wasUnread = false;
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id === id && !n.read) {
          wasUnread = true;
          return { ...n, read: true };
        }
        return n;
      })
    );
    if (wasUnread) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    try {
      await SygenAPI.markNotificationRead(id);
    } catch {
      // Revert on failure
      loadNotifications();
    }
  }, [loadNotifications]);

  // Mark all as read
  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await SygenAPI.markAllNotificationsRead();
    } catch {
      loadNotifications();
    }
  }, [loadNotifications]);

  const toggleSeverity = useCallback((sev: NotificationSeverity) => {
    setEnabledSeverities((prev) => {
      const next = prev.includes(sev)
        ? prev.filter((s) => s !== sev)
        : [...prev, sev];
      const ordered = ALL_SEVERITIES.filter((s) => next.includes(s));
      persistSeverities(ordered);
      return ordered;
    });
  }, []);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      markRead,
      markAllRead,
      loading,
      enabledSeverities,
      toggleSeverity,
    }),
    [notifications, unreadCount, markRead, markAllRead, loading, enabledSeverities, toggleSeverity]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}
