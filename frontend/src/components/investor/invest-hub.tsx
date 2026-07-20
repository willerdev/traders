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
import { InvestmentReturnsPanel } from "@/components/investor/investment-returns";
import { CurrencySwitcher } from "@/components/currency-switcher";
import {
  PaymentSourceSelector,
  type PaymentSource,
} from "@/components/wallet/payment-source-selector";
import {
  cn,
  formatCurrency,
  formatMoney,
  isLocalCurrencyDisplay,
} from "@/lib/utils";

const NETWORKS = ["TRC20", "BEP20", "ERC20"] as const;

const DEFAULT_FEE_TIERS = [
  { min: 100, max: 200, fee: 10, label: "$100 – $200" },
  { min: 201, max: 500, fee: 50, label: "$201 – $500" },
  { min: 501, max: 999.99, fee: 100, label: "$501 – under $1,000" },
  { min: 1000, max: 5000, fee: 200, label: "$1,000 – $5,000" },
] as const;

function resolveFeeClient(amount: number): number | null {
  if (!Number.isFinite(amount) || amount < 100 || amount > 5000) return null;
  if (amount <= 200) return 10;
  if (amount <= 500) return 50;
  if (amount < 1000) return 100;
  return 200;
}

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
  compactValue = false,
  delay = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "invest" | "risk" | "profit" | "neutral";
  compactValue?: boolean;
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
      <p
        className={cn(
          "mt-1 font-bold tracking-tight text-white",
          compactValue ? "text-lg xl:text-xl" : "text-2xl",
        )}
      >
        {value}
      </p>
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
  const [investmentAmount, setInvestmentAmount] = useState("100");
  const [vipLoading, setVipLoading] = useState(false);

  const tiers = status?.feeTiers?.length ? status.feeTiers : DEFAULT_FEE_TIERS;
  const investmentMin = status?.investmentMin ?? 100;
  const investmentMax = status?.investmentMax ?? 5000;
  const parsedInvestment = Number(investmentAmount);
  const feeUsdt =
    (Number.isFinite(parsedInvestment)
      ? resolveFeeClient(parsedInvestment)
      : null) ??
    tiers[0]?.fee ??
    10;
  const netInvested =
    Number.isFinite(parsedInvestment) && parsedInvestment > feeUsdt
      ? Math.round((parsedInvestment - feeUsdt) * 100) / 100
      : 0;
  const depositDue = Number.isFinite(parsedInvestment) ? parsedInvestment : 0;

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
      const amount = Number(investmentAmount);
      if (!Number.isFinite(amount) || amount < investmentMin || amount > investmentMax) {
        throw new Error(
          `Enter an investment between ${formatCurrency(investmentMin)} and ${formatCurrency(investmentMax)}`,
        );
      }
      if (resolveFeeClient(amount) == null) {
        throw new Error("Investment amount is outside a fee tier");
      }
      const paySource = source === "wallet" ? "wallet" : "crypto";
      const res = await api.investor.enrollCheckout(network, paySource, amount);
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

  async function upgradeVip() {
    setVipLoading(true);
    setError("");
    try {
      await api.investor.vipUpgrade();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "VIP upgrade failed");
    } finally {
      setVipLoading(false);
    }
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
        <div className="flex justify-end">
          <CurrencySwitcher
            displayCurrency={status?.displayCurrency}
            onChanged={refresh}
          />
        </div>
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
              Choose your investment size, pay the matching one-time subscription
              fee, then earn {status?.dailyYieldPercent ?? 8}% daily on investment —
              credited to wallet at 16:00. Trade on platform MT5 or link your own
              for auto-copy.
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
            <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-black/25">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2 font-medium">Investment</th>
                    <th className="px-3 py-2 font-medium text-right">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((tier) => (
                    <tr key={tier.label} className="border-b border-white/5 last:border-0">
                      <td className="px-3 py-2 text-gray-300">{tier.label}</td>
                      <td className="px-3 py-2 text-right font-medium text-white">
                        {formatCurrency(tier.fee)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                    fee on {network} to:
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
                  <p className="text-xs text-gray-500">
                    After payment confirms,{" "}
                    {formatCurrency(feeUsdt)} fee is deducted and{" "}
                    {formatCurrency(netInvested || parsedInvestment)} is invested
                    automatically.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  Investment amount (USDT)
                </label>
                <Input
                  type="number"
                  min={investmentMin}
                  max={investmentMax}
                  step="1"
                  value={investmentAmount}
                  onChange={(e) => setInvestmentAmount(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-gray-500">
                  You pay{" "}
                  <strong className="text-white">
                    {formatCurrency(depositDue || 0)}
                  </strong>
                  {" — "}
                  <strong className="text-white">{formatCurrency(feeUsdt)}</strong>{" "}
                  fee deducted,{" "}
                  <strong className="text-white">
                    {formatCurrency(netInvested)}
                  </strong>{" "}
                  invested
                </p>
              </div>
              <PaymentSourceSelector
                walletBalance={walletBalance}
                amountDue={depositDue}
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
              {source === "wallet" && walletBalance < depositDue && (
                <p className="text-sm text-gray-500">
                  <Link href="/wallet" className="text-primary hover:underline">
                    Deposit to wallet
                  </Link>{" "}
                  at least {formatCurrency(depositDue)} to start.
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
                {`Invest ${formatCurrency(depositDue || 0)}`}
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  const profitPositive = status.totalProfit >= 0;
  const riskPercent = status.settings?.riskPercent ?? 2;
  const display = status.displayCurrency;
  const vip = status.vip;
  const localCurrency = isLocalCurrencyDisplay(display);

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <CurrencySwitcher displayCurrency={display} onChanged={refresh} />
      </div>
      <div className="space-y-5 xl:grid xl:grid-cols-12 xl:items-start xl:gap-5 xl:space-y-0">
      <motion.div
        {...fadeUp}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-800 to-[#1e3a8a] p-5 shadow-lg shadow-indigo-900/30 xl:col-span-7 xl:row-start-1 xl:h-full xl:min-h-44"
      >
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-indigo-200">Your investment</p>
            <p
              className={cn(
                "mt-1 font-bold tracking-tight text-white",
                localCurrency
                  ? "text-2xl sm:text-3xl"
                  : "text-3xl sm:text-4xl",
              )}
            >
              {formatMoney(
                status.investmentBalance ?? status.investmentDeposited,
                display,
              )}
            </p>
            <p className="mt-2 text-sm text-indigo-200/80">
              {status.enrolledAt
                ? `Enrolled ${new Date(status.enrolledAt).toLocaleDateString()}`
                : "Active investor"}
              {vip?.active && (
                <span className="ml-2 rounded bg-amber-400/25 px-1.5 py-0.5 text-xs font-semibold text-amber-100">
                  VIP
                </span>
              )}
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

      <div className="grid gap-3 sm:grid-cols-3 xl:col-span-5 xl:row-start-1 xl:h-full">
        <StatCard
          label="Investment balance"
          value={formatMoney(status.investmentBalance ?? 0, display)}
          sub={`${status.dailyYieldPercent}% daily · credited to wallet at 16:00`}
          accent="invest"
          compactValue={localCurrency}
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
          value={`${profitPositive ? "+" : ""}${formatMoney(status.totalProfit, display)}`}
          sub={`Trading ${formatMoney(status.tradingProfit, display)} · Wallet ${formatMoney(status.walletEarnings, display)}`}
          accent="profit"
          compactValue={localCurrency}
          delay={0.15}
        />
      </div>

      <motion.div
        {...fadeUp}
        transition={{ delay: 0.16 }}
        className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent p-4 xl:col-span-5 xl:row-start-2"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-400/20 text-amber-100">VIP</Badge>
              <h3 className="text-sm font-semibold text-white">
                {vip?.active ? "VIP active" : "Upgrade to VIP"}
              </h3>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {vip?.active
                ? `Expires ${vip.expiresAt ? new Date(vip.expiresAt).toLocaleDateString() : "—"} · weekend earnings + $0 withdrawal fee`
                : `$${vip?.feeUsdt ?? 20}/month from wallet · weekend earnings + $0 withdrawal fee`}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-gray-400">
              <li>• Earn daily yield on Saturdays &amp; Sundays</li>
              <li>• Zero commission on wallet withdrawals</li>
            </ul>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={vipLoading || walletBalance < (vip?.feeUsdt ?? 20)}
            onClick={() => void upgradeVip()}
          >
            {vipLoading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {vip?.active ? "Renew VIP" : "Upgrade — $20"}
          </Button>
        </div>
        {!vip?.active && walletBalance < (vip?.feeUsdt ?? 20) && (
          <p className="mt-2 text-xs text-gray-500">
            Need {formatCurrency(vip?.feeUsdt ?? 20)} in wallet to upgrade.
          </p>
        )}
      </motion.div>

      <motion.div
        {...fadeUp}
        transition={{ delay: 0.18 }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 xl:col-span-5 xl:row-start-3"
      >
        <h3 className="text-sm font-semibold text-white">Move funds</h3>
        <p className="mt-1 text-xs text-gray-500">
          Wallet {formatMoney(status.walletBalance, display)} · Investment{" "}
          {formatMoney(status.investmentBalance ?? 0, display)}. Daily yield is
          based on investment balance.
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
        transition={{ delay: 0.19 }}
        className="xl:col-span-7 xl:col-start-6 xl:row-span-4 xl:row-start-2"
      >
        <InvestmentReturnsPanel
          investmentBalance={status.investmentBalance ?? 0}
          dailyYieldPercent={status.dailyYieldPercent}
          walletEarnings={status.walletEarnings}
          yieldPaused={status.settings?.yieldPaused}
          displayCurrency={display}
        />
      </motion.div>

      <motion.div
        {...fadeUp}
        transition={{ delay: 0.2 }}
        className="grid gap-3 sm:grid-cols-2 xl:col-span-5 xl:row-start-4 xl:grid-cols-2"
      >
        {[
          {
            label: "Wallet balance",
            value: formatMoney(status.walletBalance, display),
          },
          {
            label: "Daily yield",
            value: `${status.dailyYieldPercent}%`,
          },
          {
            label: "On MT5",
            value: formatMoney(status.investmentBalance ?? 0, display),
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
            <p
              className={cn(
                "mt-0.5 font-semibold text-white",
                localCurrency ? "text-base" : "text-lg",
              )}
            >
              {item.value}
            </p>
          </div>
        ))}
      </motion.div>

      <motion.div
        {...fadeUp}
        transition={{ delay: 0.25 }}
        className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 xl:col-span-5 xl:row-start-5"
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
          className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] xl:col-span-12 xl:row-start-6"
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
    </div>
  );
}
