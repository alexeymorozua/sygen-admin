"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users, Plus, Pencil, Trash2, Shield, ShieldCheck, Eye,
  X, RefreshCw, ClipboardList, ToggleLeft, ToggleRight, KeyRound,
} from "lucide-react";
import TableSearch from "@/components/TableSearch";
import { useAuth } from "@/context/AuthContext";
import { SygenAPI } from "@/lib/api";
import type { UserInfo, AuditEntry } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { LoadingSpinner, ErrorState } from "@/components/LoadingState";
import { useTranslation } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";

type Tab = "users" | "audit";

const ROLE_ICONS = {
  admin: ShieldCheck,
  operator: Shield,
  viewer: Eye,
};

const ROLE_COLORS = {
  admin: "text-red-400 bg-red-400/10",
  operator: "text-yellow-400 bg-yellow-400/10",
  viewer: "text-brand-400 bg-brand-400/10",
};

export default function UsersPage() {
  const { hasRole } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null);
  const [agents, setAgents] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [u, a] = await Promise.all([
        SygenAPI.getUsers(),
        SygenAPI.getAgents().catch(() => []),
      ]);
      setUsers(u);
      setAgents(a.map((ag) => ag.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await SygenAPI.getAuditLog(500);
      setAudit(entries);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "users") loadUsers();
    else loadAudit();
  }, [tab, loadUsers, loadAudit]);

  const handleDelete = async (username: string) => {
    if (!confirm(`Delete user "${username}"?`)) return;
    try {
      await SygenAPI.deleteUser(username);
      toast.success(t("toast.deleted"));
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const handleToggleActive = async (user: UserInfo) => {
    try {
      await SygenAPI.updateUser(user.username, { active: !user.active });
      toast.success(t("toast.updated"));
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
    }
  };

  if (!hasRole("admin")) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-secondary">{t("common.noAccess") || "Access denied"}</p>
      </div>
    );
  }

  if (loading && users.length === 0 && audit.length === 0) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={loadUsers} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users size={22} />
          {t("users.title") || "Users"}
        </h1>
        <div className="flex items-center gap-2">
          {tab === "users" && (
            <button
              type="button"
              onClick={() => { setEditingUser(null); setShowForm(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-sm rounded-lg transition-colors"
            >
              <Plus size={14} /> {t("users.addUser") || "Add User"}
            </button>
          )}
          <button
            type="button"
            onClick={() => tab === "users" ? loadUsers() : loadAudit()}
            className="p-2 hover:bg-bg-card rounded-lg transition-colors text-text-secondary"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-bg-card rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab("users")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
            tab === "users" ? "bg-accent text-text-primary" : "text-text-secondary hover:text-text-primary",
          )}
        >
          <Users size={14} /> {t("users.users") || "Users"}
        </button>
        <button
          type="button"
          onClick={() => setTab("audit")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
            tab === "audit" ? "bg-accent text-text-primary" : "text-text-secondary hover:text-text-primary",
          )}
        >
          <ClipboardList size={14} /> {t("users.auditLog") || "Audit Log"}
        </button>
      </div>

      {tab === "users" && (
        <div className="mb-4 w-64">
          <TableSearch
            placeholder={`${t("common.search")} (${t("users.username")}, ${t("users.role")})`}
            onSearch={setSearchQuery}
          />
        </div>
      )}

      {tab === "users" ? (
        <UsersTable
          users={users.filter((u) => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return u.username.toLowerCase().includes(q) || u.role.toLowerCase().includes(q) || (u.display_name || "").toLowerCase().includes(q);
          })}
          onEdit={(u) => { setEditingUser(u); setShowForm(true); }}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
          t={t}
        />
      ) : (
        <AuditTable entries={audit} t={t} />
      )}

      {showForm && (
        <UserFormDialog
          user={editingUser}
          agents={agents}
          onClose={() => { setShowForm(false); setEditingUser(null); }}
          onSaved={() => { setShowForm(false); setEditingUser(null); loadUsers(); }}
          t={t}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users table
// ---------------------------------------------------------------------------

function UsersTable({
  users,
  onEdit,
  onDelete,
  onToggleActive,
  t,
}: {
  users: UserInfo[];
  onEdit: (u: UserInfo) => void;
  onDelete: (username: string) => void;
  onToggleActive: (u: UserInfo) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-text-secondary text-left">
            <th className="px-4 py-3 font-medium">{t("common.name") || "Name"}</th>
            <th className="px-4 py-3 font-medium">{t("users.role") || "Role"}</th>
            <th className="px-4 py-3 font-medium hidden sm:table-cell">{t("users.agents") || "Agents"}</th>
            <th className="px-4 py-3 font-medium hidden md:table-cell">{t("common.status") || "Status"}</th>
            <th className="px-4 py-3 font-medium text-right">{t("common.actions") || "Actions"}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const RoleIcon = ROLE_ICONS[user.role] || Eye;
            const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.viewer;
            return (
              <tr key={user.username} className="border-b border-border/50 last:border-0 hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium">{user.display_name || user.username}</p>
                    <p className="text-xs text-text-secondary">@{user.username}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", roleColor)}>
                    <RoleIcon size={12} />
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <span className="text-xs text-text-secondary">
                    {user.allowed_agents?.length
                      ? user.allowed_agents.join(", ")
                      : t("users.allAgents") || "All agents"}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <button
                    type="button"
                    onClick={() => onToggleActive(user)}
                    className="flex items-center gap-1 text-xs"
                  >
                    {user.active !== false ? (
                      <><ToggleRight size={16} className="text-success" /> <span className="text-success">Active</span></>
                    ) : (
                      <><ToggleLeft size={16} className="text-text-secondary" /> <span className="text-text-secondary">Disabled</span></>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(user)}
                      className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-text-secondary"
                      title={t("common.edit")}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(user.username)}
                      className="p-1.5 hover:bg-danger/20 rounded-lg transition-colors text-text-secondary hover:text-danger"
                      title={t("common.delete")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {users.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">
                {t("common.noData") || "No data"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit log table
// ---------------------------------------------------------------------------

function AuditTable({ entries, t }: { entries: AuditEntry[]; t: (key: string) => string }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-text-secondary text-left">
            <th className="px-4 py-3 font-medium">{t("users.time") || "Time"}</th>
            <th className="px-4 py-3 font-medium">{t("users.user") || "User"}</th>
            <th className="px-4 py-3 font-medium">{t("users.action") || "Action"}</th>
            <th className="px-4 py-3 font-medium hidden sm:table-cell">{t("users.target") || "Target"}</th>
            <th className="px-4 py-3 font-medium hidden md:table-cell">{t("users.details") || "Details"}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <tr key={`${entry.ts}-${i}`} className="border-b border-border/50 last:border-0 hover:bg-white/[0.02]">
              <td className="px-4 py-2.5 text-xs text-text-secondary whitespace-nowrap">{entry.ts}</td>
              <td className="px-4 py-2.5 font-medium">{entry.user}</td>
              <td className="px-4 py-2.5">
                <span className={cn(
                  "px-2 py-0.5 rounded text-xs font-medium",
                  entry.action.includes("delete") ? "bg-danger/10 text-danger" :
                  entry.action.includes("create") ? "bg-success/10 text-success" :
                  entry.action === "login" ? "bg-brand-400/10 text-brand-400" :
                  "bg-warning/10 text-warning",
                )}>
                  {entry.action}
                </span>
              </td>
              <td className="px-4 py-2.5 hidden sm:table-cell text-text-secondary">{entry.target || "-"}</td>
              <td className="px-4 py-2.5 hidden md:table-cell text-xs text-text-secondary">{entry.details || "-"}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">
                {t("common.noData") || "No data"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User form dialog (create / edit)
// ---------------------------------------------------------------------------

function UserFormDialog({
  user,
  agents,
  onClose,
  onSaved,
  t,
}: {
  user: UserInfo | null;
  agents: string[];
  onClose: () => void;
  onSaved: () => void;
  t: (key: string) => string;
}) {
  const toast = useToast();
  const isEdit = !!user;
  const [username, setUsername] = useState(user?.username || "");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [role, setRole] = useState<string>(user?.role || "viewer");
  const [allowedAgents, setAllowedAgents] = useState<string[]>(user?.allowed_agents || []);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        const updates: Record<string, unknown> = {
          role,
          display_name: displayName,
          allowed_agents: allowedAgents,
        };
        if (password) updates.password = password;
        await SygenAPI.updateUser(user!.username, updates);
        toast.success(t("toast.updated"));
      } else {
        if (!username.trim() || !password) {
          toast.error("Username and password are required");
          setSaving(false);
          return;
        }
        await SygenAPI.createUser({
          username: username.trim(),
          password,
          role,
          display_name: displayName || username.trim(),
          allowed_agents: allowedAgents,
        });
        toast.success(t("toast.created"));
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  const toggleAgent = (name: string) => {
    setAllowedAgents((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold flex items-center gap-2">
            <KeyRound size={16} />
            {isEdit ? (t("users.editUser") || "Edit User") : (t("users.addUser") || "Add User")}
          </h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-white/10 rounded">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Username */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">{t("users.username") || "Username"}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isEdit}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              placeholder="john_doe"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              {isEdit ? (t("users.newPassword") || "New Password (leave empty to keep)") : (t("users.password") || "Password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm"
              placeholder={isEdit ? "Leave empty to keep current" : "Min 4 characters"}
            />
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">{t("users.displayName") || "Display Name"}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="John Doe"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">{t("users.role") || "Role"}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="admin">Admin</option>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
            </select>
            <p className="text-xs text-text-secondary mt-1">
              {role === "admin" && "Full access to everything"}
              {role === "operator" && "Read + run tasks, cron, webhooks"}
              {role === "viewer" && "Read-only access"}
            </p>
          </div>

          {/* Allowed Agents */}
          {agents.length > 0 && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">
                {t("users.allowedAgents") || "Allowed Agents"}
              </label>
              <p className="text-xs text-text-secondary mb-2">
                {t("users.allowedAgentsHint") || "Leave all unchecked for access to all agents"}
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {agents.map((name) => (
                  <label key={name} className="flex items-center gap-2 px-2 py-1 hover:bg-white/5 rounded cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={allowedAgents.includes(name)}
                      onChange={() => toggleAgent(name)}
                      className="rounded border-border"
                    />
                    {name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-lg hover:bg-white/10 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-sm rounded-lg transition-colors disabled:opacity-40"
            >
              {saving ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
