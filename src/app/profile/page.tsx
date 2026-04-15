"use client";

import { useState } from "react";
import { User, Shield, ShieldCheck, Eye, KeyRound, Save } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { SygenAPI } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const RoleIcon = ROLE_ICONS[user.role] || Eye;
  const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.viewer;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword && newPassword !== confirmPassword) {
      toast.error(t("profile.passwordMismatch"));
      return;
    }

    const payload: Record<string, string> = {};
    if (displayName !== user.display_name) payload.display_name = displayName;
    if (oldPassword && newPassword) {
      payload.old_password = oldPassword;
      payload.new_password = newPassword;
    }

    if (Object.keys(payload).length === 0) return;

    setSaving(true);
    try {
      const updated = await SygenAPI.updateProfile(payload);
      refreshUser(updated);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(t("profile.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <User size={22} />
        {t("profile.title")}
      </h1>

      <form onSubmit={handleSave} className="space-y-6">
        {/* User info card */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          {/* Username (read-only) */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              {t("users.username")}
            </label>
            <p className="text-sm font-mono text-text-secondary">@{user.username}</p>
          </div>

          {/* Role (read-only) */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              {t("users.role")}
            </label>
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                roleColor,
              )}
            >
              <RoleIcon size={12} />
              {user.role}
            </span>
          </div>

          {/* Display Name (editable) */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">
              {t("users.displayName")}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Password change */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <KeyRound size={14} />
            {t("profile.changePassword")}
          </h3>

          <div>
            <label className="block text-xs text-text-secondary mb-1.5">
              {t("profile.currentPassword")}
            </label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              autoComplete="current-password"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1.5">
              {t("profile.newPassword")}
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1.5">
              {t("profile.confirmPassword")}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={cn(
                "w-full bg-bg-primary border rounded-lg px-3 py-2 text-sm focus:outline-none",
                confirmPassword && newPassword !== confirmPassword
                  ? "border-danger focus:border-danger"
                  : "border-border focus:border-accent",
              )}
              autoComplete="new-password"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-danger mt-1">{t("profile.passwordMismatch")}</p>
            )}
          </div>
        </div>

        {/* Save button */}
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-text-primary text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </form>
    </div>
  );
}
