"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface TableSearchProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  debounceMs?: number;
}

export default function TableSearch({
  placeholder,
  onSearch,
  debounceMs = 300,
}: TableSearchProps) {
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearch(value);
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, debounceMs, onSearch]);

  return (
    <div className="relative">
      <Search
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder || t("common.search")}
        className="w-full bg-bg-card border border-border rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:border-accent placeholder:text-text-secondary/50"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-white/10 rounded text-text-secondary"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
