"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type DailyCalendarDay } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

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

export function DailyIncomeJournal() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [days, setDays] = useState<Record<string, DailyCalendarDay>>({});
  const [monthNet, setMonthNet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await api.wallet.dailyCalendar(y, m);
      setDays(res.days);
      setMonthNet(res.monthNet);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(year, month);
  }, [year, month, load]);

  const grid = useMemo(() => buildCalendarGrid(year, month), [year, month]);

  const selectedDay = selectedDate ? days[selectedDate] : null;

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth() + 1);
    setSelectedDate(null);
  }

  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Daily income journal</CardTitle>
          <p className="mt-1 text-xs text-gray-500">
            Month total:{" "}
            <span
              className={cn(
                "font-semibold",
                monthNet > 0
                  ? "text-success"
                  : monthNet < 0
                    ? "text-destructive"
                    : "text-gray-400",
              )}
            >
              {formatDayNet(monthNet)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-white"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-medium">
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
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
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
                      "flex min-h-[4.5rem] flex-col rounded-lg border px-1 py-1.5 text-left transition-colors",
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
                    {cell.inMonth && hasActivity && (
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
                    )}
                    {cell.inMonth && !hasActivity && (
                      <span className="mt-auto text-[10px] text-gray-600">—</span>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedDay && (
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
