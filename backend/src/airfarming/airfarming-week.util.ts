/** UTC week starts Monday 00:00:00.000. */
export function utcWeekStart(date = new Date()): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export function utcWeekEndExclusive(weekStart: Date): Date {
  return new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
}

export function utcWeekEndInclusive(weekStart: Date): Date {
  return new Date(utcWeekEndExclusive(weekStart).getTime() - 1);
}

export function isSameUtcDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function formatUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
