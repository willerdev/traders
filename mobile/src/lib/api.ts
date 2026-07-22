import { API_BASE_URL } from "../config/env";
import type {
  AuthUser,
  DailyIncomeEntry,
  DashboardData,
  DirectMessageThread,
  InvestorCheckout,
  InvestorStatus,
  KycRecord,
  LoginCompleteResponse,
  LoginResponse,
  PaymentStatusResult,
  PayoutRecord,
  PlatformNotificationsResult,
  RegistrationCheckout,
  RequestAdminResult,
  SavedWithdrawalWallet,
  SendMessageResult,
  SubmitKycInput,
  UpdatePaymentDetailsInput,
  UpdateProfileInput,
  UserSettings,
  WalletDepositCheckout,
  WalletLedgerItem,
  WalletSummary,
  WithdrawalWalletNetwork,
} from "./types";

type TokenGetter = () => string | null;
type UnauthorizedHandler = () => void;

export type LocalUploadFile = {
  uri: string;
  name: string;
  type: string;
};

function parseError(body: unknown, statusText: string): string {
  if (body && typeof body === "object") {
    const msg = (body as { message?: unknown }).message;
    if (Array.isArray(msg)) return msg.join(", ");
    if (typeof msg === "string" && msg.trim()) {
      if (msg === "Unauthorized") return "Your session expired — signing you out.";
      return msg;
    }
  }
  return statusText || "Request failed";
}

export class ApiClient {
  private getToken: TokenGetter;
  private onUnauthorized?: UnauthorizedHandler;

  constructor(getToken: TokenGetter, onUnauthorized?: UnauthorizedHandler) {
    this.getToken = getToken;
    this.onUnauthorized = onUnauthorized;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    const hasBody = options.body != null && options.body !== "";
    if (hasBody && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    const token = this.getToken();
    const sentAuth = Boolean(token);
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    } catch {
      throw new Error(
        "Cannot reach the API. The server may be waking up — wait and retry.",
      );
    }

    if (!res.ok) {
      if (res.status === 401 && sentAuth) this.onUnauthorized?.();
      const text = await res.text();
      let body: unknown = { message: res.statusText };
      try {
        if (text) body = JSON.parse(text);
      } catch {
        throw new Error(text.slice(0, 120) || res.statusText);
      }
      throw new Error(parseError(body, res.statusText));
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  private async uploadRequest<T>(
    path: string,
    formData: FormData,
    failLabel: string,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    const token = this.getToken();
    const sentAuth = Boolean(token);
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers,
        body: formData,
      });
    } catch {
      throw new Error(
        "Cannot reach the API. The server may be waking up — wait and retry.",
      );
    }

