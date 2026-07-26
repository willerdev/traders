"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InvestorRow } from "@/lib/blockchain/types";
import {
  formatWhen,
  GlassCard,
  shortAddr,
  Skeleton,
  TxStatusBadge,
} from "./ui-kit";

type SortKey = keyof InvestorRow;

export function InvestorList({
  rows,
  loading,
}: {
  rows: InvestorRow[];
  loading: boolean;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("joinedAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const filtered = useMemo(() => {
    let list = rows.filter((r) => {
      if (!q) return true;
      const needle = q.toLowerCase();
      return (
        r.wallet.toLowerCase().includes(needle) ||
        r.country.toLowerCase().includes(needle)
      );
    });
    list = [...list].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (typeof av === "number" && typeof bv === "number") {
        return order === "asc" ? av - bv : bv - av;
      }
      return order === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return list;
  }, [rows, q, sort, order]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setOrder("desc");
    }
  };

  if (loading) return <Skeleton className="h-80" />;

  return (
    <GlassCard title="Investor List">
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search wallet or country"
            className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-black/20 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted">
            <tr className="border-b border-white/5">
              {(
                [
                  ["wallet", "Wallet"],
                  ["joinedAt", "Joined"],
                  ["investment", "Investment"],
                  ["rewards", "Rewards"],
                  ["status", "Status"],
                  ["country", "Country"],
                  ["lastActivity", "Last Activity"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th key={key} className="pb-2 pr-3 font-medium">
                  <button
                    type="button"
                    className="hover:text-foreground"
                    onClick={() => toggleSort(key)}
                  >
                    {label}
                    {sort === key ? (order === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.wallet} className="border-b border-white/5 last:border-0">
                <td className="py-2.5 pr-3 font-mono text-xs text-sky-300">
                  {shortAddr(r.wallet, 6)}
                </td>
                <td className="py-2.5 pr-3 text-xs text-muted">
                  {formatWhen(r.joinedAt)}
                </td>
                <td className="py-2.5 pr-3">{r.investment} BNB</td>
                <td className="py-2.5 pr-3">{r.rewards} BNB</td>
                <td className="py-2.5 pr-3">
                  <TxStatusBadge
                    status={
                      r.status === "active"
                        ? "success"
                        : r.status === "banned"
                          ? "failed"
                          : "pending"
                    }
                  />
                </td>
                <td className="py-2.5 pr-3">{r.country}</td>
                <td className="py-2.5 text-xs text-muted">
                  {formatWhen(r.lastActivity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted">{filtered.length} investors</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </Button>
          <span className="px-2 py-1 text-muted">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
