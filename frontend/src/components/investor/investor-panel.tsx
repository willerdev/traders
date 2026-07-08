"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type InvestorStatus } from "@/lib/api";
import { Mt5ConnectForm } from "@/components/mt5/mt5-connect-form";
import { formatCurrency } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function InvestorPanel() {
  const [status, setStatus] = useState<InvestorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [risk, setRisk] = useState("2");
  const [payLoading, setPayLoading] = useState(false);
  const [checkout, setCheckout] = useState<{
    payAddress?: string;
    payAmount?: number;
    paymentId?: string;
  } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const s = await api.investor.status();
      setStatus(s);
      if (s.settings) setRisk(String(s.settings.riskPercent));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function enroll() {
    setPayLoading(true);
    try {
      const res = await api.investor.enrollCheckout("TRC20");
      if (res.active) {
        await refresh();
        return;
      }
      setCheckout({
        payAddress: res.payAddress,
        payAmount: res.payAmount ?? res.amount,
        paymentId: res.paymentId,
      });
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
            {formatCurrency(status?.feeUsdt ?? 50)} fee, and let the platform
            trade system signals on your account at 1:2 RR with your chosen risk
            %.
          </p>
          {checkout?.payAddress ? (
            <div className="rounded-lg border border-white/10 p-3 text-sm">
              <p>
                Pay {checkout.payAmount} USDT (TRC20) to{" "}
                <code className="text-xs">{checkout.payAddress}</code>
              </p>
            </div>
          ) : (
            <Button onClick={() => void enroll()} disabled={payLoading}>
              {payLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enroll — {formatCurrency(status?.feeUsdt ?? 50)}
            </Button>
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
                Risk per trade (%)
              </label>
              <Input
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
                className="w-28"
              />
            </div>
            <Button size="sm" variant="secondary" onClick={() => void saveRisk()}>
              Save risk
            </Button>
            {status.settings?.paused ? (
              <Button size="sm" onClick={() => void api.investor.resume().then(refresh)}>
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
          </div>
        </CardContent>
      </Card>

      {status.recentTrades.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent investor trades</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {status.recentTrades.map((t) => (
              <div
                key={t.id}
                className="flex justify-between rounded-lg border border-white/5 px-3 py-2 text-sm"
              >
                <span>
                  {t.symbol} {t.direction} · {t.status}
                </span>
                <span className="text-gray-500">{t.signalId.slice(0, 8)}…</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
