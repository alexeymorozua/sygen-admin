"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import {
  NOTIFICATION_PREF_KEY,
  getPermission,
  isEnabled,
  isSupported,
  requestPermission,
  setEnabled,
} from "@/lib/notifications";
import { useTranslation } from "@/lib/i18n";

type PermState = NotificationPermission | "unsupported";

export default function NotificationToggle() {
  const { t } = useTranslation();
  const [permission, setPermission] = useState<PermState>("default");
  const [enabled, setEnabledState] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    const perm = getPermission();
    setPermission(perm);
    setEnabledState(isEnabled());
  }, []);

  useEffect(() => {
    refresh();
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent) => {
      if (e.key === NOTIFICATION_PREF_KEY) refresh();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [refresh]);

  const handleClick = useCallback(async () => {
    if (!isSupported()) return;
    if (busy) return;
    setBusy(true);
    try {
      if (permission === "default") {
        const result = await requestPermission();
        setPermission(result);
        if (result === "granted") {
          setEnabled(true);
          setEnabledState(true);
        }
        return;
      }
      if (permission === "granted") {
        const next = !enabled;
        setEnabled(next);
        setEnabledState(next);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, enabled, permission]);

  if (permission === "unsupported") {
    return (
      <div
        className="flex items-center gap-3 w-full px-6 py-3 text-sm text-text-secondary opacity-60"
        aria-label={t("notifications.desktop.unsupported")}
      >
        <BellOff size={16} />
        {t("notifications.desktop.unsupported")}
      </div>
    );
  }

  const denied = permission === "denied";
  const on = permission === "granted" && enabled;
  const Icon = on ? BellRing : Bell;
  const label = denied
    ? t("notifications.desktop.blocked")
    : on
      ? t("notifications.desktop.on")
      : permission === "granted"
        ? t("notifications.desktop.off")
        : t("notifications.desktop.enable");

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || denied}
      className="flex items-center gap-3 w-full px-6 py-3 text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      aria-label={label}
      title={denied ? t("notifications.desktop.blockedHint") : undefined}
    >
      <Icon size={16} className={on ? "text-brand-400" : undefined} />
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}
