"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type SavedWithdrawalWallet, type WithdrawalWalletNetwork } from "@/lib/api";
import { Loader2, Trash2, X } from "lucide-react";

const NETWORKS: WithdrawalWalletNetwork[] = ["TRC20", "ERC20", "BEP20"];

function maskAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function maskWithdrawalWalletAddress(address: string) {
  return maskAddress(address);
}

export function WalletAddWithdrawalWalletModal({
  open,
  onClose,
  onSaved,
  networks,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Limit selectable networks (auto-withdraw uses TRC20 only). */
  networks?: readonly WithdrawalWalletNetwork[];
}) {
  const networkOptions = networks?.length ? networks : NETWORKS;
  const [label, setLabel] = useState("");
  const [network, setNetwork] = useState<WithdrawalWalletNetwork>(
    networkOptions[0] ?? "TRC20",
  );
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lockNetwork = networkOptions.length === 1;

  useEffect(() => {
    if (!open) {
      setLabel("");
      setNetwork(networks?.[0] ?? "TRC20");
      setAddress("");
      setError("");
    }
  }, [open, networks]);

  async function save() {
    setError("");
    setLoading(true);
    try {
      await api.wallet.saveWithdrawalWallet({
        label: label.trim(),
        address: address.trim(),
        network,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save wallet");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="modal-overlay fixed inset-0 z-[130] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="modal-panel w-full max-w-md rounded-t-2xl border border-white/10 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">Add withdrawal wallet</h2>
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
            Save a USDT address for withdrawals. No email verification.
          </p>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Description</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. My Binance USDT"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Network</label>
            {lockNetwork ? (
              <p className="rounded-md border border-border bg-navy px-3 py-2 text-sm text-foreground">
                {network}
              </p>
            ) : (
              <select
                value={network}
                onChange={(e) =>
                  setNetwork(e.target.value as WithdrawalWalletNetwork)
                }
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                {networkOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1 text-xs text-gray-500">
              USDT on TRC20, BEP20, or ERC20.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">
              Wallet address
            </label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={network === "TRC20" ? "T..." : "0x..."}
              className="font-mono text-sm"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button
            className="w-full"
            disabled={loading || !label.trim() || !address.trim()}
            onClick={() => void save()}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save wallet
          </Button>
        </div>
      </div>
    </div>
  );
}

export function WalletSavedWithdrawalWallets({
  onChanged,
  trc20Only = false,
  hideHeader = false,
}: {
  onChanged?: () => void;
  trc20Only?: boolean;
  hideHeader?: boolean;
}) {
  const [wallets, setWallets] = useState<SavedWithdrawalWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const items = await api.wallet.withdrawalWallets();
      setWallets(
        items.filter((w) =>
          trc20Only
            ? w.network === "TRC20"
            : w.network === "TRC20" ||
              w.network === "ERC20" ||
              w.network === "BEP20",
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load wallets");
      setWallets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [trc20Only]);

  async function removeWallet(id: string) {
    setRemovingId(id);
    try {
      await api.wallet.removeWithdrawalWallet(id);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove wallet");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <>
      <div className="space-y-3">
        {!hideHeader && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-white">Saved withdrawal wallets</p>
          <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
            Add wallet
          </Button>
        </div>
        )}
        {hideHeader && (
          <Button className="w-full" onClick={() => setAddOpen(true)}>
            Add wallet
          </Button>
        )}
        {loading ? (
          <p className="text-sm text-gray-400">Loading wallets…</p>
        ) : wallets.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-gray-400">
            No wallets yet. Add one to withdraw USDT.
          </p>
        ) : (
          <ul className="space-y-2">
            {wallets.map((wallet) => (
              <li
                key={wallet.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-medium text-white">{wallet.label}</p>
                  <p className="text-xs text-gray-400">
                    {wallet.network} · <span className="font-mono">{maskAddress(wallet.address)}</span>
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-white/5 hover:text-danger"
                  disabled={removingId === wallet.id}
                  onClick={() => void removeWallet(wallet.id)}
                  aria-label={`Remove ${wallet.label}`}
                >
                  {removingId === wallet.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      <WalletAddWithdrawalWalletModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          void load();
          onChanged?.();
        }}
      />
    </>
  );
}

export function WalletSavedWalletsModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="modal-overlay fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="modal-panel flex max-h-[88vh] w-full max-w-md flex-col rounded-t-2xl border border-white/10 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Withdrawal wallets</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Saved addresses for USDT payouts.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          <WalletSavedWithdrawalWallets hideHeader onChanged={onChanged} />
        </div>
      </div>
    </div>
  );
}
