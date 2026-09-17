"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Settings2 } from "lucide-react";
import type { UserSettings } from "@/lib/api";

export function payoutDestinationLabel(settings: UserSettings | null) {
  const profile = settings?.profile;
  if (!profile?.payoutMethod) return null;
  if (profile.payoutMethod === "TRC20" && profile.trc20Address) {
    return `TRC20: ${profile.trc20Address}`;
  }
  if (profile.payoutMethod === "MOBILE_MONEY" && profile.mobileMoneyNumber) {
    const provider = profile.mobileMoneyProvider ?? "Mobile money";
    return `${provider}: ${profile.mobileMoneyNumber}`;
  }
  return null;
}

type Props = {
  disabled?: boolean;
  settings: UserSettings | null;
  submitLabel?: string;
  onSubmit: (walletAddress?: string) => Promise<void>;
};

export function PayoutRequestForm({
  disabled = false,
  settings,
  submitLabel = "Request payout",
  onSubmit,
}: Props) {
  const savedDestination = payoutDestinationLabel(settings);
  const hasSavedDetails = Boolean(savedDestination);
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const method = settings?.profile?.payoutMethod;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onSubmit(hasSavedDetails ? undefined : wallet.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  if (hasSavedDetails) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-400">
          Payout will be sent to your saved{" "}
          {method === "MOBILE_MONEY" ? "mobile money" : "TRC20"} details:
        </p>
        <p className="truncate font-mono text-xs text-gray-300">{savedDestination}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={disabled || loading}
            onClick={() => void handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
          </Button>
          <Link href="/settings">
            <Button type="button" size="sm" variant="secondary">
              <Settings2 className="mr-1 h-3.5 w-3.5" />
              Edit details
            </Button>
          </Link>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <p className="text-xs text-amber-400/90">
        Add payout details in{" "}
        <Link href="/settings" className="underline">
          Settings
        </Link>{" "}
        for faster requests, or enter a one-time destination below.
      </p>
      <Label className="text-xs text-gray-400">
        USDT TRC20 address or mobile money (Provider: number)
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="T... or MTN: +256..."
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          disabled={disabled || loading}
          className="font-mono text-sm"
        />
        <Button type="submit" size="sm" disabled={disabled || loading || !wallet.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
