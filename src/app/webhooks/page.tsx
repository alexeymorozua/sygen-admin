"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Plus, X, Trash2, Edit2, Save, Play } from "lucide-react";
import DataTable, { type Column } from "@/components/DataTable";
import TableSearch from "@/components/TableSearch";
import StatusBadge from "@/components/StatusBadge";
import { Select } from "@/components/Select";
import DetailDrawer from "@/components/DetailDrawer";
import { LoadingSpinner, ErrorState } from "@/components/LoadingState";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { useTranslation } from "@/lib/i18n";
import { SygenAPI } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { useUrlSelection } from "@/hooks/useUrlSelection";
import type { Webhook, Agent } from "@/lib/mock-data";

type Filter = "all" | "active" | "paused" | "error";

interface WebhookFormData {
  id: string;
  name: string;
  url: string;
  method: string;
  agent: string;
  description: string;
  secret: string;
  clearSecret: boolean;
}

const EMPTY_FORM: WebhookFormData = { id: "", name: "", url: "", method: "POST", agent: "main", description: "", secret: "", clearSecret: false };

function WebhookFormDialog({
  initial,
  isEdit,
  hasExistingSecret,
  agents,
  onSave,
  onCancel,
}: {
  initial: WebhookFormData;
  isEdit: boolean;
  hasExistingSecret: boolean;
  agents: Agent[];
  onSave: (data: WebhookFormData) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<WebhookFormData>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim()) {
      setError(t('webhooks.nameUrlRequired'));
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

  const agentOptions = agents.length > 0
    ? agents
    : [{ id: "main", name: "main", displayName: "Main" } as Agent];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-md mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold">{isEdit ? t('webhooks.editWebhook') : t('webhooks.newWebhookDialog')}</h3>
          <button type="button" onClick={onCancel} className="p-1 hover:bg-bg-primary rounded-lg">
            <X size={16} className="text-text-secondary" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</div>}

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">{t('common.name')} *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              placeholder="GitHub Push Hook"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">{t('common.id')}</label>
              <input
                type="text"
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent font-mono"
                placeholder="github-push (auto-generated if empty)"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">{t('webhooks.urlPath')} *</label>
            <input
              type="text"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent"
              placeholder="/webhooks/github"
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">{t('webhooks.method')}</label>
            <Select
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
              className="w-full"
            >
              <option value="POST">POST</option>
              <option value="GET">GET</option>
              <option value="PUT">PUT</option>
            </Select>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">{t('common.agent')}</label>
            <Select
              value={form.agent}
              onChange={(e) => setForm({ ...form, agent: e.target.value })}
              className="w-full"
            >
              {agentOptions.map((a) => (
                <option key={a.id || a.name} value={a.name}>{a.displayName || a.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">{t('common.description')}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
              placeholder={t('webhooks.placeholderDescription')}
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t('webhooks.secret') || "Secret"} <span className="text-text-secondary/50">({t('common.optional') || "optional"})</span>
            </label>
            <input
              type="password"
              value={form.secret}
              onChange={(e) => setForm({ ...form, secret: e.target.value, clearSecret: false })}
              disabled={form.clearSecret}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent disabled:opacity-50"
              placeholder={isEdit && hasExistingSecret ? "•••••• (unchanged)" : t('webhooks.placeholderSecret')}
              autoComplete="off"
            />
            {isEdit && hasExistingSecret && (
              <label className="flex items-center gap-2 mt-2 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.clearSecret}
                  onChange={(e) => setForm({ ...form, clearSecret: e.target.checked, secret: e.target.checked ? "" : form.secret })}
                  className="rounded border-border"
                />
                {t('webhooks.clearSecret') || "Clear secret"}
              </label>
            )}
            <p className="text-xs text-text-secondary/60 mt-1">
              {t('webhooks.signatureHeader') || "Signature header"}: <code className="text-brand-400">X-Sygen-Signature</code>
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
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

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const { selected, select, clear: clearSelection } = useUrlSelection<Webhook>(
    "id",
    webhooks,
    (w) => w.id,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState<false | "create" | "edit">(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { success, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const { t } = useTranslation();
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const next = await SygenAPI.getWebhooks();
      if (ctrl.signal.aborted) return;
      setWebhooks(next);
      setError("");
    } catch (err) {
      if (ctrl.signal.aborted) return;
      if ((err as { name?: string } | null)?.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load webhooks");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    SygenAPI.getAgents().then(setAgents).catch(() => {});
    return () => abortRef.current?.abort();
  }, [loadData]);

  const handleTest = async (wh: Webhook) => {
    try {
      const result = await SygenAPI.testWebhook(wh.url, wh.method);
      success(`Test sent to "${wh.name}" — Status: ${result.status}`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Test failed");
    }
  };

  const handleDelete = async (wh: Webhook) => {
    if (!(await confirm({ message: `${t('common.delete')} "${wh.name}"?`, variant: "danger" }))) return;
    try {
      await SygenAPI.deleteWebhook(wh.id);
      setWebhooks((prev) => prev.filter((w) => w.id !== wh.id));
      if (selected?.id === wh.id) clearSelection();
      success(`Webhook "${wh.name}" deleted`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete webhook");
    }
  };

  const handleCreate = async (data: WebhookFormData) => {
    const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const payload: Partial<Webhook> & { id: string } = {
      id,
      name: data.name,
      url: data.url,
      method: data.method,
      agent: data.agent || "main",
      description: data.description,
    };
    if (data.secret) payload.secret = data.secret;
    const created = await SygenAPI.createWebhook(payload);
    setWebhooks((prev) => [...prev, created]);
    setShowForm(false);
    success(`Webhook "${data.name}" created`);
  };

  const handleEdit = async (data: WebhookFormData) => {
    if (!selected) return;
    const payload: Partial<Webhook> = {
      name: data.name,
      url: data.url,
      method: data.method,
      agent: data.agent,
      description: data.description,
    };
    if (data.clearSecret) {
      payload.secret = "";
    } else if (data.secret) {
      payload.secret = data.secret;
    }
    const updated = await SygenAPI.updateWebhook(selected.id, payload);
    setWebhooks((prev) => prev.map((w) => (w.id === selected.id ? updated : w)));
    setShowForm(false);
    success(`Webhook "${data.name}" updated`);
  };

  const filtered = (filter === "all" ? webhooks : webhooks.filter((w) => w.status === filter)).filter((w) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return w.name.toLowerCase().includes(q) || w.url.toLowerCase().includes(q) || w.agent.toLowerCase().includes(q);
  });

  const columns: Column<Webhook>[] = [
    { key: "name", label: t('common.name'), sortable: true, render: (w) => <span className="font-medium">{w.name}</span> },
    {
      key: "url",
      label: t('webhooks.endpoint'),
      render: (w) => (
        <div className="flex items-center gap-2">
          <span className="text-xs bg-accent/30 text-brand-400 px-1.5 py-0.5 rounded font-mono">{w.method}</span>
          <code className="text-xs text-text-secondary">{w.url}</code>
        </div>
      ),
    },
    { key: "agent", label: t('common.agent'), sortable: true, render: (w) => <span className="text-brand-400">{w.agent}</span> },
    { key: "status", label: t('common.status'), render: (w) => <StatusBadge status={w.status} /> },
    {
      key: "triggerCount",
      label: t('webhooks.triggers'),
      sortable: true,
      render: (w) => <span className="text-text-secondary">{w.triggerCount.toLocaleString()}</span>,
    },
    {
      key: "lastTriggered",
      label: t('webhooks.lastTriggered'),
      sortable: true,
      render: (w) => <span className="text-text-secondary">{formatDateTime(w.lastTriggered)}</span>,
    },
    {
      key: "actions",
      label: "",
      className: "w-28",
      render: (w) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => handleTest(w)}
            className="p-1.5 hover:bg-bg-primary rounded-lg transition-colors text-green-400"
            title={t('common.test')}
            aria-label={t('common.test')}
          >
            <Play size={14} />
          </button>
          <button
            type="button"
            onClick={() => { select(w); setShowForm("edit"); }}
            className="p-1.5 hover:bg-bg-primary rounded-lg transition-colors text-text-secondary"
            title={t('common.edit')}
            aria-label={t('common.edit')}
          >
            <Edit2 size={14} />
          </button>
          <button type="button" onClick={() => handleDelete(w)} className="p-1.5 hover:bg-bg-primary rounded-lg transition-colors text-danger" title={t('common.delete')} aria-label={t('common.delete')}>
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

  if (loading && webhooks.length === 0) return <LoadingSpinner />;
  if (error && webhooks.length === 0) return <ErrorState message={error} onRetry={loadData} />;

  const detailBody = selected ? (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-text-secondary mb-1">{t('common.name')}</p>
        <p className="text-sm font-medium">{selected.name}</p>
      </div>
      <div>
        <p className="text-sm text-text-secondary mb-1">{t('common.id')}</p>
        <p className="text-sm font-mono text-text-secondary">{selected.id}</p>
      </div>
      <div>
        <p className="text-sm text-text-secondary mb-1">{t('common.status')}</p>
        <StatusBadge status={selected.status} />
      </div>
      <div>
        <p className="text-sm text-text-secondary mb-1">{t('webhooks.endpoint')}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-accent/30 text-brand-400 px-1.5 py-0.5 rounded font-mono">{selected.method}</span>
          <code className="text-xs break-all">{selected.url}</code>
        </div>
      </div>
      <div>
        <p className="text-sm text-text-secondary mb-1">{t('common.agent')}</p>
        <p className="text-sm text-brand-400">{selected.agent}</p>
      </div>
      <div>
        <p className="text-sm text-text-secondary mb-1">{t('common.description')}</p>
        <p className="text-sm text-text-secondary">{selected.description || "—"}</p>
      </div>
      {selected.secret && (
        <div>
          <p className="text-sm text-text-secondary mb-1">{t('webhooks.signature') || "Signature"}</p>
          <p className="text-xs font-mono text-brand-400">X-Sygen-Signature</p>
          <p className="text-xs text-text-secondary mt-0.5">HMAC-SHA256</p>
        </div>
      )}
      <div>
        <p className="text-sm text-text-secondary mb-1">{t('webhooks.totalTriggers')}</p>
        <p className="text-sm">{selected.triggerCount.toLocaleString()}</p>
      </div>
      <div>
        <p className="text-sm text-text-secondary mb-1">{t('webhooks.lastTriggered')}</p>
        <p className="text-sm">{formatDateTime(selected.lastTriggered)}</p>
      </div>
      <div className="pt-2 border-t border-border flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleTest(selected)}
          className="flex-1 py-2 text-sm font-medium rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
        >
          {t('common.test')}
        </button>
        <button
          type="button"
          onClick={() => setShowForm("edit")}
          className="flex-1 py-2 text-sm font-medium rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 transition-colors"
        >
          {t('common.edit')}
        </button>
        <button
          type="button"
          onClick={() => handleDelete(selected)}
          className="py-2 px-3 text-sm font-medium rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex gap-4 md:gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h1 className="text-2xl font-bold">{t('webhooks.title')}</h1>
          <button
            type="button"
            onClick={() => setShowForm("create")}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            {t('webhooks.newWebhook')}
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
                    ? "bg-accent text-accent-foreground"
                    : "bg-bg-card text-text-secondary hover:text-text-primary"
                }`}
              >
                {f.label}
                {f.value !== "all" && (
                  <span className="ml-1.5 opacity-60">
                    {webhooks.filter((w) => w.status === f.value).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="ml-auto w-64">
            <TableSearch
              placeholder={`${t("common.search")} (${t("common.name")}, URL, ${t("common.agent")})`}
              onSearch={setSearchQuery}
            />
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <DataTable
            data={filtered}
            columns={columns}
            keyField="id"
            onRowClick={(item) => select(item)}
            emptyMessage={t('common.noData')}
          />
        </div>
      </div>

      {selected && detailBody && (
        <DetailDrawer
          open={true}
          title={t('webhooks.details')}
          onClose={clearSelection}
          actions={
            <button
              type="button"
              onClick={() => setShowForm("edit")}
              className="p-1.5 hover:bg-bg-primary rounded-lg transition-colors text-text-secondary"
              title={t('common.edit')}
            >
              <Edit2 size={14} />
            </button>
          }
        >
          {detailBody}
        </DetailDrawer>
      )}

      {showForm === "create" && (
        <WebhookFormDialog
          initial={EMPTY_FORM}
          isEdit={false}
          hasExistingSecret={false}
          agents={agents}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}
      {showForm === "edit" && selected && (
        <WebhookFormDialog
          initial={{
            id: selected.id,
            name: selected.name,
            url: selected.url,
            method: selected.method,
            agent: selected.agent,
            description: selected.description,
            secret: "",
            clearSecret: false,
          }}
          isEdit={true}
          hasExistingSecret={Boolean(selected.secret)}
          agents={agents}
          onSave={handleEdit}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
