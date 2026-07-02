"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, type ProfitShareStatus, type UserSettings } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { ProfitSharePaymentPanel } from "@/components/payments/profit-share-payment-panel";
import { PayoutRequestForm } from "@/components/payments/payout-request-form";
import { TrendingUp, Wallet } from "lucide-react";

type Props = {
  status: ProfitShareStatus;
  tradingActive: boolean;
  onRefresh: () => void;
};

export function ProfitShareCard({ status, tradingActive, onRefresh }: Props) {
  const [showCheckout, setShowCheckout] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    if (!status.canWithdraw) return;
    api.users.settings().then(setSettings).catch(() => setSettings(null));
  }, [status.canWithdraw]);

  const progressPct = status.withdrawThreshold
    ? Math.min(100, (status.balance / status.withdrawThreshold) * 100)
    : 0;

  if (!tradingActive) return null;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Profit Share
          </CardTitle>
          <p className="mt-1 text-xs text-muted">
            {status.active
              ? `${status.sharePercent}% of setup wins & copy-trade profits`
              : `Add ${formatCurrency(status.feeUsdt)} for a ${status.sharePercent}% profit split`}
          </p>
        </div>
        {status.active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="secondary">Add-on</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {!status.active ? (
          <>
            <ul className="space-y-2 text-xs text-gray-300">
              <li>• 50% of TP setup rewards credited to your profit share balance</li>
              <li>• 50% commission when the platform copies your top-3 setups</li>
              <li>• 50% of weekly virtual profits (instead of fixed tier payouts)</li>
              <li>
                • Withdraw when balance reaches {status.withdrawThresholdPercent}% of your
                account ({formatCurrency(status.withdrawThreshold)})
              </li>
            </ul>
            {showCheckout ? (
              <ProfitSharePaymentPanel
                feeUsdt={status.feeUsdt}
                onComplete={() => {
                  setShowCheckout(false);
                  onRefresh();
                }}
              />
            ) : (
              <Button size="sm" onClick={() => setShowCheckout(true)}>
                <Wallet className="mr-2 h-4 w-4" />
                Enroll — {formatCurrency(status.feeUsdt)} USDT
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Balance</p>
                <p className="text-lg font-semibold text-white">
                  {formatCurrency(status.balance)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Lifetime</p>
                <p className="text-lg font-semibold text-emerald-400">
                  {formatCurrency(status.lifetimeEarned)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Withdraw at</p>
                <p className="text-lg font-semibold text-white">
                  {formatCurrency(status.withdrawThreshold)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Your split</p>
                <p className="text-lg font-semibold text-primary">{status.sharePercent}%</p>
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-[10px] text-gray-500">
                <span>Progress to withdrawal</span>
                <span>
                  {formatCurrency(status.balance)} / {formatCurrency(status.withdrawThreshold)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {!status.canWithdraw && status.remainingToWithdraw > 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  {formatCurrency(status.remainingToWithdraw)} more to unlock withdrawal
                </p>
              )}
            </div>

            {status.canWithdraw && (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="mb-2 text-xs text-gray-300">
                  Your profit share balance is eligible for withdrawal.
                </p>
                <PayoutRequestForm
                  settings={settings}
                  submitLabel={`Withdraw ${formatCurrency(status.amountToWithdraw)}`}
                  onSubmit={async (walletAddress) => {
                    await api.payouts.withdrawProfitShare(walletAddress);
                    onRefresh();
                  }}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
