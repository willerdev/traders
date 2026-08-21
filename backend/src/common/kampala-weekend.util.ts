/** Kampala weekday: 0 Sunday … 6 Saturday. */
export function kampalaDayOfWeek(date: Date = new Date()): number {
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[day] ?? date.getUTCDay();
}

/** Saturday and Sunday in Africa/Kampala — no daily yield for any user. */
export function isKampalaWeekend(date: Date = new Date()): boolean {
  const dow = kampalaDayOfWeek(date);
  return dow === 0 || dow === 6;
}

/** Advance by N Mon–Fri days in Kampala, preserving time-of-day. */
export function addKampalaWeekdays(from: Date, weekdays: number): Date {
  if (weekdays <= 0) return new Date(from);
  const result = new Date(from.getTime());
  let added = 0;
  while (added < weekdays) {
    result.setTime(result.getTime() + 24 * 60 * 60 * 1000);
    if (!isKampalaWeekend(result)) added++;
  }
  return result;
}
