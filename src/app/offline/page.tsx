"use client";

import { WifiOff, RefreshCw } from "lucide-react";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-bg-primary text-text-primary">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-bg-card border border-border">
          <WifiOff size={36} className="text-text-secondary" />
        </div>
        <h1 className="text-2xl font-semibold mb-2">Нет соединения</h1>
        <p className="text-text-secondary mb-8">
          Похоже, вы офлайн. Проверьте подключение и попробуйте снова.
        </p>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-2 text-sm font-medium text-brand-400 hover:bg-brand-500/20 transition-colors"
        >
          <RefreshCw size={16} />
          Повторить
        </button>
      </div>
    </div>
  );
}
