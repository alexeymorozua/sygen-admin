"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, AlertCircle, FolderOpen, Brain, Lightbulb } from "lucide-react";
import { SygenAPI, type RagStatus } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { useTranslation } from "@/lib/i18n";
import { RefreshButton } from "@/components/RefreshButton";

const MEDIUM_THRESHOLD = 200;
const LARGE_THRESHOLD = 500;

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
      success(t("rag.restartHint"));
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
          {t("rag.title")}
        </h2>
        <RefreshButton size="sm" iconSize={14} loading={loading} onClick={load} />
      </div>

      {loading && (
        <p className="text-xs text-text-secondary">{t("common.loading")}</p>
      )}

      {status && (
        <div className="space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("rag.enabled")}</p>
              <p className="text-xs text-text-secondary mt-0.5">
                {t("rag.enabledDesc")}
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

          {/* Stats grid + progress */}
          <div className="pt-3 border-t border-border/50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2">
                <Brain size={14} className="text-text-secondary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary">
                    {t("rag.memoryFacts")}
                  </p>
                  <p className="text-sm font-medium tabular-nums">
                    {status.memory_fact_count ?? "—"}
                  </p>
                  <p className="text-[10px] text-text-secondary mt-0.5 tabular-nums">
                    {t("rag.chunksInIndex", { count: status.chunk_count })}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <FolderOpen size={14} className="text-text-secondary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary">
                    {t("rag.dbSize")}
                  </p>
                  <p className="text-sm font-medium tabular-nums">
                    {status.vector_db_exists ? formatBytes(status.vector_db_size_bytes) : "—"}
                  </p>
                </div>
              </div>
            </div>
            <MemoryFactProgress count={status.memory_fact_count ?? 0} />
          </div>

          {/* Model info */}
          <div className="pt-3 border-t border-border/50 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs text-text-secondary">{t("rag.embeddingModel")}</span>
              <span className="text-xs font-mono text-right break-all max-w-[65%]">
                {status.embedding_model}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs text-text-secondary">{t("rag.topK")}</span>
              <span className="text-xs font-mono tabular-nums">
                {status.top_k_retrieval} → {status.top_k_final}
              </span>
            </div>
          </div>

          {/* Sub toggles */}
          <div className="pt-3 border-t border-border/50 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                ["index_memory", t("rag.indexMemory")],
                ["index_workspace", t("rag.indexWorkspace")],
                ["reranker_enabled", t("rag.reranker")],
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

          <Recommendation status={status} onToggle={toggleField} saving={saving} />

          <div className="flex items-start gap-2 pt-3 border-t border-border/50 text-xs text-text-secondary">
            <AlertCircle size={12} className="text-yellow-500 shrink-0 mt-0.5" />
            <span>{t("rag.restartRequired")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MemoryFactProgress({ count }: { count: number }) {
  const { t } = useTranslation();
  const clamped = Math.min(count, LARGE_THRESHOLD);
  const pct = (clamped / LARGE_THRESHOLD) * 100;
  let label: string;
  if (count >= LARGE_THRESHOLD) {
    label = t("rag.atMax");
  } else if (count >= MEDIUM_THRESHOLD) {
    label = t("rag.untilLarge", { remaining: LARGE_THRESHOLD - count });
  } else {
    label = t("rag.untilMedium", { remaining: MEDIUM_THRESHOLD - count });
  }
  const barColor =
    count >= LARGE_THRESHOLD
      ? "bg-emerald-500"
      : count >= MEDIUM_THRESHOLD
        ? "bg-yellow-500"
        : "bg-brand-500";
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full bg-bg-primary rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <p className="text-[11px] text-text-secondary">{label}</p>
    </div>
  );
}

function Recommendation({
  status,
  onToggle,
  saving,
}: {
  status: RagStatus;
  onToggle: (key: "enabled" | "reranker_enabled") => void;
  saving: boolean;
}) {
  const { t } = useTranslation();

  if (!status.enabled) {
    return (
      <div className="flex items-start gap-2 pt-3 border-t border-border/50 text-xs text-text-secondary">
        <Lightbulb size={12} className="text-brand-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-text-primary mb-1">{t("rag.recommendationTitle")}</p>
          <p>{t("rag.recEnableRag")}</p>
        </div>
        <button
          type="button"
          onClick={() => onToggle("enabled")}
          disabled={saving}
          className="shrink-0 px-2.5 py-1 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 rounded-md text-[11px] transition-colors disabled:opacity-50"
        >
          {t("rag.enabled")}
        </button>
      </div>
    );
  }

  const count = status.memory_fact_count ?? 0;
  let message: string;
  let canEnableReranker = false;
  if (count >= LARGE_THRESHOLD) {
    message = t("rag.recLarge", { count });
    canEnableReranker = !status.reranker_enabled;
  } else if (count >= MEDIUM_THRESHOLD) {
    message = t("rag.recMedium", { count });
  } else {
    message = t("rag.recSmall", { count });
  }

  return (
    <div className="flex items-start gap-2 pt-3 border-t border-border/50 text-xs text-text-secondary">
      <Lightbulb size={12} className="text-brand-400 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-medium text-text-primary mb-1">{t("rag.recommendationTitle")}</p>
        <p>{message}</p>
      </div>
      {canEnableReranker && (
        <button
          type="button"
          onClick={() => onToggle("reranker_enabled")}
          disabled={saving}
          className="shrink-0 px-2.5 py-1 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 rounded-md text-[11px] transition-colors disabled:opacity-50"
        >
          {t("rag.recEnableReranker")}
        </button>
      )}
    </div>
  );
}
