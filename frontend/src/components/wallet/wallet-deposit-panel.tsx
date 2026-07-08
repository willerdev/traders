"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const NETWORKS = ["TRC20", "BEP20", "ERC20"] as const;

export function WalletDepositPanel({
  minDeposit,
  onComplete,
}: {
  minDeposit: number;
  onComplete?: () => void;
}) {
  const [network, setNetwork] = useState<string>("TRC20");
  const [amount, setAmount] = useState(String(minDeposit));
  const [riskPercent, setRiskPercent] = useState("2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [payAddress, setPayAddress] = useState("");
  const [payAmount, setPayAmount] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const pollStatus = useCallback(async () => {
    if (!paymentId) return;
    try {
      const status = await api.payments.getStatus(paymentId);
      if (status.payAddress) setPayAddress(status.payAddress);
      if (status.payAmount != null) setPayAmount(status.payAmount);
      if (status.confirmed) {
        setConfirmed(true);
        onComplete?.();
      }
    } catch {
      /* polling */
    }
  }, [paymentId, onComplete]);

  useEffect(() => {
    if (!paymentId || confirmed) return;
    const t = setInterval(() => void pollStatus(), 8000);
    void pollStatus();
    return () => clearInterval(t);
  }, [paymentId, confirmed, pollStatus]);

  async function startDeposit() {
    setError("");
    setLoading(true);
    try {
      const res = await api.wallet.deposit({
        network,
        amount: Number(amount),
        riskPercent: Number(riskPercent),
      });
      setPaymentId(res.paymentId);
      setPayAddress(res.payAddress ?? "");
      setPayAmount(res.payAmount ?? res.amount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start deposit");
    } finally {
      setLoading(false);
    }
  }

  if (confirmed) {
    return (
      <p className="text-sm text-success">
        Deposit confirmed. Your wallet balance has been updated.
      </p>
    );
  }

  if (paymentId && payAddress) {
    return (
      <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm text-gray-300">
          Send{" "}
          <strong className="text-white">
            {payAmount != null ? payAmount : amount} USDT
          </strong>{" "}
          on {network} to:
        </p>
        <code className="block break-all rounded-lg bg-black/40 p-3 text-xs text-primary">
          {payAddress}
        </code>
        <p className="text-xs text-gray-500">
          After confirmation, a 5-day earning plan starts automatically at{" "}
          {riskPercent}% risk (1:2 RR).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-gray-400">Amount (USDT)</label>
          <Input
            type="number"
            min={minDeposit}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">Risk % (1:2 RR)</label>
          <Input
            type="number"
            min={0.5}
            max={10}
            step={0.5}
            value={riskPercent}
            onChange={(e) => setRiskPercent(e.target.value)}
          />
        </div>
      </div>
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
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button onClick={() => void startDeposit()} disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Deposit {formatCurrency(Number(amount) || minDeposit)}
      </Button>
      <p className="text-xs text-gray-500">
        Minimum deposit: {formatCurrency(minDeposit)} USDT
      </p>
    </div>
  );
}
