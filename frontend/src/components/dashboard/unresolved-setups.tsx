"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type OpenSetupItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  RefreshCw,
  Target,
  Archive,
  Clock,
} from "lucide-react";
import Link from "next/link";
import {
  SetupDetailModal,
  type SetupSummary,
} from "@/components/dashboard/setup-detail-modal";
import { SetupExecutionBadge } from "@/components/dashboard/setup-execution-badge";

type Props = {
  onClaimed?: () => void;
};

function toSummary(setup: OpenSetupItem): SetupSummary {
  return {
    signalId: setup.signalId,
    symbol: setup.symbol,
    direction: setup.direction,
    entryMin: setup.entryMin,
    entryMax: setup.entryMax,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    status: "OPEN",
    submittedAt: setup.submittedAt,
  };
}

export function UnresolvedSetupsCard({ onClaimed }: Props) {
  const [items, setItems] = useState<OpenSetupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archivingAll, setArchivingAll] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [selected, setSelected] = useState<SetupSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.signals.openUnresolved();
      setItems(res.items ?? []);
    } catch (err) {
      setItems([]);
      setError(
        err instanceof Error ? err.message : "Could not load open setups",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleArchiveAll() {
    if (
      !confirm(
        `Archive all ${items.length} open setup(s)? This hides them locally without cancelling Hub orders.`,
      )
    ) {
      return;
    }

    setArchivingAll(true);
    setSuccess(null);
    setError(null);
    try {
      const result = await api.signals.archiveAll();
      setSuccess(
        `${result.archivedCount} setup${result.archivedCount !== 1 ? "s" : ""} archived`,
      );
      await load();
      onClaimed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive all failed");
    } finally {
      setArchivingAll(false);
    }
  }

  function handleUpdated() {
    void load();
    onClaimed?.();
  }

  const claimable = items.filter((i) => i.resolution.claimable);
  const openOnly = items.filter((i) => !i.resolution.claimable);

  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="lg:col-span-2 border-amber-500/20 bg-amber-500/[0.03]">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-amber-400" />
              Unresolved Setups
            </CardTitle>
            <p className="mt-1 text-sm text-gray-500">
              Click a setup for progress, claim TP/SL, or invalidate. TP claims
              on{" "}
              <Link href="/tp-claims" className="text-primary hover:underline">
                TP Claims
              </Link>
              .
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {items.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-gray-400"
                disabled={loading || archivingAll}
                onClick={() => void handleArchiveAll()}
              >
                {archivingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
                Archive all
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={load}
              disabled={loading}
              className="gap-1"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-gray-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Checking open setups…
            </div>
          ) : (
            <div className="space-y-3">
              {success && (
                <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {success}
                </div>
              )}
              {error && (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}

              {claimable.length === 0 && openOnly.length > 0 && (
                <p className="text-sm text-gray-500">
                  {openOnly.length} setup{openOnly.length !== 1 ? "s" : ""} still
                  open — click to view trade progress.
                </p>
              )}

              {[...claimable, ...openOnly].map((setup) => {
                const res = setup.resolution;
                return (
                  <button
                    key={setup.id}
                    type="button"
                    onClick={() => setSelected(toSummary(setup))}
                    className={cn(
                      "flex w-full flex-col gap-2 rounded-lg border border-white/5",
                      "bg-white/[0.02] p-4 text-left transition-colors sm:flex-row sm:items-center sm:justify-between",
                      "hover:border-amber-500/30 hover:bg-amber-500/5",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold text-white">
                          {setup.symbol}
                        </span>
                        <Badge
                          variant={
                            setup.direction === "BUY" ? "success" : "danger"
                          }
                        >
                          {setup.direction}
                        </Badge>
                        {res.executionPhase && (
                          <SetupExecutionBadge
                            phase={res.executionPhase}
                            label={res.executionLabel}
                          />
                        )}
                        {res.canClaimTp && (
                          <Badge variant="success">Claim TP</Badge>
                        )}
                        {res.canClaimTp1R1 && (
                          <Badge variant="secondary" className="text-success">
                            Claim 1:1
                          </Badge>
                        )}
                        {res.canClaimSl && (
                          <Badge variant="danger">Claim SL</Badge>
                        )}
                        {res.pendingTpClaim && (
                          <Badge variant="secondary" className="gap-1">
                            <Clock className="h-3 w-3" />
                            TP review
                          </Badge>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        Entry {setup.entryMin} – {setup.entryMax} · TP{" "}
                        {setup.takeProfit} · SL {setup.stopLoss}
                      </p>
                      <p className="mt-1 text-xs text-gray-600">
                        Submitted {new Date(setup.submittedAt).toLocaleString()}
                        {res.currentPrice != null && (
                          <> · Market {res.currentPrice}</>
                        )}
                        {res.hubStatus && <> · Hub {res.hubStatus}</>}
                      </p>
                    </div>
                    <ChevronRight className="hidden h-5 w-5 shrink-0 text-gray-600 sm:block" />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <SetupDetailModal
          setup={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </>
  );
}
