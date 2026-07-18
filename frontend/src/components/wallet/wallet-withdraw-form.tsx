"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { WalletWithdrawFeeNotice, WALLET_WITHDRAWAL_FEE_USD, walletWithdrawNetAmount } from "@/components/wallet/wallet-withdraw-fee-notice";

export function WalletWithdrawForm({
  availableBalance,
  feeUsdt = WALLET_WITHDRAWAL_FEE_USD,
  onComplete,
}: {
  availableBalance: number;
  feeUsdt?: number;
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

  const fee = feeUsdt ?? WALLET_WITHDRAWAL_FEE_USD;
  const gross = Number(amount);
  const net = walletWithdrawNetAmount(amount, fee);
  const minWithdraw = fee > 0 ? fee + 0.01 : 0.01;

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-gray-400">
          Amount (max {formatCurrency(availableBalance)})
        </label>
        <Input
          type="number"
          max={availableBalance}
          min={minWithdraw}
          step={0.01}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <WalletWithdrawFeeNotice amount={amount} feeUsdt={fee} className="mt-2" />
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
        disabled={
          loading ||
          !Number.isFinite(gross) ||
          gross < minWithdraw ||
          gross > availableBalance
        }
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {net != null ? `Withdraw ${formatCurrency(net)}` : "Withdraw"}
      </Button>
    </div>
  );
}