    if (!res.ok) {
      if (res.status === 401 && sentAuth) this.onUnauthorized?.();
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(parseError(error, res.statusText) || failLabel);
    }
    return res.json() as Promise<T>;
  }

  auth = {
    register: (data: {
      email: string;
      password: string;
      displayName: string;
      acceptTerms: boolean;
      referralCode?: string;
    }) =>
      this.request<{ user?: AuthUser; message?: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    login: (data: { email: string; password: string }) =>
      this.request<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    verifyLoginOtp: (data: { loginSessionId: string; code: string }) =>
      this.request<LoginCompleteResponse>("/auth/login/verify-otp", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    resendLoginOtp: (loginSessionId: string) =>
      this.request<{ loginSessionId: string; message: string; expiresIn: number }>(
        "/auth/login/resend-otp",
        { method: "POST", body: JSON.stringify({ loginSessionId }) },
      ),
    forgotPassword: (email: string) =>
      this.request<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
  };

  users = {
    dashboard: () => this.request<DashboardData>("/users/dashboard"),
    settings: () => this.request<UserSettings>("/users/settings"),
    updateProfile: (data: UpdateProfileInput) =>
      this.request<UserSettings>("/users/profile", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    updateCurrency: (preferredCurrency: string | null) =>
      this.request<UserSettings>("/users/currency", {
        method: "PATCH",
        body: JSON.stringify({ preferredCurrency }),
      }),
    updatePaymentDetails: (data: UpdatePaymentDetailsInput) =>
      this.request<UserSettings>("/users/payment-details", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    getKyc: () => this.request<KycRecord>("/users/kyc"),
    submitKyc: (data: SubmitKycInput) =>
      this.request<KycRecord>("/users/kyc/submit", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    retryKyc: () =>
      this.request<KycRecord>("/users/kyc/retry", { method: "POST" }),
  };

  uploads = {
    kyc: (file: LocalUploadFile) => {
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as unknown as Blob);
      return this.uploadRequest<{ url: string; filename: string }>(
        "/uploads/kyc",
        formData,
        "Upload failed",
      );
    },
  };

  messages = {
    getThread: (since?: string) => {
      const qs = since ? `?since=${encodeURIComponent(since)}` : "";
      return this.request<DirectMessageThread>(`/messages${qs}`);
    },
    send: (body: string) =>
      this.request<SendMessageResult>("/messages", {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    requestAdmin: () =>
      this.request<RequestAdminResult>("/messages/request-admin", {
        method: "POST",
      }),
    resumeAgent: () =>
      this.request<RequestAdminResult>("/messages/resume-agent", {
        method: "POST",
      }),
    unreadCount: () => this.request<{ count: number }>("/messages/unread-count"),
  };

  payments = {
    pendingRegistration: (network?: string) =>
      this.request<{
        pending: {
          paymentId: string;
          amount: number;
          currency: string;
          network: string;
          payAddress?: string;
          payAmount?: number;
          payCurrency?: string;
          liveStatus?: string;
        } | null;
      }>(
        `/payments/registration/pending${
          network ? `?network=${encodeURIComponent(network)}` : ""
        }`,
      ),
    createRegistration: (
      network: string,
      promoCode?: string,
      source?: "wallet" | "crypto" | "momo",
      momo?: { phone: string; network: string; countryCode?: string },
    ) =>
      this.request<RegistrationCheckout>("/payments/registration", {
        method: "POST",
        body: JSON.stringify({
          network,
          promoCode,
          source,
          ...(source === "momo" && momo
            ? {
                momoPhone: momo.phone,
                momoNetwork: momo.network,
                momoCountryCode: momo.countryCode,
              }
            : {}),
        }),
      }),
    getStatus: (paymentId: string) =>
      this.request<PaymentStatusResult>(`/payments/${paymentId}/status`),
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
    featuredPromo: () =>
      this.request<{
        registrationFeeUsdt: number;
        promo: {
          code: string;
          discountPercent: number;
          description: string;
          originalAmount: number;
          finalAmount: number;
          expiresAt: string;
        } | null;
      }>("/payments/promo/featured"),
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
  };

  wallet = {
    summary: () => this.request<WalletSummary>("/wallet/summary"),
    transactions: (take = 50, skip = 0) =>
      this.request<{ items: WalletLedgerItem[]; total: number }>(
        `/wallet/transactions?take=${take}&skip=${skip}`,
      ),
    depositMinimum: (network: string) =>
      this.request<{ minUsdt: number; network: string }>(
        `/wallet/deposit/minimum?network=${encodeURIComponent(network)}`,
      ),
    deposit: (data: {
      network?: string;
      amount: number;
      riskPercent?: number;
      method?: "crypto" | "momo";
      momoPhone?: string;
      momoNetwork?: string;
      momoCountryCode?: string;
    }) =>
      this.request<WalletDepositCheckout>("/wallet/deposit", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    withdraw: (amount: number, savedWalletId?: string) =>
      this.request<{
        status: string;
        payoutId: string;
        amount: number;
        fee: number;
        netPayout: number;
        balance: number;
      }>("/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify({
          amount,
          ...(savedWalletId?.trim() ? { savedWalletId: savedWalletId.trim() } : {}),
        }),
      }),
    withdrawalWallets: () =>
      this.request<SavedWithdrawalWallet[]>("/wallet/withdrawal-wallets"),
    requestWithdrawalWalletVerification: (data: {
      label: string;
      address: string;
      network: WithdrawalWalletNetwork;
    }) =>
      this.request<{
        sessionId: string;
        email: string;
        network: string;
        message: string;
        expiresIn: number;
      }>("/wallet/withdrawal-wallets/request-verification", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    confirmWithdrawalWallet: (sessionId: string, code: string) =>
      this.request<{ wallet: SavedWithdrawalWallet; message: string }>(
        "/wallet/withdrawal-wallets/confirm",
        { method: "POST", body: JSON.stringify({ sessionId, code }) },
      ),
    removeWithdrawalWallet: (id: string) =>
      this.request<{ ok: boolean; message: string }>(
        `/wallet/withdrawal-wallets/${id}`,
        { method: "DELETE" },
      ),
    incomeJournal: (take = 50, skip = 0) =>
      this.request<{ items: DailyIncomeEntry[]; total: number }>(
        `/wallet/income-journal?take=${take}&skip=${skip}`,
      ),
  };

  investor = {
    status: () => this.request<InvestorStatus>("/investor/status"),
    vipStatus: () =>
      this.request<{
        eligible: boolean;
        active: boolean;
        expiresAt: string | null;
        feeUsdt: number;
        walletBalance: number;
        benefits: { weekendEarnings: boolean; zeroWithdrawalFee: boolean };
      }>("/investor/vip/status"),
    vipUpgrade: () =>
      this.request<{
        success: boolean;
        active: boolean;
        feeUsdt: number;
        expiresAt: string;
        paymentId: string;
        message: string;
      }>("/investor/vip/upgrade", { method: "POST" }),
    enrollCheckout: (
      network: string,
      source?: "wallet" | "crypto",
      investmentAmount?: number,
    ) =>
      this.request<InvestorCheckout>("/investor/enroll/checkout", {
        method: "POST",
        body: JSON.stringify({ network, source, investmentAmount }),
      }),
    pause: () =>
      this.request<{ paused: boolean }>("/investor/pause", { method: "POST" }),
    resume: () =>
      this.request<{ paused: boolean }>("/investor/resume", { method: "POST" }),
    allocate: (amount: number) =>
      this.request<{
        direction: string;
        amount: number;
        walletBalance: number;
        investmentBalance: number;
      }>("/investor/allocate", {
        method: "POST",
        body: JSON.stringify({ amount }),
      }),
    redeem: (amount: number) =>
      this.request<{
        direction: string;
        amount: number;
        walletBalance: number;
        investmentBalance: number;
      }>("/investor/redeem", {
        method: "POST",
        body: JSON.stringify({ amount }),
      }),
  };

  payouts = {
    history: () => this.request<PayoutRecord[]>("/payouts"),
    request: (payoutId: string, walletAddress?: string) =>
      this.request("/payouts/request", {
        method: "POST",
        body: JSON.stringify(
          walletAddress?.trim()
            ? { payoutId, walletAddress: walletAddress.trim() }
            : { payoutId },
        ),
      }),
  };

  notifications = {
    list: (limit?: number) =>
      this.request<PlatformNotificationsResult>(
        `/notifications${limit ? `?limit=${limit}` : ""}`,
      ),
    markRead: (id: string) =>
      this.request<{ ok: boolean }>(`/notifications/${id}/read`, {
        method: "PATCH",
      }),
    markAllRead: () =>
      this.request<{ ok: boolean }>("/notifications/read-all", {
        method: "PATCH",
      }),
  };
}
