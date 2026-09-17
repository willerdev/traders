"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  type AutoWithdrawSettings,
  type SavedWithdrawalWallet,
} from "@/lib/api";
import {
  maskWithdrawalWalletAddress,
  WalletAddWithdrawalWalletModal,
} from "@/components/wallet/wallet-saved-withdrawal-wallets";
import {
  Check,
  Clock,
  Loader2,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

const TRC20_ONLY = ["TRC20"] as const;

export function WalletAutoWithdrawSettings({
  eligible,
  availableBalance,
  onUpdated,
}: {
  eligible: boolean;
  availableBalance?: number;
  onUpdated?: () => void;
}) {
  const [settings, setSettings] = useState<AutoWithdrawSettings | null>(null);
  const [wallets, setWallets] = useState<SavedWithdrawalWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState("");
  const [useFullAvailable, setUseFullAvailable] = useState(true);
  const [amount, setAmount] = useState("");
  const [savedWalletId, setSavedWalletId] = useState("");
  const [enabled, setEnabled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, w] = await Promise.all([
        api.wallet.autoWithdrawSettings(),
        api.wallet.withdrawalWallets(),
      ]);
      setSettings(s);
      const trc20 = w.filter((x) => x.network === "TRC20");
      setWallets(trc20);
      setUseFullAvailable(s.useFullAvailable);
      setAmount(s.amount != null ? String(s.amount) : "");
      const currentId = s.savedWalletId ?? s.savedWallet?.id ?? "";
      setSavedWalletId(currentId || (trc20.length === 1 ? trc20[0].id : ""));
      setEnabled(s.enabled);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load auto-withdraw",
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
      setError(e instanceof Error ? e.message : "Could not save auto-withdraw");
    } finally {
      setSaving(false);
    }
  }

  async function removeWallet(id: string) {
    setRemovingId(id);
    setError("");
    try {
      await api.wallet.removeWithdrawalWallet(id);
      if (savedWalletId === id) setSavedWalletId("");
      await load();
      onUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove wallet");
    } finally {
      setRemovingId(null);
    }
  }

  const isEligible = eligible && (settings?.eligible ?? eligible);
  const controlsDisabled = !isEligible || saving;
  const minHint = settings?.minFeeUsdt ?? 3;
  const balance = availableBalance ?? settings?.availableBalance ?? 0;
  const selectedWallet = wallets.find((w) => w.id === savedWalletId);

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-muted">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Loading auto-withdraw…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border bg-surface p-5 sm:p-6",
        )}
      >
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-28",
            enabled
              ? "bg-gradient-to-b from-success/20 to-transparent"
              : "bg-gradient-to-b from-primary/15 to-transparent",
          )}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Available to send
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {formatCurrency(balance)}
            </p>
            <p className="mt-1 text-sm text-muted">USDT · from your wallet</p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
              enabled
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-navy text-muted",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                enabled ? "bg-success" : "bg-muted",
              )}
            />
            {enabled ? "On" : "Off"}
          </span>
        </div>
        <dl className="relative mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-navy/60 px-3 py-2.5">
            <dt className="text-[10px] uppercase tracking-wide text-muted">
              Schedule
            </dt>
            <dd className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Clock className="h-3.5 w-3.5 text-cyan" />
              09:00 Kampala
            </dd>
          </div>
          <div className="rounded-xl border border-border bg-navy/60 px-3 py-2.5">
            <dt className="text-[10px] uppercase tracking-wide text-muted">
              Last send
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {settings?.lastAutoWithdrawAt
                ? new Date(settings.lastAutoWithdrawAt).toLocaleString()
                : "None yet"}
            </dd>
          </div>
        </dl>
      </section>

      {!isEligible && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Daily auto-withdraw is for new wallet depositors. Contact support if
          you believe you should have access.
        </p>
      )}

      <section
        className={cn(
          "rounded-2xl border border-border bg-surface p-5 sm:p-6",
          !isEligible && "opacity-60",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Destination wallet
            </h2>
            <p className="mt-1 text-sm text-muted">
              Pick a verified TRC20 address. soloEmma sends here once a day.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!isEligible}
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {wallets.length === 0 ? (
          <button
            type="button"
            disabled={!isEligible}
            onClick={() => setAddOpen(true)}
            className="mt-4 flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-navy/40 px-4 py-8 text-center transition hover:border-primary/50 hover:bg-navy/70 disabled:cursor-not-allowed"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Wallet className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium text-foreground">
              Add a TRC20 wallet
            </span>
            <span className="text-xs text-muted">
              Add a TRC20 wallet for daily auto-withdraw.
            </span>
          </button>
        ) : (
          <ul className="mt-4 space-y-2">
            {wallets.map((wallet) => {
              const selected = wallet.id === savedWalletId;
              return (
                <li key={wallet.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-3 transition",
                      selected
                        ? "border-cyan/50 bg-navy ring-1 ring-cyan/30"
                        : "border-border bg-navy/40",
                    )}
                  >
                    <button
                      type="button"
                      disabled={controlsDisabled}
                      onClick={() => setSavedWalletId(wallet.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                          selected
                            ? "bg-cyan/15 text-cyan"
                            : "bg-primary/10 text-primary",
                        )}
                      >
                        {selected ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Wallet className="h-4 w-4" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {wallet.label}
                        </span>
                        <span className="block truncate font-mono text-xs text-muted">
                          TRC20 · {maskWithdrawalWalletAddress(wallet.address)}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg p-2 text-muted transition hover:bg-white/5 hover:text-danger disabled:opacity-50"
                      disabled={removingId === wallet.id || saving}
                      onClick={() => void removeWallet(wallet.id)}
                      aria-label={`Remove ${wallet.label}`}
                    >
                      {removingId === wallet.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        className={cn(
          "rounded-2xl border border-border bg-surface p-5 sm:p-6",
          !isEligible && "opacity-60",
        )}
      >
        <h2 className="text-base font-semibold text-foreground">
          Daily amount
        </h2>
        <p className="mt-1 text-sm text-muted">
          Send everything available, or a fixed USDT amount each day.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={controlsDisabled}
            onClick={() => setUseFullAvailable(true)}
            className={cn(
              "rounded-xl border px-4 py-3 text-left transition",
              useFullAvailable
                ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                : "border-border bg-navy/40 hover:border-primary/40",
            )}
          >
            <p className="text-sm font-semibold text-foreground">
              Full balance
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Withdraw whatever is available
            </p>
          </button>
          <button
            type="button"
            disabled={controlsDisabled}
            onClick={() => setUseFullAvailable(false)}
            className={cn(
              "rounded-xl border px-4 py-3 text-left transition",
              !useFullAvailable
                ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                : "border-border bg-navy/40 hover:border-primary/40",
            )}
          >
            <p className="text-sm font-semibold text-foreground">
              Fixed amount
            </p>
            <p className="mt-0.5 text-xs text-muted">Same USDT every day</p>
          </button>
        </div>

        {!useFullAvailable && (
          <div className="mt-3">
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
              Amount (USDT)
            </label>
            <Input
              type="number"
              min={minHint + 0.01}
              step="0.01"
              placeholder={`Min ~$${(minHint + 0.01).toFixed(2)} after fees`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={controlsDisabled}
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Daily auto-withdraw
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {!isEligible
                ? "Unavailable on this account"
                : !savedWalletId
                  ? "Select a destination wallet first"
                  : enabled
                    ? selectedWallet
                      ? `On — sending to ${selectedWallet.label}`
                      : "On — runs once per day"
                    : "Off — nothing is sent automatically"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={enabled ? "Turn off auto-withdraw" : "Turn on auto-withdraw"}
            disabled={controlsDisabled || !savedWalletId}
            onClick={() => void save(!enabled)}
            className={cn(
              "relative h-8 w-14 shrink-0 rounded-full transition",
              enabled ? "bg-success" : "bg-navy border border-border",
              (controlsDisabled || !savedWalletId) && "cursor-not-allowed opacity-50",
            )}
          >
            <span
              className={cn(
                "absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all",
                enabled ? "left-7" : "left-1",
              )}
            />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            className="w-full sm:flex-1"
            variant={enabled ? "secondary" : "default"}
            disabled={controlsDisabled || !savedWalletId}
            onClick={() => void save(!enabled)}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : enabled ? (
              "Turn off"
            ) : (
              "Turn on daily sends"
            )}
          </Button>
          {!enabled && savedWalletId && isEligible && (
            <Button
              type="button"
              variant="ghost"
              className="w-full sm:w-auto"
              disabled={controlsDisabled}
              onClick={() => void save()}
            >
              Save preferences
            </Button>
          )}
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <WalletAddWithdrawalWalletModal
        open={addOpen}
        networks={TRC20_ONLY}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          void load();
          onUpdated?.();
        }}
      />
    </div>
  );
}
