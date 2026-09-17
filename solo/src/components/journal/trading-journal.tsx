"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  api,
  type UserMt5HistoryItem,
  type WalletLedgerItem,
} from "@/lib/api";
import { DailyIncomeJournal } from "@/components/wallet/daily-income-journal";
import { DerivCryptoWallets } from "@/components/deriv/deriv-crypto-wallets";
import { fmtMt5Price, Mt5Pnl } from "@/components/mt5/mt5-ui";
import { cn, formatCurrency } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type SourceFilter = "all" | "mt5" | "deriv" | "wallet";

type DerivRow = {
  id: string;
  when: string;
  label: string;
  amount: number;
  currency: string;
};

function isLocalToday(iso: string) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return false;
  const now = new Date();
  return (
    t.getFullYear() === now.getFullYear() &&
    t.getMonth() === now.getMonth() &&
    t.getDate() === now.getDate()
  );
}

function parseDerivStatement(rows: Record<string, unknown>[]): DerivRow[] {
  return rows.map((row, i) => {
    const id = String(row.transaction_id ?? row.transactionId ?? i);
    const when = String(
      row.transaction_time ?? row.transactionTime ?? row.date ?? "",
    );
    const label = String(
      row.action_type ?? row.actionType ?? row.longcode ?? "Deriv",
    );
    const amount = Number(row.amount ?? 0);
    const currency = String(row.currency ?? "");
    return { id, when, label, amount, currency };
  });
}

export function TradingJournal() {
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [mt5, setMt5] = useState<UserMt5HistoryItem[]>([]);
  const [walletTxs, setWalletTxs] = useState<WalletLedgerItem[]>([]);
  const [deriv, setDeriv] = useState<DerivRow[]>([]);
  const [derivConnected, setDerivConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [mt5Res, walletRes, derivStatus] = await Promise.allSettled([
      api.signals.mt5History(false, 90),
      api.wallet.transactions(80, 0),
      api.deriv.status(),
    ]);
    if (mt5Res.status === "fulfilled") setMt5(mt5Res.value.items);
    else setMt5([]);
    if (walletRes.status === "fulfilled") setWalletTxs(walletRes.value.items);
    else setWalletTxs([]);
    const connected =
      derivStatus.status === "fulfilled" && derivStatus.value.connected;
    setDerivConnected(connected);
    if (connected) {
      try {
        const trades = await api.deriv.trades();
        setDeriv(parseDerivStatement(trades.statement));
      } catch {
        setDeriv([]);
      }
    } else {
      setDeriv([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mt5Today = useMemo(
    () => mt5.filter((row) => isLocalToday(row.closedAt)),
    [mt5],
  );
  const mt5Wins = mt5Today.filter((r) => (r.pnl ?? 0) > 0).length;
  const mt5Pnl = mt5Today.reduce((s, r) => s + (r.pnl ?? 0), 0);
  const derivToday = useMemo(
    () =>
      deriv.filter((row) => (row.when ? isLocalToday(row.when) : true)),
    [deriv],
  );
  const derivPnl = derivToday.reduce((s, r) => s + r.amount, 0);
  const walletToday = useMemo(
    () => walletTxs.filter((tx) => isLocalToday(tx.createdAt)),
    [walletTxs],
  );
  const walletTodayNet = walletToday.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="MT5 today"
          value={fmtMt5Price(mt5Pnl)}
          hint={`${mt5Today.length} closes · ${mt5Wins} wins`}
          tone={mt5Pnl}
        />
        <Stat
          label="Deriv statement"
          value={derivConnected ? String(derivPnl.toFixed(2)) : "—"}
          hint={
            derivConnected
              ? `${derivToday.length} rows`
              : "Connect a token in Settings"
          }
          tone={derivConnected ? derivPnl : 0}
        />
        <Stat
          label="Platform wallet today"
          value={formatCurrency(walletTodayNet)}
          hint={`${walletToday.length} ledger rows`}
          tone={walletTodayNet}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "All sources"],
            ["mt5", "MT5"],
            ["deriv", "Deriv"],
            ["wallet", "Platform wallet"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              filter === id
                ? "bg-primary text-white"
                : "bg-navy text-muted hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      )}

      {(filter === "all" || filter === "mt5") && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">MT5 closes</h2>
            <Link href="/mt5" className="text-xs text-primary hover:underline">
              Open trading
            </Link>
          </div>
          {mt5.length === 0 ? (
            <p className="text-sm text-muted">
              No MetaAPI history yet. Connect the Trading account first.
            </p>
          ) : (
            <ul className="max-h-[22rem] space-y-1.5 overflow-y-auto">
              {mt5.slice(0, 40).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{row.symbol}</p>
                    <p className="text-xs text-muted">
                      {row.direction} ·{" "}
                      {new Date(row.closedAt).toLocaleString()}
                    </p>
                  </div>
                  <Mt5Pnl value={row.pnl ?? 0} className="text-sm" />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(filter === "all" || filter === "deriv") && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Deriv activity</h2>
          <DerivCryptoWallets />
          {deriv.length === 0 ? (
            <p className="text-sm text-muted">
              {derivConnected
                ? "No Deriv statement rows yet."
                : "Paste a Deriv PAT in Settings to load the statement."}
            </p>
          ) : (
            <ul className="max-h-[18rem] space-y-1.5 overflow-y-auto">
              {deriv.slice(0, 30).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {row.label}
                    </p>
                    <p className="text-xs text-muted">
                      {row.when
                        ? new Date(row.when).toLocaleString()
                        : "—"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "tabular-nums",
                      row.amount > 0
                        ? "text-success"
                        : row.amount < 0
                          ? "text-danger"
                          : "text-muted",
                    )}
                  >
                    {row.amount} {row.currency}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(filter === "all" || filter === "wallet") && (
        <section className="space-y-3">
          <DailyIncomeJournal hideTitle />
          <div>
            <h2 className="mb-2 text-lg font-semibold text-white">
              Recent platform ledger
            </h2>
            {walletTxs.length === 0 ? (
              <p className="text-sm text-muted">No platform wallet rows yet.</p>
            ) : (
              <ul className="max-h-[18rem] space-y-1.5 overflow-y-auto">
                {walletTxs.slice(0, 30).map((tx) => (
                  <li
                    key={tx.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-foreground">
                        {tx.description || tx.type.replaceAll("_", " ")}
                      </p>
                      <p className="text-xs text-muted">
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "tabular-nums",
                        tx.amount > 0
                          ? "text-success"
                          : tx.amount < 0
                            ? "text-danger"
                            : "text-muted",
                      )}
                    >
                      {formatCurrency(tx.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          tone > 0 ? "text-success" : tone < 0 ? "text-danger" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
    </div>
  );
}
