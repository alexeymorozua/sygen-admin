"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Shared wrapper used by list pages (Tasks/Cron/Webhooks/Files) to host the
 * row-detail panel. Renders as a sticky sidebar on xl+ screens and a
 * bottom-sheet drawer on smaller ones. Close via backdrop, X button, or Escape.
 */
export default function DetailDrawer({
  open,
  title,
  onClose,
  children,
  width = "w-80",
  actions,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  actions?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const header = (
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="flex items-center gap-1">
        {actions}
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-bg-primary rounded-lg"
          aria-label="Close details"
        >
          <X size={16} className="text-text-secondary" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: sticky side panel */}
      <div
        className={`${width} bg-bg-card border border-border rounded-xl p-5 shrink-0 hidden xl:block h-fit sticky top-8`}
      >
        {header}
        {children}
      </div>

      {/* Mobile/tablet: bottom-sheet drawer */}
      <div
        className="xl:hidden fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center bg-black/60"
        onClick={onClose}
      >
        <div
          className="w-full sm:max-w-md bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-xl max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {header}
          {children}
        </div>
      </div>
    </>
  );
}
