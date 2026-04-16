"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { X, Square, FileText, ChevronDown, ChevronUp, Plus, Save } from "lucide-react";
import { RefreshButton } from "@/components/RefreshButton";
import { useTranslation } from "@/lib/i18n";
import DataTable, { type Column } from "@/components/DataTable";
import TableSearch from "@/components/TableSearch";
import StatusBadge from "@/components/StatusBadge";
import { Select } from "@/components/Select";
import { LoadingSpinner, ErrorState } from "@/components/LoadingState";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { SygenAPI } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { useUrlSelection } from "@/hooks/useUrlSelection";
import type { Task, Agent } from "@/lib/mock-data";

type Filter = "all" | "running" | "completed" | "failed" | "cancelled";

function TaskFormDialog({
  agents,
  onSave,
  onCancel,
}: {
  agents: Agent[];
  onSave: (data: { name: string; agent: string; prompt: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [agent, setAgent] = useState("main");
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), agent, prompt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-md mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold">New Task</h3>
          <button type="button" onClick={onCancel} className="p-1 hover:bg-bg-primary rounded-lg">
            <X size={16} className="text-text-secondary" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</div>}

          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              placeholder="Search for flights..."
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Agent</label>
            <Select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="w-full"
            >
              {agents.length > 0
                ? agents.map((a) => (
                    <option key={a.id} value={a.name}>{a.displayName || a.name}</option>
                  ))
                : <option value="main">main</option>
              }
            </Select>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent resize-none"
              placeholder="Describe what the task should do..."
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const { selected, select, clear: clearSelection } = useUrlSelection<Task>(
    "id",
    tasks,
    (t) => t.id,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFullOutput, setShowFullOutput] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const { t } = useTranslation();

  const loadData = useCallback(async () => {
    try {
      const data = await SygenAPI.getTasks();
      setTasks(data);
    } catch (err) {
      if (tasks.length === 0) {
        setError(err instanceof Error ? err.message : "Failed to load tasks");
      }
    } finally {
      setLoading(false);
    }
  }, [tasks.length]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    loadData();
    SygenAPI.getAgents().then(setAgents).catch(() => {});
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh when there are running tasks
  useEffect(() => {
    const hasRunning = tasks.some((t) => t.status === "running");
    if (hasRunning) {
      refreshTimer.current = setInterval(loadData, 5000);
    } else if (refreshTimer.current) {
      clearInterval(refreshTimer.current);
      refreshTimer.current = null;
    }
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [tasks, loadData]);

  const handleCancel = async (task: Task) => {
    if (!(await confirm({ message: `${t('tasks.cancelConfirm')} "${task.name}"?`, variant: "danger" }))) return;
    try {
      await SygenAPI.cancelTask(task.id);
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: "cancelled" as const } : t))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel task");
    }
  };

  const handleCreate = async (data: { name: string; agent: string; prompt: string }) => {
    const created = await SygenAPI.createTask({
      name: data.name,
      agent: data.agent,
      prompt: data.prompt,
    });
    setTasks((prev) => [created, ...prev]);
    setShowForm(false);
    toastSuccess(`Task "${data.name}" created`);
  };

  const filtered = (filter === "all" ? tasks : tasks.filter((t) => t.status === filter)).filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.agent.toLowerCase().includes(q) || t.status.toLowerCase().includes(q);
  });

  const columns: Column<Task>[] = [
    { key: "name", label: t('common.name'), sortable: true, render: (task) => <span className="font-medium">{task.name}</span> },
    { key: "status", label: t('common.status'), render: (task) => <StatusBadge status={task.status} /> },
    { key: "agent", label: t('common.agent'), sortable: true, render: (task) => <span className="text-brand-400">{task.agent}</span> },
    {
      key: "provider",
      label: t('agents.provider'),
      render: (task) => <span className="text-text-secondary capitalize">{task.provider}</span>,
    },
    { key: "duration", label: t('tasks.duration'), render: (task) => <span className="text-text-secondary font-mono text-xs">{task.duration}</span> },
    {
      key: "startedAt",
      label: t('tasks.started'),
      sortable: true,
      render: (task) => <span className="text-text-secondary">{formatDateTime(task.startedAt)}</span>,
    },
    {
      key: "actions",
      label: "",
      className: "w-12",
      render: (task) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {task.status === "running" && (
            <button type="button" onClick={() => handleCancel(task)} className="p-1.5 hover:bg-bg-primary rounded-lg transition-colors text-danger" title={t('tasks.cancel')} aria-label={t('tasks.cancel')}>
              <Square size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const filters: { label: string; value: Filter }[] = [
    { label: t('common.all'), value: "all" },
    { label: t('status.running'), value: "running" },
    { label: t('tasks.completed'), value: "completed" },
    { label: t('tasks.failed'), value: "failed" },
    { label: t('status.cancelled'), value: "cancelled" },
  ];

  if (loading) return <LoadingSpinner />;
  if (error && tasks.length === 0) return <ErrorState message={error} onRetry={loadData} />;

  const runningCount = tasks.filter((t) => t.status === "running").length;

  return (
    <div className="flex gap-4 md:gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{t('tasks.title')}</h1>
            {runningCount > 0 && (
              <span className="text-xs bg-brand-500/20 text-brand-400 px-2 py-1 rounded-full animate-pulse">
                {runningCount} {t('tasks.running')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton
              loading={loading}
              onClick={loadData}
              title={t('dashboard.refresh')}
            />
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} />
              New Task
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</div>
        )}

        {/* Filters + Search */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            {filters.map((f) => (
              <button
                type="button"
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filter === f.value
                    ? "bg-accent text-accent-foreground"
                    : "bg-bg-card text-text-secondary hover:text-text-primary"
                }`}
              >
                {f.label}
                {f.value !== "all" && (
                  <span className="ml-1.5 opacity-60">
                    {tasks.filter((t) => t.status === f.value).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="ml-auto w-64">
            <TableSearch
              placeholder={`${t("common.search")} (${t("common.name")}, ${t("common.agent")})`}
              onSearch={setSearchQuery}
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <DataTable
            data={filtered}
            columns={columns}
            keyField="id"
            onRowClick={(item) => { select(item); setShowFullOutput(false); }}
            emptyMessage={t('common.noData')}
            defaultSort={{ key: "startedAt", dir: "desc" }}
          />
        </div>
      </div>

      {/* Detail Panel */}
      {selected && (
        <div className="w-96 bg-bg-card border border-border rounded-xl p-5 shrink-0 hidden xl:block h-fit sticky top-8 max-h-[calc(100vh-6rem)] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">{t('tasks.details')}</h3>
            <button type="button" onClick={() => clearSelection()} className="p-1 hover:bg-bg-primary rounded-lg" aria-label="Close details">
              <X size={16} className="text-text-secondary" />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('common.name')}</p>
              <p className="text-sm font-medium">{selected.name}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('common.id')}</p>
              <p className="text-sm font-mono text-text-secondary break-all">{selected.id}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('common.status')}</p>
              <StatusBadge status={selected.status} />
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('common.agent')}</p>
              <p className="text-sm text-brand-400">{selected.agent}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('agents.provider')}</p>
              <p className="text-sm capitalize">{selected.provider}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('tasks.duration')}</p>
              <p className="text-sm font-mono">{selected.duration}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('tasks.started')}</p>
              <p className="text-sm">{formatDateTime(selected.startedAt)}</p>
            </div>

            {/* Prompt / Description */}
            {selected.description && (
              <div>
                <p className="text-xs text-text-secondary mb-1 flex items-center gap-1">
                  <FileText size={10} />
                  {t('tasks.prompt')}
                </p>
                <div className="bg-bg-primary rounded-lg p-3 text-xs text-text-secondary max-h-32 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
                  {selected.description}
                </div>
              </div>
            )}

            {/* Result / Output */}
            {selected.result && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowFullOutput(!showFullOutput)}
                  className="flex items-center gap-1 text-xs text-text-secondary mb-1 hover:text-text-primary transition-colors"
                >
                  {showFullOutput ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  {t('tasks.result')}
                </button>
                <div
                  className={`bg-bg-primary rounded-lg p-3 text-xs text-text-secondary overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed ${
                    showFullOutput ? "max-h-96" : "max-h-32"
                  }`}
                >
                  {selected.result}
                </div>
              </div>
            )}

            {/* Cancel action */}
            {selected.status === "running" && (
              <div className="pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => handleCancel(selected)}
                  className="w-full py-2 text-xs font-medium rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  {t('tasks.cancel')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Task Dialog */}
      {showForm && (
        <TaskFormDialog
          agents={agents}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
