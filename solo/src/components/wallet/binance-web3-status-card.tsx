"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, type BinanceWeb3Status } from "@/lib/api";
import { Loader2 } from "lucide-react";

export function BinanceWeb3StatusCard() {
  const [status, setStatus] = useState<BinanceWeb3Status | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.wallet
      .binanceWeb3()
      .then(setStatus)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Binance Web3 wallet</CardTitle>
        <CardDescription>
          Users cannot deposit. Withdrawals send BEP20 USDT from the Binance
          Web3 address configured on solo-api.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading ? (
          <p className="flex items-center gap-2 text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking wallet…
          </p>
        ) : status ? (
          <>
            <p className="text-muted">{status.message}</p>
            {status.address ? (
              <p className="break-all font-mono text-xs text-foreground">
                {status.address}
              </p>
            ) : null}
            <p className="text-foreground">
              Available USDT:{" "}
              <span className="font-semibold tabular-nums">
                {status.usdtBalance.toFixed(2)}
              </span>
            </p>
          </>
        ) : (
          <p className="text-muted">Could not load Binance Web3 status.</p>
        )}
      </CardContent>
    </Card>
  );
}
