"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Check, Circle } from "lucide-react";
import { useServer } from "@/context/ServerContext";
import { checkServerHealth } from "@/lib/servers";
import type { SygenServer } from "@/lib/servers";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import Link from "next/link";

export default function ServerSwitcher() {
  const { servers, activeServer, switchServer } = useServer();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [healthMap, setHealthMap] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);

  // Check health for all servers
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const results: Record<string, boolean> = {};
      await Promise.all(
        servers.map(async (s) => {
          const { online } = await checkServerHealth(s);
          results[s.id] = online;
        })
      );
      if (!cancelled) setHealthMap(results);
    }
    check();
    const interval = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [servers]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (server: SygenServer) => {
    switchServer(server.id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative px-3 pb-2">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          "bg-white/5 hover:bg-white/10 border border-border"
        )}
      >
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: activeServer.color }}
        />
        <span className="truncate flex-1 text-left">{activeServer.name}</span>
        <ChevronDown
          size={14}
          className={cn("text-text-secondary transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          {servers.map((server) => (
            <button
              key={server.id}
              onClick={() => handleSelect(server)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-white/5",
                server.id === activeServer.id && "bg-accent/50"
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: server.color }}
              />
              <span className="truncate flex-1 text-left">{server.name}</span>
              <Circle
                size={8}
                className={cn(
                  "shrink-0",
                  healthMap[server.id] === true
                    ? "fill-success text-success"
                    : healthMap[server.id] === false
                      ? "fill-danger text-danger"
                      : "fill-text-secondary text-text-secondary"
                )}
              />
              {server.id === activeServer.id && (
                <Check size={14} className="text-success shrink-0" />
              )}
            </button>
          ))}

          <Link
            href="/servers"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 border-t border-border transition-colors"
          >
            <Plus size={14} />
            {t('connection.manageServers')}
          </Link>
        </div>
      )}
    </div>
  );
}
