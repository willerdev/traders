"use client";

import { useMemo, useState } from "react";
import { Download, ExternalLink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BlockchainTransaction } from "@/lib/blockchain/types";
import {
  formatWhen,
  GlassCard,
  shortAddr,
  Skeleton,
  TxStatusBadge,
} from "./ui-kit";

export function TransactionHistory({
  rows,
  loading,
}: {
  rows: BlockchainTransaction[];
  loading: boolean;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (type && r.type !== type) return false;
      if (status && r.status !== status) return false;
      if (!q) return true;
      const needle = q.toLowerCase();
      return (
        r.wallet.toLowerCase().includes(needle) ||
        r.hash.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, type, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const exportCsv = () => {
    const header = [
      "Wallet",
      "Type",
      "Amount",
      "Network Fee",
      "Block",
      "Hash",
      "Status",
      "Date",
    ];
    const lines = filtered.map((r) =>
      [
        r.wallet,
        r.type,
        r.amount,
        r.networkFee,
        r.block,
        r.hash,
        r.status,
        r.date,
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "blockchain-transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Skeleton className="h-96" />;

  return (
    <GlassCard
      title="Transaction History"
      action={
        <Button size="sm" variant="secondary" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search wallet or hash"
            className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-black/20 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-[var(--color-border)] bg-black/20 px-3 text-sm"
        >
          <option value="">All types</option>
          <option value="deposit">Deposit</option>
          <option value="withdrawal">Withdrawal</option>
          <option value="claim">Claim</option>
          <option value="compound">Compound</option>
          <option value="referral_bonus">Referral</option>
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-[var(--color-border)] bg-black/20 px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted">
            <tr className="border-b border-white/5">
              <th className="pb-2 pr-3 font-medium">Wallet</th>
              <th className="pb-2 pr-3 font-medium">Type</th>
              <th className="pb-2 pr-3 font-medium">Amount</th>
              <th className="pb-2 pr-3 font-medium">Fee</th>
              <th className="pb-2 pr-3 font-medium">Block</th>
              <th className="pb-2 pr-3 font-medium">Hash</th>
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className="border-b border-white/5 last:border-0">
                <td className="py-2.5 pr-3 font-mono text-xs">{shortAddr(r.wallet)}</td>
                <td className="py-2.5 pr-3 capitalize">{r.type.replace(/_/g, " ")}</td>
                <td className="py-2.5 pr-3">{r.amount}</td>
                <td className="py-2.5 pr-3 text-muted">{r.networkFee}</td>
                <td className="py-2.5 pr-3 font-mono text-xs">{r.block}</td>
                <td className="py-2.5 pr-3">
                  <a
                    href={r.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-primary"
                  >
                    {shortAddr(r.hash, 6)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
                <td className="py-2.5 pr-3">
                  <TxStatusBadge status={r.status} />
                </td>
                <td className="py-2.5 text-xs text-muted">{formatWhen(r.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted">
          {filtered.length} result{filtered.length === 1 ? "" : "s"}
        </span>
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
