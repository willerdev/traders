export const ACCOUNT_TRANSFER_AGREEMENT_VERSION = 'v1';

/** User agreement link TTL. */
export const ACCOUNT_TRANSFER_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Hold after user agrees before assets land on destination and source is banned. */
export const ACCOUNT_TRANSFER_REVIEW_MS = 24 * 60 * 60 * 1000;

export type AccountTransferSnapshot = {
  availableBalance: number;
  lockedBalance: number;
  investorBalance: number;
  virtualBalance: number;
  virtualScore: number;
  virtualTier: string;
  virtualTotalTrades: number;
  virtualWinningTrades: number;
  virtualLosingTrades: number;
  virtualWeeklyProfit: number;
  virtualTotalProfit: number;
  virtualProfitShareBalance: number;
  virtualProfitShareEarned: number;
  virtualWinRate: number;
  virtualConsecutiveWins: number;
  virtualConsecutiveLosses: number;
  virtualMaxDrawdown: number;
  virtualCurrentDrawdown: number;
  registrationPaid: boolean;
  accessExpiresAt: string | null;
  profitShareActive: boolean;
  profitShareEnrolledAt: string | null;
  investorActive: boolean;
  investorEnrolledAt: string | null;
  investorVipActive: boolean;
  investorVipExpiresAt: string | null;
  depositorActive: boolean;
  mt5SyncActive: boolean;
  mt5SyncEnrolledAt: string | null;
  mt5SyncExpiresAt: string | null;
  mt5SyncEnabled: boolean;
  metaApiAccountId: string | null;
  fromEmail: string | null;
  fromDisplayName: string;
};
