"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useHealthStatus } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n";

export default function ConnectionStatus() {
  const connected = useHealthStatus();
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 px-4 py-3 text-xs">
      {connected ? (
        <>
          <Wifi size={14} className="text-success" />
          <span className="text-success">{t('status.connected')}</span>
        </>
      ) : (
        <>
          <WifiOff size={14} className="text-danger" />
          <span className="text-danger">{t('status.disconnected')}</span>
        </>
      )}
    </div>
  );
}
