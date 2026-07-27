/** Preferred withdrawal windows and off-schedule penalties. */

export type WithdrawalPreferredSchedule = "WEEKLY" | "MONTHLY";

export type WithdrawalScheduleQuote = {
  scheduleEnabled: boolean;
  preferredSchedule: WithdrawalPreferredSchedule;
  inPreferredWindow: boolean;
  processingFeeUsdt: number;
  penaltyPercent: number;
  penaltyUsdt: number;
  totalFeesUsdt: number;
  netPayoutUsdt: number;
  nextPreferredWindowAt: string;
  preferredWindowLabel: string;
};

export function normalizePreferredSchedule(
  raw: string | null | undefined,
): WithdrawalPreferredSchedule {
  return String(raw || "WEEKLY").toUpperCase() === "MONTHLY"
    ? "MONTHLY"
    : "WEEKLY";
}

/** Sunday UTC for WEEKLY; 1st of month UTC for MONTHLY. */
export function isInPreferredWithdrawalWindow(
  now: Date,
  schedule: WithdrawalPreferredSchedule,
): boolean {
  if (schedule === "MONTHLY") return now.getUTCDate() === 1;
  return now.getUTCDay() === 0; // Sunday
}

export function preferredWindowLabel(
  schedule: WithdrawalPreferredSchedule,
): string {
  return schedule === "MONTHLY"
    ? "the 1st of each month (UTC)"
    : "Sundays (UTC)";
}

export function nextPreferredWindowAt(
  now: Date,
  schedule: WithdrawalPreferredSchedule,
): Date {
  if (isInPreferredWithdrawalWindow(now, schedule)) {
    return new Date(now);
  }
  if (schedule === "MONTHLY") {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    // Next 1st 00:00 UTC
    if (now.getUTCDate() === 1) return new Date(Date.UTC(y, m, 1));
    return new Date(Date.UTC(y, m + 1, 1));
  }
  // Next Sunday 00:00 UTC
  const day = now.getUTCDay();
  const add = day === 0 ? 0 : 7 - day;
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + add,
    ),
  );
}

export function quoteWithdrawalFees(input: {
  grossUsdt: number;
  processingFeeUsdt: number;
  scheduleEnabled: boolean;
  preferredSchedule: WithdrawalPreferredSchedule;
  offSchedulePenaltyPercent: number;
  now?: Date;
}): WithdrawalScheduleQuote {
  const now = input.now ?? new Date();
  const schedule = input.preferredSchedule;
  const inWindow =
    !input.scheduleEnabled ||
    isInPreferredWithdrawalWindow(now, schedule);
  const processingFee = Math.max(0, input.processingFeeUsdt);
  const penaltyPercent =
    input.scheduleEnabled && !inWindow
      ? Math.max(0, input.offSchedulePenaltyPercent)
      : 0;
  const gross = Math.round(input.grossUsdt * 100) / 100;
  const penaltyUsdt =
    Math.round(((gross * penaltyPercent) / 100) * 100) / 100;
  const totalFeesUsdt =
    Math.round((processingFee + penaltyUsdt) * 100) / 100;
  const netPayoutUsdt = Math.round((gross - totalFeesUsdt) * 100) / 100;
  const next = nextPreferredWindowAt(now, schedule);

  return {
    scheduleEnabled: input.scheduleEnabled,
    preferredSchedule: schedule,
    inPreferredWindow: inWindow,
    processingFeeUsdt: processingFee,
    penaltyPercent,
    penaltyUsdt,
    totalFeesUsdt,
    netPayoutUsdt,
    nextPreferredWindowAt: next.toISOString(),
    preferredWindowLabel: preferredWindowLabel(schedule),
  };
}
