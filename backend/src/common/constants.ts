export const TIER_BALANCES = {
  BRONZE: 1000,
  SILVER: 2500,
  GOLD: 5000,
  DIAMOND: 10000,
  ELITE: 25000,
} as const;

export const RR_BONUS: Record<string, number> = {
  '2': 5,
  '3': 10,
  '4': 15,
};

export const WIN_POINTS = 10;
export const LOSS_POINTS = -5;
export const DUPLICATE_THRESHOLD = 0.9;
export const ENTRY_TOLERANCE_PERCENT = 0.2;
export const DUPLICATE_ENTRY_PIP_TOLERANCE = 10;
export const DUPLICATE_LOOKBACK_MINUTES = 50;
export const TRADER_PAYOUT_PERCENT = 40;
export const PLATFORM_PAYOUT_PERCENT = 60;
export const STARTING_BALANCE = 1000;
export const RISK_PERCENT = 5;
export const MAX_RISK_PER_TRADE = 50;
export const REGISTRATION_FEE_USDT = 5;
export const TP_REWARD_USD = 5;
export const PROMO_DEFAULT_VALIDITY_DAYS = 7;

export const STREAK_THRESHOLDS = {
  WARNING: 3,
  SCORE_REDUCTION: 5,
  ACCOUNT_RESET: 10,
} as const;
