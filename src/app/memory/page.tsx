"use client";

import { useEffect, useState, useCallback } from "react";
import { Brain, Save, FileText, Loader2 } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { LoadingSpinner, ErrorState } from "@/components/LoadingState";
import { useToast } from "@/components/Toast";
import { useTranslation } from "@/lib/i18n";
import { SygenAPI } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";
import type { MemoryModule } from "@/lib/mock-data";

export default function MemoryPage() {
  const [modules, setModules] = useState<MemoryModule[]>([]);
  const [selected, setSelected] = useState<MemoryModule | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { success, error: toastError } = useToast();
  const { t } = useTranslation();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const mods = await SygenAPI.getMemoryModules();
      setModules(mods);
      if (mods.length > 0 && !selected) {
        await selectModule(mods[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memory modules");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  const selectModule = async (mod: MemoryModule) => {
    if (dirty && !confirm(t('memory.discardConfirm'))) return;
    setSelected(mod);
    setDirty(false);
    setLoadingContent(true);
    try {
      const text = await SygenAPI.getMemoryModuleContent(mod.filename);
      setContent(text);
    } catch {
      setContent("(Failed to load content)");
    } finally {
      setLoadingContent(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await SygenAPI.updateMemoryModule(selected.filename, content);
      setDirty(false);
      success(`"${selected.name}" saved`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save memory");
    } finally {
      setSaving(false);
    }
  };

  const typeColors: Record<string, string> = {
    main: "active",
    shared: "running",
    agent: "paused",
  } as const;

  if (loading) return <LoadingSpinner />;
  if (error && modules.length === 0) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('memory.title')}</h1>
        {dirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-text-primary text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? t('memory.saving') : t('memory.save')}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="flex gap-6 h-[calc(100vh-12rem)]">
        {/* Module List */}
        <div className="w-72 bg-bg-card border border-border rounded-xl overflow-hidden flex flex-col shrink-0">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Brain size={14} />
              {t('memory.modules')} ({modules.length})
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {modules.map((mod) => (
              <button
                key={mod.id}
                onClick={() => selectModule(mod)}
                className={cn(
                  "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-border/30",
                  selected?.id === mod.id && "bg-accent/20 border-l-2 border-l-blue-400"
                )}
              >
                <FileText size={16} className="text-text-secondary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{mod.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={typeColors[mod.type] as "active" | "running" | "paused"} />
                    <span className="text-xs text-text-secondary">{mod.size}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 bg-bg-card border border-border rounded-xl overflow-hidden flex flex-col">
          {selected ? (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div>
                  <h3 className="font-medium text-sm">{selected.name}</h3>
                  <p className="text-xs text-text-secondary">{selected.filename}</p>
                </div>
                <div className="flex items-center gap-3">
                  {dirty && (
                    <span className="text-xs text-warning">{t('memory.unsavedChanges')}</span>
                  )}
                  {loadingContent && (
                    <Loader2 size={14} className="animate-spin text-text-secondary" />
                  )}
                </div>
              </div>
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setDirty(true);
                }}
                className="flex-1 w-full bg-bg-primary p-5 text-sm font-mono text-text-primary resize-none focus:outline-none leading-relaxed"
                spellCheck={false}
                disabled={loadingContent}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-secondary">
              {t('memory.selectModule')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
