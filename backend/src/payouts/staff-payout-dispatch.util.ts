/** Staff payout dispatch — rukundo18@gmail.com only, 2h between slots, low→high amount order. */

export const STAFF_DISPATCH_OPERATOR_EMAIL = 'rukundo18@gmail.com';

export const STAFF_DISPATCH_INTERVAL_MS = 2 * 60 * 60 * 1000;

export function isStaffDispatchOperator(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === STAFF_DISPATCH_OPERATOR_EMAIL;
}

export function buildDispatchSchedule(
  count: number,
  firstAt: Date,
): Date[] {
  if (count <= 0) return [];
  return Array.from(
    { length: count },
    (_, i) => new Date(firstAt.getTime() + i * STAFF_DISPATCH_INTERVAL_MS),
  );
}

export function stripPriorStaffDispatchNotes(notes: string | null): string {
  return (notes ?? '')
    .replace(/\s*— Staff dispatch[^—]*?(?= —|$)/g, '')
    .trim();
}
