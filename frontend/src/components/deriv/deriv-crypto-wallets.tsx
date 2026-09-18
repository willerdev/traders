"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  api,
  type DerivCryptoWallet,
  type DerivCryptoWalletsResult,
} from "@/lib/api";
import { Loader2, Trash2 } from "lucide-react";

const NETWORKS = ["TRC20", "ERC20", "BEP20", "BTC", "ETH", "LTC", "USDC"] as const;

function maskAddress(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function Slot({
  title,
  hint,
  purpose,
  saved,
  onSaved,
}: {
  title: string;
  hint: string;
  purpose: "DEPOSIT" | "WITHDRAW";
  saved: DerivCryptoWallet | null;
  onSaved: (next: DerivCryptoWalletsResult) => void;
}) {
  const [network, setNetwork] = useState<(typeof NETWORKS)[number]>(
    (saved?.network as (typeof NETWORKS)[number]) || "TRC20",
  );
  const [address, setAddress] = useState(saved?.address ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (saved?.network && NETWORKS.includes(saved.network as (typeof NETWORKS)[number])) {
      setNetwork(saved.network as (typeof NETWORKS)[number]);
    }
    if (saved?.address) setAddress(saved.address);
  }, [saved?.network, saved?.address]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = await api.deriv.saveCryptoWallet({
        purpose,
        network,
        address: address.trim(),
      });
      onSaved(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const next = await api.deriv.deleteCryptoWallet(purpose);
      setAddress("");
      onSaved(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>
      {saved && (
        <p className="mt-2 font-mono text-xs text-cyan">
          {saved.network} · {maskAddress(saved.address)}
        </p>
      )}
      <form onSubmit={(e) => void save(e)} className="mt-3 space-y-2">
        <div className="space-y-1">
          <Label>Network</Label>
          <select
            className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-navy px-3 text-sm"
            value={network}
            onChange={(e) =>
              setNetwork(e.target.value as (typeof NETWORKS)[number])
            }
          >
            {NETWORKS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Wallet address</Label>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Paste the crypto address"
            required
            minLength={8}
          />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
          {saved && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Remove
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

export function DerivCryptoWallets() {
  const [wallets, setWallets] = useState<DerivCryptoWalletsResult>({
    deposit: null,
    withdraw: null,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await api.deriv.cryptoWallets();
    setWallets(res);
  }, []);

  useEffect(() => {
    void refresh()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [refresh]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deriv crypto addresses</CardTitle>
        <CardDescription>
          These are for Deriv only. Platform USDT deposits and daily
          auto-withdraw stay in Wallet — they are a different ledger.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {loading ? (
          <div className="flex justify-center py-8 sm:col-span-2">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : (
          <>
            <Slot
              title="Deposit address"
              hint="Network and wallet you use when sending crypto into Deriv."
              purpose="DEPOSIT"
              saved={wallets.deposit}
              onSaved={setWallets}
            />
            <Slot
              title="Auto-withdraw address"
              hint="Network and wallet Deriv should pay out to. Not the soloEmma platform wallet."
              purpose="WITHDRAW"
              saved={wallets.withdraw}
              onSaved={setWallets}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
