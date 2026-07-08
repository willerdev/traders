"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, type DepositorPlanPreview, type WalletSummary } from "@/lib/api";
import { WalletDepositPanel } from "@/components/wallet/wallet-deposit-panel";
import { formatCurrency } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { DailyIncomeJournal } from "@/components/wallet/daily-income-journal";

export function DepositorPanel() {
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [preview, setPreview] = useState<DepositorPlanPreview | null>(null);
  const [amount, setAmount] = useState("100");
  const [riskPercent, setRiskPercent] = useState("2");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const s = await api.wallet.summary();
      setSummary(s);
      setAmount(String(s.minDepositUsdt || 100));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const a = Number(amount);
    const r = Number(riskPercent);
    if (!a || !r) return;
    const t = setTimeout(() => {
      void api.wallet.previewDeposit(a, r).then(setPreview).catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(t);
  }, [amount, riskPercent]);

  if (loading && !summary) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const minDeposit = summary?.minDepositUsdt ?? 50;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deposit & earn</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-400">
            Deposit USDT and earn at the platform daily rate (
            {summary?.platformDailyYieldPercent ?? 0.5}% per day) over a 5-day
            plan. Pick your risk % to see max loss/gain per day at 1:2 RR.
          </p>
          <WalletDepositPanel
            minDeposit={minDeposit}
            onComplete={() => void refresh()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">5-day preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-gray-400">Amount</label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Risk %</label>
              <Input
                type="number"
                value={riskPercent}
                onChange={(e) => setRiskPercent(e.target.value)}
              />
            </div>
          </div>
          {preview && (
            <div className="space-y-2 text-sm">
              <p className="text-gray-400">
                Per day at 1:2 RR — max loss{" "}
                <strong className="text-danger">
                  {formatCurrency(preview.maxLossPerDay)}
                </strong>
                , max gain{" "}
                <strong className="text-success">
                  {formatCurrency(preview.maxGainPerDay)}
                </strong>
              </p>
              <p className="text-gray-400">
                Projected daily earning:{" "}
                <strong className="text-white">
                  {formatCurrency(preview.projectedDailyEarning)}
                </strong>{" "}
                · 5-day total:{" "}
                <strong className="text-white">
                  {formatCurrency(preview.projectedTotalEarning)}
                </strong>
              </p>
              <div className="grid grid-cols-5 gap-2 pt-2">
                {preview.days.map((d) => (
                  <div
                    key={d.day}
                    className="rounded-lg border border-white/10 p-2 text-center text-xs"
                  >
                    <p className="font-semibold text-white">Day {d.day}</p>
                    <p className="text-success">
                      +{formatCurrency(d.projectedEarning ?? 0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {summary?.activePlan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active plan</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-400">
            <p>
              {formatCurrency(summary.activePlan.amount)} at{" "}
              {summary.activePlan.riskPercent}% risk ·{" "}
              {summary.activePlan.dailyYieldPercent}% daily rate
            </p>
            <p className="mt-1">
              Ends {new Date(summary.activePlan.endAt).toLocaleDateString()} ·{" "}
              {summary.activePlan.credits.length}/5 days credited
            </p>
          </CardContent>
        </Card>
      )}

      <DailyIncomeJournal compact />
    </div>
  );
}
