"use client";

import { useState, useRef, useEffect } from "react";
import { KeyRound, AlertCircle, Loader2, ArrowLeft, Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";

type LoginMode = "credentials" | "token";
type LoginStep = "credentials" | "2fa";

export default function LoginPage() {
  const { login, login2FA } = useAuth();
  const { t } = useTranslation();
  const [mode, setMode] = useState<LoginMode>("credentials");
  const [step, setStep] = useState<LoginStep>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const totpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "2fa" && totpInputRef.current) {
      totpInputRef.current.focus();
    }
  }, [step]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "credentials") {
        if (!username.trim() || !password) return;
        const response = await login({ username: username.trim(), password });
        if (response.requires_2fa && response.temp_token) {
          setTempToken(response.temp_token);
          setStep("2fa");
          setTotpCode("");
        }
      } else {
        if (!token.trim()) return;
        await login({ token: token.trim() });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.failed"));
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) return;
    setError("");
    setLoading(true);
    try {
      await login2FA(tempToken, totpCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.failed"));
      setTotpCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleTotpChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setTotpCode(digits);
    // Auto-submit when 6 digits entered
    if (digits.length === 6) {
      setTimeout(() => {
        const form = totpInputRef.current?.closest("form");
        if (form) form.requestSubmit();
      }, 100);
    }
  };

  const handleBackToCredentials = () => {
    setStep("credentials");
    setTempToken("");
    setTotpCode("");
    setError("");
  };

  const canSubmit =
    mode === "credentials" ? !!(username.trim() && password) : !!token.trim();

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-sm">
        <div className="bg-bg-card border border-border rounded-2xl p-8">
          {step === "credentials" ? (
            <>
              <div className="flex items-center justify-center w-12 h-12 bg-accent/20 rounded-xl mb-6 mx-auto">
                <KeyRound size={24} className="text-brand-400" />
              </div>
              <h1 className="text-xl font-bold text-center mb-1">{t("login.title")}</h1>
              <p className="text-sm text-text-secondary text-center mb-6">
                {t("login.subtitle")}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "credentials" ? (
                  <>
                    <div>
                      <label className="block text-sm text-text-secondary mb-1.5">
                        {t("login.username") || "Username"}
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={t("login.usernamePlaceholder") || "Enter username"}
                        autoFocus
                        autoComplete="username"
                        className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-text-secondary mb-1.5">
                        {t("login.password") || "Password"}
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t("login.passwordPlaceholder") || "Enter password"}
                        autoComplete="current-password"
                        className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-sm text-text-secondary mb-1.5">
                      {t("login.tokenLabel")}
                    </label>
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder={t("login.tokenPlaceholder")}
                      autoFocus
                      className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent"
                    />
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 rounded-lg px-3 py-2">
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !canSubmit}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loading ? t("login.authenticating") : t("login.submit")}
                </button>
              </form>

              {/* Token login removed for security — admin is publicly accessible */}
            </>
          ) : (
            <>
              {/* 2FA Step */}
              <div className="flex items-center justify-center w-12 h-12 bg-brand-500/20 rounded-xl mb-6 mx-auto">
                <Shield size={24} className="text-brand-400" />
              </div>
              <h1 className="text-xl font-bold text-center mb-1">
                {t("auth.twoFactor") || "Two-Factor Authentication"}
              </h1>
              <p className="text-sm text-text-secondary text-center mb-6">
                {t("auth.enterCode") || "Enter the 6-digit code from your authenticator app"}
              </p>

              <form onSubmit={handle2FASubmit} className="space-y-4">
                <div>
                  <input
                    ref={totpInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={totpCode}
                    onChange={(e) => handleTotpChange(e.target.value)}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-3 text-center text-2xl font-mono tracking-[0.5em] text-text-primary placeholder:text-text-secondary/30 focus:outline-none focus:border-accent"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 rounded-lg px-3 py-2">
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || totpCode.length !== 6}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loading ? t("login.authenticating") : t("login.submit")}
                </button>
              </form>

              <button
                type="button"
                onClick={handleBackToCredentials}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-text-secondary hover:text-text-primary mt-4 transition-colors"
              >
                <ArrowLeft size={12} />
                {t("common.back") || "Back"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
