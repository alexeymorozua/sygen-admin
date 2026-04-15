"use client";

import { useEffect, useState, useCallback } from "react";
import { Brain, Save, FileText, Loader2, Users, FolderOpen } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { LoadingSpinner, ErrorState } from "@/components/LoadingState";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { useTranslation } from "@/lib/i18n";
import { SygenAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MemoryModule } from "@/lib/mock-data";
import type { Agent } from "@/lib/mock-data";

export default function MemoryPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [modules, setModules] = useState<MemoryModule[]>([]);
  const [selected, setSelected] = useState<MemoryModule | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingModules, setLoadingModules] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { success, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const { t } = useTranslation();

  // Load agents list
  useEffect(() => {
    SygenAPI.getAgents()
      .then((list) => {
        setAgents(list);
        // Default to "main" or first agent
        const main = list.find((a) => a.name === "main");
        setSelectedAgent(main ? "" : "");
      })
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  // Load modules when agent changes
  const loadModules = useCallback(
    async (agent: string) => {
      setLoadingModules(true);
      setError("");
      setSelected(null);
      setContent("");
      setDirty(false);
      try {
        const agentParam = agent === "" || agent === "main" ? undefined : agent;
        const mods = await SygenAPI.getMemoryModules(agentParam);
        setModules(mods);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load memory modules");
        setModules([]);
      } finally {
        setLoadingModules(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!loading) {
      loadModules(selectedAgent);
    }
  }, [selectedAgent, loading, loadModules]);

  const agentParam = selectedAgent === "" || selectedAgent === "main" ? undefined : selectedAgent;

  const selectModule = async (mod: MemoryModule) => {
    if (dirty && !(await confirm({ message: t('memory.discardConfirm') }))) return;
    setSelected(mod);
    setDirty(false);
    setLoadingContent(true);
    try {
      const text = await SygenAPI.getMemoryModuleContent(mod.filename, agentParam);
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
      await SygenAPI.updateMemoryModule(selected.filename, content, agentParam);
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

  // Group modules: root-level vs nested (modules/ subfolder)
  const rootModules = modules.filter((m) => !m.filename.includes("/"));
  const nestedModules = modules.filter((m) => m.filename.includes("/"));

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('memory.title')}</h1>
        <div className="flex items-center gap-3">
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
      </div>

      {error && (
        <div className="mb-4 text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="flex gap-6 h-[calc(100vh-12rem)]">
        {/* Module List */}
        <div className="w-72 bg-bg-card border border-border rounded-xl overflow-hidden flex flex-col shrink-0">
          {/* Agent selector */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Users size={14} className="text-text-secondary" />
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                {t('memory.agent')}
              </span>
            </div>
            <select
              value={selectedAgent}
              onChange={async (e) => {
                const val = e.target.value;
                if (dirty && !(await confirm({ message: t('memory.discardConfirm') }))) return;
                setSelectedAgent(val);
              }}
              className="w-full bg-bg-primary border border-border rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">main</option>
              {agents
                .filter((a) => a.name !== "main")
                .map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.displayName || a.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Module count */}
          <div className="px-4 py-2 border-b border-border">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Brain size={14} />
              {t('memory.modules')} ({modules.length})
            </h2>
          </div>

          {/* Modules list */}
          <div className="flex-1 overflow-y-auto">
            {loadingModules && (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={18} className="animate-spin text-text-secondary" />
              </div>
            )}
            {!loadingModules && modules.length === 0 && (
              <p className="px-4 py-6 text-xs text-text-secondary text-center">
                No memory modules found
              </p>
            )}

            {/* Root modules */}
            {!loadingModules &&
              rootModules.map((mod) => (
                <button
                  key={mod.id}
                  onClick={() => selectModule(mod)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-border/30",
                    selected?.id === mod.id && "bg-accent/20 border-l-2 border-l-brand-400"
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

            {/* Nested modules (modules/ subfolder) */}
            {!loadingModules && nestedModules.length > 0 && (
              <>
                <div className="px-4 py-2 border-b border-border/30 bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <FolderOpen size={12} className="text-text-secondary" />
                    <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                      modules/
                    </span>
                    <span className="text-[10px] text-text-secondary">({nestedModules.length})</span>
                  </div>
                </div>
                {nestedModules.map((mod) => (
                  <button
                    key={mod.id}
                    onClick={() => selectModule(mod)}
                    className={cn(
                      "w-full flex items-start gap-3 pl-6 pr-4 py-2.5 text-left hover:bg-white/5 transition-colors border-b border-border/30",
                      selected?.id === mod.id && "bg-accent/20 border-l-2 border-l-brand-400"
                    )}
                  >
                    <FileText size={14} className="text-text-secondary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm truncate">{mod.name}</p>
                      <span className="text-[10px] text-text-secondary">{mod.size}</span>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 bg-bg-card border border-border rounded-xl overflow-hidden flex flex-col">
          {selected ? (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div>
                  <h3 className="font-medium text-sm">{selected.name}</h3>
                  <p className="text-xs text-text-secondary">
                    {selectedAgent && selectedAgent !== "main"
                      ? `${selectedAgent} / ${selected.filename}`
                      : selected.filename}
                  </p>
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
