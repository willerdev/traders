export type SetupExecutionPhase =
  | 'not_opened'
  | 'limit_active'
  | 'running'
  | 'partial'
  | 'claimable'
  | 'closed_win'
  | 'closed_loss'
  | 'closed_neutral'
  | 'closed';

export type TradeProgressOutcome = 'win' | 'loss' | 'neutral';

const HUB_TERMINAL = [
  'invalidated',
  'failed',
  'cancelled',
  'canceled',
  'closed',
  'rejected',
  'expired',
  'done',
  'not_found',
];

export function isHubLimitPending(
  hubRecordId: string | null | undefined,
  hubExecuted: boolean,
  hubStatus: string | null | undefined,
): boolean {
  if (!hubRecordId || hubExecuted) return false;
  const status = (hubStatus ?? '').toLowerCase();
  if (!status) return true;
  return !HUB_TERMINAL.some((t) => status.includes(t));
}

export function resolveTradeProgressOutcome(
  signal: { status: string },
  trade?: {
    isWin?: boolean | null;
    pnl?: unknown;
    closedAt?: Date | null;
  } | null,
): TradeProgressOutcome | null {
  if (signal.status === 'WON') return 'win';
  if (signal.status === 'LOST') return 'loss';
  if (signal.status === 'ARCHIVED') {
    if (trade?.isWin === true) return 'win';
    if (
      trade?.isWin === false &&
      trade.pnl != null &&
      Number(trade.pnl) < 0
    ) {
      return 'loss';
    }
    return 'neutral';
  }
  if (trade?.closedAt) {
    if (trade.isWin === true) return 'win';
    if (trade.isWin === false && trade.pnl != null && Number(trade.pnl) < 0) {
      return 'loss';
    }
    if (trade.isWin === false) return 'neutral';
  }
  return null;
}

export function resolveSetupExecutionPhase(input: {
  signalStatus: string;
  hubRecordId?: string | null;
  hubStatus?: string | null;
  hubExecuted: boolean;
  liveTradeStatus?: string;
  activated: boolean;
  partialClosed: boolean;
  tradeClosedAt?: Date | null;
  canClaimTp: boolean;
  canClaimTp1R1: boolean;
  canClaimSl: boolean;
  pendingTpClaim: boolean;
  tradeProgressOutcome?: TradeProgressOutcome | null;
}): { phase: SetupExecutionPhase; label: string } {
  if (input.signalStatus === 'WON') {
    return { phase: 'closed_win', label: 'Won — take profit' };
  }
  if (input.signalStatus === 'LOST') {
    return { phase: 'closed_loss', label: 'Lost — stop loss' };
  }
  if (input.signalStatus === 'ARCHIVED') {
    const outcome = input.tradeProgressOutcome ?? 'neutral';
    if (outcome === 'win') {
      return { phase: 'closed_win', label: 'Closed — win' };
    }
    if (outcome === 'loss') {
      return { phase: 'closed_loss', label: 'Closed — loss' };
    }
    return { phase: 'closed_neutral', label: 'Closed — even / neutral' };
  }
  if (input.signalStatus !== 'OPEN') {
    return { phase: 'closed', label: input.signalStatus.replace(/_/g, ' ') };
  }

  if (
    input.canClaimTp ||
    input.canClaimTp1R1 ||
    input.canClaimSl ||
    input.pendingTpClaim
  ) {
    return { phase: 'claimable', label: 'Ready to claim outcome' };
  }

  if (input.partialClosed && !input.tradeClosedAt) {
    return { phase: 'partial', label: 'Partially closed — remainder open' };
  }

  if (
    input.liveTradeStatus === 'open' ||
    (input.hubExecuted && input.activated && !input.tradeClosedAt)
  ) {
    return { phase: 'running', label: 'Running — position open' };
  }

  if (
    input.liveTradeStatus === 'pending' ||
    isHubLimitPending(input.hubRecordId, input.hubExecuted, input.hubStatus)
  ) {
    return { phase: 'limit_active', label: 'Limit / stop order active' };
  }

  if (input.activated) {
    return { phase: 'running', label: 'Active — in entry zone' };
  }

  if (input.hubRecordId) {
    return { phase: 'not_opened', label: 'Submitted — awaiting Hub fill' };
  }

  return { phase: 'not_opened', label: 'Submitted — not opened yet' };
}

export function resolveTp1ClaimBlockedReason(input: {
  hitRr1: boolean;
  partialClosed: boolean;
  breakevenSet: boolean;
  breakevenPending: boolean;
  rr1Valid: boolean;
  activated: boolean;
  canClaimTpBase: boolean;
  pendingTpClaim: boolean;
  existingRr1Claim: boolean;
}): string | undefined {
  if (input.canClaimTpBase || input.pendingTpClaim || input.existingRr1Claim) {
    return undefined;
  }
  if (!input.rr1Valid || !input.activated) return undefined;
  if (!input.hitRr1 && !input.partialClosed) {
    return 'TP1 (1:1 RR) has not been reached and no partial close recorded yet.';
  }
  if (!input.breakevenSet) {
    if (input.breakevenPending) {
      return 'Breakeven is still being set — wait for the broker to accept it, then claim 1:1 RR.';
    }
    return 'Breakeven must be set before you can claim 1:1 RR (after TP1 or a partial close).';
  }
  return undefined;
}
