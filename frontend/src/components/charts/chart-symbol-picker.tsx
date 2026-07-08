"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  CHART_SYMBOL_CATALOG,
  normalizeSymbolKey,
  resolveChartSymbol,
  searchChartSymbols,
} from "@/components/charts/chart-symbol-catalog";
import { cn } from "@/lib/utils";
import { Plus, Search, X } from "lucide-react";

type Props = {
  selectedSymbol: string;
  watchlist: string[];
  onSelect: (symbol: string) => void;
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  compact?: boolean;
  className?: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
};

export function ChartSymbolPicker({
  selectedSymbol,
  watchlist,
  onSelect,
  onAdd,
  onRemove,
  compact = false,
  className,
  searchInputRef,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const tabs = useMemo(() => {
    const set = new Set<string>(watchlist);
    set.add(selectedSymbol);
    return Array.from(set);
  }, [watchlist, selectedSymbol]);

  const results = useMemo(() => searchChartSymbols(query, 10), [query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function addFromQuery() {
    const sym = resolveChartSymbol(query);
    if (!sym) return;
    onAdd(sym);
    onSelect(sym);
    setQuery("");
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex min-w-0",
        compact ? "flex-1 flex-row items-center gap-2" : "flex-1 flex-col gap-2",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5",
          compact ? "min-w-0 flex-1 overflow-x-auto" : "flex-wrap",
        )}
      >
        {tabs.map((sym) => (
          <button
            key={sym}
            type="button"
            onClick={() => onSelect(sym)}
            className={cn(
              "group flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
              sym === selectedSymbol
                ? "border-primary bg-primary/15 text-primary"
                : "border-[var(--mt5-divider)] text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)]",
            )}
          >
            {sym}
            {watchlist.includes(sym) && sym !== selectedSymbol && !compact && (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Remove ${sym}`}
                className="rounded-full p-0.5 opacity-0 transition-opacity hover:bg-[var(--mt5-divider)] group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(sym);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    onRemove(sym);
                  }
                }}
              >
                <X className="h-2.5 w-2.5" />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className={cn("relative flex gap-1", compact ? "w-44 shrink-0" : "w-full")}>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--mt5-muted)]" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addFromQuery();
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder={compact ? "Add pair" : "Search or add pair"}
            className="w-full rounded border border-[var(--mt5-divider)] bg-[var(--mt5-bg)] py-1.5 pl-7 pr-2 text-xs text-[var(--mt5-text)] placeholder:text-[var(--mt5-muted)]"
          />
        </div>
        {!compact && (
          <button
            type="button"
            onClick={addFromQuery}
            disabled={!query.trim()}
            className="flex shrink-0 items-center gap-1 rounded border border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-2.5 text-[11px] font-semibold text-primary disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        )}

        {open && (query.trim() || results.length > 0) && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 w-56 overflow-y-auto rounded-lg border border-[var(--mt5-divider)] bg-[var(--mt5-surface)] py-1 shadow-lg">
            {(query.trim() ? results : CHART_SYMBOL_CATALOG.slice(0, 8)).map(
              (entry) => {
                const inList = watchlist.includes(entry.symbol);
                return (
                  <button
                    key={entry.symbol}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--mt5-row-hover)]"
                    onClick={() => {
                      if (!inList) onAdd(entry.symbol);
                      onSelect(entry.symbol);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <span>
                      <strong className="text-[var(--mt5-text)]">{entry.symbol}</strong>
                      <span className="ml-2 text-[var(--mt5-muted)]">{entry.label}</span>
                    </span>
                  </button>
                );
              },
            )}
            {query.trim() &&
              !results.some(
                (r) => normalizeSymbolKey(r.symbol) === normalizeSymbolKey(query),
              ) && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 border-t border-[var(--mt5-divider)] px-3 py-2 text-left text-xs text-primary hover:bg-[var(--mt5-row-hover)]"
                  onClick={addFromQuery}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add &quot;{resolveChartSymbol(query)}&quot;
                </button>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
