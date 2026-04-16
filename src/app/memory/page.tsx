"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Brain, Save, FileText, Loader2, Users, FolderOpen, ArrowLeft } from "lucide-react";
import { Select } from "@/components/Select";
import { LoadingSpinner } from "@/components/LoadingState";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { useTranslation } from "@/lib/i18n";
import { SygenAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useUrlSelection } from "@/hooks/useUrlSelection";
import type { MemoryModule } from "@/lib/mock-data";
import type { Agent } from "@/lib/mock-data";

export default function MemoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedAgent = searchParams.get("agent") ?? "";

  const [agents, setAgents] = useState<Agent[]>([]);
  const [modules, setModules] = useState<MemoryModule[]>([]);
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

  const { selected, select, clear: clearSelection } = useUrlSelection<MemoryModule>(
    "file",
    modules,
    (m) => m.filename,
  );

  const setSelectedAgent = useCallback(
    (val: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (val && val !== "main") {
        params.set("agent", val);
      } else {
        params.delete("agent");
      }
      params.delete("file");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  // Load agents list
  useEffect(() => {
    SygenAPI.getAgents()
      .then((list) => setAgents(list))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  const agentParam = selectedAgent === "" || selectedAgent === "main" ? undefined : selectedAgent;

  // Load modules when agent changes
  const loadModules = useCallback(
    async (agent: string) => {
      setLoadingModules(true);
      setError("");
      try {
        const param = agent === "" || agent === "main" ? undefined : agent;
        const mods = await SygenAPI.getMemoryModules(param);
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

  // Fetch module content whenever the URL-selected module changes.
  // Covers click-to-switch, back-swipe (selected becomes null), and direct links.
  useEffect(() => {
    if (!selected) {
      setContent("");
      setDirty(false);
      return;
    }
    let cancelled = false;
    setLoadingContent(true);
    setDirty(false);
    SygenAPI.getMemoryModuleContent(selected.filename, agentParam)
      .then((text) => { if (!cancelled) setContent(text); })
      .catch(() => { if (!cancelled) setContent("(Failed to load content)"); })
      .finally(() => { if (!cancelled) setLoadingContent(false); });
    return () => { cancelled = true; };
  }, [selected, agentParam]);

  const selectModule = async (mod: MemoryModule) => {
    if (dirty && !(await confirm({ message: t('memory.discardConfirm') }))) return;
    select(mod);
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

  // Soft line limit enforced by the memory observer on modules/ files
  // (sygen_bot.config.MemoryConfig.module_line_limit default 80).
  const MODULE_LINE_LIMIT = 80;

  const lineBadgeColor = (lines: number, limit: number): string => {
    const ratio = lines / limit;
    if (ratio >= 1) return "bg-red-500/20 text-red-400 border-red-500/40";
    if (ratio >= 0.8) return "bg-orange-500/20 text-orange-400 border-orange-500/40";
    if (ratio >= 0.5) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
    return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
  };

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
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
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

      <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-12rem)]">
        {/* Module List */}
        <div
          className={cn(
            "w-full md:w-72 bg-bg-card border border-border rounded-xl overflow-hidden md:flex flex-col shrink-0",
            selected ? "hidden md:flex" : "flex"
          )}
        >
          {/* Agent selector */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Users size={14} className="text-text-secondary" />
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                {t('memory.agent')}
              </span>
            </div>
            <Select
              value={selectedAgent}
              onChange={async (e) => {
                const val = e.target.value;
                if (dirty && !(await confirm({ message: t('memory.discardConfirm') }))) return;
                setSelectedAgent(val);
              }}
              className="w-full"
            >
              <option value="">main</option>
              {agents
                .filter((a) => a.name !== "main")
                .map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.displayName || a.name}
                  </option>
                ))}
            </Select>
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
                      {typeof mod.lines === "number" && (
                        <span className="text-xs tabular-nums text-text-secondary">
                          {mod.lines} {mod.lines === 1 ? "line" : "lines"}
                        </span>
                      )}
                      <span className="text-[10px] text-text-secondary">{mod.size}</span>
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
                      <div className="flex items-center gap-2 mt-0.5">
                        {typeof mod.lines === "number" && (
                          <span
                            className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] tabular-nums font-medium",
                              lineBadgeColor(mod.lines, MODULE_LINE_LIMIT),
                            )}
                            title={`Soft limit: ${MODULE_LINE_LIMIT} lines`}
                          >
                            {mod.lines} / {MODULE_LINE_LIMIT}
                          </span>
                        )}
                        <span className="text-[10px] text-text-secondary">{mod.size}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Editor */}
        <div
          className={cn(
            "flex-1 bg-bg-card border border-border rounded-xl overflow-hidden md:flex flex-col",
            selected ? "flex" : "hidden md:flex"
          )}
        >
          {selected ? (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={async () => {
                      if (dirty && !(await confirm({ message: t('memory.discardConfirm') }))) return;
                      clearSelection();
                    }}
                    className="md:hidden p-1 -ml-1 text-text-secondary hover:text-text-primary shrink-0"
                    aria-label="Back"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm truncate">{selected.name}</h3>
                    <p className="text-xs text-text-secondary truncate">
                      {selectedAgent && selectedAgent !== "main"
                        ? `${selectedAgent} / ${selected.filename}`
                        : selected.filename}
                    </p>
                  </div>
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
