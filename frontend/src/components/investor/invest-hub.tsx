"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Copy,
  LineChart,
  Loader2,
  RefreshCw,
  Shield,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, type InvestorStatus } from "@/lib/api";
import { Mt5ConnectForm } from "@/components/mt5/mt5-connect-form";
import {
  PaymentSourceSelector,
  type PaymentSource,
} from "@/components/wallet/payment-source-selector";
import { cn, formatCurrency } from "@/lib/utils";

const NETWORKS = ["TRC20", "BEP20", "ERC20"] as const;

type Progress = "waiting" | "confirming" | "complete" | "failed";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

function StatCard({
  label,
  value,
  sub,
  accent,
  delay = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "invest" | "risk" | "profit" | "neutral";
  delay?: number;
}) {
  const accentClass =
    accent === "invest"
      ? "from-indigo-600/30 via-indigo-900/20 to-transparent border-indigo-500/30"
      : accent === "risk"
        ? "from-cyan-600/25 via-cyan-900/15 to-transparent border-cyan-500/25"
        : accent === "profit"
          ? "from-emerald-600/25 via-emerald-900/15 to-transparent border-emerald-500/25"
          : "from-white/5 to-transparent border-white/10";

  return (
    <motion.div
      {...fadeUp}
      transition={{ duration: 0.4, delay }}
      className={cn(
        "rounded-2xl border bg-gradient-to-br p-4",
        accentClass,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </motion.div>
  );
}

function tradeStatusClass(status: string) {
  const s = status.toLowerCase();
  if (s === "closed" || s === "open") return "bg-emerald-500/15 text-emerald-400";
  if (s === "failed" || s === "skipped") return "bg-red-500/15 text-red-400";
  return "bg-white/10 text-gray-400";
}

export function InvestHub() {
  const [status, setStatus] = useState<InvestorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [risk, setRisk] = useState("2");
  const [payLoading, setPayLoading] = useState(false);
  const [source, setSource] = useState<PaymentSource>("wallet");
  const [network, setNetwork] = useState("TRC20");
  const [walletBalance, setWalletBalance] = useState(0);
  const [error, setError] = useState("");
  const [checkout, setCheckout] = useState<{
    payAddress?: string;
    payAmount?: number;
    paymentId?: string;
  } | null>(null);
  const [progress, setProgress] = useState<Progress>("waiting");
  const [copied, setCopied] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);

  const feeUsdt = status?.feeUsdt ?? 10;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, w] = await Promise.all([
        api.investor.status(),
        api.wallet.summary(),
      ]);
      setStatus(s);
      setWalletBalance(w.availableBalance);
      if (s.settings) setRisk(String(s.settings.riskPercent));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pollStatus = useCallback(async () => {
    if (!checkout?.paymentId) return;
    try {
      const s = await api.payments.getStatus(checkout.paymentId);
      setProgress((s.progress as Progress) || "waiting");
      if (s.confirmed) {
        setProgress("complete");
        await refresh();
      }
    } catch {
      /* polling */
    }
  }, [checkout?.paymentId, refresh]);

  useEffect(() => {
    if (!checkout?.paymentId || progress === "complete") return;
    const t = setInterval(() => void pollStatus(), 8000);
    void pollStatus();
    return () => clearInterval(t);
  }, [checkout?.paymentId, progress, pollStatus]);

  async function enroll() {
    setPayLoading(true);
    setError("");
    try {
      const paySource = source === "wallet" ? "wallet" : "crypto";
      const res = await api.investor.enrollCheckout(network, paySource);
      if (res.active || res.success) {
        await refresh();
        setCheckout(null);
        return;
      }
      if (!res.payAddress || !res.paymentId) {
        throw new Error(res.message || "Could not start enrollment");
      }
      setCheckout({
        payAddress: res.payAddress,
        payAmount: res.payAmount ?? res.amount,
        paymentId: res.paymentId,
      });
      setProgress("waiting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrollment failed");
    } finally {
      setPayLoading(false);
    }
  }

  async function saveRisk() {
    await api.investor.updateSettings(Number(risk));
    await refresh();
  }

  if (loading && !status) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!status?.active) {
    return (
      <div className="space-y-5">
        <motion.div
          {...fadeUp}
          className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/80 via-[#0f1419] to-cyan-950/40 p-6"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">
              Investor program
            </p>
            <h2 className="mt-2 text-2xl font-bold text-white">
              Start investing with MT5
            </h2>
            <p className="mt-2 max-w-lg text-sm text-gray-400">
              Pay a one-time {formatCurrency(feeUsdt)} fee, then trade on the
              platform MT5 with your investment balance (or link your own MT5 for
              auto-copy). Earn {status?.dailyYieldPercent ?? 8}% daily on
              investment — credited to wallet at 16:00.
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { icon: LineChart, text: "Trade on platform MT5" },
                { icon: Shield, text: "1:2 risk-reward always" },
                { icon: Wallet, text: "Daily investment yield" },
              ].map(({ icon: Icon, text }) => (
                <li
                  key={text}
                  className="flex items-center gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 text-sm text-gray-300"
                >
                  <Icon className="h-4 w-4 shrink-0 text-cyan-400" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        <motion.div
          {...fadeUp}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
        >
          {checkout?.payAddress ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant={progress === "complete" ? "success" : "gold"}>
                  {progress === "complete"
                    ? "Enrollment confirmed"
                    : progress === "confirming"
                      ? "Confirming on chain"
                      : "Waiting for transfer"}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void pollStatus()}
                  className="gap-1"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
              </div>
              {progress === "complete" ? (
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm">Investor program activated</span>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-300">
                    Send{" "}
                    <strong className="text-white">
                      {checkout.payAmount} USDT
                    </strong>{" "}
                    on {network} to:
                  </p>
                  <code className="block break-all rounded-lg bg-black/40 p-3 text-xs text-primary">
                    {checkout.payAddress}
                  </code>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1"
                    onClick={async () => {
                      if (!checkout.payAddress) return;
                      await navigator.clipboard.writeText(checkout.payAddress);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied ? "Copied!" : "Copy address"}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <PaymentSourceSelector
                walletBalance={walletBalance}
                amountDue={feeUsdt}
                source={source}
                onSourceChange={setSource}
              />
              {source === "crypto" && (
                <div className="flex flex-wrap gap-2">
                  {NETWORKS.map((n) => (
                    <Button
                      key={n}
                      type="button"
                      size="sm"
                      variant={network === n ? "default" : "secondary"}
                      onClick={() => setNetwork(n)}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
              )}
              {source === "wallet" && walletBalance < feeUsdt && (
                <p className="text-sm text-gray-500">
                  <Link href="/wallet" className="text-primary hover:underline">
                    Deposit to wallet
                  </Link>{" "}
                  or pay with crypto.
                </p>
              )}
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button
                className="w-full sm:w-auto"
                size="lg"
                onClick={() => void enroll()}
                disabled={payLoading}
              >
                {payLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {source === "wallet"
                  ? `Start investing — ${formatCurrency(feeUsdt)} from wallet`
                  : `Start investing — ${formatCurrency(feeUsdt)}`}
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  const profitPositive = status.totalProfit >= 0;
  const riskPercent = status.settings?.riskPercent ?? 2;

  return (
    <div className="space-y-5">
      <motion.div
        {...fadeUp}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-800 to-[#1e3a8a] p-5 shadow-lg shadow-indigo-900/30"
      >
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-indigo-200">Your investment</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {formatCurrency(status.investmentBalance ?? status.investmentDeposited)}
            </p>
            <p className="mt-2 text-sm text-indigo-200/80">
              {status.enrolledAt
                ? `Enrolled ${new Date(status.enrolledAt).toLocaleDateString()}`
                : "Active investor"}
              {status.settings?.paused && (
                <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-200">
                  Trading paused
                </span>
              )}
              {status.settings?.yieldPaused && (
                <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-200">
                  Yield paused
                </span>
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-white/80 hover:bg-white/10 hover:text-white"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Investment balance"
          value={formatCurrency(status.investmentBalance ?? 0)}
          sub={`${status.dailyYieldPercent}% daily · credited to wallet at 16:00`}
          accent="invest"
          delay={0.05}
        />
        <StatCard
          label="Risk per trade"
          value={`${riskPercent}%`}
          sub="1:2 reward-risk on MT5"
          accent="risk"
          delay={0.1}
        />
        <StatCard
          label="Total profit"
          value={`${profitPositive ? "+" : ""}${formatCurrency(status.totalProfit)}`}
          sub={`Trading ${formatCurrency(status.tradingProfit)} · Wallet ${formatCurrency(status.walletEarnings)}`}
          accent="profit"
          delay={0.15}
        />
      </div>

      <motion.div
        {...fadeUp}
        transition={{ delay: 0.18 }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
      >
        <h3 className="text-sm font-semibold text-white">Move funds</h3>
        <p className="mt-1 text-xs text-gray-500">
          Wallet {formatCurrency(status.walletBalance)} · Investment{" "}
          {formatCurrency(status.investmentBalance ?? 0)}. Daily yield is based on
          investment balance.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-xs text-gray-400">Amount (USDT)</label>
            <Input
              type="number"
              min={0.01}
              step="0.01"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={transferLoading}
            onClick={() => {
              const amount = Number(transferAmount);
              setTransferLoading(true);
              setError("");
              void api.investor
                .allocate(amount)
                .then(() => {
                  setTransferAmount("");
                  return refresh();
                })
                .catch((e) =>
                  setError(e instanceof Error ? e.message : "Transfer failed"),
                )
                .finally(() => setTransferLoading(false));
            }}
          >
            Wallet → Investment
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={transferLoading}
            onClick={() => {
              const amount = Number(transferAmount);
              setTransferLoading(true);
              setError("");
              void api.investor
                .redeem(amount)
                .then(() => {
                  setTransferAmount("");
                  return refresh();
                })
                .catch((e) =>
                  setError(e instanceof Error ? e.message : "Transfer failed"),
                )
                .finally(() => setTransferLoading(false));
            }}
          >
            Investment → Wallet
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </motion.div>

      <motion.div
        {...fadeUp}
        transition={{ delay: 0.2 }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {[
          { label: "Wallet balance", value: formatCurrency(status.walletBalance) },
          {
            label: "Daily yield",
            value: `${status.dailyYieldPercent}%`,
          },
          {
            label: "On MT5",
            value: formatCurrency(status.investmentBalance ?? 0),
          },
          {
            label: "Broker MT5",
            value:
              status.mt5Balance != null
                ? `${formatCurrency(status.mt5Balance)} ${status.currency}`
                : "—",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
          >
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className="mt-0.5 text-lg font-semibold text-white">{item.value}</p>
          </div>
        ))}
      </motion.div>

      <motion.div
        {...fadeUp}
        transition={{ delay: 0.25 }}
        className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
      >
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-cyan-400" />
          <h3 className="text-base font-semibold text-white">Trade on MT5</h3>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Open the platform MT5 terminal to trade with your investment balance
          ({formatCurrency(status.investmentBalance ?? 0)}). Optionally link your
          own MT5 for auto-copy of system signals.
        </p>
        <p className="mt-2 text-sm text-gray-400">
          Link status:{" "}
          <span className="text-white">
            {status.mt5Connected
              ? "Connected"
              : status.mt5Linked
                ? "Linked — checking…"
                : "Not linked (optional)"}
          </span>
          {status.mt5HealthMessage && (
            <span className="ml-2 text-xs text-gray-500">
              ({status.mt5HealthMessage})
            </span>
          )}
        </p>
        {!status.mt5Linked && (
          <div className="mt-4">
            <Mt5ConnectForm
              compact
              onSubmit={async (c) => {
                await api.users.claimTradingAccount(c);
                await refresh();
              }}
            />
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-gray-400">
              Risk % per signal (1:2 RR)
            </label>
            <Input
              type="number"
              min={0.5}
              max={10}
              step={0.5}
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
              className="w-24"
            />
          </div>
          <Button size="sm" onClick={() => void saveRisk()}>
            Save risk
          </Button>
          {status.settings?.paused ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void api.investor.resume().then(refresh)}
            >
              Resume trading
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void api.investor.pause().then(refresh)}
            >
              Pause trading
            </Button>
          )}
          <Link href="/mt5" className="ml-auto">
            <Button size="sm" className="gap-1.5">
              <TrendingUp className="h-4 w-4" />
              Open MT5 terminal
            </Button>
          </Link>
        </div>
      </motion.div>

      {status.recentTrades.length > 0 && (
        <motion.div
          {...fadeUp}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden"
        >
          <div className="border-b border-white/5 px-5 py-4">
            <h3 className="text-base font-semibold text-white">Recent trades</h3>
          </div>
          <div className="divide-y divide-white/5">
            {status.recentTrades.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <div>
                  <span className="font-medium text-white">
                    {t.symbol} {t.direction}
                  </span>
                  <p className="text-xs text-gray-500">{t.signalId}</p>
                </div>
                <div className="flex items-center gap-3">
                  {t.profit != null && (
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        t.profit >= 0 ? "text-emerald-400" : "text-red-400",
                      )}
                    >
                      {t.profit >= 0 ? "+" : ""}
                      {formatCurrency(t.profit)}
                    </span>
                  )}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      tradeStatusClass(t.status),
                    )}
                  >
                    {t.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
