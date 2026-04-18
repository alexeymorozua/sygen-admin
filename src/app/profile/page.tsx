"use client";

import { useState, useRef } from "react";
import { User, Shield, ShieldCheck, Eye, KeyRound, Save, Camera, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { SygenAPI } from "@/lib/api";
import { useAuthedImage } from "@/lib/hooks";
import { useToast } from "@/components/Toast";
import { RefreshButton } from "@/components/RefreshButton";
import TwoFactorSection from "@/components/TwoFactorSection";
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
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const me = await SygenAPI.getMe();
      refreshUser(me);
      setDisplayName(me.display_name || "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reload profile");
    } finally {
      setRefreshing(false);
    }
  };

  const avatarApiUrl = user?.avatar ? SygenAPI.getAvatarUrl(user.avatar) : null;
  const avatarUrl = useAuthedImage(avatarApiUrl);

  if (!user) return null;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingAvatar(true);
    try {
      const { path } = await SygenAPI.uploadAvatar(file);
      refreshUser({ ...user, avatar: path });
      toast.success(t("profile.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarDelete = async () => {
    setUploadingAvatar(true);
    try {
      const updated = await SygenAPI.updateProfile({ avatar: "" });
      refreshUser({ ...user, avatar: "" });
      toast.success(t("profile.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const RoleIcon = ROLE_ICONS[user.role] || Eye;
  const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.viewer;

  const MIN_PASSWORD_LENGTH = 8;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword && newPassword !== confirmPassword) {
      toast.error(t("profile.passwordMismatch"));
      return;
    }

    if (newPassword && !oldPassword) {
      toast.error(t("profile.currentPassword"));
      return;
    }

    if (newPassword && newPassword.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <User size={22} />
          {t("profile.title")}
        </h1>
        <RefreshButton loading={refreshing} onClick={handleRefresh} />
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-5">
          <div className="relative">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="relative w-20 h-20 rounded-full shrink-0 overflow-hidden border-2 border-border hover:border-accent transition-colors group"
            >
              {avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-bg-card flex items-center justify-center">
                  <User size={32} className="text-text-secondary" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar ? (
                  <Loader2 size={20} className="text-white animate-spin" />
                ) : (
                  <Camera size={20} className="text-white" />
                )}
              </div>
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={handleAvatarDelete}
                disabled={uploadingAvatar}
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-danger hover:bg-red-600 text-white flex items-center justify-center transition-colors disabled:opacity-50"
                title={t("common.delete")}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <div>
            <p className="text-sm font-medium">{user.display_name || user.username}</p>
            <p className="text-xs text-text-secondary">@{user.username}</p>
          </div>
        </div>

        {/* User info card */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          {/* Username (read-only) */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              {t("users.username")}
            </label>
            <p className="text-sm font-mono text-text-secondary">@{user.username}</p>
          </div>

          {/* Role (read-only) */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
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
            <label className="block text-sm text-text-secondary mb-1.5">
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

        {/* 2FA (before password for security emphasis) */}
        <TwoFactorSection />

        {/* Password change */}
        <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <KeyRound size={14} />
            {t("profile.changePassword")}
          </h3>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
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
            <label className="block text-sm text-text-secondary mb-1.5">
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
            <label className="block text-sm text-text-secondary mb-1.5">
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
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </form>
    </div>
  );
}
