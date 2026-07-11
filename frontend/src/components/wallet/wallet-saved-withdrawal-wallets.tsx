"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type SavedWithdrawalWallet, type WithdrawalWalletNetwork } from "@/lib/api";
import { Loader2, Trash2, X } from "lucide-react";

const NETWORKS: WithdrawalWalletNetwork[] = [
  "TRC20",
  "ERC20",
  "BEP20",
  "MOMO_MTN",
  "MOMO_AIRTEL",
];

function isMomoNetwork(network: string) {
  return network.startsWith("MOMO_");
}

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
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<"form" | "code">("form");
  const [label, setLabel] = useState("");
  const [network, setNetwork] = useState<WithdrawalWalletNetwork>("TRC20");
  const [address, setAddress] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setStep("form");
      setLabel("");
      setNetwork("TRC20");
      setAddress("");
      setSessionId("");
      setEmail("");
      setCode("");
      setError("");
    }
  }, [open]);

  async function requestCode() {
    setError("");
    setLoading(true);
    try {
      const res = await api.wallet.requestWithdrawalWalletVerification({
        label: label.trim(),
        address: address.trim(),
        network,
      });
      setSessionId(res.sessionId);
      setEmail(res.email);
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send verification code");
    } finally {
      setLoading(false);
    }
  }

  async function confirmCode() {
    setError("");
    setLoading(true);
    try {
      await api.wallet.confirmWithdrawalWallet(sessionId, code.trim());
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
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
          {step === "form" ? (
            <>
              <p className="text-sm text-gray-400">
                Save a wallet for withdrawals. We&apos;ll email you a code to verify
                ownership before it can be used.
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
                <select
                  value={network}
                  onChange={(e) =>
                    setNetwork(e.target.value as WithdrawalWalletNetwork)
                  }
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  {NETWORKS.map((n) => (
                    <option key={n} value={n}>
                      {n === "MOMO_MTN"
                        ? "MTN MoMo"
                        : n === "MOMO_AIRTEL"
                          ? "Airtel Money"
                          : n}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {isMomoNetwork(network)
                    ? "MoMo withdrawals send to your verified phone number via Flutterwave."
                    : "USDT crypto withdrawals currently send on TRC20 only."}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  {isMomoNetwork(network) ? "Phone number" : "Wallet address"}
                </label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={
                    isMomoNetwork(network)
                      ? "7XXXXXXXX"
                      : network === "TRC20"
                        ? "T..."
                        : "0x..."
                  }
                  inputMode={isMomoNetwork(network) ? "numeric" : "text"}
                  className={isMomoNetwork(network) ? "text-sm" : "font-mono text-sm"}
                />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button
                className="w-full"
                disabled={loading || !label.trim() || !address.trim()}
                onClick={() => void requestCode()}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send verification code
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-400">
                Enter the 6-digit code sent to <strong className="text-white">{email}</strong>{" "}
                to save <strong className="text-white">{label}</strong> ({network}).
              </p>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                className="text-center text-lg tracking-[0.35em]"
              />
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setStep("form")}
                  disabled={loading}
                >
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={loading || code.length !== 6}
                  onClick={() => void confirmCode()}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify & save
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function WalletSavedWithdrawalWallets({
  onChanged,
  trc20Only = false,
}: {
  onChanged?: () => void;
  trc20Only?: boolean;
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
      setWallets(trc20Only ? items.filter((w) => w.network === "TRC20") : items);
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
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-white">Saved withdrawal wallets</p>
          <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
            Add wallet
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-gray-400">Loading wallets…</p>
        ) : wallets.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-gray-400">
            No saved wallets yet. Add one with a description, network, and address —
            we&apos;ll verify it by email before you can withdraw.
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
