"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type BinanceWeb3Status } from "@/lib/api";
import { Loader2 } from "lucide-react";

export function BinanceWeb3StatusCard({
  onChanged,
}: {
  onChanged?: (status: BinanceWeb3Status) => void;
} = {}) {
  const [status, setStatus] = useState<BinanceWeb3Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [privateKey, setPrivateKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    void api.wallet
      .binanceWeb3()
      .then(setStatus)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const next = await api.wallet.saveBinanceWeb3Key(privateKey.trim());
      setStatus(next);
      onChanged?.(next);
      setPrivateKey("");
      setMsg("Wallet connected. Your withdrawals now send USDT from it.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save key");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const next = await api.wallet.disconnectBinanceWeb3();
      setStatus(next);
      onChanged?.(next);
      setMsg("Disconnected. Your key was deleted from Soloema.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not disconnect");
    } finally {
      setSaving(false);
    }
  }

  const connected = Boolean(status?.configured);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Binance Web3 wallet</CardTitle>
        <CardDescription>
          Connect your own Binance Web3 wallet (BNB Smart Chain). Withdrawals
          send BEP20 USDT from it to your saved withdrawal address. Keep a
          little BNB in it for network fees.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading ? (
          <p className="flex items-center gap-2 text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking wallet…
          </p>
        ) : (
          <>
            {status && <p className="text-muted">{status.message}</p>}
            {connected && status?.address ? (
              <>
                <p className="break-all font-mono text-xs text-foreground">
                  {status.address}
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-foreground">
                  <p>
                    USDT:{" "}
                    <span className="font-semibold tabular-nums">
                      {status.usdtBalance.toFixed(2)}
                    </span>
                  </p>
                  <p>
                    BNB (fees):{" "}
                    <span className="font-semibold tabular-nums">
                      {(status.bnbBalance ?? 0).toFixed(4)}
                    </span>
                  </p>
                </div>
              </>
            ) : null}

            <form onSubmit={save} className="space-y-2">
              <Label htmlFor="binance-web3-key">
                {connected ? "Replace wallet private key" : "Wallet private key"}
              </Label>
              <Input
                id="binance-web3-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="64-character private key (not your seed phrase)"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                required
              />
              <p className="text-xs text-muted">
                Stored encrypted for your account only and never shown again.
                Use a wallet dedicated to payouts.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : connected ? "Replace key" : "Connect wallet"}
                </Button>
                {connected && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void disconnect()}
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            </form>
          </>
        )}
        {msg && <p className="text-sm text-success">{msg}</p>}
        {err && <p className="text-sm text-danger">{err}</p>}
      </CardContent>
    </Card>
  );
}
