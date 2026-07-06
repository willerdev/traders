"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, type Mt5SyncStatus } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Mt5LiveSyncPaymentPanel } from "@/components/mt5/mt5-live-sync-payment-panel";
import { Radio, RefreshCw } from "lucide-react";

type Props = {
  tradingActive: boolean;
  linkedAccountId?: string | null;
  compact?: boolean;
};

export function Mt5LiveSyncCard({
  tradingActive,
  linkedAccountId,
  compact = false,
}: Props) {
  const [status, setStatus] = useState<Mt5SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCheckout, setShowCheckout] = useState(false);
  const [toggling, setToggling] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.payments.mt5SyncStatus();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tradingActive) return;
    void refresh();
  }, [tradingActive, refresh]);

  if (!tradingActive) return null;

  const hasLinkedAccount = Boolean(
    linkedAccountId?.trim() || status?.linkedAccountId?.trim(),
  );
  const active = status?.active ?? false;
  const feeUsdt = status?.feeUsdt ?? 5;

  async function toggleEnabled(enabled: boolean) {
    setToggling(true);
    try {
      const next = await api.mt5Sync.setEnabled(enabled);
      setStatus((prev) => (prev ? { ...prev, ...next } : next));
    } finally {
      setToggling(false);
    }
  }

  const body = (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Trade on your linked MT5 account — the platform creates setups automatically and
        mirrors your open, modify, and close actions. Sync runs about every 30 seconds.
      </p>

      {!hasLinkedAccount && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Link your MT5 trading account in{" "}
          <Link href="/settings" className="font-medium underline">
            Settings
          </Link>{" "}
          before subscribing.
        </p>
      )}

      {status && (
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <span className="text-muted">Linked account</span>
            <p className="font-mono text-foreground">
              {status.linkedAccountId ?? "Not linked"}
            </p>
          </div>
          <div>
            <span className="text-muted">Expires</span>
            <p className="text-foreground">
              {status.expiresAt
                ? new Date(status.expiresAt).toLocaleString()
                : active
                  ? "—"
                  : "Not subscribed"}
            </p>
          </div>
          {status.lastSyncedAt && (
            <div>
              <span className="text-muted">Last sync</span>
              <p className="text-foreground">
                {new Date(status.lastSyncedAt).toLocaleString()}
              </p>
            </div>
          )}
          {active && (
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <span className="text-muted">Sync enabled</span>
              <Button
                size="sm"
                variant={status.enabled ? "secondary" : "ghost"}
                disabled={toggling}
                onClick={() => void toggleEnabled(!status.enabled)}
              >
                {status.enabled ? "On" : "Off"}
              </Button>
            </div>
          )}
        </div>
      )}

      {!active ? (
        <>
          {!showCheckout ? (
            <Button
              onClick={() => setShowCheckout(true)}
              disabled={!hasLinkedAccount || loading}
              className="w-full sm:w-auto"
            >
              Pay {formatCurrency(feeUsdt)}/week
            </Button>
          ) : (
            <Mt5LiveSyncPaymentPanel
              feeUsdt={feeUsdt}
              onComplete={() => {
                setShowCheckout(false);
                void refresh();
              }}
            />
          )}
        </>
      ) : (
        <p className="text-xs text-muted">
          {status?.openLinks ?? 0} open synced position
          {(status?.openLinks ?? 0) === 1 ? "" : "s"} tracked.
        </p>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="border-b border-[var(--mt5-divider)] bg-[var(--mt5-surface)] px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">MT5 Live Sync</span>
            {active ? (
              <Badge variant="success" className="text-[10px]">
                Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                Add-on
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {!active && hasLinkedAccount && (
          <Button
            size="sm"
            className="w-full"
            onClick={() => setShowCheckout(true)}
          >
            Enable — {formatCurrency(feeUsdt)}/week
          </Button>
        )}
        {showCheckout && (
          <div className="mt-3">
            <Mt5LiveSyncPaymentPanel
              feeUsdt={feeUsdt}
              onComplete={() => {
                setShowCheckout(false);
                void refresh();
              }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-4 w-4 text-primary" />
            MT5 Live Sync
          </CardTitle>
          <p className="mt-1 text-xs text-muted">
            {active
              ? "Your MT5 trades sync to the platform automatically"
              : `${formatCurrency(feeUsdt)}/week — no manual setup upload`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {active ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="secondary">Add-on</Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void refresh()}
            disabled={loading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">{body}</CardContent>
    </Card>
  );
}
