"use client";

import type { LucideIcon } from "lucide-react";

interface StatusCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  accent?: boolean;
}

export default function StatusCard({ title, value, icon: Icon, trend, accent }: StatusCardProps) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-5 hover:border-accent/50 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-text-secondary text-sm font-medium">{title}</span>
        <div className={`p-2 rounded-lg ${accent ? "bg-danger/20 text-danger" : "bg-accent/30 text-blue-400"}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className="text-3xl font-bold text-text-primary">{value}</div>
      {trend && <p className="text-xs text-text-secondary mt-1">{trend}</p>}
    </div>
  );
}
