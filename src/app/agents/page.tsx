"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Bot, Clock, Users, MessageSquare, Cpu, FileText, RefreshCw } from "lucide-react";
import AgentCard from "@/components/AgentCard";
import StatusBadge from "@/components/StatusBadge";
import { LoadingSpinner, ErrorState, CardSkeleton } from "@/components/LoadingState";
import { useToast } from "@/components/Toast";
import { SygenAPI } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import type { Agent } from "@/lib/mock-data";

type DetailTab = "info" | "logs";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("info");
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
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

  const handleSelectAgent = (agent: Agent) => {
    setSelected(agent);
    setDetailTab("info");
    setLogs([]);
  };

  const handleShowLogs = (agent: Agent) => {
    setDetailTab("logs");
    loadLogs(agent.name);
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
              <div key={agent.id} onClick={() => handleSelectAgent(agent)} className="cursor-pointer">
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
              <div className="w-10 h-10 rounded-lg bg-accent/30 flex items-center justify-center">
                <Bot size={20} className="text-blue-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">{selected.displayName}</p>
                <p className="text-[10px] text-text-secondary font-mono">{selected.name}</p>
              </div>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="p-1 hover:bg-bg-primary rounded-lg" aria-label="Close details">
              <X size={16} className="text-text-secondary" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border mx-5">
            <button
              type="button"
              onClick={() => setDetailTab("info")}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                detailTab === "info" ? "border-blue-400 text-blue-400" : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {t('agents.info')}
            </button>
            <button
              type="button"
              onClick={() => handleShowLogs(selected)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 flex items-center gap-1 ${
                detailTab === "logs" ? "border-blue-400 text-blue-400" : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              <FileText size={12} />
              {t('agents.logs')}
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
                  <a href="/chat" className="block w-full py-2 text-center text-xs font-medium rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors">
                    {t('agents.openChat')}
                  </a>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-text-secondary">{t('agents.lastLines')}</p>
                  <button type="button" onClick={() => loadLogs(selected.name)} className="p-1 hover:bg-bg-primary rounded text-text-secondary">
                    <RefreshCw size={12} className={logsLoading ? "animate-spin" : ""} />
                  </button>
                </div>
                <div className="bg-bg-primary rounded-lg p-3 text-[11px] font-mono text-text-secondary overflow-y-auto max-h-[50vh] whitespace-pre-wrap leading-relaxed">
                  {logsLoading ? t('common.loading') : logs.length > 0 ? logs.join("\n") : t('agents.noLogs')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
