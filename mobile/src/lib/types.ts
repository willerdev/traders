/** Stage 1 types mirrored from frontend/src/lib/api.ts */

export interface LoginStartResponse {
  requiresOtp: true;
  loginSessionId: string;
  email: string;
  message: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  displayName: string;
  email?: string;
  role: string;
  status: string;
}

export interface LoginCompleteResponse {
  accessToken: string;
  user: AuthUser;
}

export type LoginResponse = LoginStartResponse | LoginCompleteResponse;

export interface OnboardingStatus {
  emailVerified: boolean;
  registrationPaid: boolean;
  accountActive: boolean;
  kycStatus: "NOT_STARTED" | "PENDING" | "APPROVED" | "REJECTED";
  profileComplete: boolean;
  addressComplete: boolean;
  hasSubmittedSignal: boolean;
}

export interface DashboardData {
  user: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
    email: string;
    role: string;
    status: string;
    emailVerified?: boolean;
    registrationPaid?: boolean;
    accessExpiresAt?: string | null;
    tradingAccessActive?: boolean;
    tradingDaysRemaining?: number | null;
  };
  onboarding?: OnboardingStatus;
  account: {
    balance: number;
    tier: string;
    weeklyProfit: number;
    winRate: number;
    score: number;
    consecutiveWins: number;
    consecutiveLosses: number;
    maxDrawdown: number;
    currentDrawdown: number;
    totalProfit: number;
  } | null;
  rank: number | null;
  tier: string;
  walletTransactions: WalletTransaction[];
}

export interface WalletTransaction {
  id: string;
  amount: number;
  type: string;
  referenceId: string | null;
  description: string;
  balanceAfter: number | null;
  createdAt: string;
}

export interface DisplayCurrencyInfo {
  code: string;
  rate: number | null;
  source: "coinbase" | "fallback";
  preferredCurrency: string | null;
  derivedFromCountry: string | null;
  localCurrencyCode?: string | null;
}

export interface WalletSummary {
  availableBalance: number;
  lockedBalance: number;
  pendingWalletDeposits?: number;
  pendingWalletDepositAmount?: number;
  subscriptionPaid: number;
  totalDeposited: number;
  totalEarned: number;
  totalWithdrawn: number;
  platformDailyYieldPercent: number;
  investorDailyYieldPercent: number;
  minDepositUsdt: number;
  displayCurrency?: DisplayCurrencyInfo;
  withdrawalFeeUsdt?: number;
  vipActive?: boolean;
  activePlan: {
    id: string;
    amount: number;
    riskPercent: number;
    dailyYieldPercent: number;
    startAt: string;
    endAt: string;
    status: string;
  } | null;
}

export interface WalletLedgerItem {
  id: string;
  amount: number;
  type: string;
  description: string;
  referenceId: string | null;
  balanceAfter: number | null;
  createdAt: string;
}

export type WithdrawalWalletNetwork =
  | "TRC20"
  | "ERC20"
  | "BEP20"
  | "MOMO_MTN"
  | "MOMO_AIRTEL";

export interface SavedWithdrawalWallet {
  id: string;
  label: string;
  address: string;
  network: WithdrawalWalletNetwork;
  verifiedAt: string;
  createdAt: string;
}

export interface WalletDepositCheckout {
  paymentId: string;
  amount: number;
  amountLocal?: number;
  localCurrency?: string;
  currency: string;
  network: string;
  payAddress?: string;
  payAmount?: number;
  payCurrency?: string;
  gatewayPaymentId?: number | string;
  gatewayChargeId?: string;
  liveStatus?: string;
  gateway?: string;
  instruction?: string;
  momoNetwork?: string;
  momoPhone?: string;
  redirectUrl?: string;
}

export interface DailyIncomeEntry {
  id: string;
  source: "INVESTOR" | "DEPOSITOR";
  amount: number;
  yieldPercent: number;
  baseBalance: number;
  creditDate: string;
  dayIndex: number | null;
  creditedAt: string;
}

export interface InvestorStatus {
  active: boolean;
  enrolledAt: string | null;
  vip?: {
    active: boolean;
    expiresAt: string | null;
    feeUsdt: number;
    benefits: {
      weekendEarnings: boolean;
      zeroWithdrawalFee: boolean;
    };
  };
  feeUsdt: number;
  investmentMin?: number;
  investmentMax?: number;
  dailyYieldPercent: number;
  platformDailyYieldPercent: number;
  displayCurrency?: DisplayCurrencyInfo;
  investmentDeposited: number;
  investmentBalance: number;
  enrollmentPaid: number;
  walletDeposited: number;
  walletBalance: number;
  tradingProfit: number;
  walletEarnings: number;
  totalProfit: number;
  currency: string;
  settings: {
    riskPercent: number;
    useTwoToOneRr: boolean;
    paused: boolean;
    yieldPaused?: boolean;
  } | null;
}

