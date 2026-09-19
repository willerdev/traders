/** Temporary Trade Guard withdrawal limits during platform maintenance. */
export const WITHDRAW_MAINTENANCE = {
  enabled: true,
  maxFraction: 0.4,
  feesWaived: true,
  userMessage:
    'Due to ongoing system maintenance, withdrawals are temporarily limited to 40% of your available wallet balance. Withdrawal fees are waived during this period. This is temporary and is being fixed.',
} as const;

export function isWithdrawMaintenanceActive(): boolean {
  return WITHDRAW_MAINTENANCE.enabled;
}

export function maxMaintenanceWithdrawUsdt(availableBalance: number): number {
  const available = Math.max(0, Number(availableBalance) || 0);
  if (!isWithdrawMaintenanceActive()) {
    return Math.round(available * 100) / 100;
  }
  return (
    Math.round(available * WITHDRAW_MAINTENANCE.maxFraction * 100) / 100
  );
}
