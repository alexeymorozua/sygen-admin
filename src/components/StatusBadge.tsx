"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

type BadgeVariant = "active" | "paused" | "error" | "running" | "completed" | "failed" | "cancelled" | "online" | "offline";

const variantStyles: Record<BadgeVariant, string> = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  online: "bg-green-500/20 text-green-400 border-green-500/30",
  running: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  paused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  error: "bg-red-500/20 text-red-400 border-red-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
  cancelled: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  offline: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const dotStyles: Record<BadgeVariant, string> = {
  active: "bg-green-400",
  online: "bg-green-400",
  running: "bg-blue-400 animate-pulse",
  paused: "bg-yellow-400",
  completed: "bg-green-400",
  error: "bg-red-400",
  failed: "bg-red-400",
  cancelled: "bg-gray-400",
  offline: "bg-gray-400",
};

export default function StatusBadge({ status }: { status: BadgeVariant }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
        variantStyles[status]
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", dotStyles[status])} />
      {t(`status.${status}`)}
    </span>
  );
}
