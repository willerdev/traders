"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
} from "lucide-react";
import {
  api,
  type OpenSetupItem,
  type UserMt5HistoryItem,
  type UserMt5Trade,
} from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { useMt5Terminal } from "@/hooks/use-mt5-terminal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SetupDetailModal,
  type SetupSummary,
} from "@/components/dashboard/setup-detail-modal";
import {
  Mt5ActionStrip,
  Mt5DetailGrid,
  Mt5DirectionTag,
  Mt5Empty,
  Mt5ExpandableRow,
  Mt5FloatingHeader,
  Mt5Pnl,
  Mt5SubTabs,
  Mt5SummaryBlock,
  Mt5ThemeToggle,
  fmtMt5Date,
  fmtMt5Price,
  useMt5Expand,
} from "@/components/mt5/mt5-ui";

type Tab = "setups" | "trades" | "history";
type HistorySubTab = "positions" | "orders" | "deals";

function toSetupSummary(setup: OpenSetupItem): SetupSummary {
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

function orderStatus(row: UserMt5HistoryItem): "FILLED" | "CANCELED" {
  if (row.status === "CANCELLED") return "CANCELED";
  return "FILLED";
}

function orderTypeLabel(row: UserMt5HistoryItem) {
  const dir = row.direction.toLowerCase();
  if (row.entryPrice == null && row.status === "CANCELLED") {
    return `${dir} limit`;
  }
  if (row.entryPrice != null) return dir;
  return `${dir} limit`;
}

export default function Mt5UserPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const userRole = useAuthStore((s) => s.user?.role);
  const userId = useAuthStore((s) => s.user?.id);
  const [tab, setTab] = useState<Tab>("trades");
  const [historySubTab, setHistorySubTab] = useState<HistorySubTab>("deals");
  const [selectedSetup, setSelectedSetup] = useState<SetupSummary | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);

  const {
    data,
    runningTrades,
    loading,
    refreshing,
    error,
    setError,
    load,
    loadRunning,
  } = useMt5Terminal(userId, isAuthenticated, hasHydrated, tab);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [hasHydrated, isAuthenticated, router]);

  const setups = data?.setups.items ?? [];
  const history = data?.history.items ?? [];
  const limitTrades = useMemo(
    () => (data?.trades ?? []).filter((t) => t.kind === "limit"),
    [data?.trades],
  );
  const floating = data?.stats.floatingProfit ?? 0;
  const limitCount = data?.stats.limitCount ?? 0;
  const runningCount = data?.stats.runningCount ?? runningTrades.length;

  const historyPositions = useMemo(
    () => history.filter((h) => h.status === "WON" || h.status === "LOST"),
    [history],
  );
  const historyOrders = useMemo(
    () => history,
    [history],
  );
  const historyProfit = useMemo(
    () =>
      history.reduce((sum, h) => sum + (h.pnl ?? 0), 0),
    [history],
  );

  async function runSetupAction(key: string, fn: () => Promise<void>) {
    setActionKey(key);
    setError(null);
    try {
      await fn();
      await load({ background: true });
      if (tab === "trades") await loadRunning();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionKey(null);
    }
  }

  async function handleCloseTrade(trade: UserMt5Trade) {
    if (!confirm(`Close running ${trade.symbol} position?`)) return;
    const key = trade.signalId ?? trade.positionId ?? trade.symbol;
    await runSetupAction(key, async () => {
      if (trade.signalId) {
        await api.signals.closeTrade(trade.signalId);
      } else if (trade.positionId) {
        await api.signals.closeMt5Position(trade.positionId);
      } else {
        throw new Error("No trade id to close");
      }
    });
  }

  async function handleBreakeven(trade: UserMt5Trade) {
    if (!trade.signalId) return;
    if (
      !confirm(
        "Move stop loss to breakeven (entry)? Retries automatically if the broker rejects.",
      )
    ) {
      return;
    }
    await runSetupAction(`be-${trade.signalId}`, async () => {
      await api.signals.setBreakeven(trade.signalId!);
    });
  }

  async function handlePartialClose(trade: UserMt5Trade, volume: number) {
    if (!trade.signalId) return;
    if (
      !confirm(
        `Partial close ${volume} lot(s) on ${trade.symbol}? Position stays open.`,
      )
    ) {
      return;
    }
    await runSetupAction(`partial-${trade.signalId}`, async () => {
      await api.signals.partialClose(trade.signalId!, volume);
    });
  }

  async function openSetupFromHistory(row: UserMt5HistoryItem) {
    setHistoryLoadingId(row.signalId);
    setError(null);
    try {
      let screenshotUrl: string | undefined;
      try {
        const full = await api.signals.get(row.signalId);
        screenshotUrl = full.screenshotUrl;
      } catch {
        /* chart optional */
      }
      setSelectedSetup({
        signalId: row.signalId,
        symbol: row.symbol,
        direction: row.direction,
        entryMin: row.entryMin,
        entryMax: row.entryMax,
        stopLoss: row.stopLoss,
        takeProfit: row.takeProfit,
        status: row.status,
        submittedAt: row.submittedAt,
        screenshotUrl,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load setup");
    } finally {
      setHistoryLoadingId(null);
    }
  }

  async function handlePlaceSetup(setup: OpenSetupItem) {
    if (
      !confirm(
        `Place ${setup.direction} ${setup.symbol} on platform MT5 now?\n\nSL ${setup.stopLoss} · TP ${setup.takeProfit}`,
      )
    ) {
      return;
    }
    await runSetupAction(`place-${setup.signalId}`, async () => {
      await api.signals.placeTrade(setup.signalId);
    });
  }

  async function handleInvalidateSetup(setup: OpenSetupItem) {
    if (setup.resolution.canInvalidate === false) {
      setError(
        setup.resolution.invalidateBlockedReason ??
          "Cannot invalidate while a trade is running on this setup.",
      );
      return;
    }
    if (
      !confirm(
        `Invalidate ${setup.symbol} setup? Pending orders will be cancelled.`,
      )
    ) {
      return;
    }
    await runSetupAction(`inv-${setup.signalId}`, async () => {
      await api.signals.invalidate(setup.signalId);
    });
  }

  if (!hasHydrated || !isAuthenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const mainTabs: { id: Tab; label: string; count?: number }[] = [
    { id: "setups", label: "Setups", count: setups.length },
    { id: "trades", label: "Trade", count: runningCount },
    { id: "history", label: "History", count: history.length },
  ];

  return (
    <div className="mt5-shell mx-auto flex min-h-[calc(100dvh-4rem)] max-w-lg flex-col bg-[var(--mt5-bg)] text-[var(--mt5-text)] md:max-w-2xl">
      {/* MT5-style header */}
      <div className="sticky top-0 z-20 border-b border-[var(--mt5-divider)] bg-[var(--mt5-surface)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-base font-semibold">
              {tab === "history"
                ? "History"
                : tab === "trades"
                  ? "Trade"
                  : "Setups"}
            </h1>
            <p className="text-xs text-[var(--mt5-muted)]">
              All symbols
              {refreshing && (
                <span className="ml-2 text-[10px] text-primary">· syncing</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            {userRole === "ADMIN" && (
              <Link href="/mt5/copy">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-[10px] text-[var(--mt5-muted)]"
                >
                  Copy
                </Button>
              </Link>
            )}
            <Mt5ThemeToggle />
            <button
              type="button"
              onClick={() => void load({ background: Boolean(data) })}
              disabled={refreshing}
              className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--mt5-muted)] hover:bg-[var(--mt5-row-hover)] hover:text-[var(--mt5-text)] disabled:opacity-50"
            >
              {refreshing ? "…" : "Refresh"}
            </button>
          </div>
        </div>

        {tab === "trades" && (
          <Mt5FloatingHeader profit={floating} />
        )}

        {tab === "trades" && runningCount > 0 && (
          <Mt5SummaryBlock
            rows={[
              { label: "Positions", value: String(runningCount) },
              {
                label: "Floating",
                value: `${floating >= 0 ? "" : ""}${fmtMt5Price(floating)}`,
                color: floating >= 0 ? "#4a9eff" : "#ff5252",
              },
            ]}
          />
        )}

        {tab === "history" && history.length > 0 && (
          <Mt5SummaryBlock
            rows={[
              {
                label: "Profit",
                value: fmtMt5Price(historyProfit),
                color: historyProfit >= 0 ? "#4a9eff" : "#ff5252",
              },
              {
                label: "Closed",
                value: String(history.length),
              },
              {
                label: "Wins",
                value: String(
                  history.filter((h) => h.status === "WON").length,
                ),
                color: "#4a9eff",
              },
              {
                label: "Losses",
                value: String(
                  history.filter((h) => h.status === "LOST").length,
                ),
                color: "#ff5252",
              },
            ]}
          />
        )}

        {tab === "setups" && (
          <Mt5SummaryBlock
            rows={[
              { label: "Open setups", value: String(setups.length) },
              { label: "Limits on MT5", value: String(limitCount) },
            ]}
          />
        )}

        {data?.message && (
          <p className="mx-4 mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-200">
            {data.message}
          </p>
        )}

        <Mt5SubTabs
          tabs={mainTabs.map((t) => ({ id: t.id, label: t.label.toUpperCase() }))}
          active={tab}
          onChange={setTab}
        />

        {tab === "history" && (
          <Mt5SubTabs
            tabs={[
              { id: "positions" as const, label: "POSITIONS" },
              { id: "orders" as const, label: "ORDERS" },
              { id: "deals" as const, label: "DEALS" },
            ]}
            active={historySubTab}
            onChange={setHistorySubTab}
          />
        )}
      </div>

      {error && (
        <p className="mx-4 mt-3 rounded border border-[#ff5252]/30 bg-[#ff5252]/10 px-3 py-2 text-xs text-[#ff5252]">
          {error}
        </p>
      )}

      <div
        className={`flex-1 overflow-y-auto transition-opacity duration-200 ${refreshing ? "opacity-[0.92]" : ""}`}
      >
        {loading && !data ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--mt5-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-xs">Loading MT5…</span>
          </div>
        ) : tab === "setups" ? (
          <SetupsPanel
            setups={setups}
            limitTrades={limitTrades}
            actionKey={actionKey}
            onOpenSetup={(s) => setSelectedSetup(toSetupSummary(s))}
            onPlace={handlePlaceSetup}
            onInvalidate={handleInvalidateSetup}
          />
        ) : tab === "trades" ? (
          <PositionsPanel
            trades={runningTrades}
            actionKey={actionKey}
            onClose={handleCloseTrade}
            onBreakeven={handleBreakeven}
            onPartialClose={handlePartialClose}
            onOpenSetup={setSelectedSetup}
          />
        ) : (
          <HistoryPanel
            subTab={historySubTab}
            positions={historyPositions}
            orders={historyOrders}
            deals={history}
            loadingSignalId={historyLoadingId}
            onOpenSetup={(row) => void openSetupFromHistory(row)}
          />
        )}
      </div>

      {selectedSetup && (
        <SetupDetailModal
          setup={selectedSetup}
          onClose={() => setSelectedSetup(null)}
          onUpdated={() => {
            void load({ background: true });
            void loadRunning();
            setSelectedSetup(null);
          }}
        />
      )}
    </div>
  );
}

function SetupsPanel({
  setups,
  limitTrades,
  actionKey,
  onOpenSetup,
  onPlace,
  onInvalidate,
}: {
  setups: OpenSetupItem[];
  limitTrades: UserMt5Trade[];
  actionKey: string | null;
  onOpenSetup: (s: OpenSetupItem) => void;
  onPlace: (s: OpenSetupItem) => void;
  onInvalidate: (s: OpenSetupItem) => void;
}) {
  const expand = useMt5Expand();

  if (setups.length === 0 && limitTrades.length === 0) {
    return (
      <Mt5Empty
        title="No open setups"
        hint="Submit a setup to place limits on platform MT5"
      />
    );
  }

  return (
    <div>
      {limitTrades.map((order) => {
        const id = order.orderId ?? order.signalId ?? order.symbol;
        const expanded = expand.isExpanded(id);
        return (
          <Mt5ExpandableRow
            key={id}
            id={id}
            expanded={expanded}
            onToggle={() => expand.toggle(id)}
            header={
              <>
                <div>
                  <span className="font-semibold">{order.symbol}</span>
                  <span className="ml-2">
                    <Mt5DirectionTag
                      direction={order.direction}
                      volume={order.volume}
                      suffix="limit"
                    />
                  </span>
                </div>
                <span className="shrink-0 text-xs text-[var(--mt5-muted)]">
                  pending
                </span>
              </>
            }
            subheader={
              <>
                {order.volume?.toFixed(2) ?? "—"} / {order.volume?.toFixed(2) ?? "—"}{" "}
                at {fmtMt5Price(order.openPrice ?? order.entryMin)}
              </>
            }
            actions={
              order.signalId ? (
                <Mt5ActionStrip
                  actions={[
                    {
                      key: "setup",
                      label: "Setup",
                      variant: "buy",
                      onClick: () => {
                        const s = setups.find(
                          (x) => x.signalId === order.signalId,
                        );
                        if (s) onOpenSetup(s);
                      },
                    },
                  ]}
                />
              ) : undefined
            }
          >
            <Mt5DetailGrid
              left={[
                {
                  label: "S / L:",
                  value: fmtMt5Price(order.stopLoss),
                },
                {
                  label: "T / P:",
                  value: fmtMt5Price(order.takeProfit),
                },
              ]}
              right={[
                {
                  label: "Entry zone:",
                  value: `${fmtMt5Price(order.entryMin)} – ${fmtMt5Price(order.entryMax)}`,
                },
                {
                  label: "Order:",
                  value: order.orderId ? `#${order.orderId}` : "—",
                },
              ]}
            />
          </Mt5ExpandableRow>
        );
      })}

      {setups.map((setup) => {
        const id = setup.signalId;
        const expanded = expand.isExpanded(id);
        const res = setup.resolution;
        const isRunning =
          setup.liveTrade?.status === "open" || setup.activated;

        return (
          <Mt5ExpandableRow
            key={id}
            id={id}
            expanded={expanded}
            onToggle={() => expand.toggle(id)}
            header={
              <>
                <div>
                  <span className="font-semibold">{setup.symbol}</span>
                  <span className="ml-2">
                    <Mt5DirectionTag direction={setup.direction} />
                  </span>
                </div>
                {setup.liveTrade?.profit != null && (
                  <Mt5Pnl value={setup.liveTrade.profit} className="text-base" />
                )}
              </>
            }
            subheader={
              <>
                Entry {fmtMt5Price(setup.entryMin)} – {fmtMt5Price(setup.entryMax)}
              </>
            }
            actions={
              <Mt5ActionStrip
                actions={[
                  ...(res.canPlaceTrade
                    ? [
                        {
                          key: "place",
                          label: "Place",
                          variant: "buy" as const,
                          loading: actionKey === `place-${setup.signalId}`,
                          onClick: () => void onPlace(setup),
                        },
                      ]
                    : []),
                  ...(!isRunning
                    ? [
                        {
                          key: "inv",
                          label: "Cancel",
                          variant: "sell" as const,
                          loading: actionKey === `inv-${setup.signalId}`,
                          disabled: !res.canInvalidate,
                          onClick: () => void onInvalidate(setup),
                        },
                      ]
                    : []),
                  {
                    key: "setup",
                    label: "Setup",
                    variant: "neutral",
                    onClick: () => onOpenSetup(setup),
                  },
                ]}
              />
            }
          >
            <Mt5DetailGrid
              left={[
                { label: "S / L:", value: fmtMt5Price(setup.stopLoss) },
                { label: "T / P:", value: fmtMt5Price(setup.takeProfit) },
              ]}
              right={[
                {
                  label: "Setup:",
                  value: `#${setup.signalId.slice(0, 8)}`,
                },
                {
                  label: "Submitted:",
                  value: fmtMt5Date(setup.submittedAt),
                },
              ]}
            />
          </Mt5ExpandableRow>
        );
      })}
    </div>
  );
}

function PositionsPanel({
  trades,
  actionKey,
  onClose,
  onBreakeven,
  onPartialClose,
  onOpenSetup,
}: {
  trades: UserMt5Trade[];
  actionKey: string | null;
  onClose: (t: UserMt5Trade) => void;
  onBreakeven: (t: UserMt5Trade) => void;
  onPartialClose: (t: UserMt5Trade, vol: number) => void;
  onOpenSetup: (setup: SetupSummary) => void;
}) {
  const expand = useMt5Expand();
  const [partialLot, setPartialLot] = useState<Record<string, string>>({});
  const [partialOpen, setPartialOpen] = useState<string | null>(null);

  if (trades.length === 0) {
    return (
      <Mt5Empty
        title="No open positions"
        hint="Running trades from your setups appear here · refreshes every 2s"
      />
    );
  }

  return (
    <div>
      <div className="border-b border-[var(--mt5-divider)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--mt5-muted)]">
        Positions
      </div>
      {trades.map((trade) => {
        const key =
          trade.signalId ?? trade.positionId ?? trade.orderId ?? trade.symbol;
        const expanded = expand.isExpanded(key);
        const profit = trade.profit ?? 0;
        const partialKey = partialLot[key] ?? "";

        return (
          <Mt5ExpandableRow
            key={key}
            id={key}
            expanded={expanded}
            onToggle={() => expand.toggle(key)}
            header={
              <>
                <div>
                  <span className="font-semibold">{trade.symbol}</span>
                  <span className="text-[var(--mt5-muted)]">, </span>
                  <Mt5DirectionTag
                    direction={trade.direction}
                    volume={trade.volume}
                  />
                </div>
                <Mt5Pnl value={profit} className="text-base" />
              </>
            }
            subheader={
              <>
                {fmtMt5Price(trade.openPrice)} →{" "}
                {fmtMt5Price(trade.currentPrice ?? trade.openPrice)}
              </>
            }
            actions={
              <>
                {partialOpen === key && trade.signalId && (
                  <div
                    className="flex items-end gap-2 border-t border-[var(--mt5-divider)] px-4 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      type="number"
                      step="any"
                      min="0.01"
                      placeholder={`Lots (max ${trade.volume ?? "?"})`}
                      value={partialKey}
                      onChange={(e) =>
                        setPartialLot((p) => ({ ...p, [key]: e.target.value }))
                      }
                      className="h-9 flex-1 border-[var(--mt5-divider)] bg-[var(--mt5-bg)] text-[var(--mt5-text)]"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={actionKey === `partial-${trade.signalId}`}
                      onClick={() => {
                        const vol = parseFloat(partialKey);
                        if (isNaN(vol) || vol <= 0) return;
                        void onPartialClose(trade, vol);
                        setPartialOpen(null);
                      }}
                    >
                      OK
                    </Button>
                  </div>
                )}
                <Mt5ActionStrip
                  actions={[
                    ...(trade.canSetBreakeven && trade.signalId
                      ? [
                          {
                            key: "be",
                            label: "Modify",
                            variant: "buy" as const,
                            loading: actionKey === `be-${trade.signalId}`,
                            onClick: () => void onBreakeven(trade),
                          },
                        ]
                      : []),
                    ...(trade.canPartialClose && trade.signalId
                      ? [
                          {
                            key: "partial",
                            label: "Partial",
                            variant: "neutral" as const,
                            onClick: () =>
                              setPartialOpen(partialOpen === key ? null : key),
                          },
                        ]
                      : []),
                    ...(trade.canClose
                      ? [
                          {
                            key: "close",
                            label: "Close",
                            variant: "sell" as const,
                            loading: actionKey === key,
                            onClick: () => void onClose(trade),
                          },
                        ]
                      : []),
                    ...(trade.signalId
                      ? [
                          {
                            key: "setup",
                            label: "Setup",
                            variant: "neutral" as const,
                            onClick: () =>
                              onOpenSetup({
                                signalId: trade.signalId!,
                                symbol: trade.symbol,
                                direction: trade.direction,
                                entryMin: trade.entryMin ?? 0,
                                entryMax: trade.entryMax ?? 0,
                                stopLoss: trade.stopLoss ?? 0,
                                takeProfit: trade.takeProfit ?? 0,
                                status: "OPEN",
                                submittedAt: new Date().toISOString(),
                              }),
                          },
                        ]
                      : []),
                  ]}
                />
              </>
            }
          >
            <Mt5DetailGrid
              left={[
                {
                  label: "",
                  value: trade.positionId
                    ? `#${trade.positionId}`
                    : trade.signalId
                      ? `#${trade.signalId.slice(0, 10)}`
                      : "—",
                },
                { label: "S / L:", value: fmtMt5Price(trade.stopLoss) },
                { label: "T / P:", value: fmtMt5Price(trade.takeProfit) },
              ]}
              right={[
                {
                  label: "Open:",
                  value: fmtMt5Date(new Date().toISOString()),
                },
                { label: "Swap:", value: "0.00" },
                ...(trade.breakevenSet
                  ? [{ label: "BE:", value: "set" }]
                  : []),
              ]}
            />
          </Mt5ExpandableRow>
        );
      })}
    </div>
  );
}

function HistoryPanel({
  subTab,
  positions,
  orders,
  deals,
  loadingSignalId,
  onOpenSetup,
}: {
  subTab: HistorySubTab;
  positions: UserMt5HistoryItem[];
  orders: UserMt5HistoryItem[];
  deals: UserMt5HistoryItem[];
  loadingSignalId: string | null;
  onOpenSetup: (row: UserMt5HistoryItem) => void;
}) {
  const expand = useMt5Expand();

  if (subTab === "positions") {
    if (positions.length === 0) {
      return <Mt5Empty title="No closed positions" />;
    }
    return (
      <div>
        {positions.map((row) => {
          const id = row.id;
          const expanded = expand.isExpanded(id);
          const pnl = row.pnl ?? 0;
          return (
            <Mt5ExpandableRow
              key={id}
              id={id}
              expanded={expanded}
              onToggle={() => expand.toggle(id)}
              header={
                <>
                  <div>
                    <span className="font-semibold">{row.symbol}</span>
                    <span className="text-[var(--mt5-muted)]">, </span>
                    <Mt5DirectionTag direction={row.direction} volume={0.01} />
                  </div>
                  <Mt5Pnl value={pnl} className="text-base" />
                </>
              }
              subheader={
                <>
                  {fmtMt5Price(row.entryPrice)} → {fmtMt5Price(row.exitPrice)}
                </>
              }
              actions={
                <Mt5ActionStrip
                  actions={[
                    {
                      key: "setup",
                      label: loadingSignalId === row.signalId ? "…" : "Setup",
                      variant: "buy",
                      loading: loadingSignalId === row.signalId,
                      onClick: () => onOpenSetup(row),
                    },
                  ]}
                />
              }
            >
              <Mt5DetailGrid
                left={[
                  { label: "", value: `#${row.signalId.slice(0, 10)}` },
                  { label: "S / L:", value: fmtMt5Price(row.stopLoss) },
                  { label: "T / P:", value: fmtMt5Price(row.takeProfit) },
                ]}
                right={[
                  { label: "Open:", value: fmtMt5Date(row.submittedAt) },
                  { label: "Close:", value: fmtMt5Date(row.closedAt) },
                  {
                    label: "Status:",
                    value: row.status,
                  },
                ]}
              />
            </Mt5ExpandableRow>
          );
        })}
      </div>
    );
  }

  if (subTab === "orders") {
    const filled = orders.filter((o) => orderStatus(o) === "FILLED").length;
    const canceled = orders.filter((o) => orderStatus(o) === "CANCELED").length;

    if (orders.length === 0) {
      return <Mt5Empty title="No orders in history" />;
    }

    return (
      <div>
        <Mt5SummaryBlock
          rows={[
            { label: "Filled", value: String(filled), color: "#4a9eff" },
            { label: "Canceled", value: String(canceled) },
            { label: "Total", value: String(orders.length) },
          ]}
        />
        {orders.map((row) => {
          const id = `ord-${row.id}`;
          const expanded = expand.isExpanded(id);
          const status = orderStatus(row);
          return (
            <Mt5ExpandableRow
              key={id}
              id={id}
              expanded={expanded}
              onToggle={() => expand.toggle(id)}
              header={
                <>
                  <span className="font-semibold">{row.symbol}</span>
                  <span className="shrink-0 text-xs text-[var(--mt5-muted)]">
                    {fmtMt5Date(row.closedAt)}
                  </span>
                </>
              }
              subheader={
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <Mt5DirectionTag
                      direction={row.direction}
                      volume={0.01}
                      suffix={
                        orderTypeLabel(row).includes("limit") ? "limit" : undefined
                      }
                    />
                    {" · "}
                    0.01 / 0.01 at{" "}
                    {row.entryPrice != null
                      ? fmtMt5Price(row.entryPrice)
                      : fmtMt5Price(row.entryMin)}
                  </span>
                  <span
                    className="shrink-0 text-xs font-semibold uppercase"
                    style={{
                      color: status === "FILLED" ? "#4a9eff" : "var(--mt5-muted)",
                    }}
                  >
                    {status}
                  </span>
                </div>
              }
              actions={
                <Mt5ActionStrip
                  actions={[
                    {
                      key: "setup",
                      label: "Setup",
                      variant: "buy",
                      loading: loadingSignalId === row.signalId,
                      onClick: () => onOpenSetup(row),
                    },
                  ]}
                />
              }
            >
              <Mt5DetailGrid
                left={[
                  { label: "S / L:", value: fmtMt5Price(row.stopLoss) },
                  { label: "T / P:", value: fmtMt5Price(row.takeProfit) },
                ]}
                right={[
                  {
                    label: "Zone:",
                    value: `${fmtMt5Price(row.entryMin)} – ${fmtMt5Price(row.entryMax)}`,
                  },
                  { label: "Setup:", value: `#${row.signalId.slice(0, 8)}` },
                ]}
              />
            </Mt5ExpandableRow>
          );
        })}
      </div>
    );
  }

  /* DEALS */
  if (deals.length === 0) {
    return <Mt5Empty title="No deals yet" />;
  }

  const totalProfit = deals.reduce((s, d) => s + (d.pnl ?? 0), 0);

  return (
    <div>
      <Mt5SummaryBlock
        rows={[
          {
            label: "Profit",
            value: fmtMt5Price(totalProfit),
            color: totalProfit >= 0 ? "#4a9eff" : "#ff5252",
          },
          { label: "Deals", value: String(deals.length) },
        ]}
      />
      {deals.map((row) => {
        const id = `deal-${row.id}`;
        const expanded = expand.isExpanded(id);
        const pnl = row.pnl ?? 0;
        return (
          <Mt5ExpandableRow
            key={id}
            id={id}
            expanded={expanded}
            onToggle={() => expand.toggle(id)}
            header={
              <>
                <div>
                  <span className="font-semibold">{row.symbol}</span>
                  <span className="ml-2">
                    <Mt5DirectionTag direction={row.direction} volume={0.01} />
                  </span>
                </div>
                <span className="shrink-0 text-xs text-[var(--mt5-muted)]">
                  {fmtMt5Date(row.closedAt)}
                </span>
              </>
            }
            subheader={
              <div className="flex items-center justify-between">
                <span>
                  {row.entryPrice != null
                    ? `${fmtMt5Price(row.entryPrice)} → ${fmtMt5Price(row.exitPrice)}`
                    : `Entry ${fmtMt5Price(row.entryMin)} – ${fmtMt5Price(row.entryMax)}`}
                </span>
                {row.pnl != null && <Mt5Pnl value={pnl} />}
              </div>
            }
            actions={
              <Mt5ActionStrip
                actions={[
                  {
                    key: "setup",
                    label: "Setup",
                    variant: "buy",
                    loading: loadingSignalId === row.signalId,
                    onClick: () => onOpenSetup(row),
                  },
                ]}
              />
            }
          >
            <Mt5DetailGrid
              left={[
                { label: "", value: `#${row.signalId.slice(0, 10)}` },
                { label: "S / L:", value: fmtMt5Price(row.stopLoss) },
                { label: "T / P:", value: fmtMt5Price(row.takeProfit) },
              ]}
              right={[
                { label: "Open:", value: fmtMt5Date(row.submittedAt) },
                { label: "Swap:", value: "0.00" },
                { label: "Commission:", value: "0.00" },
              ]}
            />
          </Mt5ExpandableRow>
        );
      })}
    </div>
  );
}
