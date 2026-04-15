"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, Clock, Webhook, Cpu, Bot, Check, Reply } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useNotifications } from "@/context/NotificationContext";
import { cn } from "@/lib/utils";
import type { SygenNotification } from "@/lib/api";

function formatRelativeTime(ts: number): string {
  const now = Date.now() / 1000;
  const diff = now - ts;
  const minutes = Math.floor(diff / 60);
  const hours = Math.floor(diff / 3600);
  const days = Math.floor(diff / 86400);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getNotificationIcon(type: SygenNotification["type"]) {
  switch (type) {
    case "cron":
      return <Clock size={14} className="text-brand-400 shrink-0" />;
    case "webhook":
      return <Webhook size={14} className="text-purple-400 shrink-0" />;
    case "task":
      return <Cpu size={14} className="text-green-400 shrink-0" />;
    case "system":
    default:
      return <Bot size={14} className="text-text-secondary shrink-0" />;
  }
}

export default function NotificationBell() {
  const { t } = useTranslation();
  const router = useRouter();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleOpen = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const handleReply = useCallback(
    (agent: string) => {
      setOpen(false);
      router.push(`/chat?agent=${encodeURIComponent(agent)}`);
    },
    [router]
  );

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
                onClick={markAllRead}
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
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0",
                    !n.read && "bg-brand-500/5"
                  )}
                  onClick={() => { if (!n.read) markRead(n.id); }}
                >
                  <div className="mt-0.5">{getNotificationIcon(n.type)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-primary font-medium truncate">{n.title}</p>
                    <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{n.body}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-text-secondary">
                        {formatRelativeTime(n.created_at)}
                      </span>
                      {n.agent && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReply(n.agent);
                          }}
                          className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-500 transition-colors"
                        >
                          <Reply size={10} />
                          {t("notifications.reply")}
                        </button>
                      )}
                    </div>
                  </div>
                  {!n.read && (
                    <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0 mt-1.5" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
