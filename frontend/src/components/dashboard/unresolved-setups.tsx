"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type OpenSetupItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, RefreshCw, Target, Archive, Clock } from "lucide-react";
import Link from "next/link";
import { ClaimTpModal } from "@/components/dashboard/claim-tp-modal";

type Props = {
  onClaimed?: () => void;
};

export function UnresolvedSetupsCard({ onClaimed }: Props) {
  const [items, setItems] = useState<OpenSetupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tpModal, setTpModal] = useState<{ signalId: string; symbol: string } | null>(null);

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

  async function handleClaimSl(signalId: string) {
    if (
      !confirm(
        "Claim stop loss for this setup? Your account will be scored and the setup marked resolved.",
      )
    ) {
      return;
    }

    setClaiming(`${signalId}:sl`);
    setSuccess(null);
    setError(null);
    try {
      const result = await api.signals.claim(signalId, "sl");
      setSuccess(`${result.outcome?.toUpperCase() ?? "SL"} claimed — setup resolved`);
      await load();
      onClaimed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setClaiming(null);
    }
  }

  function openTpModal(signalId: string, symbol: string) {
    setError(null);
    setTpModal({ signalId, symbol });
  }

  async function handleArchive(signalId: string, symbol: string) {
    if (
      !confirm(
        `Archive ${symbol}? It will be removed from open setups with no score or wallet change.`,
      )
    ) {
      return;
    }

    setArchiving(signalId);
    setSuccess(null);
    setError(null);
    try {
      await api.signals.archive(signalId);
      setSuccess(`${symbol} archived`);
      await load();
      onClaimed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setArchiving(null);
    }
  }

  const claimable = items.filter((i) => i.resolution.claimable);
  const openOnly = items.filter((i) => !i.resolution.claimable);

  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <Card className="lg:col-span-2 border-amber-500/20 bg-amber-500/[0.03]">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-amber-400" />
            Unresolved Setups
          </CardTitle>
          <p className="mt-1 text-sm text-gray-500">
            Open setups that hit TP or SL but were not auto-recorded. TP claims
            require before/after screenshots and admin approval — track them on{" "}
            <Link href="/tp-claims" className="text-primary hover:underline">
              TP Claims
            </Link>
            .
          </p>
        </div>
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
      </CardHeader>
      <CardContent>
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Checking open setups…
          </div>
        ) : (
          <div className="space-y-4">
            {success && (
              <div className="flex flex-col gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {success}
                </div>
                {success.includes("review") && (
                  <Link href="/tp-claims" className="text-xs underline">
                    View TP Claims status
                  </Link>
                )}
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
                open — none are ready to claim yet (price has not reached TP/SL
                and Hub has not confirmed execution).
              </p>
            )}

            {[...claimable, ...openOnly].map((setup) => {
              const res = setup.resolution;
              const claimingSl = claiming === `${setup.signalId}:sl`;
              const isArchiving = archiving === setup.signalId;

              return (
                <div
                  key={setup.id}
                  className="rounded-lg border border-white/5 bg-white/[0.02] p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
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
                        <Badge variant="secondary">OPEN</Badge>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        Entry {setup.entryMin} – {setup.entryMax} · TP{" "}
                        {setup.takeProfit} · SL {setup.stopLoss}
                      </p>
                      <p className="mt-1 text-xs text-gray-600">
                        Submitted {new Date(setup.submittedAt).toLocaleString()}
                        {res.currentPrice != null && (
                          <>
                            {" · "}
                            Market {res.currentPrice}
                          </>
                        )}
                        {res.hubStatus && (
                          <>
                            {" · "}
                            Hub {res.hubStatus}
                          </>
                        )}
                        {res.pendingTpClaim && (
                          <>
                            {" · "}
                            <span className="text-amber-400">TP claim pending review</span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {res.canClaimTp && (
                        <Button
                          variant="success"
                          size="sm"
                          disabled={Boolean(claiming)}
                          onClick={() => openTpModal(setup.signalId, setup.symbol)}
                        >
                          Claim TP
                        </Button>
                      )}
                      {res.pendingTpClaim && !res.canClaimTp && (
                        <span className="flex items-center gap-1 self-center text-xs text-amber-400">
                          <Clock className="h-3.5 w-3.5" />
                          Review pending
                        </span>
                      )}
                      {res.canClaimSl && (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={Boolean(claiming)}
                          onClick={() => handleClaimSl(setup.signalId)}
                        >
                          {claimingSl ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Claim SL"
                          )}
                        </Button>
                      )}
                      {!res.canClaimTp && !res.canClaimSl && !res.pendingTpClaim && (
                        <span className="self-center text-xs text-gray-500">
                          Awaiting TP/SL
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-gray-400"
                        disabled={Boolean(claiming) || isArchiving}
                        onClick={() =>
                          handleArchive(setup.signalId, setup.symbol)
                        }
                      >
                        {isArchiving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Archive className="h-3.5 w-3.5" />
                        )}
                        Archive
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {tpModal && (
        <ClaimTpModal
          signalId={tpModal.signalId}
          symbol={tpModal.symbol}
          onClose={() => setTpModal(null)}
          onSubmitted={(msg) => {
            setSuccess(msg);
            void load();
            onClaimed?.();
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </Card>
  );
}
