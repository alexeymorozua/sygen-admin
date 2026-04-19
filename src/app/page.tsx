"use client";

import { useEffect, useState, useCallback, useRef, forwardRef } from "react";
import {
  Bot,
  ListTodo,
  Clock,
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Server,
  Circle,
  LogIn,
  Terminal,
  Webhook as WebhookIcon,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { RefreshButton } from "@/components/RefreshButton";
import { ErrorState } from "@/components/LoadingState";
import {
  SygenAPI,
  type ActivityRecentEvent,
  type DashboardSummary,
  type DashboardSummarySystem,
} from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useServer } from "@/context/ServerContext";
import { checkServerHealth } from "@/lib/servers";
import { useTranslation } from "@/lib/i18n";

const REFRESH_INTERVAL = 10_000;

type ThresholdLevel = "ok" | "warn" | "critical";

function thresholdLevel(value: number): ThresholdLevel {
  if (value >= 80) return "critical";
  if (value >= 50) return "warn";
  return "ok";
}

// Severity colors the % number on the right, not the bar — so CPU/RAM/Disk
// at the same "warn" level don't visually collapse into one yellow blob.
const THRESHOLD_TEXT: Record<ThresholdLevel, string> = {
  ok: "text-success",
  warn: "text-warning",
  critical: "text-danger",
};

type MetricTone = "cpu" | "ram" | "disk";

const METRIC_BAR: Record<MetricTone, string> = {
  cpu: "bg-sky-500",
  ram: "bg-purple-500",
  disk: "bg-teal-500",
};

const METRIC_ICON: Record<MetricTone, string> = {
  cpu: "text-sky-500",
  ram: "text-purple-500",
  disk: "text-teal-500",
};

type ActivityFilter = "all" | "error";

function iconForEventType(type: string): LucideIcon {
  if (type.startsWith("task")) return ListTodo;
  if (type.startsWith("cron")) return Clock;
  if (type.startsWith("agent")) return Bot;
  if (type.startsWith("webhook")) return WebhookIcon;
  if (type === "auth_login" || type === "login") return LogIn;
  return Terminal;
}

interface SeverityStyle {
  border: string;
  iconBg: string;
  iconText: string;
  Icon: LucideIcon;
}

function severityStyle(severity: ActivityRecentEvent["severity"]): SeverityStyle {
  switch (severity) {
    case "error":
      return { border: "border-l-danger", iconBg: "bg-danger/15", iconText: "text-danger", Icon: XCircle };
    case "warning":
      return { border: "border-l-warning", iconBg: "bg-warning/15", iconText: "text-warning", Icon: AlertTriangle };
    case "success":
      return { border: "border-l-success", iconBg: "bg-success/15", iconText: "text-success", Icon: CheckCircle2 };
    default:
      return { border: "border-l-brand-400", iconBg: "bg-brand-400/15", iconText: "text-brand-400", Icon: Info };
  }
}

