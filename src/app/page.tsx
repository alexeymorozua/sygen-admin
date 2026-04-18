"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Bot, ListTodo, Clock, Activity, Cpu, HardDrive, MemoryStick, Server, Circle, LogIn, Terminal, Webhook as WebhookIcon, AlertTriangle } from "lucide-react";
import StatusCard from "@/components/StatusCard";
import { RefreshButton } from "@/components/RefreshButton";
import { LoadingSpinner, ErrorState } from "@/components/LoadingState";
import { SygenAPI, type ActivityRecentEvent, type DashboardSummary } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useServer } from "@/context/ServerContext";
import { checkServerHealth } from "@/lib/servers";
import { useTranslation } from "@/lib/i18n";

const HISTORY_MAX = 30; // 30 data points (~5 min at 10s interval)
const REFRESH_INTERVAL = 10_000; // 10 seconds

interface MetricHistory {
  cpu: number[];
  ram: number[];
  disk: number[];
}

function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const w = 120;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${w},${height} L0,${height} Z`;

  return (
    <svg width={w} height={height} className="shrink-0">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function iconForEventType(type: string, className: string) {
  const props = { size: 14, className: `shrink-0 mt-0.5 ${className}` };
  if (type.startsWith("task")) return <ListTodo {...props} />;
  if (type.startsWith("cron")) return <Clock {...props} />;
  if (type.startsWith("agent")) return <Bot {...props} />;
  if (type.startsWith("webhook")) return <WebhookIcon {...props} />;
  if (type === "auth_login" || type === "login") return <LogIn {...props} />;
  return <Terminal {...props} />;
}

function severityColorClass(severity: ActivityRecentEvent["severity"]): string {
  if (severity === "error") return "text-danger";
  if (severity === "warning") return "text-warning";
  if (severity === "success") return "text-success";
  return "text-brand-400";
}

export default function DashboardPage() {
  const { servers, activeServer, switchServer, refreshKey } = useServer();
  const { t } = useTranslation();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [serverStatuses, setServerStatuses] = useState<Record<string, { online: boolean }>>({});
  const [metricHistory, setMetricHistory] = useState<MetricHistory>({ cpu: [], ram: [], disk: [] });
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    setError("");
    try {
      const data = await SygenAPI.getDashboardSummary();
      setSummary(data);
      setMetricHistory((prev) => ({
        cpu: [...prev.cpu, data.system.cpu_percent].slice(-HISTORY_MAX),
        ram: [...prev.ram, data.system.ram_percent].slice(-HISTORY_MAX),
        disk: [...prev.disk, data.system.disk_percent].slice(-HISTORY_MAX),
      }));
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData, refreshKey]);

  // Auto-refresh
  useEffect(() => {
    refreshRef.current = setInterval(() => loadData(true), REFRESH_INTERVAL);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [loadData]);

  // Reset history on server switch
  useEffect(() => {
    setMetricHistory({ cpu: [], ram: [], disk: [] });
  }, [activeServer.id]);

  // Check all server statuses
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

  if (loading) return <LoadingSpinner />;
  if (error || !summary) return <ErrorState message={error || "No data"} onRetry={loadData} />;

  const { system, counters, recent_activity } = summary;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <RefreshButton
          loading={refreshing}
          onClick={() => loadData()}
          title={t('dashboard.refresh')}
        />
      </div>

      {/* Connected Servers */}
      {servers.length > 1 && (
        <div className="bg-bg-card border border-border rounded-xl p-4 mb-4 md:mb-6">
          <h2 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
            <Server size={14} />
            {t('dashboard.connectedServers')}
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
                  <Circle size={6} className={cn("shrink-0", status?.online ? "fill-success text-success" : status ? "fill-danger text-danger" : "fill-text-secondary text-text-secondary")} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Status Cards — driven by counters from /api/dashboard/summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 md:mb-8">
        <StatusCard title={t('nav.agents')} value={`${counters.agents_online}/${counters.agents_total}`} icon={Bot} trend={`${counters.agents_online} ${t('dashboard.online')}`} />
        <StatusCard title={t('dashboard.activeTasks')} value={counters.active_tasks} icon={ListTodo} trend={`${counters.active_tasks} ${t('dashboard.running')}`} />
        <StatusCard title={t('nav.cron')} value={counters.running_crons} icon={Clock} trend={`${counters.running_crons} ${t('dashboard.active')}`} />
        <StatusCard title={t('dashboard.failedLast24h')} value={counters.failed_last_24h} icon={AlertTriangle} trend="" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Recent Activity — backend-localized title/subtitle/severity */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity size={18} className="text-brand-400" />
            {t('dashboard.recentActivity')}
          </h2>
          <div className="space-y-3">
            {recent_activity.length === 0 && (
              <p className="text-sm text-text-secondary py-4 text-center">{t('dashboard.noRecentActivity')}</p>
            )}
            {recent_activity.slice(0, 8).map((event) => (
              <div key={event.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                {iconForEventType(event.type, severityColorClass(event.severity))}
                <div className="min-w-0">
                  <p className="text-sm text-text-primary truncate">{event.title}</p>
                  <p className="text-xs text-text-secondary">{event.subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System Health */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Cpu size={18} className="text-brand-400" />
            {t('dashboard.systemHealth')}
          </h2>
          <div className="space-y-5">
            <HealthBar label="CPU" value={system.cpu_percent} icon={Cpu} history={metricHistory.cpu} color="#00c853" />
            <HealthBar label="RAM" value={system.ram_percent} icon={MemoryStick} history={metricHistory.ram} color="#ffa726" />
            <HealthBar label="Disk" value={system.disk_percent} icon={HardDrive} history={metricHistory.disk} color="#42a5f5" />
            <div className="pt-3 border-t border-border/50">
              <p className="text-xs text-text-secondary">{t('dashboard.uptime')}</p>
              <p className="text-sm font-medium">{system.uptime_human}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthBar({ label, value, icon: Icon, history, color }: { label: string; value: number; icon: typeof Cpu; history: number[]; color: string }) {
  const barColor = value > 80 ? "bg-danger" : value > 60 ? "bg-warning" : "bg-success";
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-text-secondary flex items-center gap-1.5">
          <Icon size={14} />
          {label}
        </span>
        <div className="flex items-center gap-3">
          <Sparkline data={history} color={color} height={20} />
          <span className="text-sm font-medium w-10 text-right">{value}%</span>
        </div>
      </div>
      <div className="w-full h-2 bg-bg-primary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
