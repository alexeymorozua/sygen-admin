"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { X, Bot, Clock, Users, MessageSquare, Cpu, FileText, RefreshCw, Radio, Pause, Play, Activity, AlertTriangle, CheckCircle, Timer, Camera, Trash2 } from "lucide-react";
import AgentCard from "@/components/AgentCard";
import StatusBadge from "@/components/StatusBadge";
import { LoadingSpinner, ErrorState, CardSkeleton } from "@/components/LoadingState";
import { useToast } from "@/components/Toast";
import { SygenAPI } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { useUrlSelection } from "@/hooks/useUrlSelection";
import type { Agent } from "@/lib/mock-data";

type DetailTab = "info" | "logs" | "metrics";
type MetricsPeriod = "24h" | "7d";

interface AgentMetrics {
  total_executions: number;
  avg_duration_seconds: number;
  error_count: number;
  success_rate: number;
  last_active: string | null;
  tokens_used: number | null;
  period: string;
}

interface MetricsHistoryPoint {
  timestamp: string;
  executions: number;
  errors: number;
  avg_duration: number;
}

function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const w = 100;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${w},${height} L0,${height} Z`;
  const gradId = `agent-grad-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg width={w} height={height} className="shrink-0">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  sparkData,
  sparkColor,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  sparkData?: number[];
  sparkColor?: string;
}) {
  return (
    <div className="bg-bg-primary rounded-lg p-3 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-text-secondary">
        <Icon size={12} />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-lg font-semibold">{value}</span>
        {sparkData && sparkColor && <Sparkline data={sparkData} color={sparkColor} height={24} />}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const { selected, selectedId, select, clear: clearSelection } = useUrlSelection<Agent>(
    "name",
    agents,
    (a) => a.name,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("info");
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<MetricsHistoryPoint[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsPeriod, setMetricsPeriod] = useState<MetricsPeriod>("24h");
  const metricsRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [livePaused, setLivePaused] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTimestampRef = useRef<number>(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarKey, setAvatarKey] = useState(0);
  const [avatarError, setAvatarError] = useState<Record<string, boolean>>({});
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const { success, error: toastError } = useToast();
  const { t } = useTranslation();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAgents(await SygenAPI.getAgents());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadLogs = useCallback(async (agentName: string) => {
    setLogsLoading(true);
    try {
      const data = await SygenAPI.getLogs(200, agentName);
      setLogs(data.lines);
    } catch {
      setLogs(["Failed to load logs"]);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const stopLiveTail = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setLiveMode(false);
    setLivePaused(false);
    lastTimestampRef.current = 0;
  }, []);

  const startLiveTail = useCallback((agentName: string) => {
    stopLiveTail();
    setLiveMode(true);
    setLivePaused(false);
    lastTimestampRef.current = 0;

    SygenAPI.getLogsPoll(agentName, 0, 200).then((data) => {
      setLogs(data.lines);
      lastTimestampRef.current = data.timestamp;
      setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }).catch(() => {});

    pollTimerRef.current = setInterval(async () => {
      try {
        const data = await SygenAPI.getLogsPoll(agentName, lastTimestampRef.current, 200);
        if (data.lines.length > 0) {
          lastTimestampRef.current = data.timestamp;
          setLogs(data.lines);
          setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      } catch {
        // Silently skip poll errors
      }
    }, 2000);
  }, [stopLiveTail]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const loadMetrics = useCallback(async (agentName: string, period: MetricsPeriod) => {
    setMetricsLoading(true);
    try {
      const [m, h] = await Promise.all([
        SygenAPI.getAgentMetrics(agentName, period),
        SygenAPI.getAgentMetricsHistory(agentName, period),
      ]);
      setMetrics(m);
      setMetricsHistory(h);
    } catch {
      setMetrics(null);
      setMetricsHistory([]);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  // Reset per-agent view state whenever selection changes (via click, swipe-back, or shared link).
  useEffect(() => {
    stopLiveTail();
    setDetailTab("info");
    setLogs([]);
    setMetrics(null);
    setMetricsHistory([]);
  }, [selectedId, stopLiveTail]);

  const handleShowLogs = (agent: Agent) => {
    setDetailTab("logs");
    loadLogs(agent.name);
  };

  const toggleLive = (agent: Agent) => {
    if (liveMode) {
      stopLiveTail();
    } else {
      startLiveTail(agent.name);
    }
  };

  const togglePause = () => {
    if (!liveMode || !selected) return;
    if (livePaused) {
      setLivePaused(false);
      pollTimerRef.current = setInterval(async () => {
        try {
          const data = await SygenAPI.getLogsPoll(selected.name, lastTimestampRef.current, 200);
          if (data.lines.length > 0) {
            lastTimestampRef.current = data.timestamp;
            setLogs(data.lines);
            setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
          }
        } catch {}
      }, 2000);
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setLivePaused(true);
    }
  };

  const handleShowMetrics = (agent: Agent) => {
    stopLiveTail();
    setDetailTab("metrics");
    loadMetrics(agent.name, metricsPeriod);
  };

  const refreshAgentList = useCallback(async (agentName: string, hasAvatar: boolean) => {
    setAgents((prev) =>
      prev.map((a) => (a.name === agentName ? { ...a, hasAvatar } : a))
    );
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    e.target.value = "";
    setUploadingAvatar(true);
    try {
      await SygenAPI.uploadAgentAvatar(selected.name, file);
      setAvatarError((prev) => ({ ...prev, [selected.name]: false }));
      setAvatarKey((k) => k + 1);
      refreshAgentList(selected.name, true);
      success(t("agents.avatarUploaded") || "Avatar uploaded");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarDelete = async () => {
    if (!selected) return;
    try {
      await SygenAPI.deleteAgentAvatar(selected.name);
      setAvatarError((prev) => ({ ...prev, [selected.name]: true }));
      setAvatarKey((k) => k + 1);
      refreshAgentList(selected.name, false);
      success(t("agents.avatarDeleted") || "Avatar deleted");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  // Auto-refresh metrics every 30s
  useEffect(() => {
    if (metricsRefreshRef.current) {
      clearInterval(metricsRefreshRef.current);
      metricsRefreshRef.current = null;
    }

    if (detailTab === "metrics" && selected) {
      const agentName = selected.name;
      const period = metricsPeriod;
      metricsRefreshRef.current = setInterval(() => {
        loadMetrics(agentName, period);
      }, 30_000);
    }

    return () => {
      if (metricsRefreshRef.current) {
        clearInterval(metricsRefreshRef.current);
        metricsRefreshRef.current = null;
      }
    };
  }, [detailTab, selected, metricsPeriod, loadMetrics]);

  // Reload metrics when period changes
  useEffect(() => {
    if (detailTab === "metrics" && selected) {
      loadMetrics(selected.name, metricsPeriod);
    }
  }, [metricsPeriod, detailTab, selected, loadMetrics]);

  const formatDuration = (seconds: number): string => {
    if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  };

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{t('agents.title')}</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">
              {agents.filter((a) => a.status === "online").length}/{agents.length} {t('agents.online')}
            </span>
            <button type="button" onClick={loadData} className="p-2 hover:bg-bg-card rounded-lg transition-colors text-text-secondary">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {error && <ErrorState message={error} onRetry={loadData} />}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div key={agent.id} onClick={() => select(agent)} className="cursor-pointer">
                <AgentCard agent={agent} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selected && (
        <div className="w-96 bg-bg-card border border-border rounded-xl shrink-0 hidden xl:flex flex-col h-fit sticky top-8 max-h-[calc(100vh-6rem)]">
          {/* Header */}
          <div className="flex items-center justify-between p-5 pb-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg bg-accent/30 flex items-center justify-center relative group/avatar cursor-pointer overflow-hidden"
                onClick={() => avatarInputRef.current?.click()}
                title={t("agents.changeAvatar") || "Change avatar"}
              >
                {(selected.hasAvatar || avatarKey > 0) && !avatarError[selected.name] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={avatarKey}
                    src={SygenAPI.getAgentAvatarUrl(selected.name) + `?v=${avatarKey}`}
                    alt={selected.displayName}
                    className="w-10 h-10 rounded-lg object-cover"
                    onError={() => setAvatarError((prev) => ({ ...prev, [selected.name]: true }))}
                  />
                ) : (
                  <Bot size={20} className="text-brand-400" />
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                  <Camera size={14} className="text-white" />
                </div>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <div>
                <p className="font-semibold text-sm">{selected.displayName}</p>
                <p className="text-[10px] text-text-secondary font-mono">{selected.name}</p>
              </div>
            </div>
            <button type="button" onClick={() => clearSelection()} className="p-1 hover:bg-bg-primary rounded-lg" aria-label="Close details">
              <X size={16} className="text-text-secondary" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border mx-5">
            <button
              type="button"
              onClick={() => { setDetailTab("info"); stopLiveTail(); }}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                detailTab === "info" ? "border-brand-400 text-brand-400" : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {t('agents.info')}
            </button>
            <button
              type="button"
              onClick={() => handleShowLogs(selected)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 flex items-center gap-1 ${
                detailTab === "logs" ? "border-brand-400 text-brand-400" : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              <FileText size={12} />
              {t('agents.logs')}
            </button>
            <button
              type="button"
              onClick={() => handleShowMetrics(selected)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 flex items-center gap-1 ${
                detailTab === "metrics" ? "border-brand-400 text-brand-400" : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              <Activity size={12} />
              {t('agents.metrics')}
            </button>
          </div>

          {/* Tab content */}
          <div className="p-5 overflow-y-auto flex-1">
            {detailTab === "info" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-text-secondary mb-1">{t('common.status')}</p>
                  <StatusBadge status={selected.status} />
                </div>
                <div>
                  <p className="text-xs text-text-secondary mb-1 flex items-center gap-1"><Cpu size={10} /> {t('agents.model')}</p>
                  <p className="text-sm font-mono">{selected.model}</p>
                </div>
                <div>
                  <p className="text-xs text-text-secondary mb-1">{t('agents.provider')}</p>
                  <p className="text-sm capitalize">{selected.provider}</p>
                </div>
                <div>
                  <p className="text-xs text-text-secondary mb-1 flex items-center gap-1"><MessageSquare size={10} /> {t('agents.activeSessions')}</p>
                  <p className="text-sm">{selected.sessions}</p>
                </div>
                <div>
                  <p className="text-xs text-text-secondary mb-1 flex items-center gap-1"><Clock size={10} /> {t('agents.lastActive')}</p>
                  <p className="text-sm">{formatDate(selected.lastActive) || "—"}</p>
                </div>
                {selected.description && (
                  <div>
                    <p className="text-xs text-text-secondary mb-1">{t('common.description')}</p>
                    <p className="text-sm text-text-secondary">{selected.description}</p>
                  </div>
                )}
                {selected.allowedUsers && selected.allowedUsers.length > 0 && (
                  <div>
                    <p className="text-xs text-text-secondary mb-1 flex items-center gap-1"><Users size={10} /> {t('agents.allowedUsers')}</p>
                    <div className="flex flex-wrap gap-1">
                      {selected.allowedUsers.map((u) => (
                        <span key={u} className="text-xs bg-bg-primary px-2 py-0.5 rounded">{u}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-text-secondary mb-2 flex items-center gap-1"><Camera size={10} /> {t("agents.avatar") || "Avatar"}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="flex-1 py-1.5 text-center text-xs font-medium rounded-lg bg-bg-primary hover:bg-white/5 transition-colors disabled:opacity-40"
                    >
                      {uploadingAvatar ? t("common.loading") || "..." : t("agents.uploadAvatar") || "Upload"}
                    </button>
                    {(selected.hasAvatar || avatarKey > 0) && !avatarError[selected.name] && (
                      <button
                        type="button"
                        onClick={handleAvatarDelete}
                        className="p-1.5 rounded-lg bg-bg-primary hover:bg-danger/20 text-text-secondary hover:text-danger transition-colors"
                        title={t("agents.deleteAvatar") || "Delete avatar"}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="pt-2 border-t border-border">
                  <a href={`/chat?agent=${selected.name}`} className="block w-full py-2 text-center text-xs font-medium rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 transition-colors">
                    {t('agents.openChat')}
                  </a>
                </div>
              </div>
            ) : detailTab === "logs" ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-text-secondary">
                      {logs.length} {t('logs.lines')}
                    </p>
                    {liveMode && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-green-400">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                        </span>
                        {t('logs.live')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleLive(selected)}
                      className={`p-1 rounded text-xs flex items-center gap-1 ${
                        liveMode
                          ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                          : "hover:bg-bg-primary text-text-secondary"
                      }`}
                      title={liveMode ? "Stop live" : "Start live"}
                    >
                      <Radio size={12} />
                    </button>
                    {liveMode && (
                      <button
                        type="button"
                        onClick={togglePause}
                        className="p-1 hover:bg-bg-primary rounded text-text-secondary"
                        title={livePaused ? t('logs.resume') : t('logs.pause')}
                      >
                        {livePaused ? <Play size={12} /> : <Pause size={12} />}
                      </button>
                    )}
                    {!liveMode && (
                      <button type="button" onClick={() => loadLogs(selected.name)} className="p-1 hover:bg-bg-primary rounded text-text-secondary">
                        <RefreshCw size={12} className={logsLoading ? "animate-spin" : ""} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="bg-bg-primary rounded-lg p-3 text-[11px] font-mono text-text-secondary overflow-y-auto max-h-[50vh] whitespace-pre-wrap leading-relaxed">
                  {logsLoading && !liveMode ? t('common.loading') : logs.length > 0 ? logs.join("\n") : t('agents.noLogs')}
                  <div ref={logsEndRef} />
                </div>
              </div>
            ) : (
              /* Metrics Tab */
              <div>
                {/* Period selector + refresh */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1 bg-bg-primary rounded-lg p-0.5">
                    {(["24h", "7d"] as MetricsPeriod[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setMetricsPeriod(p)}
                        className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
                          metricsPeriod === p
                            ? "bg-brand-500/20 text-brand-400"
                            : "text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {t(p === "24h" ? "agents.period24h" : "agents.period7d")}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => loadMetrics(selected.name, metricsPeriod)}
                    className="p-1 hover:bg-bg-primary rounded text-text-secondary"
                  >
                    <RefreshCw size={12} className={metricsLoading ? "animate-spin" : ""} />
                  </button>
                </div>

                {metricsLoading && !metrics ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <MetricCard
                      label={t("agents.executions")}
                      value={String(metrics?.total_executions ?? 0)}
                      icon={Activity}
                      sparkData={metricsHistory.map((h) => h.executions)}
                      sparkColor="var(--color-brand-400)"
                    />
                    <MetricCard
                      label={t("agents.avgDuration")}
                      value={formatDuration(metrics?.avg_duration_seconds ?? 0)}
                      icon={Timer}
                      sparkData={metricsHistory.map((h) => h.avg_duration)}
                      sparkColor="var(--color-warning)"
                    />
                    <MetricCard
                      label={t("agents.successRate")}
                      value={`${metrics?.success_rate ?? 100}%`}
                      icon={CheckCircle}
                      sparkData={metricsHistory.map((h) =>
                        h.executions > 0
                          ? Math.round(((h.executions - h.errors) / h.executions) * 100)
                          : 100
                      )}
                      sparkColor="var(--color-success)"
                    />
                    <MetricCard
                      label={t("agents.errors")}
                      value={String(metrics?.error_count ?? 0)}
                      icon={AlertTriangle}
                      sparkData={metricsHistory.map((h) => h.errors)}
                      sparkColor="var(--color-danger)"
                    />
                  </div>
                )}

                {metrics?.last_active && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-text-secondary flex items-center gap-1">
                      <Clock size={10} />
                      {t("agents.lastActive")}: {formatDate(metrics.last_active) || metrics.last_active}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
