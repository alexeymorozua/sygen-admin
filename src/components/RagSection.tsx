"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, RefreshCw, AlertCircle, FolderOpen, Brain } from "lucide-react";
import { SygenAPI, type RagStatus } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { useTranslation } from "@/lib/i18n";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function RagSection() {
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();
  const [status, setStatus] = useState<RagStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await SygenAPI.getRagStatus();
      setStatus(data);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to load RAG status");
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleField = async (key: keyof Pick<RagStatus, "enabled" | "reranker_enabled" | "index_workspace" | "index_memory">) => {
    if (!status) return;
    setSaving(true);
    try {
      await SygenAPI.updateRagConfig({ [key]: !status[key] });
      setStatus({ ...status, [key]: !status[key] });
      success(t("rag.restartHint") || "Saved. Restart required to apply.");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to update RAG config");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Database size={18} className="text-brand-400" />
          {t("rag.title") || "RAG (Retrieval)"}
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-primary rounded-lg transition-colors disabled:opacity-50"
          title={t("common.refresh") || "Refresh"}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading && (
        <p className="text-xs text-text-secondary">{t("common.loading") || "Loading…"}</p>
      )}

      {status && (
        <div className="space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("rag.enabled") || "Enabled"}</p>
              <p className="text-xs text-text-secondary mt-0.5">
                {t("rag.enabledDesc") || "Hybrid BM25 + vector retrieval for agent context"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleField("enabled")}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                status.enabled ? "bg-brand-500" : "bg-bg-primary border border-border"
              } disabled:opacity-50`}
              aria-pressed={status.enabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  status.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/50">
            <div className="flex items-start gap-2">
              <Brain size={14} className="text-text-secondary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">
                  {t("rag.chunks") || "Indexed chunks"}
                </p>
                <p className="text-sm font-medium tabular-nums">{status.chunk_count}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FolderOpen size={14} className="text-text-secondary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">
                  {t("rag.dbSize") || "Vector DB size"}
                </p>
                <p className="text-sm font-medium tabular-nums">
                  {status.vector_db_exists ? formatBytes(status.vector_db_size_bytes) : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Model info */}
          <div className="pt-3 border-t border-border/50 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs text-text-secondary">{t("rag.embeddingModel") || "Embedding model"}</span>
              <span className="text-xs font-mono text-right break-all max-w-[65%]">
                {status.embedding_model}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs text-text-secondary">{t("rag.topK") || "Top K (retrieval → final)"}</span>
              <span className="text-xs font-mono tabular-nums">
                {status.top_k_retrieval} → {status.top_k_final}
              </span>
            </div>
          </div>

          {/* Sub toggles */}
          <div className="pt-3 border-t border-border/50 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                ["index_memory", t("rag.indexMemory") || "Index memory"],
                ["index_workspace", t("rag.indexWorkspace") || "Index workspace"],
                ["reranker_enabled", t("rag.reranker") || "Reranker"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs cursor-pointer hover:border-accent transition-colors"
              >
                <span className="text-text-secondary">{label}</span>
                <input
                  type="checkbox"
                  checked={status[key]}
                  onChange={() => toggleField(key)}
                  disabled={saving}
                  className="accent-brand-500"
                />
              </label>
            ))}
          </div>

          <div className="flex items-start gap-2 pt-3 border-t border-border/50 text-xs text-text-secondary">
            <AlertCircle size={12} className="text-yellow-500 shrink-0 mt-0.5" />
            <span>{t("rag.restartRequired") || "Changes take effect after bot restart."}</span>
          </div>
        </div>
      )}
    </div>
  );
}
