/** VVIP — instant withdraw anytime, no schedule penalties, free self-serve reinvest. */

import {
  quoteWithdrawalFees,
  type WithdrawalPreferredSchedule,
} from '../wallet/withdrawal-schedule';

export function isInvestorVvipActive(user: {
  investorVvipActive?: boolean | null;
}): boolean {
  return Boolean(user.investorVvipActive);
}

/** VVIP pays no withdraw processing fee and no off-schedule penalty. */
export function vvipWithdrawFeeQuote(input: {
  grossUsdt: number;
  preferredSchedule: WithdrawalPreferredSchedule;
  offSchedulePenaltyPercent: number;
  now?: Date;
}) {
  return quoteWithdrawalFees({
    grossUsdt: input.grossUsdt,
    processingFeeUsdt: 0,
    scheduleEnabled: false,
    preferredSchedule: input.preferredSchedule,
    offSchedulePenaltyPercent: input.offSchedulePenaltyPercent,
    now: input.now,
  });
}
