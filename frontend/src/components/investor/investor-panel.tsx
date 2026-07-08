"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import Link from "next/link";
import {
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
} from "lucide-react";

const NETWORKS = ["TRC20", "BEP20", "ERC20"] as const;

type Progress = "waiting" | "confirming" | "complete" | "failed";

export function InvestorPanel() {
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

  const feeUsdt = status?.feeUsdt ?? 50;

  async function refresh() {
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
  }

  useEffect(() => {
    void refresh();
  }, []);

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
  }, [checkout?.paymentId]);

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
      const res = await api.investor.enrollCheckout(network, source);
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
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!status?.active) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Investor program</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-400">
            Link your MT5 account, pay a one-time{" "}
            {formatCurrency(feeUsdt)} fee, and let the platform trade system
            signals on your account at 1:2 RR with your chosen risk %. Daily
            wallet earning: {status?.dailyYieldPercent ?? 0.5}% of your balance.
          </p>

          {checkout?.payAddress ? (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
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
            <>
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
              <Button onClick={() => void enroll()} disabled={payLoading}>
                {payLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {source === "wallet"
                  ? `Pay ${formatCurrency(feeUsdt)} from wallet`
                  : `Enroll — ${formatCurrency(feeUsdt)}`}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">MT5 auto-trading</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-400">
            Status:{" "}
            <span className="text-white">
              {status.mt5Connected
                ? "Connected"
                : status.mt5Linked
                  ? "Linked — checking…"
                  : "Not linked"}
            </span>
            {status.mt5HealthMessage && (
              <span className="ml-2 text-xs text-gray-500">
                ({status.mt5HealthMessage})
              </span>
            )}
          </p>
          <p className="text-sm text-gray-400">
            Daily wallet earning:{" "}
            <span className="text-white">{status.dailyYieldPercent}%</span> of
            available balance
          </p>
          {!status.mt5Linked && (
            <Mt5ConnectForm
              compact
              onSubmit={async (c) => {
                await api.users.claimTradingAccount(c);
                await refresh();
              }}
            />
          )}
          <div className="flex flex-wrap items-end gap-3">
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
              <Button size="sm" variant="secondary" onClick={() => void api.investor.resume().then(refresh)}>
                Resume trading
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => void api.investor.pause().then(refresh)}>
                Pause trading
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {status.recentTrades.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent trades</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {status.recentTrades.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "flex items-center justify-between rounded-lg border border-white/5 px-3 py-2 text-sm",
                )}
              >
                <span className="text-white">
                  {t.symbol} {t.direction}
                </span>
                <span className="text-gray-500">{t.status}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
