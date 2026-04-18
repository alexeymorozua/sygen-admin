"use client";

import { useState } from "react";
import { Shield, Check, Copy, AlertCircle, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { SygenAPI } from "@/lib/api";
import type { TwoFactorSetupResponse } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import { useTranslation } from "@/lib/i18n";

export default function TwoFactorSection() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const { success } = useToast();
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
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
    if (disableCode.length !== 6 || !disablePassword) return;
    setLoading(true);
    setError("");
    try {
      await SygenAPI.disable2FA(disableCode, disablePassword);
      setDisableCode("");
      setDisablePassword("");
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
    <div className="bg-bg-card border border-border rounded-xl p-5">
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
              {t("auth.disableHint") || "Enter your password and current 2FA code to disable"}
            </p>
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder={t("auth.password") || "Password"}
              autoComplete="current-password"
              className="w-64 bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
            />
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
                disabled={loading || disableCode.length !== 6 || !disablePassword}
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
          <div className="flex justify-center py-4">
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value={setupData.otpauth_uri} size={180} />
            </div>
          </div>
          <div className="bg-bg-primary border border-border rounded-lg p-4">
            <p className="text-sm text-text-secondary mb-2">{t("auth.secretKey") || "Secret Key"}</p>
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
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
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
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
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
