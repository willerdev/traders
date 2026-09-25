/** Closed MT5 deals before this instant are hidden (reset 24 Sep 2026, current hour). */
export const SOLO_MT5_HISTORY_SINCE_MS = Date.parse(
  "2026-09-24T12:50:00.000Z",
);

export function isAfterSoloMt5HistoryReset(iso: string): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= SOLO_MT5_HISTORY_SINCE_MS;
}
