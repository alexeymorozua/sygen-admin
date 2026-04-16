"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Cpu, Loader2, Undo2 } from "lucide-react";
import {
  SygenAPI,
  type AvailableProvider,
  type AvailableProvidersResponse,
} from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface ProviderSwitcherProps {
  sessionId: string | null;
  currentOverrideProvider: string | null;
  currentOverrideModel: string | null;
  agentDefaultLabel: string | null;
  onChange: (provider: string | null, model: string | null) => void;
}

export function ProviderSwitcher({
  sessionId,
  currentOverrideProvider,
  currentOverrideModel,
  agentDefaultLabel,
  onChange,
}: ProviderSwitcherProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AvailableProvidersResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await SygenAPI.getAvailableProviders();
      setData(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !data && !loading) {
      load();
    }
  }, [open, data, loading, load]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const hasOverride = Boolean(currentOverrideProvider);

  const summary = useMemo(() => {
    if (hasOverride) {
      return currentOverrideModel
        ? `${currentOverrideProvider} · ${currentOverrideModel}`
        : currentOverrideProvider || "";
    }
    return agentDefaultLabel || t("chat.defaultLabel");
  }, [hasOverride, currentOverrideProvider, currentOverrideModel, agentDefaultLabel, t]);

  const applyOverride = useCallback(
    async (provider: string, model: string) => {
      if (!sessionId) return;
      setBusy(true);
      setError(null);
      try {
        const resp = await SygenAPI.setSessionProvider(sessionId, provider, model);
        onChange(resp.provider, resp.model);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("chat.providerUpdateFailed"));
      } finally {
        setBusy(false);
      }
    },
    [sessionId, onChange, t]
  );

  const resetOverride = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await SygenAPI.resetSessionProvider(sessionId);
      onChange(resp.provider, resp.model);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("chat.providerUpdateFailed"));
    } finally {
      setBusy(false);
    }
  }, [sessionId, onChange, t]);

  if (!sessionId) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border transition-colors",
          "bg-bg-card border-border hover:border-accent",
          hasOverride ? "text-brand-400" : "text-text-secondary",
          busy && "opacity-60 cursor-wait"
        )}
        title={hasOverride ? t("chat.providerOverride") : t("chat.provider")}
      >
        {busy ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Cpu size={12} />
        )}
        <span className="max-w-[160px] truncate">{summary}</span>
        {hasOverride && (
          <span className="px-1 py-0 rounded bg-brand-500/20 text-brand-300 uppercase tracking-wide text-[9px] font-semibold">
            override
          </span>
        )}
        <ChevronDown size={12} className="opacity-60" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-40 w-72 bg-bg-card border border-border rounded-lg shadow-lg py-2 text-sm"
          role="menu"
        >
          <div className="px-3 pb-2 flex items-center justify-between text-xs text-text-secondary">
            <span>{t("chat.provider")}</span>
            {hasOverride && (
              <button
                type="button"
                onClick={resetOverride}
                disabled={busy}
                className="flex items-center gap-1 text-brand-400 hover:text-brand-300 disabled:opacity-50"
              >
                <Undo2 size={12} />
                {t("chat.resetToDefault")}
              </button>
            )}
          </div>

          {loading && (
            <div className="px-3 py-2 text-xs text-text-secondary flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" />
              …
            </div>
          )}

          {error && (
            <div className="px-3 py-2 text-xs text-red-400">{error}</div>
          )}

          {!loading && data && (
            <div className="max-h-80 overflow-y-auto">
              {data.providers.map((p) => (
                <ProviderBlock
                  key={p.name}
                  provider={p}
                  currentProvider={currentOverrideProvider}
                  currentModel={currentOverrideModel}
                  agentDefaultProvider={data.agent_default_provider}
                  agentDefaultModel={data.agent_default_model}
                  onPick={applyOverride}
                  disabled={busy}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ProviderBlockProps {
  provider: AvailableProvider;
  currentProvider: string | null;
  currentModel: string | null;
  agentDefaultProvider: string | null;
  agentDefaultModel: string | null;
  onPick: (provider: string, model: string) => void;
  disabled: boolean;
}

function ProviderBlock({
  provider,
  currentProvider,
  currentModel,
  agentDefaultProvider,
  agentDefaultModel,
  onPick,
  disabled,
}: ProviderBlockProps) {
  const { t } = useTranslation();
  const disabledProvider = !provider.authenticated;
  return (
    <div className="px-1">
      <div className="px-2 pt-2 pb-1 flex items-center justify-between text-xs">
        <span
          className={cn(
            "font-medium",
            disabledProvider ? "text-text-secondary" : "text-text-primary"
          )}
        >
          {provider.display_name || provider.name}
        </span>
        {disabledProvider && (
          <span className="text-[10px] text-text-secondary">
            {t("chat.providerAuthFailed")}
          </span>
        )}
      </div>
      {!disabledProvider && provider.models.length === 0 && (
        <div className="px-3 py-1 text-xs text-text-secondary">—</div>
      )}
      {!disabledProvider &&
        provider.models.map((m) => {
          const isSelected =
            currentProvider === provider.name && currentModel === m;
          const isAgentDefault =
            agentDefaultProvider === provider.name && agentDefaultModel === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onPick(provider.name, m)}
              disabled={disabled || isSelected}
              className={cn(
                "w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs text-left",
                "hover:bg-bg-primary transition-colors",
                isSelected && "bg-bg-primary text-brand-300"
              )}
            >
              <span className="flex items-center gap-2">
                {isSelected ? (
                  <Check size={12} className="text-brand-400" />
                ) : (
                  <span className="w-[12px]" />
                )}
                <span>{m}</span>
              </span>
              {isAgentDefault && (
                <span className="text-[10px] text-text-secondary uppercase tracking-wide">
                  {t("chat.defaultLabel")}
                </span>
              )}
            </button>
          );
        })}
    </div>
  );
}

export default ProviderSwitcher;