function useCountUp(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  displayRef.current = display;

  useEffect(() => {
    const start = displayRef.current;
    if (start === target) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}

export default function DashboardPage() {
  const { servers, activeServer, switchServer, refreshKey } = useServer();
  const { t } = useTranslation();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [serverStatuses, setServerStatuses] = useState<Record<string, { online: boolean }>>({});
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activityRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    setError("");
    try {
      const data = await SygenAPI.getDashboardSummary();
      setSummary(data);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData, refreshKey]);

  useEffect(() => {
    refreshRef.current = setInterval(() => loadData(true), REFRESH_INTERVAL);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [loadData]);

  useEffect(() => {
    const onFocus = () => loadData(true);
    if (typeof window === "undefined") return;
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadData]);

  useEffect(() => {
    if (servers.length <= 1) return;
    let cancelled = false;
    async function checkAll() {
      const results: Record<string, { online: boolean }> = {};
      await Promise.all(
        servers.map(async (s) => {
          const { online } = await checkServerHealth(s);
          results[s.id] = { online };
        })
      );
      if (!cancelled) setServerStatuses(results);
    }
    checkAll();
    return () => { cancelled = true; };
  }, [servers]);

  if (error && !summary) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
        <RefreshButton
          loading={refreshing}
          onClick={() => loadData()}
          title={t("dashboard.refresh")}
        />
      </div>

      {servers.length > 1 && (
        <div className="bg-bg-card border border-border rounded-xl p-4 mb-4 md:mb-6">
          <h2 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
            <Server size={14} />
            {t("dashboard.connectedServers")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {servers.map((server) => {
              const status = serverStatuses[server.id];
              const isActive = server.id === activeServer.id;
              return (
                <button
                  key={server.id}
                  onClick={() => switchServer(server.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
                    isActive ? "bg-accent border border-accent-hover" : "bg-white/5 hover:bg-white/10 border border-transparent"
                  )}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: server.color }} />
                  <span className="font-medium">{server.name}</span>
                  <Circle
                    size={6}
                    className={cn(
                      "shrink-0",
                      status?.online
                        ? "fill-success text-success"
                        : status
                        ? "fill-danger text-danger"
                        : "fill-text-secondary text-text-secondary"
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loading || !summary ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-4 md:mb-6">
            <div className="lg:col-span-1">
              <SystemHero system={summary.system} t={t} />
            </div>
            <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <CounterTile
                label={t("nav.agents")}
                value={`${summary.counters.agents_online}/${summary.counters.agents_total}`}
                icon={Bot}
                hint={
                  summary.counters.agents_online === 0 && summary.counters.agents_total > 0
                    ? t("dashboard.registered")
                    : `${summary.counters.agents_online} ${t("dashboard.online")}`
                }
              />
              <CounterTile
                label={t("dashboard.activeTasks")}
                value={summary.counters.active_tasks}
                icon={ListTodo}
                hint={t("dashboard.running")}
              />
              <CounterTile
                label={t("nav.cron")}
                value={summary.counters.running_crons}
                icon={Clock}
                hint={t("dashboard.active")}
              />
              <CounterTile
                label={t("dashboard.failedLast24h")}
                value={summary.counters.failed_last_24h}
                icon={AlertTriangle}
                alert={summary.counters.failed_last_24h > 0}
                hint={t("dashboard.last24h")}
                onClick={
                  summary.counters.failed_last_24h > 0
                    ? () => {
                        setActivityFilter("error");
                        activityRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    : undefined
                }
              />
            </div>
          </div>

          <ActivityCard
            ref={activityRef}
            events={summary.recent_activity}
            t={t}
            filter={activityFilter}
            onClearFilter={() => setActivityFilter("all")}
          />
        </>
      )}
    </div>
  );
}

interface TFn {
  (key: string): string;
}

function SystemHero({ system, t }: { system: DashboardSummarySystem; t: TFn }) {
  return (
    <div
      data-testid="system-hero"
      className="bg-bg-card border border-border rounded-xl p-5 h-full flex flex-col"
    >
      <h2 className="text-sm font-semibold text-text-secondary mb-4 flex items-center gap-2">
        <Cpu size={14} className="text-brand-400" />
        {t("dashboard.systemHealth")}
      </h2>
      <div className="space-y-4 flex-1">
        <MetricBar label="CPU" value={system.cpu_percent} icon={Cpu} tone="cpu" />
        <MetricBar label="RAM" value={system.ram_percent} icon={MemoryStick} tone="ram" />
        <MetricBar label="Disk" value={system.disk_percent} icon={HardDrive} tone="disk" />
      </div>
      <div className="pt-3 mt-4 border-t border-border/50">
        <p className="text-xs text-text-secondary">{t("dashboard.uptime")}</p>
        <p className="text-sm font-medium">{system.uptime_human}</p>
      </div>
    </div>
  );
}

function MetricBar({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: MetricTone;
}) {
  const level = thresholdLevel(value);
  return (
    <div data-testid={`metric-${label.toLowerCase()}`} data-level={level} data-tone={tone}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-text-secondary flex items-center gap-1.5">
          <Icon size={14} className={METRIC_ICON[tone]} />
          {label}
        </span>
        <span className={cn("text-sm font-medium tabular-nums", THRESHOLD_TEXT[level])}>
          {value}%
        </span>
      </div>
      <div className="w-full h-1.5 bg-bg-primary rounded-full overflow-hidden">
        <div
          data-testid={`metric-${label.toLowerCase()}-bar`}
          className={cn("h-full rounded-full transition-all duration-500", METRIC_BAR[tone])}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

function CounterTile({
  label,
  value,
  icon: Icon,
  hint,
  alert,
  onClick,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  alert?: boolean;
  onClick?: () => void;
}) {
  const numericValue = typeof value === "number" ? value : null;
  const isAlerting = alert && numericValue !== null && numericValue > 0;
  const clickable = Boolean(onClick);
  return (
    <div
      data-testid={`counter-${label}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "bg-bg-card border rounded-xl p-4 transition-colors",
        isAlerting ? "border-danger/40 hover:border-danger/70" : "border-border hover:border-accent/50",
        clickable && "cursor-pointer focus:outline-none focus:ring-2 focus:ring-danger/50"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider truncate">
          {label}
        </span>
        <Icon
          data-testid={`counter-${label}-icon`}
          size={16}
          className={cn("shrink-0", isAlerting ? "text-danger" : "text-brand-400")}
        />
      </div>
      <div
        className={cn(
          "text-2xl md:text-3xl font-bold tabular-nums leading-none",
          isAlerting ? "text-danger" : "text-text-primary"
        )}
      >
        {numericValue !== null ? <CountUp value={numericValue} /> : value}
      </div>
      {hint && <p className="text-xs text-text-secondary mt-2 truncate">{hint}</p>}
    </div>
  );
}

function CountUp({ value }: { value: number }) {
  const display = useCountUp(value);
  return <>{display}</>;
}

const ActivityCard = forwardRef<
  HTMLDivElement,
  {
    events: ActivityRecentEvent[];
    t: TFn;
    filter: ActivityFilter;
    onClearFilter: () => void;
  }
>(function ActivityCard({ events, t, filter, onClearFilter }, ref) {
  const filtered = filter === "error" ? events.filter((e) => e.severity === "error") : events;
  return (
    <div ref={ref} className="bg-bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-sm font-semibold text-text-secondary flex items-center gap-2">
          <Activity size={14} className="text-brand-400" />
          {t("dashboard.recentActivity")}
        </h2>
        {filter === "error" && (
          <button
            type="button"
            onClick={onClearFilter}
            data-testid="activity-clear-filter"
            className="inline-flex items-center gap-1 rounded-full border border-danger/40 bg-danger/10 px-2.5 py-0.5 text-xs text-danger hover:bg-danger/20"
          >
            {t("dashboard.filterErrors")}
            <span aria-hidden="true">×</span>
            <span className="sr-only">{t("dashboard.clearFilter")}</span>
          </button>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-text-secondary py-6 text-center">
          {t("dashboard.noRecentActivity")}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.slice(0, 8).map((event) => (
            <ActivityItem key={event.id} event={event} />
          ))}
        </ul>
      )}
    </div>
  );
});

function ActivityItem({ event }: { event: ActivityRecentEvent }) {
  const sev = severityStyle(event.severity);
  const TypeIcon = iconForEventType(event.type);
  // Backend subtitle is "{actor} · {relative_time}". Split so we can put the
  // time in its own right-aligned column and avoid cramming both into one line.
  const dotIdx = event.subtitle.indexOf(" · ");
  const actor = dotIdx >= 0 ? event.subtitle.slice(0, dotIdx) : event.subtitle;
  const time = formatDate(event.timestamp);
  return (
    <li
      data-testid={`activity-${event.id}`}
      data-severity={event.severity}
      className={cn(
        "flex items-start gap-3 rounded-lg border-l-2 bg-bg-primary/40 px-3 py-2 transition-colors hover:bg-bg-primary/60",
        sev.border
      )}
    >
      <div className={cn("shrink-0 mt-0.5 rounded-md p-1.5", sev.iconBg)}>
        <TypeIcon size={14} className={sev.iconText} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary truncate">{event.title}</p>
        <p className="text-xs text-text-secondary truncate">{actor}</p>
      </div>
      <span className="shrink-0 text-xs text-text-secondary tabular-nums whitespace-nowrap pl-2">
        {time}
      </span>
    </li>
  );
}

function DashboardSkeleton() {
  return (
    <div data-testid="dashboard-skeleton">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-4 md:mb-6">
        <div className="lg:col-span-1 bg-bg-card border border-border rounded-xl p-5 animate-pulse">
          <div className="h-3 bg-bg-primary rounded w-1/3 mb-4" />
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="h-3 bg-bg-primary rounded w-1/4" />
                  <div className="h-3 bg-bg-primary rounded w-8" />
                </div>
                <div className="h-1.5 bg-bg-primary rounded w-full" />
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-border/50">
            <div className="h-3 bg-bg-primary rounded w-1/4 mb-1.5" />
            <div className="h-3 bg-bg-primary rounded w-1/3" />
          </div>
        </div>
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-bg-card border border-border rounded-xl p-4 animate-pulse">
              <div className="flex items-center justify-between mb-2">
                <div className="h-3 bg-bg-primary rounded w-1/2" />
                <div className="h-4 w-4 bg-bg-primary rounded" />
              </div>
              <div className="h-7 bg-bg-primary rounded w-1/3 mb-2" />
              <div className="h-3 bg-bg-primary rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-bg-card border border-border rounded-xl p-5 animate-pulse">
        <div className="h-3 bg-bg-primary rounded w-1/4 mb-4" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg bg-bg-primary/40 px-3 py-2">
              <div className="h-7 w-7 bg-bg-primary rounded-md" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-bg-primary rounded w-2/3" />
                <div className="h-3 bg-bg-primary rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
