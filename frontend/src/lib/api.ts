// Browser uses same-origin proxy (app/api/v1/[...path]/route.ts) to avoid CORS.
const API_BASE = "/api/v1";

function apiErrorMessage(body: unknown, statusText: string): string {
  if (body && typeof body === "object") {
    const msg = (body as { message?: unknown }).message;
    if (Array.isArray(msg)) return msg.join(", ");
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return statusText || "Request failed";
}

function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("trp-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string } };
    return parsed.state?.token ?? null;
  } catch {
    return null;
  }
}

class ApiClient {
  private token: string | null = readStoredToken();

  setToken(token: string | null) {
    this.token = token;
  }

  getToken() {
    return this.token ?? readStoredToken();
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      });
    } catch {
      throw new Error(
        "Cannot reach the API. If you're running locally, start the backend with: cd backend && npm run start:dev",
      );
    }

    if (!res.ok) {
      const text = await res.text();
      let error: { message?: unknown } = { message: res.statusText };
      try {
        if (text) error = JSON.parse(text) as { message?: unknown };
      } catch {
        throw new Error(
          text.slice(0, 120) || "Request failed — invalid server response",
        );
      }
      throw new Error(apiErrorMessage(error, res.statusText));
    }

    try {
      return await res.json();
    } catch {
      throw new Error("Invalid response from server — try again shortly");
    }
  }

  auth = {
    register: (data: { email: string; password: string; displayName: string; acceptTerms: boolean }) =>
      this.request("/auth/register", { method: "POST", body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      this.request<{ accessToken: string; user: Record<string, unknown> }>(
        "/auth/login",
        { method: "POST", body: JSON.stringify(data) },
      ),
    walletLogin: (data: { walletAddress: string; signature: string; message: string }) =>
      this.request<{ accessToken: string; user: Record<string, unknown> }>(
        "/auth/wallet",
        { method: "POST", body: JSON.stringify(data) },
      ),
  };

  users = {
    dashboard: () => this.request<DashboardData>("/users/dashboard"),
    profile: () => this.request("/users/profile"),
    settings: () => this.request<UserSettings>("/users/settings"),
    updateProfile: (data: UpdateProfileInput) =>
      this.request<UserSettings>("/users/profile", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    updateAddress: (data: UpdateAddressInput) =>
      this.request<UserSettings>("/users/address", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    getKyc: () => this.request<KycRecord>("/users/kyc"),
    submitKyc: (data: SubmitKycInput) =>
      this.request<KycRecord>("/users/kyc/submit", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  };

  signals = {
    submit: (data: SignalInput) =>
      this.request<
        | { status: "duplicate_signal"; signalId: string }
        | {
            status: "accepted";
            signalId: string;
            submittedAt: string;
            entryRange: { min: number; max: number };
          }
      >("/signals", { method: "POST", body: JSON.stringify(data) }),
    list: () => this.request<SignalRecord[]>("/signals"),
    executionStatus: (signalId: string) =>
      this.request<HubSignalStatus>(`/signals/hub/execution/${signalId}`),
    executionLogs: (params?: { signal_id?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.signal_id) q.set("signal_id", params.signal_id);
      if (params?.limit) q.set("limit", String(params.limit));
      const qs = q.toString();
      return this.request<HubLogsResult>(
        `/signals/hub/logs${qs ? `?${qs}` : ""}`,
      );
    },
    hubList: (params?: { status?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.limit) q.set("limit", String(params.limit ?? 50));
      const qs = q.toString();
      return this.request<HubSignalList>(`/signals/hub/list${qs ? `?${qs}` : ""}`);
    },
    positions: () => this.request<HubPositions>("/signals/hub/positions"),
    closePosition: (ticket: number) =>
      this.request<{ ok: boolean; ticket: number }>(
        `/signals/hub/positions/${ticket}/close`,
        { method: "POST" },
      ),
    closeAllPositions: () =>
      this.request<{ ok: boolean; closed: number; count: number }>(
        "/signals/hub/positions/close-all",
        { method: "POST" },
      ),
    listDrafts: () => this.request<SignalDraft[]>("/signals/drafts"),
    createDraft: (data: SignalDraftInput) =>
      this.request<SignalDraft>("/signals/drafts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateDraft: (draftId: string, data: SignalDraftInput) =>
      this.request<SignalDraft>(`/signals/drafts/${draftId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteDraft: (draftId: string) =>
      this.request<{ deleted: boolean }>(`/signals/drafts/${draftId}`, {
        method: "DELETE",
      }),
  };

  uploads = {
    setup: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const headers: Record<string, string> = {};
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }

      const res = await fetch(`${API_BASE}/uploads/setup`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(apiErrorMessage(error, res.statusText) || "Upload failed");
      }

      return res.json() as Promise<{ url: string; filename: string }>;
    },
    kyc: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const headers: Record<string, string> = {};
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }

      const res = await fetch(`${API_BASE}/uploads/kyc`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(apiErrorMessage(error, res.statusText) || "Upload failed");
      }

      return res.json() as Promise<{ url: string; filename: string }>;
    },
    analyzeSetup: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const headers: Record<string, string> = {};
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }

      const res = await fetch(`${API_BASE}/uploads/setup/analyze`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(apiErrorMessage(error, res.statusText) || "AI analysis failed");
      }

      return res.json() as Promise<{ analysis: SetupAnalysis }>;
    },
  };

  leaderboard = {
    get: (week?: number, year?: number) => {
      const params = new URLSearchParams();
      if (week) params.set("week", String(week));
      if (year) params.set("year", String(year));
      return this.request<LeaderboardEntry[]>(`/leaderboard?${params}`);
    },
  };

  payments = {
    createRegistration: (network: string, promoCode?: string) =>
      this.request<{
        paymentId?: string;
        amount?: number;
        currency?: string;
        network?: string;
        payAddress?: string;
        payAmount?: number;
        payCurrency?: string;
        gatewayPaymentId?: number;
        liveStatus?: string;
        invoiceUrl?: string;
        gateway?: string;
        success?: boolean;
        message?: string;
        promoCode?: string;
        amountCharged?: number;
      }>("/payments/registration", {
        method: "POST",
        body: JSON.stringify({ network, promoCode }),
      }),
    getStatus: (paymentId: string) =>
      this.request<{
        payment: { id: string; status: string; amount: number };
        liveStatus?: string;
        actuallyPaid?: number;
        payAmount?: number;
        payAddress?: string;
        progress: string;
        confirmed: boolean;
      }>(`/payments/${paymentId}/status`),
    applyPromo: (code: string) =>
      this.request<{
        success?: boolean;
        alreadyPaid?: boolean;
        message: string;
        promoCode?: string;
        discountPercent?: number;
        amountCharged?: number;
      }>("/payments/apply-promo", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
    validatePromo: (code: string) =>
      this.request<{
        valid: boolean;
        code: string;
        discountPercent: number;
        description: string;
        originalAmount: number;
        finalAmount: number;
        freeRegistration: boolean;
      }>(`/payments/promo/validate?code=${encodeURIComponent(code)}`),
    history: () => this.request("/payments/history"),
    wallet: () => this.request<WalletTransaction[]>("/payments/wallet"),
  };

  payouts = {
    history: () => this.request<PayoutRecord[]>("/payouts"),
    request: (payoutId: string, walletAddress: string) =>
      this.request("/payouts/request", {
        method: "POST",
        body: JSON.stringify({ payoutId, walletAddress }),
      }),
  };

  admin = {
    overview: () => this.request<AdminOverview>("/admin/overview"),
    pendingKyc: () => this.request<AdminKycItem[]>("/admin/kyc/pending"),
    approveKyc: (userId: string) =>
      this.request(`/admin/kyc/${userId}/approve`, { method: "POST" }),
    rejectKyc: (userId: string, reason: string) =>
      this.request(`/admin/kyc/${userId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    pendingPayouts: () => this.request<AdminPayoutItem[]>("/admin/payouts/pending"),
    approvePayout: (payoutId: string) =>
      this.request(`/admin/payouts/${payoutId}/approve`, { method: "POST" }),
  };
}

export interface PayoutRecord {
  id: string;
  virtualProfit: number;
  traderShare: number;
  platformShare: number;
  status: string;
  weekNumber: number;
  year: number;
  requestedAt: string;
}

export interface DashboardData {
  user: {
    id: string;
    displayName: string;
    email: string;
    role: string;
    status: string;
    emailVerified?: boolean;
    registrationPaid?: boolean;
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
  recentSignals: SignalRecord[];
  walletTransactions: WalletTransaction[];
}

export interface OnboardingStatus {
  emailVerified: boolean;
  registrationPaid: boolean;
  accountActive: boolean;
  kycStatus: "NOT_STARTED" | "PENDING" | "APPROVED" | "REJECTED";
  profileComplete: boolean;
  addressComplete: boolean;
  hasSubmittedSignal: boolean;
}

export interface AdminOverview {
  activeTraders: number;
  totalUsers: number;
  todayRegistrations: number;
  totalRevenue: number;
  pendingKycCount: number;
  pendingPayouts: { count: number; amount: number };
}

export interface AdminKycItem {
  id: string;
  userId: string;
  status: string;
  documentType: string | null;
  documentFrontUrl: string | null;
  selfieUrl: string | null;
  submittedAt: string | null;
  user: {
    id: string;
    email: string | null;
    displayName: string;
    profile: UserProfileRecord | null;
  };
}

export interface AdminPayoutItem {
  id: string;
  traderShare: number;
  virtualProfit: number;
  walletAddress: string | null;
  status: string;
  user: {
    id: string;
    displayName: string;
    email: string | null;
    kyc: { status: string } | null;
  };
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

export interface SignalRecord {
  id: string;
  signalId: string;
  symbol: string;
  direction: string;
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  status: string;
  submittedAt: string;
  pointsAwarded: number;
  screenshotUrl?: string;
}

export interface SignalInput {
  symbol: string;
  direction: "BUY" | "SELL";
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  description: string;
  screenshotUrl: string;
}

export interface SetupAnalysis {
  symbol: string;
  direction: "BUY" | "SELL";
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  description: string;
}

export interface SignalDraftInput {
  symbol?: string;
  direction?: "BUY" | "SELL";
  entryMin?: number;
  entryMax?: number;
  stopLoss?: number;
  takeProfit?: number;
  description?: string;
  screenshotUrl?: string;
  aiFilled?: boolean;
}

export interface SignalDraft {
  id: string;
  symbol: string | null;
  direction: "BUY" | "SELL" | null;
  entryMin: number | null;
  entryMax: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  description: string | null;
  screenshotUrl: string | null;
  aiFilled: boolean;
  progress: number;
  createdAt: string;
  updatedAt: string;
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
}

export interface UserProfileRecord {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
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

export interface UpdateProfileInput {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: string;
}

export interface UpdateAddressInput {
  country?: string;
  state?: string;
  city?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
}

export interface SubmitKycInput {
  documentType: "PASSPORT" | "NATIONAL_ID" | "DRIVERS_LICENSE";
  documentNumber: string;
  documentFrontUrl: string;
  documentBackUrl?: string;
  selfieUrl: string;
}

export interface LeaderboardEntry {
  id: string;
  userId: string;
  displayName: string;
  tier: string;
  rank: number;
  score: number;
  profit: number;
  winRate: number;
  drawdown: number;
  consistency: number;
}

export interface HubSignalStatus {
  id: string;
  external_id: string | null;
  status: string;
  duplicate: boolean;
  progress?: { stage: string; message: string; executed: boolean } | null;
  created_at?: string;
  acked_at?: string | null;
}

export interface HubSignalList {
  items: HubSignalStatus[];
  count: number;
  sendername?: string | null;
}

export interface HubLogEvent {
  id: string;
  signal_id: string | null;
  sendername: string | null;
  event: string;
  message: string;
  created_at: string;
}

export interface HubLogsResult {
  items: HubLogEvent[];
  count: number;
  sendername?: string | null;
}

export interface HubPosition {
  ticket?: number;
  symbol?: string;
  type?: string;
  volume?: number;
  price_open?: number;
  sl?: number;
  tp?: number;
  profit?: number;
}

export interface HubPositions {
  sendername: string;
  count: number;
  items: HubPosition[];
}

export const api = new ApiClient();
