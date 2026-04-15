"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, X, Play, Pause, RotateCcw, Trash2, Edit2, Save, Clock, ChevronDown } from "lucide-react";
import DataTable, { type Column } from "@/components/DataTable";
import TableSearch from "@/components/TableSearch";
import StatusBadge from "@/components/StatusBadge";
import { LoadingSpinner, ErrorState } from "@/components/LoadingState";
import { useToast } from "@/components/Toast";
import { SygenAPI } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { isValidCron, describeCron, CRON_PRESETS } from "@/lib/cron";
import { useTranslation } from "@/lib/i18n";
import type { CronJob } from "@/lib/mock-data";

type Filter = "all" | "active" | "paused" | "error";

interface CronFormData {
  id: string;
  name: string;
  schedule: string;
  agent: string;
  description: string;
  enabled: boolean;
}

const EMPTY_FORM: CronFormData = { id: "", name: "", schedule: "", agent: "main", description: "", enabled: true };

function CronFormDialog({
  initial,
  isEdit,
  onSave,
  onCancel,
}: {
  initial: CronFormData;
  isEdit: boolean;
  onSave: (data: CronFormData) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CronFormData>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPresets, setShowPresets] = useState(false);

  const cronHint = form.schedule.trim() ? describeCron(form.schedule) : "";
  const cronValid = !form.schedule.trim() || isValidCron(form.schedule);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError(t('cron.nameRequired'));
      return;
    }
    if (!form.schedule.trim()) {
      setError(t('cron.scheduleRequired'));
      return;
    }
    if (!isValidCron(form.schedule)) {
      setError(t('cron.invalidCron'));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-md mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold">{isEdit ? t('cron.editJob') : t('cron.newCronJob')}</h3>
          <button type="button" onClick={onCancel} className="p-1 hover:bg-bg-primary rounded-lg">
            <X size={16} className="text-text-secondary" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</div>}

          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('common.name')} *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              placeholder="Daily cleanup"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">{t('common.id')}</label>
              <input
                type="text"
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent font-mono"
                placeholder="daily-cleanup (auto-generated if empty)"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-text-secondary">{t('cron.schedule')} (cron) *</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowPresets(!showPresets)}
                  className="flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 transition-colors"
                >
                  <Clock size={10} />
                  {t('cron.presets')}
                  <ChevronDown size={10} />
                </button>
                {showPresets && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-bg-card border border-border rounded-lg shadow-xl z-10 py-1 max-h-48 overflow-y-auto">
                    {CRON_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => { setForm({ ...form, schedule: p.value }); setShowPresets(false); }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex justify-between"
                      >
                        <span>{p.label}</span>
                        <code className="text-text-secondary text-[10px]">{p.value}</code>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <input
              type="text"
              value={form.schedule}
              onChange={(e) => setForm({ ...form, schedule: e.target.value })}
              className={`w-full bg-bg-primary border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none ${
                !cronValid ? "border-danger focus:border-danger" : "border-border focus:border-accent"
              }`}
              placeholder="0 3 * * *"
            />
            {cronHint && cronValid && (
              <p className="text-[10px] text-green-400 mt-1 flex items-center gap-1">
                <Clock size={10} />
                {cronHint}
              </p>
            )}
            {!cronValid && (
              <p className="text-[10px] text-danger mt-1">{t('cron.invalidFormat')}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('common.agent')}</label>
            <input
              type="text"
              value={form.agent}
              onChange={(e) => setForm({ ...form, agent: e.target.value })}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              placeholder="main"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('common.description')}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
              placeholder="What this job does..."
            />
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-secondary">{t('cron.startEnabled')}</label>
            <button
              type="button"
              onClick={() => setForm({ ...form, enabled: !form.enabled })}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                form.enabled ? "bg-green-500" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  form.enabled ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-text-primary text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? t('common.saving') : isEdit ? t('common.update') : t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<CronJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState<false | "create" | "edit">(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { success, error: toastError } = useToast();
  const { t } = useTranslation();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setJobs(await SygenAPI.getCronJobs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cron jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = async (job: CronJob) => {
    try {
      const newStatus = job.status === "active" ? "paused" : "active";
      const updated = await SygenAPI.updateCronJob(job.id, { status: newStatus } as Partial<CronJob>);
      setJobs((prev) => prev.map((j) => (j.id === job.id ? updated : j)));
      if (selected?.id === job.id) setSelected(updated);
      success(`Job "${job.name}" ${newStatus === "active" ? "resumed" : "paused"}`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to update job");
    }
  };

  const handleRunNow = async (job: CronJob) => {
    try {
      await SygenAPI.runCronJob(job.id);
      success(`Job "${job.name}" triggered`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to trigger job");
    }
  };

  const handleDelete = async (job: CronJob) => {
    if (!confirm(`${t('common.delete')} "${job.name}"?`)) return;
    try {
      await SygenAPI.deleteCronJob(job.id);
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      if (selected?.id === job.id) setSelected(null);
      success(`Job "${job.name}" deleted`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete job");
    }
  };

  const handleCreate = async (data: CronFormData) => {
    const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const created = await SygenAPI.createCronJob({
      id,
      name: data.name,
      schedule: data.schedule,
      agent: data.agent || "main",
      description: data.description,
      status: data.enabled ? "active" : "paused",
    } as Partial<CronJob>);
    setJobs((prev) => [...prev, created]);
    setShowForm(false);
    success(`Job "${data.name}" created`);
  };

  const handleEdit = async (data: CronFormData) => {
    if (!selected) return;
    const updated = await SygenAPI.updateCronJob(selected.id, {
      name: data.name,
      schedule: data.schedule,
      agent: data.agent,
      description: data.description,
    } as Partial<CronJob>);
    setJobs((prev) => prev.map((j) => (j.id === selected.id ? updated : j)));
    setSelected(updated);
    setShowForm(false);
    success(`Job "${data.name}" updated`);
  };

  const filtered = (filter === "all" ? jobs : jobs.filter((j) => j.status === filter)).filter((j) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return j.name.toLowerCase().includes(q) || j.agent.toLowerCase().includes(q) || j.schedule.toLowerCase().includes(q);
  });

  const columns: Column<CronJob>[] = [
    { key: "name", label: t('common.name'), sortable: true, render: (j) => (
      <div>
        <span className="font-medium">{j.name}</span>
        {j.schedule && (
          <p className="text-[10px] text-text-secondary mt-0.5">{describeCron(j.schedule)}</p>
        )}
      </div>
    )},
    { key: "schedule", label: t('cron.schedule'), render: (j) => <code className="text-xs bg-bg-primary px-2 py-0.5 rounded">{j.schedule}</code> },
    { key: "agent", label: t('common.agent'), sortable: true, render: (j) => <span className="text-brand-400">{j.agent}</span> },
    { key: "status", label: t('common.status'), render: (j) => <StatusBadge status={j.status} /> },
    { key: "lastRun", label: t('cron.lastRun'), sortable: true, render: (j) => <span className="text-text-secondary">{formatDateTime(j.lastRun)}</span> },
    {
      key: "actions",
      label: "",
      className: "w-32",
      render: (j) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {j.status === "active" ? (
            <button type="button" onClick={() => handleToggle(j)} className="p-1.5 hover:bg-bg-primary rounded-lg transition-colors text-yellow-400" title={t('cron.pause')} aria-label="Pause job">
              <Pause size={14} />
            </button>
          ) : (
            <button type="button" onClick={() => handleToggle(j)} className="p-1.5 hover:bg-bg-primary rounded-lg transition-colors text-green-400" title={t('cron.resume')} aria-label="Resume job">
              <Play size={14} />
            </button>
          )}
          <button type="button" onClick={() => handleRunNow(j)} className="p-1.5 hover:bg-bg-primary rounded-lg transition-colors text-text-secondary" title={t('cron.runNow')} aria-label="Run job now">
            <RotateCcw size={14} />
          </button>
          <button type="button" onClick={() => handleDelete(j)} className="p-1.5 hover:bg-bg-primary rounded-lg transition-colors text-danger" title={t('common.delete')} aria-label="Delete job">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  const filters: { label: string; value: Filter }[] = [
    { label: t('common.all'), value: "all" },
    { label: t('common.active'), value: "active" },
    { label: t('status.paused'), value: "paused" },
    { label: t('common.error'), value: "error" },
  ];

  if (loading) return <LoadingSpinner />;
  if (error && jobs.length === 0) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{t('cron.title')}</h1>
          <button
            type="button"
            onClick={() => setShowForm("create")}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-text-primary text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            {t('cron.newJob')}
          </button>
        </div>

        {error && (
          <div className="mb-4 text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</div>
        )}

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            {filters.map((f) => (
              <button
                type="button"
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filter === f.value
                    ? "bg-accent text-text-primary"
                    : "bg-bg-card text-text-secondary hover:text-text-primary"
                }`}
              >
                {f.label}
                {f.value !== "all" && (
                  <span className="ml-1.5 opacity-60">
                    {jobs.filter((j) => j.status === f.value).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="ml-auto w-64">
            <TableSearch
              placeholder={`${t("common.search")} (${t("common.name")}, ${t("common.agent")}, ${t("cron.schedule")})`}
              onSearch={setSearchQuery}
            />
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <DataTable data={filtered} columns={columns} keyField="id" onRowClick={(item) => setSelected(item)} />
        </div>
      </div>

      {/* Detail Panel */}
      {selected && (
        <div className="w-80 bg-bg-card border border-border rounded-xl p-5 shrink-0 hidden xl:block h-fit sticky top-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">{t('cron.jobDetails')}</h3>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setShowForm("edit")} className="p-1.5 hover:bg-bg-primary rounded-lg transition-colors text-text-secondary" title="Edit">
                <Edit2 size={14} />
              </button>
              <button type="button" onClick={() => setSelected(null)} className="p-1 hover:bg-bg-primary rounded-lg" aria-label="Close details">
                <X size={16} className="text-text-secondary" />
              </button>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('common.name')}</p>
              <p className="text-sm font-medium">{selected.name}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('common.id')}</p>
              <p className="text-sm font-mono text-text-secondary">{selected.id}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('common.status')}</p>
              <StatusBadge status={selected.status} />
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('cron.schedule')}</p>
              <code className="text-sm bg-bg-primary px-2 py-0.5 rounded">{selected.schedule}</code>
              {selected.schedule && (
                <p className="text-[10px] text-green-400 mt-1">{describeCron(selected.schedule)}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('common.agent')}</p>
              <p className="text-sm text-brand-400">{selected.agent}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('common.description')}</p>
              <p className="text-sm text-text-secondary">{selected.description || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('cron.lastRun')}</p>
              <p className="text-sm">{formatDateTime(selected.lastRun)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('cron.nextRun')}</p>
              <p className="text-sm">{formatDateTime(selected.nextRun)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('cron.executions')}</p>
              <p className="text-sm">{selected.executionCount}</p>
            </div>
            <div className="pt-2 border-t border-border flex items-center gap-2">
              <button type="button" onClick={() => handleToggle(selected)} className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${selected.status === "active" ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30" : "bg-green-500/20 text-green-400 hover:bg-green-500/30"}`}>
                {selected.status === "active" ? t('cron.pause') : t('cron.resume')}
              </button>
              <button type="button" onClick={() => handleRunNow(selected)} className="flex-1 py-2 text-xs font-medium rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 transition-colors">
                {t('cron.runNow')}
              </button>
              <button type="button" onClick={() => handleDelete(selected)} className="py-2 px-3 text-xs font-medium rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm === "create" && (
        <CronFormDialog initial={EMPTY_FORM} isEdit={false} onSave={handleCreate} onCancel={() => setShowForm(false)} />
      )}
      {showForm === "edit" && selected && (
        <CronFormDialog
          initial={{ id: selected.id, name: selected.name, schedule: selected.schedule, agent: selected.agent, description: selected.description, enabled: selected.status === "active" }}
          isEdit={true}
          onSave={handleEdit}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
