"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  api,
  type HubLogEvent,
  type HubSignalStatus,
  type SetupLiveTrade,
  type SetupResolution,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Ban,
  CheckCircle2,
  Circle,
  Loader2,
  Target,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";
import { ClaimTpModal } from "@/components/dashboard/claim-tp-modal";

export type SetupSummary = {
  signalId: string;
  symbol: string;
  direction: string;
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  status: string;
  submittedAt: string;
  screenshotUrl?: string;
};

type Props = {
  setup: SetupSummary;
  onClose: () => void;
  onUpdated: () => void;
};

type StepState = "done" | "current" | "pending" | "error";

function stepIcon(state: StepState) {
  if (state === "done") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (state === "current") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (state === "error") return <Circle className="h-4 w-4 text-danger" />;
  return <Circle className="h-4 w-4 text-gray-600" />;
}

function hubStageLabel(hub: HubSignalStatus | null) {
  if (!hub) return "Not queued on Signal Hub";
  const stage = hub.progress?.stage ?? hub.status;
  const msg = hub.progress?.message;
  return msg ? `${stage} — ${msg}` : stage;
}

function buildProgressSteps(
  setup: SetupSummary,
  resolution: SetupResolution | null,
  hub: HubSignalStatus | null,
): { label: string; detail: string; state: StepState }[] {
  const status = setup.status;
  const hubStatus = (hub?.status ?? resolution?.hubStatus ?? "").toLowerCase();
  const executed = hub?.progress?.executed ?? false;
  const activated = resolution?.activated ?? false;
  const terminal = ["WON", "LOST", "ARCHIVED", "CANCELLED", "REJECTED_DUPLICATE"];

  const submitted: StepState = "done";
  let hubState: StepState = "pending";
  if (hubStatus.includes("fail") || hubStatus === "invalidated") hubState = "error";
  else if (executed || ["executed", "filled", "closed"].some((s) => hubStatus.includes(s)))
    hubState = "done";
  else if (hub) hubState = "current";

  let tradeState: StepState = "pending";
  if (activated) tradeState = "done";
  else if (hubState === "done") tradeState = "current";
  else if (status === "OPEN" && hubState === "current") tradeState = "pending";

  let outcomeState: StepState = "pending";
  if (status === "WON") outcomeState = "done";
  else if (status === "LOST" || status === "ARCHIVED" || status === "CANCELLED")
    outcomeState = status === "LOST" ? "done" : "error";
  else if (resolution?.canClaimTp || resolution?.canClaimTp1R1 || resolution?.canClaimSl || resolution?.pendingTpClaim)
    outcomeState = "current";
  else if (terminal.includes(status)) outcomeState = "error";

  return [
    {
      label: "Submitted",
      detail: new Date(setup.submittedAt).toLocaleString(),
      state: submitted,
    },
    {
      label: "Signal Hub / MT5",
      detail: hub ? hubStageLabel(hub) : resolution?.hubStatus ?? "Waiting for execution queue",
      state: hubState,
    },
    {
      label: "Trade active",
      detail: activated
        ? "Price entered your zone — trade is live"
        : "Waiting for entry fill",
      state: tradeState,
    },
    {
      label: "Outcome",
      detail:
        status === "WON"
          ? "Take profit recorded"
          : status === "LOST"
            ? "Stop loss recorded"
            : resolution?.pendingTpClaim
              ? "TP claim pending admin review"
              : resolution?.canClaimTp
                ? "TP level reached — you can claim"
                : resolution?.canClaimTp1R1
                ? "1:1 RR reached — you can claim with proof"
                : resolution?.canClaimSl
                  ? "SL level reached — you can claim"
                  : resolution?.currentPrice != null
                    ? `Market ${resolution.currentPrice}`
                    : "Awaiting TP or SL",
      state: outcomeState,
    },
  ];
}

