"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Save, FileText, Loader2, Users, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Select } from "@/components/Select";
import { LoadingSpinner } from "@/components/LoadingState";
import { RefreshButton } from "@/components/RefreshButton";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { useTranslation } from "@/lib/i18n";
import { SygenAPI, type Skill, type SkillScope } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Agent } from "@/lib/mock-data";

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

type ScopeFilter = "all" | "global" | "own";
const SCOPE_FILTERS: ScopeFilter[] = ["all", "global", "own"];
const SCOPE_LABEL_KEY: Record<ScopeFilter, string> = {
  all: "skills.scope.all",
  global: "skills.scope.global",
  own: "skills.scope.own",
};

function parseScopeFilter(val: string | null): ScopeFilter {
  return val === "global" || val === "own" ? val : "all";
}

function skillPath(skill: Skill, agent: string): string {
  if (skill.path) return skill.path;
  if (skill.scope === "global") return `~/.sygen/skills/${skill.name}/SKILL.md`;
  if (agent === "main") return `~/.sygen/workspace/skills/${skill.name}/SKILL.md`;
  return `~/.sygen/agents/${agent}/workspace/skills/${skill.name}/SKILL.md`;
}

export default function SkillsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedAgent = searchParams.get("agent") ?? "";
  const scopeFilter = parseScopeFilter(searchParams.get("scope"));
  const selectedSkillName = searchParams.get("skill");

  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newScope, setNewScope] = useState<SkillScope>("global");
  const [creating, setCreating] = useState(false);
  const { success, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const { t } = useTranslation();

  const effectiveAgent = selectedAgent || "main";

  const selected = useMemo<Skill | null>(() => {
    if (!selectedSkillName) return null;
    return skills.find((s) => s.name === selectedSkillName) ?? null;
  }, [selectedSkillName, skills]);

  const updateUrl = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setSelectedAgent = useCallback(
    (val: string) => {
      updateUrl((params) => {
        if (val && val !== "main") params.set("agent", val);
        else params.delete("agent");
        params.delete("skill");
      });
    },
    [updateUrl],
  );

  const setScopeFilter = useCallback(
    (val: ScopeFilter) => {
      updateUrl((params) => {
        if (val === "all") params.delete("scope");
        else params.set("scope", val);
        params.delete("skill");
      });
    },
    [updateUrl],
  );

  const selectSkillInUrl = useCallback(
    (name: string | null) => {
      updateUrl((params) => {
        if (name) params.set("skill", name);
        else params.delete("skill");
      });
    },
    [updateUrl],
  );

  useEffect(() => {
    SygenAPI.getAgents()
      .then((list) => setAgents(list))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  const loadSkills = useCallback(
    async (agent: string, scope: ScopeFilter) => {
      setLoadingSkills(true);
      setError("");
      try {
        let list: Skill[];
        if (scope === "global") {
          list = await SygenAPI.getGlobalSkills();
          list = list.map((s) => ({ ...s, scope: s.scope ?? "global" }));
        } else if (scope === "own") {
          list = await SygenAPI.getSkills(agent, "own");
          list = list.map((s) => ({ ...s, scope: s.scope ?? "agent" }));
        } else {
          list = await SygenAPI.getSkills(agent);
        }
        setSkills(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load skills");
        setSkills([]);
      } finally {
        setLoadingSkills(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!loading) loadSkills(effectiveAgent, scopeFilter);
  }, [effectiveAgent, scopeFilter, loading, loadSkills]);

  useEffect(() => {
    if (!selected) {
      setContent("");
      setDirty(false);
      return;
    }
    let cancelled = false;
    setLoadingContent(true);
    setDirty(false);
    const scope = selected.scope ?? "agent";
    const loader =
      scope === "global"
        ? SygenAPI.getGlobalSkill(selected.name)
        : SygenAPI.getSkill(effectiveAgent, selected.name, scope);
    loader
      .then((resp) => {
        if (!cancelled) setContent(resp.content);
      })
      .catch(() => {
        if (!cancelled) setContent("(Failed to load content)");
      })
      .finally(() => {
        if (!cancelled) setLoadingContent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, effectiveAgent]);

  useEffect(() => {
    // Default new-skill scope: global if there's no specific agent focus,
    // otherwise agent-scope when user is filtering to "own".
    setNewScope(scopeFilter === "own" ? "agent" : "global");
  }, [scopeFilter]);

  const selectSkill = async (s: Skill) => {
    if (dirty && !(await confirm({ message: t("skills.discardConfirm") }))) return;
    selectSkillInUrl(s.name);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      if (selected.scope === "global") {
        await SygenAPI.updateGlobalSkill(selected.name, content);
      } else {
        await SygenAPI.updateSkill(effectiveAgent, selected.name, content);
      }
      setDirty(false);
      success(t("skills.saved"));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save skill");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    const isGlobal = selected.scope === "global";
    const message = isGlobal
      ? t("skills.deleteGlobalConfirm").replace("{name}", selected.name)
      : t("skills.deleteConfirm").replace("{name}", selected.name);
    const ok = await confirm({ message, variant: "danger" });
    if (!ok) return;
    try {
      if (isGlobal) {
        await SygenAPI.deleteGlobalSkill(selected.name);
      } else {
        await SygenAPI.deleteSkill(effectiveAgent, selected.name);
      }
      success(t("skills.deleted"));
      selectSkillInUrl(null);
      await loadSkills(effectiveAgent, scopeFilter);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to delete skill");
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!NAME_RE.test(name)) {
      toastError(t("skills.nameHint"));
      return;
    }
    setCreating(true);
    try {
      const skill =
        newScope === "global"
          ? await SygenAPI.createGlobalSkill(name, newContent)
          : await SygenAPI.createSkill(effectiveAgent, name, newContent);
      success(t("skills.created"));
      setShowCreate(false);
      setNewName("");
      setNewContent("");
      await loadSkills(effectiveAgent, scopeFilter);
      selectSkillInUrl(skill.name);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to create skill");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const agentDisplayName =
    agents.find((a) => a.name === effectiveAgent)?.displayName || effectiveAgent;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">{t("skills.title")}</h1>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? t("skills.saving") : t("skills.save")}
            </button>
          )}
          <RefreshButton
            loading={loadingSkills}
            onClick={() => loadSkills(effectiveAgent, scopeFilter)}
          />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-bg-card hover:bg-white/5 border border-border text-sm rounded-lg transition-colors"
          >
            <Plus size={14} />
            {t("skills.create")}
          </button>
        </div>
      </div>

      <div className="mb-4 inline-flex items-center gap-1 p-1 bg-bg-card border border-border rounded-lg">
        {SCOPE_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={async () => {
              if (dirty && !(await confirm({ message: t("skills.discardConfirm") }))) return;
              setScopeFilter(f);
            }}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors",
              scopeFilter === f
                ? "bg-accent text-accent-foreground"
                : "text-text-secondary hover:text-text-primary hover:bg-white/5",
            )}
          >
            {t(SCOPE_LABEL_KEY[f])}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="flex flex-col md:flex-row gap-4 md:gap-6 h-[calc(100vh-14rem)]">
        <div
          className={cn(
            "w-full md:w-80 bg-bg-card border border-border rounded-xl overflow-hidden md:flex flex-col shrink-0",
            selected ? "hidden md:flex" : "flex",
          )}
        >
          {scopeFilter !== "global" && (
            <div className="p-3 border-b border-border">
              <div className="flex items-center gap-2 mb-2">
                <Users size={14} className="text-text-secondary" />
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  {t("skills.agent")}
                </span>
              </div>
              <Select
                value={selectedAgent}
                onChange={async (e) => {
                  const val = e.target.value;
                  if (dirty && !(await confirm({ message: t("skills.discardConfirm") }))) return;
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
          )}

          <div className="px-4 py-2 border-b border-border">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={14} />
              {t("skills.list")} ({skills.length})
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingSkills && (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={18} className="animate-spin text-text-secondary" />
              </div>
            )}
            {!loadingSkills && skills.length === 0 && (
              <p className="px-4 py-6 text-xs text-text-secondary text-center">
                {t("skills.empty")}
              </p>
            )}
            {!loadingSkills &&
              skills.map((s) => (
                <button
                  key={`${s.scope ?? "agent"}:${s.name}`}
                  onClick={() => selectSkill(s)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-border/30",
                    selected?.name === s.name && "bg-accent/20 border-l-2 border-l-brand-400",
                  )}
                >
                  <FileText size={16} className="text-text-secondary mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <ScopeBadge skill={s} compact />
                    </div>
                    {s.description && (
                      <p className="text-[11px] text-text-secondary truncate mt-0.5">
                        {s.description}
                      </p>
                    )}
                  </div>
                </button>
              ))}
          </div>
        </div>

        <div
          className={cn(
            "flex-1 bg-bg-card border border-border rounded-xl overflow-hidden md:flex flex-col",
            selected ? "flex" : "hidden md:flex",
          )}
        >
          {selected ? (
            <>
              <div className="flex items-start justify-between px-5 py-3 border-b border-border gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={async () => {
                      if (dirty && !(await confirm({ message: t("skills.discardConfirm") }))) return;
                      selectSkillInUrl(null);
                    }}
                    className="md:hidden p-1 -ml-1 text-text-secondary hover:text-text-primary shrink-0"
                    aria-label="Back"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-sm truncate">{selected.name}</h3>
                      <ScopeBadge skill={selected} />
                    </div>
                    <p className="text-xs text-text-secondary truncate mt-0.5">
                      {t("skills.pathLabel")}: {skillPath(selected, effectiveAgent)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {dirty && (
                    <span className="text-xs text-warning">{t("skills.unsavedChanges")}</span>
                  )}
                  {loadingContent && (
                    <Loader2 size={14} className="animate-spin text-text-secondary" />
                  )}
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="p-1.5 text-danger hover:bg-danger/10 rounded"
                    title={t("skills.delete")}
                    aria-label={t("skills.delete")}
                  >
                    <Trash2 size={14} />
                  </button>
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
                placeholder={selected.has_doc ? "" : t("skills.noDoc")}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-secondary">
              {t("skills.selectSkill")}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => !creating && setShowCreate(false)}
        >
          <div
            className="bg-bg-card border border-border rounded-xl p-5 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-3">{t("skills.newSkillTitle")}</h2>

            <label className="block text-sm text-text-secondary mb-1">
              {t("skills.scopeLabel")}
            </label>
            <Select
              value={newScope}
              onChange={(e) => setNewScope(e.target.value as SkillScope)}
              className="w-full mb-3"
            >
              <option value="global">{t("skills.scopeGlobalOption")}</option>
              <option value="agent">
                {t("skills.scopeAgentOption").replace("{agent}", agentDisplayName)}
              </option>
            </Select>

            <label className="block text-sm text-text-secondary mb-1">
              {t("skills.nameLabel")}
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("skills.namePlaceholder")}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:border-accent"
              autoFocus
            />
            <p className="text-[10px] text-text-secondary mb-3">{t("skills.nameHint")}</p>
            <label className="block text-sm text-text-secondary mb-1">
              {t("skills.contentLabel")}
            </label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={t("skills.contentPlaceholder")}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono h-40 resize-none focus:outline-none focus:border-accent"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                disabled={creating}
                className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-lg disabled:opacity-50"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {t("skills.create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScopeBadge({ skill, compact = false }: { skill: Skill; compact?: boolean }) {
  const { t } = useTranslation();
  if (skill.overrides) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 whitespace-nowrap shrink-0",
          compact ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5",
        )}
      >
        {t("skills.badge.overrides")}
      </span>
    );
  }
  if (skill.scope === "global") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-sky-500/40 bg-sky-500/10 text-sky-300 whitespace-nowrap shrink-0",
          compact ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5",
        )}
      >
        {t("skills.badge.global")}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 whitespace-nowrap shrink-0",
        compact ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5",
      )}
    >
      {t("skills.badge.agent")}
    </span>
  );
}
