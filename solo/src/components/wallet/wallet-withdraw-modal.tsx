"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type SavedWithdrawalWallet } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import {
  WalletWithdrawResultModal,
  type WalletWithdrawResult,
} from "@/components/wallet/wallet-withdraw-result-modal";
import {
  WalletWithdrawFeeNotice,
  WALLET_WITHDRAWAL_FEE_USD,
  walletWithdrawNetAmount,
  estimateWithdrawalFees,
} from "@/components/wallet/wallet-withdraw-fee-notice";
import {
  WalletAddWithdrawalWalletModal,
  maskWithdrawalWalletAddress,
} from "@/components/wallet/wallet-saved-withdrawal-wallets";

function isCryptoNetwork(network?: string) {
  return network === "TRC20" || network === "ERC20" || network === "BEP20";
}

export function WalletWithdrawModal({
  open,
  onClose,
  availableBalance,
  feeUsdt = WALLET_WITHDRAWAL_FEE_USD,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  availableBalance: number;
  feeUsdt?: number;
  onComplete?: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [wallets, setWallets] = useState<SavedWithdrawalWallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [addWalletOpen, setAddWalletOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<WalletWithdrawResult | null>(null);

  const loadWallets = useCallback(async () => {
    setWalletsLoading(true);
    try {
      const items = (await api.wallet.withdrawalWallets()).filter((w) =>
        isCryptoNetwork(w.network),
      );
      setWallets(items);
      setSelectedWalletId((prev) =>
        prev && items.some((w) => w.id === prev) ? prev : (items[0]?.id ?? ""),
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
      setResult(null);
      return;
    }
    void loadWallets();
  }, [open, loadWallets]);

  const selectedWallet = wallets.find((w) => w.id === selectedWalletId);
  const gross = Number(amount);
  const fee = feeUsdt ?? WALLET_WITHDRAWAL_FEE_USD;
  const preview =
    Number.isFinite(gross) && gross > 0
      ? estimateWithdrawalFees(gross, fee, null)
      : null;
  const net = walletWithdrawNetAmount(amount, fee, null);

  async function submit() {
    setError("");
    if (!selectedWalletId) {
      setError("Select a saved USDT wallet or add one first");
      return;
    }
    setLoading(true);
    try {
      const sent = await api.wallet.withdraw(Number(amount), selectedWalletId);
      onComplete?.();
      const failure =
        sent.instantFailure ||
        sent.errorCode ||
        sent.status === "queued"
          ? sent.instantFailure || sent.message || "NOWPayments did not accept this withdrawal."
          : "";
      if (failure) {
        const missingCredentials =
          sent.errorCode === "missing_credentials" ||
          /not configured|payout login|api key|missing NOWPayments|credentials/i.test(
            failure,
          );
        setResult({
          ok: false,
          title: "Withdrawal not sent",
          body: failure,
          missingCredentials,
        });
        return;
      }
      setResult({
        ok: true,
        title: "Withdrawal sent",
        body: `${formatCurrency(sent.netPayout)} USDT is being sent to your saved wallet.`,
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Withdrawal failed";
      setResult({
        ok: false,
        title: "Withdrawal failed",
        body: message,
        missingCredentials:
          /not configured|payout login|api key|missing NOWPayments|credentials/i.test(
            message,
          ),
      });
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const minWithdraw =
    preview && preview.totalFeesUsdt > 0
      ? preview.totalFeesUsdt + 0.01
      : fee > 0
        ? fee + 0.01
        : 0.01;
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
        onClick={result ? undefined : onClose}
      >
        <div
          className="modal-panel w-full max-w-md rounded-t-2xl border border-white/10 shadow-2xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="text-lg font-semibold text-white">Withdraw USDT</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4 p-5">
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
                  <WalletWithdrawFeeNotice
                    amount={amount}
                    feeUsdt={fee}
                    className="mt-2"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-xs text-gray-400">
                      USDT wallet
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
                      Add a USDT address (TRC20, BEP20, or ERC20) before
                      withdrawing.
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
          </div>
        </div>
      </div>

      <WalletWithdrawResultModal
        result={result}
        onClose={() => {
          const closeAll = result?.ok;
          setResult(null);
          if (closeAll) onClose();
        }}
      />
      <WalletAddWithdrawalWalletModal
        open={addWalletOpen}
        onClose={() => setAddWalletOpen(false)}
        onSaved={() => void loadWallets()}
      />
    </>
  );
}
