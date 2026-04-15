"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import { Terminal } from "lucide-react";
import { SygenAPI } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CommandItem {
  command: string;
  description: string;
}

export interface CommandMenuHandle {
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

interface CommandMenuProps {
  input: string;
  visible: boolean;
  onSelect: (command: string) => void;
  onClose: () => void;
}

const CommandMenu = forwardRef<CommandMenuHandle, CommandMenuProps>(
  function CommandMenu({ input, visible, onSelect, onClose }, ref) {
    const [commands, setCommands] = useState<CommandItem[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const loadedRef = useRef(false);

    // Load commands once
    useEffect(() => {
      if (loadedRef.current) return;
      loadedRef.current = true;
      SygenAPI.getCommands()
        .then((data) => {
          setCommands([...data.commands, ...data.multiagent]);
        })
        .catch(() => {
          setCommands([
            { command: "/new", description: "New conversation" },
            { command: "/stop", description: "Stop generation" },
            { command: "/model", description: "Switch model" },
            { command: "/status", description: "Session info" },
            { command: "/memory", description: "Show memory" },
            { command: "/compact", description: "Compress context" },
            { command: "/tasks", description: "Background tasks" },
            { command: "/cron", description: "Manage cron jobs" },
            { command: "/help", description: "Show all commands" },
          ]);
        });
    }, []);

    const query = input.startsWith("/") ? input.slice(1).toLowerCase() : "";
    const filtered = visible
      ? commands.filter(
          (c) =>
            c.command.slice(1).toLowerCase().includes(query) ||
            c.description.toLowerCase().includes(query)
        )
      : [];

    useEffect(() => {
      setActiveIndex(0);
    }, [query]);

    useEffect(() => {
      if (!listRef.current) return;
      const el = listRef.current.querySelector("[data-active='true']");
      if (el) el.scrollIntoView({ block: "nearest" });
    }, [activeIndex]);

    useImperativeHandle(
      ref,
      () => ({
        handleKeyDown: (e: React.KeyboardEvent): boolean => {
          if (!visible || filtered.length === 0) return false;

          switch (e.key) {
            case "ArrowDown":
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
              return true;
            case "ArrowUp":
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
              return true;
            case "Tab":
              if (filtered[activeIndex]) {
                e.preventDefault();
                onSelect(filtered[activeIndex].command);
                return true;
              }
              return false;
            case "Enter":
              if (filtered[activeIndex] && !input.includes(" ")) {
                e.preventDefault();
                onSelect(filtered[activeIndex].command);
                return true;
              }
              return false;
            case "Escape":
              e.preventDefault();
              onClose();
              return true;
          }
          return false;
        },
      }),
      [visible, filtered, activeIndex, onSelect, onClose, input]
    );

    if (!visible || filtered.length === 0) return null;

    return (
      <div
        ref={listRef}
        className="absolute bottom-full left-0 right-0 mb-1 bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50"
      >
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <Terminal size={12} className="text-text-secondary" />
          <span className="text-[11px] text-text-secondary font-medium uppercase tracking-wider">
            Commands
          </span>
          <span className="ml-auto text-[10px] text-text-secondary">
            Tab to select
          </span>
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {filtered.map((cmd, idx) => (
            <button
              type="button"
              key={cmd.command}
              data-active={idx === activeIndex}
              onClick={() => onSelect(cmd.command)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2 text-left text-sm transition-colors",
                idx === activeIndex
                  ? "bg-accent/40 text-accent-foreground"
                  : "text-text-secondary hover:bg-white/5"
              )}
            >
              <code className="text-brand-400 font-mono text-xs shrink-0 min-w-[100px]">
                {cmd.command}
              </code>
              <span className="truncate text-xs">{cmd.description}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
);

export default CommandMenu;
