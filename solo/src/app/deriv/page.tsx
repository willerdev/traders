"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type DerivAccount } from "@/lib/api";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DerivCryptoWallets } from "@/components/deriv/deriv-crypto-wallets";
import { useAuthStore } from "@/stores/auth";
import { canManageSoloTrades } from "@/lib/solo-admin";

function money(n: number, currency: string) {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

function contractId(row: Record<string, unknown>): string | null {
  const id = row.contract_id ?? row.contractId;
  if (id == null) return null;
  return String(id);
}

export default function DerivPage() {
  const { ready } = useRequireAuth();
  const canManage = canManageSoloTrades(useAuthStore((s) => s.user));
  const [connected, setConnected] = useState(false);
  const [wallet, setWallet] = useState<DerivAccount | null>(null);
  const [mt5, setMt5] = useState<DerivAccount[]>([]);
  const [open, setOpen] = useState<Record<string, unknown>[]>([]);
  const [statement, setStatement] = useState<Record<string, unknown>[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mt5Login, setMt5Login] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const accounts = useMemo(() => {
    const list: DerivAccount[] = [];
    if (wallet?.login) list.push(wallet);
    list.push(...mt5.filter((a) => a.login));
    const extra = mt5Login.trim();
    if (extra && !list.some((a) => a.login === extra)) {
      list.push({
        login: extra,
        kind: "mt5",
        accountType: "mt5",
        currency,
        balance: 0,
      });
    }
    return list;
  }, [wallet, mt5, mt5Login, currency]);

  const refresh = useCallback(async () => {
    setError("");
    const status = await api.deriv.status();
    setConnected(status.connected);
    if (!status.connected) {
      setWallet(null);
      setMt5([]);
      setOpen([]);
      setStatement([]);
      return;
    }
    const [acc, trades] = await Promise.all([
      api.deriv.accounts(),
      api.deriv.trades(),
    ]);
    setWallet(acc.wallet);
    setMt5([
      ...(acc.wallets ?? []).filter((a) => a.login !== acc.wallet?.login),
      ...(acc.options ?? []),
      ...acc.mt5,
    ]);
    setOpen(trades.open);
    setStatement(trades.statement);
    if (acc.wallet?.currency) setCurrency(acc.wallet.currency);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    void refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load Deriv"))
      .finally(() => setLoading(false));
  }, [ready, refresh]);

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.deriv.transfer({
        accountFrom: from,
        accountTo: to,
        amount: Number(amount),
        currency,
      });
      setNotice("Transfer sent.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSell(id: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.deriv.sellContract(id);
      setNotice("Contract close requested.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <AuthLoadingScreen />;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Deriv</h1>
        <p className="mt-1 text-sm text-muted">
          Wallets, Options accounts, transfers, and open Options contracts for
          the PAT in Settings. MT5 logins (MTR…) can be used as a transfer
          destination; Deriv does not list MT5 balances on the PAT API.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {notice && <p className="text-sm text-success">{notice}</p>}

      {!connected ? (
        <Card>
          <CardHeader>
            <CardTitle>Not connected</CardTitle>
            <CardDescription>
              {canManage
                ? "Paste your Deriv API token in Settings, then come back here."
                : "Waiting for the admin to connect Deriv. You will see the same live accounts once it is linked."}
            </CardDescription>
          </CardHeader>
          {canManage ? (
          <CardContent>
            <Link href="/settings">
              <Button>Open Settings</Button>
            </Link>
          </CardContent>
          ) : null}
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {accounts.map((acc) => (
              <Card key={`${acc.kind}-${acc.login}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {acc.kind === "mt5"
                      ? "MT5"
                      : acc.kind === "options"
                        ? "Options"
                        : "Wallet"}{" "}
                    {acc.login}
                  </CardTitle>
                  <CardDescription>{acc.accountType ?? acc.kind}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold text-white">
                    {money(acc.balance, acc.currency)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <DerivCryptoWallets canEdit={canManage} />

          {canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Transfer</CardTitle>
              <CardDescription>
                Move funds wallet↔wallet or wallet↔Options/MT5 (MTR…).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTransfer} className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>From</Label>
                  <select
                    className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-navy px-3 text-sm"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    required
                  >
                    <option value="">Select</option>
                    {accounts.map((a) => (
                      <option key={`from-${a.login}`} value={a.login}>
                        {a.kind} {a.login}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>To</Label>
                  <select
                    className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-navy px-3 text-sm"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    required
                  >
                    <option value="">Select</option>
                    {accounts.map((a) => (
                      <option key={`to-${a.login}`} value={a.login}>
                        {a.kind} {a.login}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Currency</Label>
                  <Input
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    required
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>MT5 login (optional)</Label>
                  <Input
                    placeholder="MTR…"
                    value={mt5Login}
                    onChange={(e) => setMt5Login(e.target.value)}
                  />
                </div>
                <Button className="sm:col-span-2" type="submit" disabled={busy}>
                  Send transfer
                </Button>
              </form>
            </CardContent>
          </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Open contracts</CardTitle>
              <CardDescription>
                {canManage
                  ? "Close stops a Deriv contract (not MT5 stop-loss)."
                  : "Shared live contracts. Only the admin can close them."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {open.length === 0 ? (
                <p className="text-sm text-muted">No open Deriv contracts.</p>
              ) : (
                open.map((row) => {
                  const id = contractId(row);
                  return (
                    <div
                      key={id ?? JSON.stringify(row)}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2"
                    >
                      <p className="text-sm text-white">
                        {String(row.display_name ?? row.contract_type ?? "Contract")}{" "}
                        <span className="text-muted">#{id}</span>
                      </p>
                      {id && canManage && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void handleSell(id)}
                        >
                          Close
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent statement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {statement.length === 0 ? (
                <p className="text-sm text-muted">No recent transactions.</p>
              ) : (
                statement.slice(0, 15).map((row, i) => (
                  <div
                    key={String(row.transaction_id ?? i)}
                    className="flex justify-between text-sm text-muted"
                  >
                    <span>{String(row.action_type ?? row.transaction_id ?? "txn")}</span>
                    <span className="text-white">
                      {String(row.amount ?? "")} {String(row.currency ?? "")}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