function PriceProgressBar({
  setup,
  currentPrice,
  oneToOnePrice,
}: {
  setup: SetupSummary;
  currentPrice: number | null | undefined;
  oneToOnePrice?: number | null;
}) {
  const sl = setup.stopLoss;
  const tp = setup.takeProfit;
  const entryMid = (setup.entryMin + setup.entryMax) / 2;
  const min = Math.min(sl, tp, setup.entryMin, setup.entryMax, oneToOnePrice ?? tp);
  const max = Math.max(sl, tp, setup.entryMin, setup.entryMax, oneToOnePrice ?? tp);
  const range = max - min || 1;

  const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / range) * 100))}%`;

  return (
    <div className="space-y-2">
      <div className="relative h-3 overflow-hidden rounded-full bg-white/10">
        <div
          className="absolute top-0 h-full rounded-full bg-primary/30"
          style={{
            left: pct(setup.entryMin),
            width: `calc(${pct(setup.entryMax)} - ${pct(setup.entryMin)})`,
          }}
        />
        {oneToOnePrice != null && oneToOnePrice !== tp && (
          <div
            className="absolute top-0 h-full w-0.5 bg-emerald-400/80"
            style={{ left: pct(oneToOnePrice) }}
            title={`1:1 RR ${oneToOnePrice}`}
          />
        )}
        {currentPrice != null && (
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-400 shadow"
            style={{ left: pct(currentPrice) }}
            title={`Market ${currentPrice}`}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>SL {sl}</span>
        <span>
          {oneToOnePrice != null && oneToOnePrice !== tp
            ? `1:1 ${oneToOnePrice}`
            : `Entry ${setup.entryMin}–${setup.entryMax}`}
        </span>
        <span>TP {tp}</span>
      </div>
      {currentPrice != null && (
        <p className="text-center text-xs text-gray-400">
          Mid entry {entryMid.toFixed(5)} · Live {currentPrice}
        </p>
      )}
    </div>
  );
}

export function SetupDetailModal({ setup, onClose, onUpdated }: Props) {
  const [loading, setLoading] = useState(true);
  const [resolution, setResolution] = useState<SetupResolution | null>(null);
  const [hub, setHub] = useState<HubSignalStatus | null>(null);
  const [logs, setLogs] = useState<HubLogEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showTpModal, setShowTpModal] = useState(false);
  const [tpClaimType, setTpClaimType] = useState<"full" | "rr_1_1">("full");
  const [success, setSuccess] = useState<string | null>(null);

  const isOpen = setup.status === "OPEN";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, hubStatus, logRes] = await Promise.all([
        api.signals.getResolution(setup.signalId).catch(() => null),
        api.signals.executionStatus(setup.signalId).catch(() => null),
        api.signals.executionLogs({ signal_id: setup.signalId, limit: 6 }).catch(() => ({
          items: [],
          count: 0,
        })),
      ]);
      setResolution(res);
      setHub(hubStatus);
      setLogs(logRes.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load setup details");
    } finally {
      setLoading(false);
    }
  }, [setup.signalId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (resolution?.liveTrade?.status !== "open" || !isOpen) return;
    const timer = setInterval(() => {
      void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [resolution?.liveTrade?.status, isOpen, load]);

  async function handlePlaceTrade() {
    if (
      !confirm(
        `Place ${setup.direction} ${setup.symbol} at market now?\n\nSL: ${setup.stopLoss}\nTP: ${setup.takeProfit}`,
      )
    ) {
      return;
    }
    setActionLoading("place");
    setActionError(null);
    try {
      const result = await api.signals.placeTrade(setup.signalId);
      const orderLabel = result.pending
        ? `Pending ${result.orderKind?.replace('ORDER_TYPE_', '').replace(/_/g, ' ')} @ ${result.entryPrice}`
        : `Trade placed at ${result.entryPrice}`;
      setSuccess(
        `${orderLabel} · ${result.risk.volume} lots (~${result.risk.riskPercent}% risk, est. loss ${result.risk.estimatedLossAtSl.toFixed(2)} ${result.risk.currency})`,
      );
      onUpdated();
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not place trade");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCloseTrade() {
    const tp1 = resolution?.liveTrade?.tp1Price ?? resolution?.oneToOnePrice;
    const tp1Label = tp1 != null ? String(tp1) : "1:1 RR";
    if (
      !confirm(
        `Close this live trade now?\n\nWin: only if price reached TP1 (${tp1Label})\nEven: closed before TP1 but not in loss\nLoss: closed below entry (buy) or above entry (sell)`,
      )
    ) {
      return;
    }
    setActionLoading("close");
    setActionError(null);
    try {
      const result = await api.signals.closeTrade(setup.signalId);
      setSuccess(result.message ?? "Trade closed");
      onUpdated();
      if (result.status === "closed") {
        onClose();
      } else {
        await load();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not close trade");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleInvalidate() {
    if (
      !confirm(
        `Invalidate ${setup.symbol}? This cancels the Hub order and archives the setup.`,
      )
    ) {
      return;
    }
    setActionLoading("invalidate");
    setActionError(null);
    try {
      const result = await api.signals.invalidate(setup.signalId);
      setSuccess(
        result.hubWarning
          ? `Archived. Hub note: ${result.hubWarning}`
          : `${setup.symbol} invalidated`,
      );
      onUpdated();
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Invalidate failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleClaimSl() {
    if (!confirm("Claim stop loss for this setup?")) return;
    setActionLoading("sl");
    setActionError(null);
    try {
      await api.signals.claim(setup.signalId, "sl");
      setSuccess("Stop loss claimed");
      onUpdated();
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleArchive() {
    if (!confirm(`Archive ${setup.symbol} locally?`)) return;
    setActionLoading("archive");
    setActionError(null);
    try {
      await api.signals.archive(setup.signalId);
      setSuccess(`${setup.symbol} archived`);
      onUpdated();
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setActionLoading(null);
    }
  }

  const steps = buildProgressSteps(setup, resolution, hub);
  const res = resolution;

  return (
    <>
      <div className="modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4">
        <Card
          className="modal-panel max-h-[92vh] w-full max-w-2xl overflow-y-auto border border-white/10 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Target className="h-5 w-5 text-primary" />
                  {setup.symbol}
                </CardTitle>
                <Badge variant={setup.direction === "BUY" ? "success" : "danger"}>
                  {setup.direction}
                </Badge>
                <Badge variant="secondary">{setup.status}</Badge>
              </div>
              <CardDescription className="mt-1 font-mono text-xs">
                {setup.signalId}
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-muted hover:bg-white/5 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </CardHeader>

          <CardContent className="space-y-5">
            {loading ? (
              <div className="flex justify-center py-12 text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                {error && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    {error}
                  </p>
                )}

                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <InfoRow label="Entry" value={`${setup.entryMin} – ${setup.entryMax}`} />
                  <InfoRow label="Take profit" value={String(setup.takeProfit)} />
                  <InfoRow label="Stop loss" value={String(setup.stopLoss)} />
                  <InfoRow
                    label="Submitted"
                    value={new Date(setup.submittedAt).toLocaleString()}
                  />
                </div>

                {res?.liveTrade && res.liveTrade.status !== "none" && (
                  <LiveTradePanel live={res.liveTrade} direction={setup.direction} />
                )}

                {setup.screenshotUrl && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                      Chart setup
                    </p>
                    <div className="overflow-hidden rounded-lg border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={setup.screenshotUrl}
                        alt="Setup"
                        className="max-h-48 w-full object-contain bg-black/40"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                    Trade progress
                  </p>
                  <ol className="space-y-3">
                    {steps.map((step) => (
                      <li key={step.label} className="flex gap-3">
                        <div className="mt-0.5 shrink-0">{stepIcon(step.state)}</div>
                        <div>
                          <p
                            className={cn(
                              "text-sm font-medium",
                              step.state === "done" && "text-success",
                              step.state === "current" && "text-primary",
                              step.state === "pending" && "text-gray-400",
                              step.state === "error" && "text-danger",
                            )}
                          >
                            {step.label}
                          </p>
                          <p className="text-xs text-gray-500">{step.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                {(res?.currentPrice != null || isOpen) && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                      Price vs levels
                    </p>
                    <PriceProgressBar
                      setup={setup}
                      currentPrice={res?.currentPrice}
                      oneToOnePrice={res?.oneToOnePrice}
                    />
                  </div>
                )}

                {res?.oneToOnePrice != null && isOpen && (
                  <p className="text-xs text-gray-500">
                    1:1 RR target: {res.oneToOnePrice}
                    {res.riskRewardRatio != null && (
                      <> · Submitted RR 1:{res.riskRewardRatio}</>
                    )}
                  </p>
                )}

                {logs.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                      Hub activity
                    </p>
                    <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-lg border border-white/5 bg-white/[0.02] p-3">
                      {logs.map((log) => (
                        <div key={log.id} className="text-xs text-gray-400">
                          <span className="font-medium text-gray-300">{log.event}</span>
                          {" — "}
                          {log.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {success && (
                  <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                    {success}
                  </p>
                )}
                {actionError && (
                  <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {actionError}
                  </p>
                )}

                {isOpen && (
                  <div className="flex flex-wrap gap-2 border-t border-white/5 pt-4">
                    {res?.canPlaceTrade && !res.metaApiExecuted && (
                      <Button
                        size="sm"
                        disabled={actionLoading === "place"}
                        onClick={() => void handlePlaceTrade()}
                        className="gap-1"
                      >
                        {actionLoading === "place" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <TrendingUp className="h-3.5 w-3.5" />
                        )}
                        Place trade
                      </Button>
                    )}
                    {res?.liveTrade?.canClose && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="gap-1 border-amber-500/40 text-amber-300"
                        disabled={actionLoading === "close"}
                        onClick={() => void handleCloseTrade()}
                      >
                        {actionLoading === "close" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        Close trade
                      </Button>
                    )}
                    {res?.metaApiExecuted && !res?.liveTrade?.canClose && (
                      <span className="self-center text-xs text-success">
                        Live trade placed
                        {res.metaApiOrderId ? ` · order ${res.metaApiOrderId}` : ""}
                      </span>
                    )}
                    {res?.canClaimTp && !res.pendingTpClaim && (
                      <Button
                        variant="success"
                        size="sm"
                        disabled={Boolean(actionLoading)}
                        onClick={() => {
                          setTpClaimType("full");
                          setShowTpModal(true);
                        }}
                      >
                        Claim full TP
                      </Button>
                    )}
                    {res?.canClaimTp1R1 && !res.pendingTpClaim && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="border-success/40 text-success"
                        disabled={Boolean(actionLoading)}
                        onClick={() => {
                          setTpClaimType("rr_1_1");
                          setShowTpModal(true);
                        }}
                      >
                        Claim 1:1 RR
                      </Button>
                    )}
                    {res?.pendingTpClaim && (
                      <span className="self-center text-xs text-amber-400">
                        TP claim pending review —{" "}
                        <Link href="/tp-claims" className="underline">
                          track status
                        </Link>
                      </span>
                    )}
                    {res?.canClaimSl && (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={actionLoading === "sl"}
                        onClick={() => void handleClaimSl()}
                      >
                        {actionLoading === "sl" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Claim SL"
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-amber-400"
                      disabled={Boolean(actionLoading)}
                      onClick={() => void handleInvalidate()}
                    >
                      {actionLoading === "invalidate" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Ban className="h-3.5 w-3.5" />
                      )}
                      Invalidate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-400"
                      disabled={Boolean(actionLoading)}
                      onClick={() => void handleArchive()}
                    >
                      Archive
                    </Button>
                  </div>
                )}

                {!isOpen && (
                  <p className="text-xs text-gray-500">
                    This setup is {setup.status.toLowerCase().replace("_", " ")} — actions
                    are read-only.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {showTpModal && (
        <ClaimTpModal
          signalId={setup.signalId}
          symbol={setup.symbol}
          claimType={tpClaimType}
          oneToOnePrice={res?.oneToOnePrice}
          onClose={() => setShowTpModal(false)}
          onSubmitted={(msg) => {
            setShowTpModal(false);
            setSuccess(msg);
            onUpdated();
            void load();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-medium text-white">{value}</p>
    </div>
  );
}

function LiveTradePanel({
  live,
  direction,
}: {
  live: SetupLiveTrade;
  direction: string;
}) {
  const currency = live.currency ?? "USD";
  const pnl =
    live.profit ??
    live.unrealizedProfit ??
    (live.openPrice != null && live.currentPrice != null
      ? direction === "BUY"
        ? (live.currentPrice - live.openPrice) * (live.volume ?? 0)
        : (live.openPrice - live.currentPrice) * (live.volume ?? 0)
      : undefined);

  if (live.status === "pending") {
    return (
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-amber-400">
          Live order
        </p>
        <p className="mt-1 text-sm text-gray-300">
          Pending fill — P/L available once the position opens.
        </p>
      </div>
    );
  }

  const inProfit = pnl != null && pnl > 0;
  const inLoss = pnl != null && pnl < 0;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Live P/L
          </p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums",
              inProfit && "text-success",
              inLoss && "text-danger",
              pnl != null && pnl === 0 && "text-gray-300",
              pnl == null && "text-gray-400",
            )}
          >
            {pnl != null
              ? `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ${currency}`
              : "—"}
          </p>
        </div>
        <div className="text-right text-xs text-gray-500">
          {live.volume != null && <p>{live.volume} lots</p>}
          {live.openPrice != null && <p>Entry {live.openPrice}</p>}
          {live.currentPrice != null && <p>Mark {live.currentPrice}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {live.tp1Price != null && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5",
              live.tp1Reached
                ? "bg-success/15 text-success"
                : "bg-white/5 text-gray-400",
            )}
          >
            TP1 (1:1) {live.tp1Price}
            {live.tp1Reached ? " · reached" : ""}
          </span>
        )}
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-gray-400">
          Win on close only if TP1 was reached
        </span>
        {live.comment && (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-gray-400">
            Comment: {live.comment}
          </span>
        )}
      </div>
    </div>
  );
}
