"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type HubLogEvent, type HubPosition } from "@/lib/api";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Activity,
  EyeOff,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  readMt5PanelVisible,
  writeMt5PanelVisible,
} from "@/lib/platform-rules";

function positionSide(pos: HubPosition): "BUY" | "SELL" | string {
  const t = String(pos.type ?? "").toLowerCase();
  if (t.includes("buy") || t === "0") return "BUY";
  if (t.includes("sell") || t === "1") return "SELL";
  return t.toUpperCase() || "—";
}

export function Mt5PositionsPanel() {
  const [visible, setVisible] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setVisible(readMt5PanelVisible());
    setHydrated(true);
  }, []);

  function showPanel() {
    writeMt5PanelVisible(true);
    setVisible(true);
  }

  function hidePanel() {
    writeMt5PanelVisible(false);
    setVisible(false);
  }

  if (!hydrated) {
    return null;
  }

  if (!visible) {
    return (
      <Card className="lg:col-span-2 border-white/5">
        <CardContent className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-gray-300">Live MT5 positions</p>
            <p className="text-xs text-gray-500">
              Hidden — show this panel to view Signal Hub executions and close trades
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={showPanel} className="gap-1">
            <Activity className="h-3.5 w-3.5" />
            Show MT5 panel
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <OpenPositionsCard onHide={hidePanel} />;
}

type OpenPositionsCardProps = {
  onHide?: () => void;
};

function OpenPositionsCard({ onHide }: OpenPositionsCardProps) {
  const [positions, setPositions] = useState<HubPosition[]>([]);
  const [logs, setLogs] = useState<HubLogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingTicket, setClosingTicket] = useState<number | null>(null);
  const [breakingEven, setBreakingEven] = useState<number | null>(null);
  const [closingAll, setClosingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [posRes, logRes] = await Promise.all([
        api.signals.positions(),
        api.signals.executionLogs({ limit: 8 }),
      ]);
      setPositions(posRes.items ?? []);
      setLogs(logRes.items ?? []);
    } catch (err) {
      setPositions([]);
      setLogs([]);
      setError(
        err instanceof Error ? err.message : "Could not load live positions",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClose(ticket: number) {
    setClosingTicket(ticket);
    try {
      await api.signals.closePosition(ticket);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close position");
    } finally {
      setClosingTicket(null);
    }
  }

  async function handleBreakeven(pos: HubPosition) {
    const ticket = Number(pos.ticket);
    if (!ticket) return;
    setBreakingEven(ticket);
    try {
      await api.signals.hubAction({
        action: "breakeven",
        ticket,
        symbol: pos.symbol,
      });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to move stop to breakeven",
      );
    } finally {
      setBreakingEven(null);
    }
  }

  async function handleCloseAll() {
    if (!confirm("Close all open MT5 positions for your account?")) return;
    setClosingAll(true);
    try {
      await api.signals.closeAllPositions();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close positions");
    } finally {
      setClosingAll(false);
    }
  }

  const totalProfit = positions.reduce(
    (sum, p) => sum + (Number(p.profit) || 0),
    0,
  );

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Live MT5 Positions
          </CardTitle>
          <p className="mt-1 text-sm text-gray-500">
            Open trades executed from your signals via Signal Hub
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {onHide && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onHide}
              className="gap-1 text-gray-400"
              title="Hide MT5 panel"
            >
              <EyeOff className="h-3.5 w-3.5" />
              Hide
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
          {positions.length > 0 && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleCloseAll}
              disabled={closingAll || loading}
            >
              {closingAll ? "Closing…" : "Close all"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && positions.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading positions…
          </div>
        ) : error && positions.length === 0 ? (
          <div className="rounded-lg border border-white/5 bg-white/[0.02] py-8 text-center">
            <p className="text-sm text-gray-400">{error}</p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={load}>
              Try again
            </Button>
          </div>
        ) : positions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 py-10 text-center">
            <p className="text-gray-500">No open positions on MT5</p>
            <p className="mt-1 text-xs text-gray-600">
              Positions appear here after a submitted setup is executed
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
              <span className="text-gray-400">
                {positions.length} open position{positions.length !== 1 ? "s" : ""}
              </span>
              <span
                className={cn(
                  "font-semibold",
                  totalProfit >= 0 ? "text-success" : "text-danger",
                )}
              >
                Floating P/L: {totalProfit >= 0 ? "+" : ""}
                {formatCurrency(totalProfit)}
              </span>
            </div>

            {positions.map((pos) => {
              const ticket = Number(pos.ticket);
              const side = positionSide(pos);
              const profit = Number(pos.profit) || 0;

              return (
                <div
                  key={ticket || `${pos.symbol}-${pos.price_open}`}
                  className="flex flex-col gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-white">
                        {pos.symbol ?? "—"}
                      </span>
                      <Badge variant={side === "BUY" ? "success" : "danger"}>
                        {side}
                      </Badge>
                      {ticket > 0 && (
                        <span className="text-xs text-gray-500">#{ticket}</span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400 sm:grid-cols-4">
                      <span>
                        Vol:{" "}
                        <span className="text-gray-300">
                          {pos.volume ?? "—"}
                        </span>
                      </span>
                      <span>
                        Entry:{" "}
                        <span className="text-gray-300">
                          {pos.price_open ?? "—"}
                        </span>
                      </span>
                      <span>
                        SL:{" "}
                        <span className="text-gray-300">{pos.sl ?? "—"}</span>
                      </span>
                      <span>
                        TP:{" "}
                        <span className="text-gray-300">{pos.tp ?? "—"}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Profit</p>
                      <p
                        className={cn(
                          "flex items-center justify-end gap-1 text-lg font-bold",
                          profit >= 0 ? "text-success" : "text-danger",
                        )}
                      >
                        {profit >= 0 ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        {formatCurrency(profit)}
                      </p>
                    </div>
                    {ticket > 0 && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={breakingEven === ticket}
                          onClick={() => handleBreakeven(pos)}
                        >
                          {breakingEven === ticket ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Breakeven"
                          )}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="gap-1"
                          disabled={closingTicket === ticket}
                          onClick={() => handleClose(ticket)}
                        >
                          {closingTicket === ticket ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                          Close
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {logs.length > 0 && (
          <div className="mt-6 border-t border-white/5 pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
              Recent execution activity
            </p>
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-gray-300">{log.event}</span>
                    <span className="text-gray-500"> — {log.message}</span>
                  </div>
                  <span className="shrink-0 text-gray-600">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
