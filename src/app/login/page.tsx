"use client";

import { useState } from "react";
import { KeyRound, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";

type LoginMode = "credentials" | "token";

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const [mode, setMode] = useState<LoginMode>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "credentials") {
        if (!username.trim() || !password) return;
        await login({ username: username.trim(), password });
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

  const canSubmit =
    mode === "credentials" ? !!(username.trim() && password) : !!token.trim();

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-sm">
        <div className="bg-bg-card border border-border rounded-2xl p-8">
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
                  <label className="block text-xs text-text-secondary mb-1.5">
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
                  <label className="block text-xs text-text-secondary mb-1.5">
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
                <label className="block text-xs text-text-secondary mb-1.5">
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
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-text-primary text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? t("login.authenticating") : t("login.submit")}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { setMode(mode === "credentials" ? "token" : "credentials"); setError(""); }}
            className="w-full text-center text-xs text-text-secondary hover:text-text-primary mt-4 transition-colors"
          >
            {mode === "credentials"
              ? (t("login.useToken") || "Use API token instead")
              : (t("login.useCredentials") || "Use username & password")}
          </button>
        </div>
      </div>
    </div>
  );
}
