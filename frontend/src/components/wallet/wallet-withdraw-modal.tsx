"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { WalletWithdrawFeeNotice, WALLET_WITHDRAWAL_FEE_USD, walletWithdrawNetAmount } from "@/components/wallet/wallet-withdraw-fee-notice";

export function WalletWithdrawModal({
  open,
  onClose,
  availableBalance,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  availableBalance: number;
  onComplete?: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setAmount("");
      setWalletAddress("");
      setError("");
      setSuccess(false);
    }
  }, [open]);

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

  if (!open) return null;

  const gross = Number(amount);
  const net = walletWithdrawNetAmount(amount);
  const minWithdraw = WALLET_WITHDRAWAL_FEE_USD + 0.01;
  const canSubmit =
    !loading &&
    Number.isFinite(gross) &&
    gross >= minWithdraw &&
    gross <= availableBalance;

  return (
    <div
      className="modal-overlay fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="modal-panel w-full max-w-md rounded-t-2xl border border-white/10 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">Send / Withdraw</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="text-sm text-gray-300">
                Withdrawal requested. You will receive an email when processed.
              </p>
              <Button onClick={onClose}>Done</Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-400">
                Available:{" "}
                <strong className="text-white">
                  {formatCurrency(availableBalance)}
                </strong>
              </p>
              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  Amount (USDT)
                </label>
                <Input
                  type="number"
                  max={availableBalance}
                  min={minWithdraw}
                  step={0.01}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <WalletWithdrawFeeNotice amount={amount} className="mt-2" />
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
                className="w-full"
                onClick={() => void submit()}
                disabled={!canSubmit}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {net != null
                  ? `Withdraw ${formatCurrency(net)}`
                  : amount
                    ? `Withdraw ${formatCurrency(gross)}`
                    : "Withdraw"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
