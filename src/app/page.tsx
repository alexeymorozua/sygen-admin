"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Bot, ListTodo, Clock, Webhook as WebhookIcon, Activity, Cpu, HardDrive, MemoryStick, Server, Circle, LogIn, Terminal } from "lucide-react";
import StatusCard from "@/components/StatusCard";
import { RefreshButton } from "@/components/RefreshButton";
import StatusBadge from "@/components/StatusBadge";
import { LoadingSpinner, ErrorState } from "@/components/LoadingState";
import { SygenAPI } from "@/lib/api";
import { formatDate, cn } from "@/lib/utils";
import type { Agent, ActivityEvent, SystemHealth } from "@/lib/mock-data";
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

export default function DashboardPage() {
  const { servers, activeServer, switchServer, refreshKey } = useServer();
  const { t } = useTranslation();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [cronCount, setCronCount] = useState({ total: 0, active: 0, paused: 0 });
  const [webhookCount, setWebhookCount] = useState({ total: 0, active: 0 });
  const [taskCount, setTaskCount] = useState({ total: 0, running: 0 });
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
      const [a, e, h, crons, webhooks, tasks] = await Promise.all([
        SygenAPI.getAgents(),
        SygenAPI.getActivity().catch(() => []),
        SygenAPI.getSystemStatus().catch(() => null),
        SygenAPI.getCronJobs().catch(() => []),
        SygenAPI.getWebhooks().catch(() => []),
        SygenAPI.getTasks().catch(() => []),
      ]);
      setAgents(a);
      setEvents(e);
      setHealth(h);
      if (h) {
        setMetricHistory((prev) => ({
          cpu: [...prev.cpu, h.cpu].slice(-HISTORY_MAX),
          ram: [...prev.ram, h.ram].slice(-HISTORY_MAX),
          disk: [...prev.disk, h.disk].slice(-HISTORY_MAX),
        }));
      }
      setCronCount({
        total: crons.length,
        active: crons.filter((cj) => cj.status === "active").length,
        paused: crons.filter((cj) => cj.status === "paused").length,
      });
      setWebhookCount({
        total: webhooks.length,
        active: webhooks.filter((wh) => wh.status === "active").length,
      });
      setTaskCount({
        total: tasks.length,
        running: tasks.filter((tk) => tk.status === "running").length,
      });
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
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  const onlineAgents = agents.filter((a) => a.status === "online").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <RefreshButton
          loading={refreshing}
          onClick={() => loadData()}
          title={t('dashboard.refresh')}
        />
      </div>

      {/* Connected Servers */}
      {servers.length > 1 && (
        <div className="bg-bg-card border border-border rounded-xl p-4 mb-6">
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

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatusCard title={t('nav.agents')} value={`${onlineAgents}/${agents.length}`} icon={Bot} trend={`${onlineAgents} ${t('dashboard.online')}`} />
        <StatusCard title={t('dashboard.activeTasks')} value={taskCount.total} icon={ListTodo} trend={`${taskCount.running} ${t('dashboard.running')}`} />
        <StatusCard title={t('nav.cron')} value={cronCount.total} icon={Clock} trend={`${cronCount.active} ${t('dashboard.active')}, ${cronCount.paused} ${t('dashboard.paused')}`} />
        <StatusCard title={t('nav.webhooks')} value={webhookCount.total} icon={WebhookIcon} trend={`${webhookCount.active} ${t('dashboard.active')}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Status */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Bot size={18} className="text-brand-400" />
            {t('dashboard.agentStatus')}
          </h2>
          <div className="space-y-3">
            {agents.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <p className="text-sm font-medium">{agent.displayName}</p>
                  <p className="text-xs text-text-secondary">{agent.model}</p>
                </div>
                <StatusBadge status={agent.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity size={18} className="text-brand-400" />
            {t('dashboard.recentActivity')}
          </h2>
          <div className="space-y-3">
            {events.length === 0 && (
              <p className="text-sm text-text-secondary py-4 text-center">{t('dashboard.noRecentActivity')}</p>
            )}
            {events.slice(0, 8).map((event, idx) => {
              const iconProps = { size: 14, className: "shrink-0 mt-0.5" };
              const icon =
                event.type === "login" ? <LogIn {...iconProps} className={`${iconProps.className} text-brand-400`} /> :
                event.type === "task" ? <ListTodo {...iconProps} className={`${iconProps.className} text-yellow-400`} /> :
                event.type === "cron" ? <Clock {...iconProps} className={`${iconProps.className} text-green-400`} /> :
                event.type === "agent" ? <Bot {...iconProps} className={`${iconProps.className} text-brand-400`} /> :
                event.type === "webhook" ? <WebhookIcon {...iconProps} className={`${iconProps.className} text-purple-400`} /> :
                <Terminal {...iconProps} className={`${iconProps.className} text-gray-400`} />;

              return (
                <div key={event.id || `activity-${idx}`} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                  {icon}
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary truncate">{event.message}</p>
                    <p className="text-xs text-text-secondary">{formatDate(event.timestamp)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* System Health */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Cpu size={18} className="text-brand-400" />
            {t('dashboard.systemHealth')}
          </h2>
          {health && (
            <div className="space-y-5">
              <HealthBar label="CPU" value={health.cpu} icon={Cpu} history={metricHistory.cpu} color="#00c853" />
              <HealthBar label="RAM" value={health.ram} icon={MemoryStick} history={metricHistory.ram} color="#ffa726" />
              <HealthBar label="Disk" value={health.disk} icon={HardDrive} history={metricHistory.disk} color="#42a5f5" />
              <div className="pt-3 border-t border-border/50">
                <p className="text-xs text-text-secondary">{t('dashboard.uptime')}</p>
                <p className="text-sm font-medium">{health.uptime}</p>
              </div>
            </div>
          )}
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
