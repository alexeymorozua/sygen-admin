"use client";

import { useState, useCallback } from "react";
import { Bell, Clock, Webhook, Cpu, Bot, Check, Reply, Filter, CheckCheck } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useNotifications } from "@/context/NotificationContext";
import { cn } from "@/lib/utils";
import type { SygenNotification } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

type NotificationFilter = "all" | "cron" | "system" | "task" | "webhook";

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

function formatFullDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getNotificationIcon(type: SygenNotification["type"], size = 14) {
  switch (type) {
    case "cron":
      return <Clock size={size} className="text-brand-400 shrink-0" />;
    case "webhook":
      return <Webhook size={size} className="text-purple-400 shrink-0" />;
    case "task":
      return <Cpu size={size} className="text-green-400 shrink-0" />;
    case "system":
    default:
      return <Bot size={size} className="text-text-secondary shrink-0" />;
  }
}

function getTypeLabel(type: SygenNotification["type"], t: (key: string) => string): string {
  switch (type) {
    case "cron": return t("notifications.typeCron");
    case "webhook": return t("notifications.typeWebhook");
    case "task": return t("notifications.typeTask");
    case "system": return t("notifications.typeSystem");
    default: return type;
  }
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { notifications, unreadCount, markRead, markAllRead, loading } = useNotifications();
  const [selected, setSelected] = useState<SygenNotification | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>("all");

  const filtered = filter === "all"
    ? notifications
    : notifications.filter((n) => n.type === filter);

  const handleSelect = useCallback(
    (n: SygenNotification) => {
      setSelected(n);
      if (!n.read) markRead(n.id);
    },
    [markRead]
  );

  const filters: { key: NotificationFilter; labelKey: string }[] = [
    { key: "all", labelKey: "notifications.filterAll" },
    { key: "cron", labelKey: "notifications.filterCron" },
    { key: "system", labelKey: "notifications.filterSystem" },
    { key: "task", labelKey: "notifications.filterTask" },
    { key: "webhook", labelKey: "notifications.filterWebhook" },
  ];

  return (
    <div className="flex gap-6 h-[calc(100vh-4rem)]">
      {/* Left: Notification list */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{t("notifications.title")}</h1>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-danger/20 text-danger">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 transition-colors"
            >
              <CheckCheck size={14} />
              {t("notifications.markAllRead")}
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 mb-4 bg-bg-card rounded-lg p-1 border border-border w-fit">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setFilter(f.key); setSelected(null); }}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                filter === f.key
                  ? "bg-brand-500/20 text-brand-400"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 bg-bg-card rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
              <Bell size={32} className="mb-3 opacity-40" />
              <p className="text-sm">{t("notifications.empty")}</p>
            </div>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleSelect(n)}
                className={cn(
                  "w-full text-left flex items-start gap-3 px-4 py-3 rounded-lg transition-colors",
                  selected?.id === n.id
                    ? "bg-brand-500/10 border border-brand-500/30"
                    : n.read
                      ? "bg-bg-card/50 border border-transparent hover:bg-bg-card"
                      : "bg-bg-card border border-border hover:bg-bg-card/80"
                )}
              >
                <div className="mt-0.5">{getNotificationIcon(n.type)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn(
                      "text-sm truncate",
                      n.read ? "text-text-secondary" : "text-text-primary font-medium"
                    )}>
                      {n.title}
                    </p>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5 truncate">{n.body}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-text-secondary">
                      {formatRelativeTime(n.created_at)}
                    </span>
                    {n.agent && (
                      <span className="text-[10px] text-text-secondary font-mono">
                        @{n.agent}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: Detail panel */}
      {selected && (
        <div className="w-[480px] bg-bg-card border border-border rounded-xl shrink-0 hidden xl:flex flex-col h-fit sticky top-8 max-h-[calc(100vh-6rem)]">
          {/* Detail header */}
          <div className="p-5 border-b border-border">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{getNotificationIcon(selected.type, 18)}</div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-text-primary">{selected.title}</h2>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-text-secondary">
                    {formatFullDate(selected.created_at)}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-bg-primary text-text-secondary">
                    {getTypeLabel(selected.type, t)}
                  </span>
                  {selected.agent && (
                    <span className="text-xs text-text-secondary font-mono">@{selected.agent}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-4">
              {!selected.read && (
                <button
                  type="button"
                  onClick={() => markRead(selected.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-bg-primary hover:bg-white/5 transition-colors text-text-secondary"
                >
                  <Check size={12} />
                  {t("notifications.markRead")}
                </button>
              )}
              {selected.agent && (
                <a
                  href={`/chat?agent=${encodeURIComponent(selected.agent)}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 transition-colors"
                >
                  <Reply size={12} />
                  {t("notifications.reply")}
                </a>
              )}
            </div>
          </div>

          {/* Detail body - markdown */}
          <div className="p-5 overflow-y-auto flex-1">
            <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-black/30 [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:text-brand-300 [&_a]:text-brand-400 [&_a:hover]:text-brand-500 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_p]:text-text-secondary [&_li]:text-text-secondary [&_strong]:text-text-primary">
              <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                {selected.body}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* Mobile detail overlay */}
      {selected && (
        <div className="xl:hidden fixed inset-0 z-50 bg-bg-primary/95 overflow-y-auto p-4 pt-16">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="absolute top-4 right-4 p-2 bg-bg-card border border-border rounded-lg text-text-secondary hover:text-text-primary"
          >
            ✕
          </button>

          <div className="max-w-2xl mx-auto">
            <div className="flex items-start gap-3 mb-4">
              {getNotificationIcon(selected.type, 18)}
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{selected.title}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-text-secondary">
                    {formatFullDate(selected.created_at)}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-bg-card text-text-secondary">
                    {getTypeLabel(selected.type, t)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-6">
              {!selected.read && (
                <button
                  type="button"
                  onClick={() => markRead(selected.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-bg-card hover:bg-white/5 transition-colors text-text-secondary"
                >
                  <Check size={12} />
                  {t("notifications.markRead")}
                </button>
              )}
              {selected.agent && (
                <a
                  href={`/chat?agent=${encodeURIComponent(selected.agent)}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 transition-colors"
                >
                  <Reply size={12} />
                  {t("notifications.reply")}
                </a>
              )}
            </div>

            <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-black/30 [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:text-brand-300 [&_a]:text-brand-400 [&_p]:text-text-secondary [&_li]:text-text-secondary [&_strong]:text-text-primary">
              <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                {selected.body}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
