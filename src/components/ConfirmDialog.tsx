"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}

interface DialogState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const confirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        setDialog({ ...options, resolve });
      });
    },
    [],
  );

  const handleClose = useCallback(
    (result: boolean) => {
      dialog?.resolve(result);
      setDialog(null);
    },
    [dialog],
  );

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose(false);
      if (e.key === "Enter") handleClose(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, handleClose]);

  const variant = dialog?.variant ?? "danger";
  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}

      {dialog && (
        <div
          ref={backdropRef}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in"
          onClick={(e) => {
            if (e.target === backdropRef.current) handleClose(false);
          }}
        >
          <div className="w-full max-w-md mx-4 bg-bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-0">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center",
                    variant === "danger"
                      ? "bg-danger/15 text-danger"
                      : "bg-accent/15 text-accent",
                  )}
                >
                  <AlertTriangle size={18} />
                </div>
                <h3 className="text-base font-semibold text-text-primary">
                  {dialog.title ?? t("common.confirm")}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="p-1.5 rounded-lg hover:bg-white/5 text-text-secondary hover:text-text-primary transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <p className="text-sm text-text-secondary leading-relaxed">
                {dialog.message}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 px-5 pb-5">
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-border text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
              >
                {dialog.cancelLabel ?? t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => handleClose(true)}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-xl transition-colors text-white",
                  variant === "danger"
                    ? "bg-danger hover:bg-danger/80"
                    : "bg-accent hover:bg-accent-hover",
                )}
              >
                {dialog.confirmLabel ?? t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
