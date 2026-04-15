"use client";

import { useEffect, useState } from "react";
import {
  Server,
  Plus,
  Pencil,
  Trash2,
  Star,
  Wifi,
  WifiOff,
  TestTube,
  Loader2,
  X,
} from "lucide-react";
import { useServer } from "@/context/ServerContext";
import { useConfirm } from "@/components/ConfirmDialog";
import { useTranslation } from "@/lib/i18n";
import { checkServerHealth, testServerConnection } from "@/lib/servers";
import type { SygenServer } from "@/lib/servers";
import { cn } from "@/lib/utils";

const PRESET_COLORS = ["#e94560", "#4ecdc4", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316"];

interface ServerStatus {
  online: boolean;
  latency: number;
}

interface TestResult {
  online: boolean;
  latency: number;
  version?: string;
  agents?: number;
  uptime?: string;
}

export default function ServersPage() {
  const { servers, activeServer, switchServer, addServer, updateServer, removeServer } = useServer();
  const { confirm } = useConfirm();
  const { t } = useTranslation();
  const [statusMap, setStatusMap] = useState<Record<string, ServerStatus>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const results: Record<string, ServerStatus> = {};
      await Promise.all(
        servers.map(async (s) => {
          results[s.id] = await checkServerHealth(s);
        })
      );
      if (!cancelled) setStatusMap(results);
    }
    check();
    const interval = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [servers]);

  const handleDelete = async (id: string) => {
    if (servers.length <= 1) return;
    if (!(await confirm({ message: t('servers.deleteConfirm'), variant: "danger" }))) return;
    removeServer(id);
  };

  const handleSetDefault = (id: string) => {
    updateServer(id, { isDefault: true });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('servers.title')}</h1>
        <button
          onClick={() => { setShowAdd(true); setEditing(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-danger hover:bg-danger/80 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          {t('servers.addServer')}
        </button>
      </div>

      {/* Server Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {servers.map((server) => {
          const status = statusMap[server.id];
          const isActive = server.id === activeServer.id;

          return (
            <div
              key={server.id}
              className={cn(
                "bg-bg-card border rounded-xl p-5 transition-colors",
                isActive ? "border-accent-hover ring-1 ring-accent-hover" : "border-border"
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: server.color }}
                  />
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      {server.name}
                      {server.isDefault && (
                        <Star size={14} className="text-warning fill-warning" />
                      )}
                    </h3>
                    <p className="text-xs text-text-secondary font-mono">{server.url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {status?.online ? (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <Wifi size={12} />
                      {status.latency}ms
                    </span>
                  ) : status ? (
                    <span className="flex items-center gap-1 text-xs text-danger">
                      <WifiOff size={12} />
                      {t('servers.offline')}
                    </span>
                  ) : (
                    <Loader2 size={12} className="animate-spin text-text-secondary" />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4">
                {!isActive && (
                  <button
                    onClick={() => switchServer(server.id)}
                    className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover rounded-md transition-colors"
                  >
                    {t('servers.switchTo')}
                  </button>
                )}
                {isActive && (
                  <span className="px-3 py-1.5 text-xs bg-success/20 text-success rounded-md">
                    {t('common.active')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => { setEditing(server.id); setShowAdd(false); }}
                  className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-md transition-colors"
                  aria-label="Edit server"
                >
                  <Pencil size={14} />
                </button>
                {!server.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(server.id)}
                    title={t('servers.setAsDefault')}
                    aria-label="Set as default server"
                    className="p-1.5 text-text-secondary hover:text-warning hover:bg-white/5 rounded-md transition-colors"
                  >
                    <Star size={14} />
                  </button>
                )}
                {servers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDelete(server.id)}
                    aria-label="Delete server"
                    className="p-1.5 text-text-secondary hover:text-danger hover:bg-white/5 rounded-md transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add/Edit Form */}
      {(showAdd || editing) && (
        <ServerForm
          server={editing ? servers.find((s) => s.id === editing) : undefined}
          onSave={(data) => {
            if (editing) {
              updateServer(editing, data);
            } else {
              addServer({ ...data, isDefault: servers.length === 0 });
            }
            setEditing(null);
            setShowAdd(false);
          }}
          onCancel={() => { setEditing(null); setShowAdd(false); }}
        />
      )}
    </div>
  );
}

function ServerForm({
  server,
  onSave,
  onCancel,
}: {
  server?: SygenServer;
  onSave: (data: Omit<SygenServer, "id">) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(server?.name || "");
  const [url, setUrl] = useState(server?.url || "http://");
  const [token, setToken] = useState(server?.token || "");
  const [color, setColor] = useState(server?.color || PRESET_COLORS[0]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testServerConnection({ id: "", name, url, token, color, isDefault: false });
    setTestResult(result);
    setTesting(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, url, token, color, isDefault: server?.isDefault || false });
  };

  return (
    <div className="bg-bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Server size={18} className="text-text-secondary" />
          {server ? t('servers.editServer') : t('servers.addServer')}
        </h2>
        <button type="button" onClick={onCancel} className="p-1 text-text-secondary hover:text-text-primary" aria-label="Close form">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t('common.name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Production"
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-hover"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t('common.url')}</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="http://server:8799"
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent-hover"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t('common.apiToken')}</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter API token"
            className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent-hover"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t('common.color')}</label>
          <div className="flex items-center gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "w-7 h-7 rounded-full transition-transform",
                  color === c ? "ring-2 ring-white ring-offset-2 ring-offset-bg-card scale-110" : "hover:scale-110"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-7 h-7 rounded-full cursor-pointer bg-transparent border-0"
            />
          </div>
        </div>

        {/* Test Connection */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !url}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <TestTube size={14} />}
            {t('servers.testConnection')}
          </button>

          {testResult && (
            <div className={cn("text-sm", testResult.online ? "text-success" : "text-danger")}>
              {testResult.online ? (
                <span>
                  Connected ({testResult.latency}ms)
                  {testResult.version && ` — v${testResult.version}`}
                  {testResult.agents !== undefined && ` — ${testResult.agents} agents`}
                  {testResult.uptime && ` — up ${testResult.uptime}`}
                </span>
              ) : (
                <span>{t('servers.connectionFailed')} ({testResult.latency}ms)</span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 border-t border-border">
          <button
            type="submit"
            disabled={!name || !url}
            className="px-4 py-2 bg-danger hover:bg-danger/80 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {server ? t('servers.saveChanges') : t('servers.addServer')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors"
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
