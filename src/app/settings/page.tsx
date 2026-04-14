"use client";

import { useEffect, useState, useCallback } from "react";
import { Settings, Server, Bot, Clock, Webhook, Globe, RefreshCw, LogOut } from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/LoadingState";
import { SygenAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";

interface ConfigSection {
  title: string;
  icon: React.ElementType;
  data: Record<string, unknown>;
}

export default function SettingsPage() {
  const { logout } = useAuth();
  const { t } = useTranslation();
  const [config, setConfig] = useState<Record<string, Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const c = await SygenAPI.getConfig();
      setConfig(c as unknown as Record<string, Record<string, unknown>>);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleTestConnection = async () => {
    setChecking(true);
    const ok = await SygenAPI.checkHealth();
    setHealthOk(ok);
    setChecking(false);
  };

  const icons: Record<string, React.ElementType> = {
    core: Server,
    telegram: Globe,
    agents: Bot,
    tasks: Settings,
    cron: Clock,
    api: Webhook,
  };

  const sections: ConfigSection[] = config
    ? Object.entries(config).map(([key, data]) => ({
        title: key.charAt(0).toUpperCase() + key.slice(1),
        icon: icons[key] || Settings,
        data: data as Record<string, unknown>,
      }))
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
          <p className="text-xs text-text-secondary mt-1">{t('settings.readOnly')}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border hover:border-danger text-text-secondary hover:text-danger text-sm font-medium rounded-lg transition-colors"
        >
          <LogOut size={16} />
          {t('settings.logout')}
        </button>
      </div>

      {/* API Connection */}
      <div className="bg-bg-card border border-border rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Globe size={18} className="text-blue-400" />
          {t('settings.apiConnection')}
        </h2>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={checking}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-text-primary text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
            {t('settings.testConnection')}
          </button>
          {healthOk !== null && (
            <span className={`text-sm ${healthOk ? "text-green-400" : "text-danger"}`}>
              {healthOk ? t('status.connected') : t('servers.connectionFailed')}
            </span>
          )}
        </div>
      </div>

      {/* Config Sections */}
      {loading && <LoadingSpinner />}
      {error && <ErrorState message={error} onRetry={loadData} />}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map((section) => (
            <div key={section.title} className="bg-bg-card border border-border rounded-xl p-5">
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                <section.icon size={16} className="text-blue-400" />
                {section.title}
              </h2>
              <div className="space-y-2.5">
                {Object.entries(section.data).map(([key, value]) => (
                  <div key={key} className="flex items-start justify-between gap-4">
                    <span className="text-xs text-text-secondary font-mono">{key}</span>
                    <span className="text-xs text-text-primary text-right font-mono break-all max-w-[60%]">
                      {typeof value === "boolean" ? (
                        <span className={value ? "text-green-400" : "text-red-400"}>
                          {String(value)}
                        </span>
                      ) : Array.isArray(value) ? (
                        value.join(", ")
                      ) : (
                        String(value)
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
