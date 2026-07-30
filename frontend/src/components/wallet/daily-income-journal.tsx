"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  api,
  type DailyCalendarDay,
  type DailyCalendarSummary,
} from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2, Mail } from "lucide-react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type CalendarCell = {
  date: string;
  day: number;
  inMonth: boolean;
};

function buildCalendarGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startPad = (first.getUTCDay() + 6) % 7;
  const cells: CalendarCell[] = [];

  for (let i = 0; i < startPad; i += 1) {
    const d = new Date(Date.UTC(year, month - 1, -startPad + i + 1));
    cells.push({
      date: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(Date.UTC(year, month - 1, day));
    cells.push({
      date: d.toISOString().slice(0, 10),
      day,
      inMonth: true,
    });
  }

  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const d = new Date(`${last.date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    cells.push({
      date: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: false,
    });
  }

  return cells;
}

function monthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDayNet(value: number) {
  const abs = formatCurrency(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return formatCurrency(0);
}

function localSummary(
  days: Record<string, DailyCalendarDay>,
  monthNet: number,
): DailyCalendarSummary {
  const dayList = Object.values(days);
  let creditTotal = 0;
  let debitTotal = 0;
  const byTypeMap: Record<string, number> = {};
  let bestDay: { date: string; net: number } | null = null;
  let worstDay: { date: string; net: number } | null = null;

  for (const day of dayList) {
    if (!bestDay || day.net > bestDay.net) bestDay = { date: day.date, net: day.net };
    if (!worstDay || day.net < worstDay.net)
      worstDay = { date: day.date, net: day.net };
    for (const tx of day.transactions) {
      if (tx.amount > 0) creditTotal += tx.amount;
      else if (tx.amount < 0) debitTotal += Math.abs(tx.amount);
      byTypeMap[tx.type] = (byTypeMap[tx.type] ?? 0) + tx.amount;
    }
  }

  return {
    activeDays: dayList.length,
    creditTotal,
    debitTotal,
    monthNet,
    bestDay,
    worstDay,
    byType: Object.entries(byTypeMap)
      .map(([type, amount]) => ({ type, amount }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    dailyNets: dayList
      .map((d) => ({
        date: d.date,
        net: d.net,
        txCount: d.transactions.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function DailyIncomeJournal() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [days, setDays] = useState<Record<string, DailyCalendarDay>>({});
  const [monthNet, setMonthNet] = useState(0);
  const [summary, setSummary] = useState<DailyCalendarSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.wallet.dailyCalendar(y, m);
      setDays(res.days);
      setMonthNet(res.monthNet);
      setSummary(res.summary ?? localSummary(res.days, res.monthNet));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load journal");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(year, month);
  }, [year, month, load]);

  const grid = useMemo(() => buildCalendarGrid(year, month), [year, month]);
  const selectedDay = selectedDate ? days[selectedDate] : null;
  const todayKey = new Date().toISOString().slice(0, 10);
  const stats = summary ?? localSummary(days, monthNet);

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth() + 1);
    setSelectedDate(null);
    setMessage("");
  }

  async function sendReport() {
    setSending(true);
    setError("");
    setMessage("");
    try {
      const res = await api.wallet.sendJournalReport(year, month);
      setMessage(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send report");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Journal</h1>
          <p className="mt-1 text-sm text-gray-400">
            Your wallet activity by day — earnings, allocations, and withdrawals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-white"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[9rem] text-center text-sm font-medium text-white">
              {monthLabel(year, month)}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-white"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={sending || loading}
            onClick={() => void sendReport()}
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mail className="h-3.5 w-3.5" />
            )}
            {sending ? "Sending…" : "Send report"}
          </Button>
        </div>
      </div>

      {message && (
        <p className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {
            label: "Month net",
            value: formatDayNet(stats.monthNet),
            tone:
              stats.monthNet > 0
                ? "text-success"
                : stats.monthNet < 0
                  ? "text-destructive"
                  : "text-white",
          },
          {
            label: "Credits",
            value: formatDayNet(stats.creditTotal),
            tone: "text-success",
          },
          {
            label: "Debits",
            value: formatDayNet(-stats.debitTotal),
            tone: stats.debitTotal > 0 ? "text-destructive" : "text-gray-400",
          },
          {
            label: "Active days",
            value: String(stats.activeDays),
            tone: "text-white",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
          >
            <p className="text-[11px] uppercase tracking-wide text-gray-500">
              {stat.label}
            </p>
            <p className={cn("mt-1 text-sm font-semibold", stat.tone)}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {stats.bestDay && (
        <p className="text-xs text-gray-500">
          Best day{" "}
          <span className="text-gray-300">{stats.bestDay.date}</span>{" "}
          ({formatDayNet(stats.bestDay.net)})
          {stats.byType[0] && (
            <>
              {" "}
              · Top type{" "}
              <span className="text-gray-300">
                {stats.byType[0].type.replace(/_/g, " ")}
              </span>{" "}
              ({formatDayNet(stats.byType[0].amount)})
            </>
          )}
        </p>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-4">
        {loading ? (
          <div className="flex justify-center py-14">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {grid.map((cell) => {
                const dayData = days[cell.date];
                const net = dayData?.net ?? 0;
                const hasActivity = Boolean(dayData);
                const isSelected = selectedDate === cell.date;
                const isToday = cell.date === todayKey;

                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() =>
                      cell.inMonth &&
                      setSelectedDate(isSelected ? null : cell.date)
                    }
                    disabled={!cell.inMonth}
                    className={cn(
                      "flex min-h-[4.25rem] flex-col rounded-lg border px-1 py-1.5 text-left transition-colors sm:min-h-[4.75rem]",
                      cell.inMonth
                        ? "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                        : "border-transparent bg-transparent opacity-30",
                      isSelected && "border-primary/40 bg-primary/10",
                      isToday && cell.inMonth && "ring-1 ring-primary/30",
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs font-medium",
                        cell.inMonth ? "text-gray-300" : "text-gray-600",
                      )}
                    >
                      {cell.day}
                    </span>
                    {cell.inMonth && hasActivity ? (
                      <span
                        className={cn(
                          "mt-auto text-[10px] font-bold leading-tight",
                          net > 0
                            ? "text-success"
                            : net < 0
                              ? "text-destructive"
                              : "text-gray-500",
                        )}
                      >
                        {formatDayNet(net)}
                      </span>
                    ) : cell.inMonth ? (
                      <span className="mt-auto text-[10px] text-gray-600">—</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {selectedDay && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">
                    {new Date(`${selectedDay.date}T12:00:00.000Z`).toLocaleDateString(
                      undefined,
                      {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      },
                    )}
                  </p>
                  <span
                    className={cn(
                      "text-sm font-bold",
                      selectedDay.net > 0
                        ? "text-success"
                        : selectedDay.net < 0
                          ? "text-destructive"
                          : "text-gray-400",
                    )}
                  >
                    {formatDayNet(selectedDay.net)}
                  </span>
                </div>
                {selectedDay.transactions.length === 0 ? (
                  <p className="text-xs text-gray-500">No activity this day.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {selectedDay.transactions.map((tx, i) => (
                      <li
                        key={`${tx.type}-${i}`}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="min-w-0 truncate text-gray-400">
                          {tx.description || tx.type.replace(/_/g, " ")}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-semibold",
                            tx.amount > 0
                              ? "text-success"
                              : tx.amount < 0
                                ? "text-destructive"
                                : "text-gray-400",
                          )}
                        >
                          {formatDayNet(tx.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {!selectedDay && stats.byType.length > 0 && (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  This month by type
                </p>
                <ul className="space-y-1.5">
                  {stats.byType.slice(0, 8).map((row) => (
                    <li
                      key={row.type}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-gray-400">
                        {row.type.replace(/_/g, " ")}
                      </span>
                      <span
                        className={cn(
                          "font-semibold",
                          row.amount > 0
                            ? "text-success"
                            : row.amount < 0
                              ? "text-destructive"
                              : "text-gray-400",
                        )}
                      >
                        {formatDayNet(row.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
