"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function WalletWithdrawForm({
  availableBalance,
  onComplete,
}: {
  availableBalance: number;
  onComplete?: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit() {
    setError("");
    setLoading(true);
    try {
      await api.wallet.withdraw(
        Number(amount),
        walletAddress.trim() || undefined,
      );
      setSuccess(true);
      onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <p className="text-sm text-success">
        Withdrawal requested. You will receive an email when it is processed.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-gray-400">
          Amount (max {formatCurrency(availableBalance)})
        </label>
        <Input
          type="number"
          max={availableBalance}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-400">
          TRC20 address (optional if saved in settings)
        </label>
        <Input
          value={walletAddress}
          onChange={(e) => setWalletAddress(e.target.value)}
          placeholder="T..."
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button
        onClick={() => void submit()}
        disabled={loading || !amount || Number(amount) <= 0}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Withdraw
      </Button>
    </div>
  );
}
