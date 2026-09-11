"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  type AutoWithdrawSettings,
  type SavedWithdrawalWallet,
} from "@/lib/api";
import { maskWithdrawalWalletAddress } from "@/components/wallet/wallet-saved-withdrawal-wallets";
import { Loader2 } from "lucide-react";

export function WalletAutoWithdrawSettings({
  eligible,
  onUpdated,
}: {
  eligible: boolean;
  onUpdated?: () => void;
}) {
  const [settings, setSettings] = useState<AutoWithdrawSettings | null>(null);
  const [wallets, setWallets] = useState<SavedWithdrawalWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [useFullAvailable, setUseFullAvailable] = useState(true);
  const [amount, setAmount] = useState("");
  const [savedWalletId, setSavedWalletId] = useState("");
  const [enabled, setEnabled] = useState(false);

  const load = useCallback(async () => {
    if (!eligible) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [s, w] = await Promise.all([
        api.wallet.autoWithdrawSettings(),
        api.wallet.withdrawalWallets(),
      ]);
      setSettings(s);
      setWallets(w.filter((x) => x.network === "TRC20"));
      setUseFullAvailable(s.useFullAvailable);
      setAmount(s.amount != null ? String(s.amount) : "");
      setSavedWalletId(s.savedWalletId ?? s.savedWallet?.id ?? "");
      setEnabled(s.enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load auto-withdraw settings");
    } finally {
      setLoading(false);
    }
  }, [eligible]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(nextEnabled?: boolean) {
    setError("");
    setSaving(true);
    try {
      const payload: {
        enabled?: boolean;
        savedWalletId?: string | null;
        amount?: number | null;
        useFullAvailable?: boolean;
      } = {
        enabled: nextEnabled ?? enabled,
        savedWalletId: savedWalletId || null,
        useFullAvailable,
      };
      if (!useFullAvailable) {
        const n = Number(amount);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error("Enter a valid daily withdrawal amount");
        }
        payload.amount = n;
      }
      const updated = await api.wallet.updateAutoWithdrawSettings(payload);
      setSettings(updated);
      setEnabled(updated.enabled);
      onUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  if (!eligible) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading auto-withdraw…
      </div>
    );
  }

  const trc20Wallets = wallets;
  const minHint = settings?.minFeeUsdt ?? 3;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-300">
          Send earnings to your saved TRC20 wallet automatically each day at
          09:00 Kampala time.
        </p>
        {!settings?.kycApproved && (
          <p className="mt-2 text-sm text-amber-400">
            Complete{" "}
            <Link href="/settings" className="underline">
              KYC verification
            </Link>{" "}
            before enabling auto-withdraw.
          </p>
        )}
      </div>

      {trc20Wallets.length === 0 ? (
        <p className="text-sm text-gray-500">
          Add and verify a TRC20 withdrawal wallet above to use daily
          auto-withdraw.
        </p>
      ) : (
        <>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">
              Destination wallet
            </label>
            <select
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              value={savedWalletId}
              onChange={(e) => setSavedWalletId(e.target.value)}
              disabled={saving}
            >
              <option value="">Select TRC20 wallet</option>
              {trc20Wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label} — {maskWithdrawalWalletAddress(w.address)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="radio"
                name="autoWithdrawAmountMode"
                checked={useFullAvailable}
                onChange={() => setUseFullAvailable(true)}
                disabled={saving}
              />
              Withdraw full available balance daily
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="radio"
                name="autoWithdrawAmountMode"
                checked={!useFullAvailable}
                onChange={() => setUseFullAvailable(false)}
                disabled={saving}
              />
              Fixed amount (USDT)
            </label>
            {!useFullAvailable && (
              <Input
                type="number"
                min={minHint + 0.01}
                step="0.01"
                placeholder={`Min ~$${(minHint + 0.01).toFixed(2)} after fees`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={saving}
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3">
            <div>
              <p className="text-sm font-medium text-white">Daily auto-withdraw</p>
              <p className="text-xs text-gray-500">
                {enabled ? "On — runs once per day" : "Off"}
              </p>
            </div>
            <Button
              type="button"
              variant={enabled ? "secondary" : "default"}
              size="sm"
              disabled={saving || !settings?.kycApproved || !savedWalletId}
              onClick={() => void save(!enabled)}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : enabled ? (
                "Turn off"
              ) : (
                "Turn on"
              )}
            </Button>
          </div>

          {!enabled && savedWalletId && settings?.kycApproved && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted"
              disabled={saving}
              onClick={() => void save()}
            >
              Save preferences
            </Button>
          )}

          {settings?.lastAutoWithdrawAt && (
            <p className="text-xs text-gray-500">
              Last auto-withdraw:{" "}
              {new Date(settings.lastAutoWithdrawAt).toLocaleString()}
            </p>
          )}
        </>
      )}

      {error && (
        <p className="text-sm text-danger">{error}</p>
      )}
    </div>
  );
}
