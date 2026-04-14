"use client";

import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-12 ${className || ""}`}>
      <Loader2 size={24} className="animate-spin text-text-secondary" />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle size={32} className="text-danger mb-3" />
      <p className="text-sm text-text-secondary mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border rounded-lg text-sm hover:bg-white/5 transition-colors"
        >
          <RefreshCw size={14} />
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-5 animate-pulse">
      <div className="h-4 bg-bg-primary rounded w-1/3 mb-3" />
      <div className="h-3 bg-bg-primary rounded w-2/3 mb-2" />
      <div className="h-3 bg-bg-primary rounded w-1/2" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 animate-pulse">
            <div className="h-4 bg-bg-primary rounded flex-1" />
            <div className="h-4 bg-bg-primary rounded w-20" />
            <div className="h-4 bg-bg-primary rounded w-16" />
            <div className="h-4 bg-bg-primary rounded w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
