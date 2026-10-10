"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { BinanceWeb3StatusCard } from "@/components/wallet/binance-web3-status-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  api,
  type BinanceWeb3SendResult,
  type BinanceWeb3Status,
  type SavedWithdrawalWallet,
} from "@/lib/api";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Coins,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function BinanceWalletPage() {
  const { ready } = useRequireAuth();
  const [status, setStatus] = useState<BinanceWeb3Status | null>(null);
  const [savedWallets, setSavedWallets] = useState<SavedWithdrawalWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState("");
  const [lastSend, setLastSend] = useState<BinanceWeb3SendResult | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [s, wallets] = await Promise.all([
        api.wallet.binanceWeb3(),
        api.wallet.withdrawalWallets().catch(() => [] as SavedWithdrawalWallet[]),
      ]);
      setStatus(s);
      setSavedWallets(wallets);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, refresh]);

  const bep20Wallets = useMemo(
    () =>
      savedWallets.filter(
        (w) =>
          w.network === "BEP20" &&
          w.address.toLowerCase() !== status?.address?.toLowerCase(),
      ),
    [savedWallets, status?.address],
  );

  useEffect(() => {
    if (!walletId && bep20Wallets[0]) setWalletId(bep20Wallets[0].id);
  }, [bep20Wallets, walletId]);

  if (!ready) return <AuthLoadingScreen />;

  const connected = Boolean(status?.configured && status.address);
  const usdt = status?.usdtBalance ?? 0;
  const bnb = status?.bnbBalance ?? 0;

  async function copyAddress() {
    if (!status?.address) return;
    await navigator.clipboard.writeText(status.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSendErr("");
    setLastSend(null);
    const value = Math.round(Number(amount) * 100) / 100;
    const dest = bep20Wallets.find((w) => w.id === walletId);
    if (!dest) {
      setSendErr("Choose a saved BEP20 address.");
      return;
    }
    if (!Number.isFinite(value) || value < 1) {
      setSendErr("Minimum send is 1 USDT.");
      return;
    }
    if (value > usdt) {
      setSendErr(`Your wallet has ${usdt.toFixed(2)} USDT.`);
      return;
    }
    if (
      !window.confirm(
        `Send ${value.toFixed(2)} USDT on BEP20 to ${dest.label} (${shortAddress(dest.address)})? Blockchain transfers cannot be reversed.`,
      )
    ) {
      return;
    }
    setSending(true);
    try {
      const res = await api.wallet.sendFromBinanceWeb3(value, dest.id);
      setLastSend(res);
      setStatus(res.status);
      setAmount("");
    } catch (err) {
      setSendErr(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-4 sm:max-w-xl sm:px-6 sm:py-6 xl:max-w-2xl xl:px-8 xl:py-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-3"
      >
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
          <Coins className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan">
            soloEmma
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            Binance wallet
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Your Binance Web3 wallet on BNB Smart Chain. Deposit USDT (BEP20)
            to it and send USDT from it to your saved addresses.
          </p>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex min-h-[220px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !connected ? (
        <BinanceWeb3StatusCard onChanged={() => void refresh()} />
      ) : (
        <>
          <Card className="min-w-0">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Balance</CardTitle>
                <CardDescription>
                  {shortAddress(status!.address!)} · BEP20
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                disabled={refreshing}
                onClick={() => void refresh()}
                aria-label="Refresh balance"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-3xl font-bold tabular-nums text-foreground">
                {usdt.toFixed(2)}{" "}
                <span className="text-base font-medium text-muted">USDT</span>
              </p>
              <p className="text-sm text-muted">
                BNB for network fees:{" "}
                <span
                  className={`tabular-nums ${bnb <= 0 ? "text-amber-300" : "text-foreground"}`}
                >
                  {bnb.toFixed(4)}
                </span>
                {bnb <= 0 ? " — add a little BNB to send" : ""}
              </p>
              <a
                href={`https://bscscan.com/address/${status!.address}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View on BscScan <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowDownToLine className="h-4 w-4 text-success" />
                Deposit
              </CardTitle>
              <CardDescription>
                Send USDT to this address from Binance or any wallet. Choose
                the <strong>BNB Smart Chain (BEP20)</strong> network.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
                <p className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
                  {status!.address}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void copyAddress()}
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-amber-300">
                Only send USDT on BEP20 (and a little BNB for fees). Tokens
                sent on TRC20, ERC20 or other networks will be lost.
              </p>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpFromLine className="h-4 w-4 text-primary" />
                Withdraw
              </CardTitle>
              <CardDescription>
                Send USDT from this wallet to one of your saved BEP20
                withdrawal addresses.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {bep20Wallets.length === 0 ? (
                <p className="text-muted">
                  Add a BEP20 withdrawal address on the{" "}
                  <Link href="/wallet" className="text-primary hover:underline">
                    Wallet
                  </Link>{" "}
                  page first.
                </p>
              ) : (
                <form onSubmit={send} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="binance-dest">To</Label>
                    <select
                      id="binance-dest"
                      value={walletId}
                      onChange={(e) => setWalletId(e.target.value)}
                      className="w-full rounded-md border border-[var(--color-border)] bg-card px-3 py-2 text-sm text-foreground"
                    >
                      {bep20Wallets.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label} · {shortAddress(w.address)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="binance-amount">Amount (USDT)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="binance-amount"
                        type="number"
                        inputMode="decimal"
                        min={1}
                        step="0.01"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setAmount((Math.floor(usdt * 100) / 100).toFixed(2))
                        }
                      >
                        Max
                      </Button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={sending || usdt < 1 || bnb <= 0}
                    className="w-full"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      "Send USDT"
                    )}
                  </Button>
                </form>
              )}
              {sendErr && <p className="text-danger">{sendErr}</p>}
              {lastSend && (
                <p className="text-success">
                  Sent {lastSend.amount.toFixed(2)} USDT to {lastSend.label}.{" "}
                  <a
                    href={lastSend.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    View transaction
                  </a>
                </p>
              )}
            </CardContent>
          </Card>

          <BinanceWeb3StatusCard onChanged={() => void refresh()} />
        </>
      )}
    </div>
  );
}