export interface InvestorCheckout {
  paymentId?: string;
  amount?: number;
  feeUsdt?: number;
  investmentAmount?: number;
  currency?: string;
  network?: string;
  payAddress?: string;
  payAmount?: number;
  payCurrency?: string;
  liveStatus?: string;
  message?: string;
  active?: boolean;
  enrolledAt?: string | null;
  success?: boolean;
  source?: string;
  balanceAfter?: number;
}

export interface PayoutRecord {
  id: string;
  virtualProfit: number;
  traderShare: number;
  platformShare: number;
  status: string;
  source?: "WEEKLY" | "TP_REWARD";
  rewardTier?: string | null;
  payoutMethod?: "TRC20" | "MOBILE_MONEY" | null;
  weekNumber: number;
  year: number;
  walletAddress?: string | null;
  notes?: string | null;
  requestedAt: string;
}

export interface DirectMessage {
  id: string;
  userId: string;
  senderId: string;
  senderRole: string;
  senderName: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  fromAdmin: boolean;
  isAgent: boolean;
}

export interface DirectMessageThread {
  userId: string;
  messages: DirectMessage[];
  unreadCount: number;
  agentEnabled: boolean;
  escalatedAt: string | null;
}

export interface SendMessageResult {
  message: DirectMessage;
  replies?: DirectMessage[];
  agentEnabled: boolean;
  escalated?: boolean;
}

export interface RequestAdminResult {
  agentEnabled: boolean;
  escalated: boolean;
  reply: DirectMessage;
}

export interface KycRecord {
  id?: string;
  status: "NOT_STARTED" | "PENDING" | "APPROVED" | "REJECTED";
  documentType?: "PASSPORT" | "NATIONAL_ID" | "DRIVERS_LICENSE" | null;
  documentNumber?: string | null;
  documentFrontUrl?: string | null;
  documentBackUrl?: string | null;
  selfieUrl?: string | null;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
}

export interface UserProfileRecord {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  country: string | null;
  preferredCurrency?: string | null;
  state: string | null;
  city: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  payoutMethod?: "TRC20" | "MOBILE_MONEY" | null;
  trc20Address?: string | null;
  mobileMoneyProvider?: string | null;
  mobileMoneyNumber?: string | null;
  mobileMoneyAccountName?: string | null;
}

export interface UserSettings {
  user: {
    id: string;
    email: string | null;
    displayName: string;
    avatarUrl: string | null;
    role: string;
    status: string;
    walletAddress: string | null;
    createdAt: string;
    tier: string;
  };
  profile: UserProfileRecord | null;
  kyc: KycRecord;
  displayCurrency?: DisplayCurrencyInfo;
  currencyOptions?: string[];
}

export interface UpdateProfileInput {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: string;
}

export interface UpdatePaymentDetailsInput {
  payoutMethod: "TRC20" | "MOBILE_MONEY";
  trc20Address?: string;
  mobileMoneyProvider?: string;
  mobileMoneyNumber?: string;
  mobileMoneyAccountName?: string;
}

export interface SubmitKycInput {
  documentType: "PASSPORT" | "NATIONAL_ID" | "DRIVERS_LICENSE";
  documentNumber: string;
  documentFrontUrl: string;
  documentBackUrl?: string;
  selfieUrl: string;
}

export interface PlatformNotification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  type?: string;
}

export interface PlatformNotificationsResult {
  unreadCount: number;
  items: PlatformNotification[];
}

export interface RegistrationCheckout {
  paymentId?: string;
  amount?: number;
  amountLocal?: number;
  localCurrency?: string;
  currency?: string;
  network?: string;
  payAddress?: string;
  payAmount?: number;
  payCurrency?: string;
  liveStatus?: string;
  instruction?: string;
  gateway?: string;
  success?: boolean;
  message?: string;
  promoCode?: string;
  amountCharged?: number;
  source?: string;
  balanceAfter?: number;
  accessExpiresAt?: string;
}

export interface PaymentStatusResult {
  payment: { id: string; status: string; amount: number };
  liveStatus?: string;
  actuallyPaid?: number;
  payAmount?: number;
  payAddress?: string;
  progress: string;
  confirmed: boolean;
}
