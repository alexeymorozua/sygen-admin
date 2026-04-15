"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Settings, Server, Bot, Clock, Webhook, Globe, RefreshCw, LogOut, Download, Upload, FileJson, Check, X, Shield, Copy, AlertCircle, Loader2 } from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/LoadingState";
import { SygenAPI } from "@/lib/api";
import type { TwoFactorSetupResponse } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import { useTranslation } from "@/lib/i18n";

interface ConfigSection {
  title: string;
  icon: React.ElementType;
  data: Record<string, unknown>;
}

interface ImportPreview {
  data: Record<string, unknown>;
  cron_jobs: number;
  webhooks: number;
  users: number;
}

function TwoFactorSection() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const { success, error: toastError } = useToast();
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const is2FAEnabled = user?.totp_enabled ?? false;

  const handleSetup = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await SygenAPI.setup2FA();
      setSetupData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to setup 2FA");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyCode.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      await SygenAPI.verify2FA(verifyCode);
      setSetupData(null);
      setVerifyCode("");
      const me = await SygenAPI.getMe();
      refreshUser(me);
      success(t("auth.verified") || "2FA enabled successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disableCode.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      await SygenAPI.disable2FA(disableCode);
      setDisableCode("");
      const me = await SygenAPI.getMe();
      refreshUser(me);
      success("2FA disabled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable 2FA");
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5 mb-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Shield size={18} className="text-brand-400" />
        {t("auth.twoFactor") || "Two-Factor Authentication"}
      </h2>

      {is2FAEnabled ? (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full">
              <Check size={12} />
              {t("auth.twoFactorEnabled") || "2FA Enabled"}
            </span>
          </div>
          <form onSubmit={handleDisable} className="space-y-3">
            <p className="text-sm text-text-secondary">
              {t("auth.disableHint") || "Enter your current 2FA code to disable"}
            </p>
            <input
              type="text"
              inputMode="numeric"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="w-48 bg-bg-primary border border-border rounded-lg px-3 py-2 text-center text-lg font-mono tracking-[0.3em] text-text-primary placeholder:text-text-secondary/30 focus:outline-none focus:border-accent"
            />
            {error && (
              <div className="flex items-center gap-2 text-danger text-sm">
                <AlertCircle size={14} />
                {error}
              </div>
            )}
            <div>
              <button
                type="submit"
                disabled={loading || disableCode.length !== 6}
                className="flex items-center gap-2 px-4 py-2 bg-danger/20 hover:bg-danger/30 text-danger text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                {t("auth.disable2FA") || "Disable 2FA"}
              </button>
            </div>
          </form>
        </div>
      ) : setupData ? (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {t("auth.scanQR") || "Add this secret to your authenticator app:"}
          </p>
          <div className="bg-bg-primary border border-border rounded-lg p-4">
            <p className="text-xs text-text-secondary mb-2">{t("auth.secretKey") || "Secret Key"}</p>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-brand-400 break-all select-all">
                {setupData.secret}
              </code>
              <button
                type="button"
                onClick={copySecret}
                className="p-1.5 hover:bg-bg-card rounded-lg transition-colors shrink-0"
                title="Copy"
              >
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} className="text-text-secondary" />}
              </button>
            </div>
            <p className="text-xs text-text-secondary mt-3 break-all font-mono opacity-60">
              {setupData.otpauth_uri}
            </p>
          </div>
          <form onSubmit={handleVerify} className="space-y-3">
            <p className="text-sm text-text-secondary">
              {t("auth.enterCode") || "Enter the 6-digit code from your authenticator app"}
            </p>
            <input
              type="text"
              inputMode="numeric"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              autoFocus
              className="w-48 bg-bg-primary border border-border rounded-lg px-3 py-2 text-center text-lg font-mono tracking-[0.3em] text-text-primary placeholder:text-text-secondary/30 focus:outline-none focus:border-accent"
            />
            {error && (
              <div className="flex items-center gap-2 text-danger text-sm">
                <AlertCircle size={14} />
                {error}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={loading || verifyCode.length !== 6}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-text-primary text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                {t("common.confirm") || "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => { setSetupData(null); setError(""); }}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                {t("common.cancel") || "Cancel"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div>
          <p className="text-sm text-text-secondary mb-4">
            {t("auth.twoFactorDescription") || "Add an extra layer of security to your account with a TOTP authenticator app."}
          </p>
          <button
            type="button"
            onClick={handleSetup}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-text-primary text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            <Shield size={14} />
            {t("auth.enable2FA") || "Enable 2FA"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { logout } = useAuth();
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();
  const [config, setConfig] = useState<Record<string, Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await SygenAPI.exportConfig();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sygen-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      success(t("settings.export"));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const MAX_IMPORT_SIZE = 5 * 1024 * 1024; // 5 MB

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_SIZE) {
      toastError(`File too large (max ${MAX_IMPORT_SIZE / 1024 / 1024} MB)`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (!file.name.endsWith(".json") && file.type !== "application/json") {
      toastError("Only .json files are accepted");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (typeof data !== "object" || data === null || Array.isArray(data)) {
          toastError("Invalid config format: expected a JSON object");
          return;
        }
        if (data.version !== 1) {
          toastError("Unsupported export version");
          return;
        }
        setImportPreview({
          data,
          cron_jobs: Array.isArray(data.cron_jobs) ? data.cron_jobs.length : 0,
          webhooks: Array.isArray(data.webhooks) ? data.webhooks.length : 0,
          users: Array.isArray(data.users) ? data.users.length : 0,
        });
      } catch {
        toastError("Invalid JSON file");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    try {
      const result = await SygenAPI.importConfig(importPreview.data);
      const parts: string[] = [];
      if (result.cron_jobs_added) parts.push(`${result.cron_jobs_added} cron ${t("settings.added")}`);
      if (result.webhooks_added) parts.push(`${result.webhooks_added} webhooks ${t("settings.added")}`);
      if (result.users_added) parts.push(`${result.users_added} users ${t("settings.added")}`);
      if (result.skipped) parts.push(`${result.skipped} ${t("settings.skipped")}`);
      success(`${t("settings.importSuccess")}: ${parts.join(", ") || "nothing new"}`);
      setImportPreview(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
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

      {/* 2FA Section */}
      <TwoFactorSection />

      {/* API Connection */}
      <div className="bg-bg-card border border-border rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Globe size={18} className="text-brand-400" />
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

      {/* Export / Import */}
      <div className="bg-bg-card border border-border rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileJson size={18} className="text-brand-400" />
          {t('settings.exportImport')}
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Download size={14} className={exporting ? "animate-pulse" : ""} />
            {exporting ? t('settings.exporting') : t('settings.exportConfig')}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-text-primary text-sm font-medium rounded-lg transition-colors"
            >
              <Upload size={14} />
              {t('settings.importConfig')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>
        <p className="text-xs text-text-secondary mt-2">{t('settings.exportDescription')}</p>

        {/* Import Preview */}
        {importPreview && (
          <div className="mt-4 bg-bg-primary rounded-lg p-4 border border-border">
            <h3 className="text-sm font-semibold mb-3">{t('settings.importPreview')}</h3>
            <div className="space-y-1.5 text-xs text-text-secondary mb-4">
              <p>{t('settings.cronJobs')}: <span className="text-text-primary font-medium">{importPreview.cron_jobs}</span></p>
              <p>{t('settings.webhooks')}: <span className="text-text-primary font-medium">{importPreview.webhooks}</span></p>
              <p>{t('settings.users')}: <span className="text-text-primary font-medium">{importPreview.users}</span></p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Check size={12} />
                {importing ? t('settings.importing') : t('settings.importConfirm')}
              </button>
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card text-text-secondary hover:text-text-primary text-xs font-medium rounded-lg transition-colors border border-border"
              >
                <X size={12} />
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Config Sections */}
      {loading && <LoadingSpinner />}
      {error && <ErrorState message={error} onRetry={loadData} />}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map((section) => (
            <div key={section.title} className="bg-bg-card border border-border rounded-xl p-5">
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                <section.icon size={16} className="text-brand-400" />
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
