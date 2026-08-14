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
