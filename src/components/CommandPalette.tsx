"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  Bot,
  MessageSquare,
  Clock,
  Webhook,
  ListTodo,
  Brain,
  Server,
  Settings,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fuzzyFilter, type SearchItem } from "@/lib/fuzzySearch";
import { SygenAPI } from "@/lib/api";

const PAGE_ITEMS: SearchItem[] = [
  { id: "page-dashboard", label: "Dashboard", type: "page", href: "/" },
  { id: "page-agents", label: "Agents", type: "page", href: "/agents" },
  { id: "page-chat", label: "Chat", type: "page", href: "/chat" },
  { id: "page-cron", label: "Cron Jobs", type: "page", href: "/cron" },
  { id: "page-webhooks", label: "Webhooks", type: "page", href: "/webhooks" },
  { id: "page-tasks", label: "Tasks", type: "page", href: "/tasks" },
  { id: "page-memory", label: "Memory", type: "page", href: "/memory" },
  { id: "page-servers", label: "Servers", type: "page", href: "/servers" },
  { id: "page-settings", label: "Settings", type: "page", href: "/settings" },
];

const TYPE_ICONS: Record<SearchItem["type"], typeof Search> = {
  page: FileText,
  agent: Bot,
  cron: Clock,
  webhook: Webhook,
  task: ListTodo,
};

const TYPE_COLORS: Record<SearchItem["type"], string> = {
  page: "text-text-secondary",
  agent: "text-blue-400",
  cron: "text-yellow-400",
  webhook: "text-purple-400",
  task: "text-green-400",
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>(PAGE_ITEMS);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Load dynamic items on open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadItems() {
      const dynamicItems: SearchItem[] = [...PAGE_ITEMS];

      try {
        const [agents, crons, webhooks, tasks] = await Promise.allSettled([
          SygenAPI.getAgents(),
          SygenAPI.getCronJobs(),
          SygenAPI.getWebhooks(),
          SygenAPI.getTasks(),
        ]);

        if (!cancelled && agents.status === "fulfilled") {
          for (const a of agents.value) {
            dynamicItems.push({
              id: `agent-${a.id}`,
              label: a.displayName || a.name,
              type: "agent",
              href: "/agents",
            });
          }
        }
        if (!cancelled && crons.status === "fulfilled") {
          for (const c of crons.value) {
            dynamicItems.push({
              id: `cron-${c.id}`,
              label: c.name,
              type: "cron",
              href: "/cron",
            });
          }
        }
        if (!cancelled && webhooks.status === "fulfilled") {
          for (const w of webhooks.value) {
            dynamicItems.push({
              id: `webhook-${w.id}`,
              label: w.name,
              type: "webhook",
              href: "/webhooks",
            });
          }
        }
        if (!cancelled && tasks.status === "fulfilled") {
          for (const t of tasks.value) {
            dynamicItems.push({
              id: `task-${t.id}`,
              label: t.name,
              type: "task",
              href: "/tasks",
            });
          }
        }
      } catch {
        // Use page items only on error
      }

      if (!cancelled) {
        setItems(dynamicItems);
      }
    }

    loadItems();
    return () => { cancelled = true; };
  }, [open]);

  // Keyboard shortcut to open
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const filtered = fuzzyFilter(items, query);

  const handleSelect = useCallback(
    (item: SearchItem) => {
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector("[data-active='true']");
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[activeIndex]) {
            handleSelect(filtered[activeIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          break;
      }
    },
    [filtered, activeIndex, handleSelect],
  );

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-lg mx-4 bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search size={18} className="text-text-secondary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search agents, cron jobs, webhooks, tasks, pages..."
            className="w-full py-3.5 bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] text-text-secondary border border-border rounded font-mono shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-text-secondary">
              No results found
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = TYPE_ICONS[item.type];
              return (
                <button
                  type="button"
                  key={item.id}
                  data-active={idx === activeIndex}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left transition-colors",
                    idx === activeIndex
                      ? "bg-accent/40 text-text-primary"
                      : "text-text-secondary hover:bg-white/5",
                  )}
                >
                  <Icon size={16} className={cn("shrink-0", TYPE_COLORS[item.type])} />
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="text-[10px] uppercase tracking-wider opacity-50">{item.type}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border text-[10px] text-text-secondary">
          <span className="flex items-center gap-1">
            <kbd className="px-1 border border-border rounded font-mono">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 border border-border rounded font-mono">↵</kbd> open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 border border-border rounded font-mono">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
