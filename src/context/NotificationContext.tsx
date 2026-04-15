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
import { SygenAPI, type SygenNotification } from "@/lib/api";
import { useChat } from "@/context/ChatContext";

// ---------------------------------------------------------------------------
// Context interface
// ---------------------------------------------------------------------------

interface NotificationContextValue {
  notifications: SygenNotification[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  loading: boolean;
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
  const initializedRef = useRef(false);

  // Load notifications from server
  const loadNotifications = useCallback(async () => {
    try {
      const [notifs, count] = await Promise.all([
        SygenAPI.getNotifications(50),
        SygenAPI.getUnreadCount(),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch {
      // Non-critical — keep existing state
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load when WS connects
  useEffect(() => {
    if (wsStatus !== "connected") return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    loadNotifications();
  }, [wsStatus, loadNotifications]);

  // Reset on disconnect
  useEffect(() => {
    if (wsStatus === "disconnected") {
      initializedRef.current = false;
    }
  }, [wsStatus]);

  // Register WS notification callback
  useEffect(() => {
    setNotificationCallback((notification: SygenNotification) => {
      setNotifications((prev) => [notification, ...prev]);
      if (!notification.read) {
        setUnreadCount((prev) => prev + 1);
      }

      // Browser notification when tab is not focused
      if (
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
  }, [setNotificationCallback]);

  // Mark single notification as read
  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.read ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
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

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      markRead,
      markAllRead,
      loading,
    }),
    [notifications, unreadCount, markRead, markAllRead, loading]
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
