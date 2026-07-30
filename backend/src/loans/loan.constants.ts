export const LOAN_ADVANCE_PERCENT = 80;
export const LOAN_INTEREST_PERCENT = 20;
/** Minimum combined invest+unitrust corpus to request a loan. */
export const LOAN_MIN_CORPUS_USDT = 100;
/** Minimum projected daily earning to qualify. */
export const LOAN_MIN_DAILY_EARNING_USDT = 0.5;

export const LOAN_TERM_DAYS = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 30,
} as const;

export type LoanTermKey = keyof typeof LOAN_TERM_DAYS;
