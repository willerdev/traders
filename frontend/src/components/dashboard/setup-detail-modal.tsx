"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Pencil,
  Shield,
  Ban,
  CheckCircle2,
  Circle,
  Loader2,
  Target,
  RefreshCw,
  TrendingUp,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { ClaimTpModal } from "@/components/dashboard/claim-tp-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TradeExecutionNotice } from "@/components/trading/trade-execution-notice";
import {
  SetupExecutionBadge,
  tradeProgressLabel,
} from "@/components/dashboard/setup-execution-badge";

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

function isSetupTradeRunning(
  res: SetupResolution | null | undefined,
  liveTrade: SetupLiveTrade | null,
): boolean {
  if (liveTrade?.status === "open" || liveTrade?.status === "pending") return true;
  if (res?.metaApiExecuted) return true;
  if (res?.activated) return true;
  return false;
}

function buildProgressSteps(
  setup: SetupSummary,
  resolution: SetupResolution | null,
  hub: HubSignalStatus | null,
): { label: string; detail: string; state: StepState }[] {
  const status = setup.status;
  const phase = resolution?.executionPhase;
  const hubStatus = (hub?.status ?? resolution?.hubStatus ?? "").toLowerCase();
  const executed = hub?.progress?.executed ?? false;
  const activated = resolution?.activated ?? resolution?.tradeOpened ?? false;
  const terminal = ["WON", "LOST", "ARCHIVED", "CANCELLED", "REJECTED_DUPLICATE"];

  const submitted: StepState = "done";
  let hubState: StepState = "pending";
  if (hubStatus.includes("fail") || hubStatus === "invalidated") hubState = "error";
  else if (executed || ["executed", "filled", "closed"].some((s) => hubStatus.includes(s)))
    hubState = "done";
  else if (hub) hubState = "current";

  let tradeState: StepState = "pending";
  if (
    phase === "running" ||
    phase === "partial" ||
    phase === "claimable" ||
    activated
  ) {
    tradeState = "done";
  } else if (phase === "limit_active") tradeState = "current";
  else if (hubState === "done") tradeState = "current";

  let outcomeState: StepState = "pending";
  if (status === "WON" || phase === "closed_win") outcomeState = "done";
  else if (status === "LOST" || phase === "closed_loss") outcomeState = "done";
  else if (status === "ARCHIVED" || phase === "closed_neutral") outcomeState = "done";
  else if (status === "CANCELLED" || terminal.includes(status)) outcomeState = "error";
  else if (resolution?.canClaimTp || resolution?.canClaimTp1R1 || resolution?.canClaimSl || resolution?.pendingTpClaim)
    outcomeState = "current";
  else if (phase === "partial") outcomeState = "current";

  const tradeDetail =
    resolution?.executionLabel ??
    (phase === "limit_active"
      ? "Limit or stop order waiting for price"
      : phase === "running"
        ? "Position is open on the broker"
        : phase === "partial"
          ? "Part of the position was closed"
          : activated
            ? "Price entered your zone — trade is live"
            : "Waiting for entry fill");

  const outcomeDetail =
    resolution?.executionLabel && phase?.startsWith("closed")
      ? resolution.executionLabel
      : resolution?.tradeProgressOutcome
        ? `${tradeProgressLabel(resolution.tradeProgressOutcome)} recorded`
        : status === "WON"
          ? "Take profit recorded"
          : status === "LOST"
            ? "Stop loss recorded"
            : resolution?.pendingTpClaim
              ? "TP claim pending admin review"
              : resolution?.canClaimTp
                ? "Full TP reached — you can claim"
                : resolution?.canClaimTp1R1
                  ? "TP1 hit + breakeven — claim 1:1 RR with proof"
                  : resolution?.tp1Reached && resolution?.tp1ClaimBlockedReason
                    ? resolution.tp1ClaimBlockedReason
                    : resolution?.canClaimSl
                      ? "SL level reached — you can claim"
                      : resolution?.currentPrice != null
                        ? `Market ${resolution.currentPrice}`
                        : "Awaiting TP or SL";

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
      label: "Trade status",
      detail: tradeDetail,
      state: tradeState,
    },
    {
      label: "Outcome",
      detail: outcomeDetail,
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
  const [liveTrade, setLiveTrade] = useState<SetupLiveTrade | null>(null);
  const [liveTradeRefreshing, setLiveTradeRefreshing] = useState(false);
  const [liveTradeError, setLiveTradeError] = useState<string | null>(null);
  const [hub, setHub] = useState<HubSignalStatus | null>(null);
  const [logs, setLogs] = useState<HubLogEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showTpModal, setShowTpModal] = useState(false);
  const [tpClaimType, setTpClaimType] = useState<"full" | "rr_1_1">("full");
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteLimitConfirm, setShowDeleteLimitConfirm] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [editStopLoss, setEditStopLoss] = useState(String(setup.stopLoss));
  const [editTakeProfit, setEditTakeProfit] = useState(String(setup.takeProfit));

  const isOpen = setup.status === "OPEN";

  const applyLiveTrade = useCallback((next: SetupLiveTrade | null | undefined) => {
    const normalized =
      next && next.status !== "none" ? next : null;
    setLiveTrade(normalized);
    setResolution((prev) =>
      prev ? { ...prev, liveTrade: normalized ?? undefined } : prev,
    );
  }, []);

  const loadDetails = useCallback(
    async (options?: { showSpinner?: boolean }) => {
      if (options?.showSpinner) setLoading(true);
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
        applyLiveTrade(res?.liveTrade ?? null);
        setHub(hubStatus);
        setLogs(logRes.items ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load setup details");
      } finally {
        if (options?.showSpinner) setLoading(false);
      }
    },
    [applyLiveTrade, setup.signalId],
  );

  const refreshLiveTrade = useCallback(async () => {
    setLiveTradeRefreshing(true);
    setLiveTradeError(null);
    try {
      const { liveTrade: next } = await api.signals.getLiveTrade(setup.signalId);
      applyLiveTrade(next);
    } catch (err) {
      setLiveTradeError(
        err instanceof Error ? err.message : "Could not refresh live P/L",
      );
    } finally {
      setLiveTradeRefreshing(false);
    }
  }, [applyLiveTrade, setup.signalId]);

  useEffect(() => {
    void loadDetails({ showSpinner: true });
  }, [loadDetails]);

  useEffect(() => {
    const sl = resolution?.stopLoss ?? setup.stopLoss;
    const tp = resolution?.takeProfit ?? setup.takeProfit;
    setEditStopLoss(String(sl));
    setEditTakeProfit(String(tp));
  }, [resolution?.stopLoss, resolution?.takeProfit, setup.stopLoss, setup.takeProfit]);

  async function handlePlaceTrade() {
    if (
      !confirm(
        `Place ${setup.direction} ${setup.symbol} now?\n\n` +
          `This goes LIVE immediately in Orders — market fill now, or a broker pending order at your entry edge. It does NOT wait for your Signal Hub limit zone.\n\n` +
          `SL: ${setup.stopLoss}\nTP: ${setup.takeProfit}`,
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
      await loadDetails();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not place trade");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCloseTrade() {
    const tp1 = liveTrade?.tp1Price ?? resolution?.oneToOnePrice;
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
        await loadDetails();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not close trade");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSetBreakeven() {
    if (
      !confirm(
        "Move stop loss to breakeven (entry)?\n\nIf the broker rejects it at the current price, we will retry automatically up to 10 times.",
      )
    ) {
      return;
    }
    setActionLoading("breakeven");
    setActionError(null);
    try {
      const result = await api.signals.setBreakeven(setup.signalId);
      setSuccess(result.message);
      onUpdated();
      await loadDetails();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not set breakeven",
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUpdateStops() {
    const sl = parseFloat(editStopLoss);
    const tp = parseFloat(editTakeProfit);
    if (!Number.isFinite(sl) || !Number.isFinite(tp)) {
      setActionError("Enter valid stop loss and take profit prices");
      return;
    }
    setActionLoading("stops");
    setActionError(null);
    try {
      const result = await api.signals.updateStops(setup.signalId, {
        stopLoss: sl,
        takeProfit: tp,
      });
      setSuccess(result.message);
      onUpdated();
      await loadDetails();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not update stop levels",
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleInvalidate() {
    if (resolution?.canInvalidate === false) {
      setActionError(
        resolution.invalidateBlockedReason ??
          "Cannot invalidate while an order or trade is running on this setup.",
      );
      return;
    }
    if (
      !confirm(
        `Invalidate ${setup.symbol}? This cancels the Hub order (if any) and archives the setup.\n\nOnly do this when no live order or open trade exists on this setup.`,
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
      await loadDetails();
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
      await loadDetails();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function confirmArchive() {
    setActionLoading("archive");
    setActionError(null);
    try {
      await api.signals.archive(setup.signalId);
      setSuccess(`${setup.symbol} archived`);
      setShowArchiveConfirm(false);
      onUpdated();
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Archive failed");
      setShowArchiveConfirm(false);
    } finally {
      setActionLoading(null);
    }
  }

  async function confirmDeleteLimit() {
    setActionLoading("deleteLimit");
    setActionError(null);
    try {
      const result = await api.signals.deleteLimit(setup.signalId);
      setSuccess(result.message ?? "Limit deleted");
      setShowDeleteLimitConfirm(false);
      onUpdated();
      await loadDetails();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete limit");
      setShowDeleteLimitConfirm(false);
    } finally {
      setActionLoading(null);
    }
  }

  const steps = buildProgressSteps(setup, resolution, hub);
  const res = resolution;
  const tradeRunning = isSetupTradeRunning(res, liveTrade);
  const canCloseTrade =
    Boolean(res?.canCloseTrade) ||
    liveTrade?.status === "open" ||
    liveTrade?.status === "pending" ||
    res?.liveTrade?.status === "open" ||
    res?.liveTrade?.status === "pending";
  const hasPendingLimit =
    liveTrade?.status === "pending" ||
    res?.liveTrade?.status === "pending" ||
    res?.executionPhase === "limit_active";
  const showLiveTradeSection =
    isOpen &&
    !loading &&
    (liveTrade != null || Boolean(res?.metaApiExecuted));

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
                {res?.executionPhase && (
                  <SetupExecutionBadge
                    phase={res.executionPhase}
                    label={res.executionLabel}
                  />
                )}
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

                {res?.executionLabel && (
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                      Trade progress
                    </p>
                    <p className="mt-1 text-sm text-white">{res.executionLabel}</p>
                    {res.partialClosed && isOpen && (
                      <p className="mt-1 text-xs text-amber-300/90">
                        Partial close recorded — remainder may still be open.
                      </p>
                    )}
                    {res.tradeProgressOutcome && (
                      <p className="mt-1 text-xs text-gray-400">
                        Result: {tradeProgressLabel(res.tradeProgressOutcome)}
                        {res.exitPrice != null ? ` · exit ${res.exitPrice}` : ""}
                        {res.pnl != null ? ` · P/L ${res.pnl}` : ""}
                        {res.pointsAwarded ? ` · ${res.pointsAwarded} pts` : ""}
                      </p>
                    )}
                  </div>
                )}

                {isOpen && !tradeRunning && <TradeExecutionNotice variant="modal" />}

                {res?.breakevenSet && (
                  <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                    Stop loss is at breakeven
                    {res.breakevenRetryCount
                      ? ` (set after ${res.breakevenRetryCount} attempt(s))`
                      : ""}
                    .
                  </p>
                )}

                {res?.breakevenPending && !res.breakevenSet && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    Setting breakeven… attempt {res.breakevenRetryCount ?? 0}/10.
                    We retry each minute until the broker accepts it.
                  </p>
                )}

                {res?.tp1Reached && !res.canClaimTp1R1 && !res.pendingTpClaim && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    {res.tp1ClaimBlockedReason ??
                      "TP1 (1:1 RR) reached — breakeven must be set before you can claim on TP Claims."}
                  </p>
                )}

                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <InfoRow label="Entry" value={`${setup.entryMin} – ${setup.entryMax}`} />
                  <InfoRow
                    label="Take profit"
                    value={String(res?.takeProfit ?? setup.takeProfit)}
                  />
                  <InfoRow
                    label="Stop loss"
                    value={String(res?.stopLoss ?? setup.stopLoss)}
                  />
                  <InfoRow
                    label="Submitted"
                    value={new Date(setup.submittedAt).toLocaleString()}
                  />
                </div>

                {isOpen && res?.canAdjustStops && (
                  <AdjustStopsPanel
                    direction={setup.direction}
                    editStopLoss={editStopLoss}
                    editTakeProfit={editTakeProfit}
                    onStopLossChange={setEditStopLoss}
                    onTakeProfitChange={setEditTakeProfit}
                    brokerStopLoss={liveTrade?.stopLoss}
                    brokerTakeProfit={liveTrade?.takeProfit}
                    platformStopLoss={res?.stopLoss ?? setup.stopLoss}
                    platformTakeProfit={res?.takeProfit ?? setup.takeProfit}
                    loading={actionLoading === "stops"}
                    onSave={() => void handleUpdateStops()}
                  />
                )}

                {showLiveTradeSection && (
                  <LiveTradePanel
                    live={liveTrade}
                    direction={setup.direction}
                    refreshing={liveTradeRefreshing}
                    error={liveTradeError}
                    onRefresh={() => void refreshLiveTrade()}
                  />
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
                    {res?.canPlaceTrade && !tradeRunning && (
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
                    {canCloseTrade && (
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
                    {res?.canSetBreakeven && !res.breakevenSet && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="gap-1 border-sky-500/40 text-sky-300"
                        disabled={actionLoading === "breakeven"}
                        onClick={() => void handleSetBreakeven()}
                      >
                        {actionLoading === "breakeven" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Shield className="h-3.5 w-3.5" />
                        )}
                        Set breakeven
                      </Button>
                    )}
                    {tradeRunning && !canCloseTrade && (
                      <span className="self-center text-xs text-success">
                        Live trade active
                        {res?.metaApiOrderId ? ` · order ${res.metaApiOrderId}` : ""}
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
                    {res?.canInvalidate !== false && (
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
                    )}
                    {hasPendingLimit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-danger"
                        disabled={Boolean(actionLoading)}
                        onClick={() => setShowDeleteLimitConfirm(true)}
                      >
                        {actionLoading === "deleteLimit" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete limit
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-400"
                      disabled={Boolean(actionLoading)}
                      onClick={() => setShowArchiveConfirm(true)}
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
            void loadDetails();
          }}
        />
      )}

      <ConfirmDialog
        open={showArchiveConfirm}
        tone="warning"
        title={`Archive ${setup.symbol}?`}
        message={
          <>
            This removes the setup from your open list. It will not cancel any
            live order or trade on MT5 — archiving is local only. Are you sure
            you want to archive it?
          </>
        }
        confirmLabel="Yes, archive"
        loading={actionLoading === "archive"}
        onConfirm={() => void confirmArchive()}
        onCancel={() => setShowArchiveConfirm(false)}
      />

      <ConfirmDialog
        open={showDeleteLimitConfirm}
        tone="danger"
        title={`Delete limit for ${setup.symbol}?`}
        message={
          <>
            This cancels the pending limit order you placed and stops the
            platform from placing it again. The setup stays in your open list,
            but no order will run unless you submit a new one.
          </>
        }
        confirmLabel="Yes, delete limit"
        loading={actionLoading === "deleteLimit"}
        onConfirm={() => void confirmDeleteLimit()}
        onCancel={() => setShowDeleteLimitConfirm(false)}
      />
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

function AdjustStopsPanel({
  direction,
  editStopLoss,
  editTakeProfit,
  onStopLossChange,
  onTakeProfitChange,
  brokerStopLoss,
  brokerTakeProfit,
  platformStopLoss,
  platformTakeProfit,
  loading,
  onSave,
}: {
  direction: string;
  editStopLoss: string;
  editTakeProfit: string;
  onStopLossChange: (v: string) => void;
  onTakeProfitChange: (v: string) => void;
  brokerStopLoss?: number;
  brokerTakeProfit?: number;
  platformStopLoss: number;
  platformTakeProfit: number;
  loading: boolean;
  onSave: () => void;
}) {
  const slMismatch =
    brokerStopLoss != null &&
    Math.abs(brokerStopLoss - platformStopLoss) > 1e-6;
  const tpMismatch =
    brokerTakeProfit != null &&
    Math.abs(brokerTakeProfit - platformTakeProfit) > 1e-6;

  return (
    <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-4">
      <div className="mb-3 flex items-start gap-2">
        <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
        <div>
          <p className="text-sm font-medium text-sky-200">Adjust stop levels</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Sync your platform SL/TP with the broker when they differ. Updates your
            broker and Signal Hub for this setup.
          </p>
        </div>
      </div>

      {(slMismatch || tpMismatch) && (
        <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Broker mismatch detected
          {slMismatch ? ` · SL on broker: ${brokerStopLoss}` : ""}
          {tpMismatch ? ` · TP on broker: ${brokerTakeProfit}` : ""}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-sl" className="text-xs text-gray-400">
            Stop loss ({direction === "BUY" ? "below entry" : "above entry"})
          </Label>
          <Input
            id="edit-sl"
            type="number"
            step="any"
            value={editStopLoss}
            onChange={(e) => onStopLossChange(e.target.value)}
            className="border-white/10 bg-white/[0.03]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-tp" className="text-xs text-gray-400">
            Take profit
          </Label>
          <Input
            id="edit-tp"
            type="number"
            step="any"
            value={editTakeProfit}
            onChange={(e) => onTakeProfitChange(e.target.value)}
            className="border-white/10 bg-white/[0.03]"
          />
        </div>
      </div>

      <Button
        size="sm"
        className="mt-3 gap-1.5"
        disabled={loading}
        onClick={onSave}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Pencil className="h-3.5 w-3.5" />
        )}
        Save &amp; update broker
      </Button>
    </div>
  );
}

function LiveTradePanel({
  live,
  direction,
  refreshing,
  error,
  onRefresh,
}: {
  live: SetupLiveTrade | null;
  direction: string;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (live?.status === "pending") {
    return (
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3">
        <LiveTradePanelHeader refreshing={refreshing} onRefresh={onRefresh} />
        <p className="mt-2 text-sm text-gray-300">
          Pending fill — P/L available once the position opens.
        </p>
        {(live.stopLoss != null || live.takeProfit != null) && (
          <p className="mt-2 text-xs text-gray-500">
            {live.stopLoss != null && <>Broker SL {live.stopLoss}</>}
            {live.stopLoss != null && live.takeProfit != null && " · "}
            {live.takeProfit != null && <>Broker TP {live.takeProfit}</>}
          </p>
        )}
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    );
  }

  if (!live || live.status === "none") {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
        <LiveTradePanelHeader refreshing={refreshing} onRefresh={onRefresh} />
        <p className="mt-2 text-sm text-gray-400">
          No open position with your comment tag — tap refresh after placing a trade.
        </p>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    );
  }

  const currency = live.currency ?? "USD";
  const pnl =
    live.profit ??
    live.unrealizedProfit ??
    (live.openPrice != null && live.currentPrice != null
      ? direction === "BUY"
        ? (live.currentPrice - live.openPrice) * (live.volume ?? 0)
        : (live.openPrice - live.currentPrice) * (live.volume ?? 0)
      : undefined);

  const inProfit = pnl != null && pnl > 0;
  const inLoss = pnl != null && pnl < 0;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
      <LiveTradePanelHeader refreshing={refreshing} onRefresh={onRefresh} />
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums",
              refreshing && "opacity-60",
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
          {live.stopLoss != null && <p>Broker SL {live.stopLoss}</p>}
          {live.takeProfit != null && <p>Broker TP {live.takeProfit}</p>}
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
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

function LiveTradePanelHeader({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
        Live P/L
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-gray-400"
        disabled={refreshing}
        onClick={onRefresh}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        Refresh
      </Button>
    </div>
  );
}
