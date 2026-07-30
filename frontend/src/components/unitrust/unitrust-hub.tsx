"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type UnitrustStatus } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function UnitrustHub() {
  const [status, setStatus] = useState<UnitrustStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const s = await api.unitrust.status();
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Unitrust");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function deposit() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await api.unitrust.enroll(Number(amount));
      setMessage(res.message);
      setAmount("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await api.unitrust.redeem(Number(redeemAmount));
      setMessage(res.message);
      setRedeemAmount("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdraw failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const min = status?.minDepositUsdt ?? 100;
  const depositValue = Number(amount);
  const redeemValue = Number(redeemAmount);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-emerald-300/80">
          Unitrust
        </p>
        <h2 className="mt-1 text-xl font-semibold text-white">
          {formatCurrency(status?.unitrustBalance ?? 0)} corpus
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          {status?.dailyYieldPercent ?? 5}% daily yield credited to your wallet
          at 16:00 Africa/Kampala. New deposits earn after 24 hours. Withdrawals
          once per calendar month.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-black/20 p-3">
            <div className="text-xs text-gray-500">Projected daily</div>
            <div className="font-medium text-white">
              {formatCurrency(status?.projectedDailyEarning ?? 0)}
            </div>
          </div>
          <div className="rounded-xl bg-black/20 p-3">
            <div className="text-xs text-gray-500">Wallet available</div>
            <div className="font-medium text-white">
              {formatCurrency(status?.availableBalance ?? 0)}
            </div>
          </div>
        </div>
        {status?.yieldPaused && (
          <p className="mt-3 text-sm text-amber-300">
            Unitrust yield is paused by the platform.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
        <h3 className="font-medium text-white">
          {status?.active ? "Add to Unitrust" : "Join Unitrust"}
        </h3>
        <p className="text-xs text-gray-500">
          Min {formatCurrency(min)} · no enrollment fee · max{" "}
          {formatCurrency(status?.maxDepositUsdt ?? 50000)}
        </p>
        <Input
          type="number"
          min={min}
          step={0.01}
          placeholder={`Amount (min $${min})`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button
          className="w-full"
          disabled={
            busy || !Number.isFinite(depositValue) || depositValue < min
          }
          onClick={() => void deposit()}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Deposit from wallet
        </Button>
      </div>

      {status?.active && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
          <h3 className="font-medium text-white">Monthly withdrawal</h3>
          <p className="text-xs text-gray-500">
            {status.canWithdrawThisMonth
              ? "You can withdraw once this month (Kampala calendar)."
              : `Already withdrew this month. Next window: ${
                  status.nextWithdrawAt
                    ? new Date(status.nextWithdrawAt).toLocaleDateString()
                    : "next month"
                }`}
          </p>
          <Input
            type="number"
            min={0.01}
            step={0.01}
            placeholder="Amount to wallet"
            value={redeemAmount}
            onChange={(e) => setRedeemAmount(e.target.value)}
            disabled={!status.canWithdrawThisMonth}
          />
          <Button
            className="w-full"
            variant="secondary"
            disabled={
              busy ||
              !status.canWithdrawThisMonth ||
              !Number.isFinite(redeemValue) ||
              redeemValue <= 0 ||
              redeemValue > (status.unitrustBalance ?? 0)
            }
            onClick={() => void withdraw()}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Withdraw to wallet
          </Button>
        </div>
      )}

      {status?.recentCredits && status.recentCredits.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="mb-3 font-medium text-white">Recent daily credits</h3>
          <ul className="space-y-2 text-sm">
            {status.recentCredits.map((c) => (
              <li
                key={c.creditDate}
                className="flex justify-between text-gray-300"
              >
                <span>{c.creditDate}</span>
                <span className="text-emerald-300">
                  +{formatCurrency(c.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {message && <p className="text-sm text-emerald-300">{message}</p>}

      <p className="text-center text-sm text-gray-500">
        Also use{" "}
        <Link href="/invest" className="text-primary hover:underline">
          Smart Invest
        </Link>{" "}
        for the standard investor product.
      </p>
    </div>
  );
}
