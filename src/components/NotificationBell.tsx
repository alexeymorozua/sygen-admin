"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, ListTodo, Clock, Bot, Terminal, Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface Notification {
  id: string;
  type: "task_completed" | "task_failed" | "cron_failed";
  message: string;
  timestamp: string;
}

const STORAGE_KEY = "sygen_notifications_last_read";

function getLastReadTime(): number {
  if (typeof window === "undefined") return 0;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? Number(stored) : 0;
}

function setLastReadTime(time: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(time));
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getNotificationIcon(type: Notification["type"]) {
  switch (type) {
    case "task_completed":
      return <ListTodo size={14} className="text-green-400 shrink-0" />;
    case "task_failed":
      return <Terminal size={14} className="text-danger shrink-0" />;
    case "cron_failed":
      return <Clock size={14} className="text-danger shrink-0" />;
    default:
      return <Bot size={14} className="text-brand-400 shrink-0" />;
  }
}

interface NotificationBellProps {
  notifications: Notification[];
}

export default function NotificationBell({ notifications }: NotificationBellProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [lastRead, setLastRead] = useState(getLastReadTime);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => {
    const ts = new Date(n.timestamp).getTime();
    return ts > lastRead;
  }).length;

  const handleOpen = useCallback(() => {
    setOpen((prev) => {
      if (!prev) {
        // Opening — mark all as read
        const now = Date.now();
        setLastRead(now);
        setLastReadTime(now);
      }
      return !prev;
    });
  }, []);

  const handleMarkAllRead = useCallback(() => {
    const now = Date.now();
    setLastRead(now);
    setLastReadTime(now);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  // Browser notification for new events
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    if (
      Notification.permission === "granted" &&
      notifications.length > 0 &&
      !document.hasFocus()
    ) {
      const latest = notifications[0];
      const latestTs = new Date(latest.timestamp).getTime();
      if (latestTs > lastRead) {
        new Notification("Sygen Admin", {
          body: latest.message,
          tag: `sygen-${latest.id}`,
        });
      }
    }
  }, [notifications, lastRead]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-3 w-full px-6 py-3 text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
        aria-label={t("notifications.title")}
      >
        <div className="relative">
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
        {t("notifications.title")}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 w-80 mb-2 bg-bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">{t("notifications.title")}</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-500 transition-colors"
              >
                <Check size={12} />
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-text-secondary text-center py-6">
                {t("notifications.empty")}
              </p>
            ) : (
              notifications.slice(0, 20).map((n) => {
                const isUnread = new Date(n.timestamp).getTime() > lastRead;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0",
                      isUnread && "bg-brand-500/5"
                    )}
                  >
                    <div className="mt-0.5">{getNotificationIcon(n.type)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary truncate">{n.message}</p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {formatRelativeTime(n.timestamp)}
                      </p>
                    </div>
                    {isUnread && (
                      <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0 mt-1.5" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
