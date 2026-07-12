export type UserMt5AccountSource =
  | "virtual"
  | "copy_live"
  | "linked_live"
  | "investor_live"
  | "evaluation_live";

export interface LoginStartResponse {
  requiresOtp: true;
  loginSessionId: string;
  email: string;
  message: string;
  expiresIn: number;
}

export interface LoginCompleteResponse {
  accessToken: string;
  user: AuthUser;
}

export type LoginResponse = LoginStartResponse | LoginCompleteResponse;

export interface AuthUser {
  id: string;
  displayName: string;
  email?: string;
  role: string;
  status: string;
  adminPermissions?: {
    copy?: boolean;
  };
}

export interface DashboardData {
  user: {
    id: string;
    displayName: string;
    email?: string;
    role: string;
    status: string;
    tradingAccessActive?: boolean;
    accessExpiresAt?: string | null;
    adminPermissions?: { copy?: boolean };
  };
}

export interface WalletSummary {
  availableBalance: number;
  lockedBalance: number;
  totalDeposited: number;
  totalEarned: number;
  totalWithdrawn: number;
  activePlan?: {
    amount: number;
    riskPercent: number;
    dailyYieldPercent: number;
    status: string;
  } | null;
}

export interface WalletLedgerItem {
  id: string;
  amount: number;
  type: string;
  description: string;
  balanceAfter: number;
  createdAt: string;
}

export type WithdrawalWalletNetwork = "TRC20" | "ERC20" | "BEP20";

export interface SavedWithdrawalWallet {
  id: string;
  label: string;
  address: string;
  network: WithdrawalWalletNetwork;
  verifiedAt: string;
}

export interface UserMt5AccountSummary {
  startingBalance: number;
  currency: string;
  realizedProfit: number;
  floatingProfit: number;
  totalProfit: number;
  equity: number;
}

export interface UserMt5Trade {
  signalId: string | null;
  symbol: string;
  direction: string;
  kind: "limit" | "running";
  status: "pending" | "open";
  stopLoss?: number;
  takeProfit?: number;
  volume?: number;
  openPrice?: number;
  currentPrice?: number;
  profit?: number;
  orderId?: string;
  positionId?: string;
  canClose: boolean;
  canSetBreakeven?: boolean;
  canPartialClose?: boolean;
}

export interface UserMt5QuoteItem {
  signalId: string;
  symbol: string;
  direction: string;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  spread: number | null;
}

export interface UserMt5HistoryItem {
  id: string;
  signalId: string;
  symbol: string;
  direction: string;
  status: string;
  pnl: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  closedAt: string;
}

export interface UserMt5Terminal {
  configured: boolean;
  accountSource?: UserMt5AccountSource;
  message?: string;
  account?: UserMt5AccountSummary;
  investor?: {
    investmentDeposited: number;
    investmentBalance?: number;
    mt5Balance?: number;
    currency: string;
  };
  trades: UserMt5Trade[];
  history: { items: UserMt5HistoryItem[]; count: number };
  stats: {
    runningCount: number;
    floatingProfit: number;
    limitCount: number;
  };
  refreshedAt: string;
}

export interface UserMt5RunningResult {
  trades: UserMt5Trade[];
  account?: UserMt5AccountSummary;
  accountSource?: UserMt5AccountSource;
  stats: { runningCount: number; floatingProfit: number };
}

export interface UserMt5QuotesResult {
  items: UserMt5QuoteItem[];
}

export interface UserMt5OhlcBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Mt5MarketOrderPreview {
  symbol: string;
  direction: "BUY" | "SELL";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  defaultSlPips: number;
  risk: { volume: number; riskAmount: number; riskPercent: number; currency: string };
}

export interface UserSettings {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    status: string;
    metaApiAccountId?: string | null;
    tier?: string;
    createdAt?: string;
  };
  profile: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    dateOfBirth?: string;
    country?: string;
    state?: string;
    city?: string;
    addressLine1?: string;
    addressLine2?: string;
    postalCode?: string;
    payoutMethod?: string;
    trc20Address?: string;
    mobileMoneyProvider?: string;
    mobileMoneyNumber?: string;
    mobileMoneyAccountName?: string;
  } | null;
  kyc: { status: string; rejectionReason?: string };
  metaApi?: { configured: boolean; defaultAccountId?: string | null };
}

export interface MetaApiAccountRow {
  id: string;
  name: string;
  login?: string;
  server?: string;
}

export interface Mt5SyncStatus {
  active: boolean;
  expiresAt?: string | null;
  linkedAccountId?: string | null;
  message?: string;
}
