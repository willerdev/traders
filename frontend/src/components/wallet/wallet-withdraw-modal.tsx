"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type SavedWithdrawalWallet } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle2, Loader2, X } from "lucide-react";
import {
  WalletWithdrawFeeNotice,
  WALLET_WITHDRAWAL_FEE_USD,
  walletWithdrawNetAmount,
} from "@/components/wallet/wallet-withdraw-fee-notice";
import {
  WalletAddWithdrawalWalletModal,
  maskWithdrawalWalletAddress,
} from "@/components/wallet/wallet-saved-withdrawal-wallets";

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
  const [wallets, setWallets] = useState<SavedWithdrawalWallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [addWalletOpen, setAddWalletOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const loadWallets = useCallback(async () => {
    setWalletsLoading(true);
    try {
      const items = await api.wallet.withdrawalWallets();
      const trc20 = items.filter((w) => w.network === "TRC20");
      setWallets(trc20);
      setSelectedWalletId((prev) =>
        prev && trc20.some((w) => w.id === prev) ? prev : (trc20[0]?.id ?? ""),
      );
    } catch {
      setWallets([]);
      setSelectedWalletId("");
    } finally {
      setWalletsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setAmount("");
      setError("");
      setSuccess(false);
      return;
    }
    void loadWallets();
  }, [open, loadWallets]);

  async function submit() {
    setError("");
    if (!selectedWalletId) {
      setError("Select a saved TRC20 wallet or add one first");
      return;
    }
    setLoading(true);
    try {
      await api.wallet.withdraw(Number(amount), selectedWalletId);
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
  const selectedWallet = wallets.find((w) => w.id === selectedWalletId);
  const canSubmit =
    !loading &&
    !walletsLoading &&
    Boolean(selectedWalletId) &&
    Number.isFinite(gross) &&
    gross >= minWithdraw &&
    gross <= availableBalance;

  return (
    <>
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
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-xs text-gray-400">
                      Withdraw to
                    </label>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => setAddWalletOpen(true)}
                    >
                      Add wallet
                    </button>
                  </div>
                  {walletsLoading ? (
                    <p className="text-sm text-gray-400">Loading saved wallets…</p>
                  ) : wallets.length === 0 ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                      Add a verified TRC20 wallet before withdrawing.
                    </div>
                  ) : (
                    <select
                      value={selectedWalletId}
                      onChange={(e) => setSelectedWalletId(e.target.value)}
                      className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    >
                      {wallets.map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {wallet.label} · {wallet.network} ·{" "}
                          {maskWithdrawalWalletAddress(wallet.address)}
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedWallet && (
                    <p className="mt-1 font-mono text-xs text-gray-500">
                      {selectedWallet.address}
                    </p>
                  )}
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

      <WalletAddWithdrawalWalletModal
        open={addWalletOpen}
        onClose={() => setAddWalletOpen(false)}
        onSaved={() => void loadWallets()}
      />
    </>
  );
}
