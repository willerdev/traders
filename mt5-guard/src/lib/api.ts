import { API_BASE_URL } from "../config/env";
import type {
  DashboardData,
  LoginCompleteResponse,
  LoginResponse,
  MetaApiAccountRow,
  Mt5MarketOrderPreview,
  Mt5SyncStatus,
  SavedWithdrawalWallet,
  UserMt5OhlcBar,
  UserMt5QuotesResult,
  UserMt5RunningResult,
  UserMt5Terminal,
  UserSettings,
  WalletLedgerItem,
  WalletSummary,
  WithdrawalWalletNetwork,
} from "./types";

type TokenGetter = () => string | null;
type UnauthorizedHandler = () => void;

function parseError(body: unknown, statusText: string): string {
  if (body && typeof body === "object") {
    const msg = (body as { message?: unknown }).message;
    if (Array.isArray(msg)) return msg.join(", ");
    if (typeof msg === "string" && msg.trim()) return msg;
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
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const token = this.getToken();
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
      if (res.status === 401) {
        this.onUnauthorized?.();
      }
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

  auth = {
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
      this.request<{ loginSessionId: string; expiresIn: number }>(
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
    updateProfile: (body: Record<string, unknown>) =>
      this.request<UserSettings>("/users/profile", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    updateAddress: (body: Record<string, unknown>) =>
      this.request<UserSettings>("/users/address", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    updatePaymentDetails: (body: Record<string, unknown>) =>
      this.request<UserSettings>("/users/payment-details", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    updateTradingAccount: (metaApiAccountId: string | null) =>
      this.request<UserSettings>("/users/trading-account", {
        method: "PATCH",
        body: JSON.stringify({ metaApiAccountId }),
      }),
    claimTradingAccount: (body: {
      accountName: string;
      login: string;
      password: string;
      server: string;
    }) =>
      this.request<{ accountId: string; account: MetaApiAccountRow }>(
        "/users/trading-account/claim",
        { method: "POST", body: JSON.stringify(body) },
      ),
  };

  wallet = {
    summary: () => this.request<WalletSummary>("/wallet/summary"),
    transactions: (take = 50, skip = 0) =>
      this.request<{ items: WalletLedgerItem[] }>(
        `/wallet/transactions?take=${take}&skip=${skip}`,
      ),
    depositMinimum: (network: WithdrawalWalletNetwork) =>
      this.request<{ minimum: number }>(
        `/wallet/deposit/minimum?network=${network}`,
      ),
    depositPreview: (amount: number, riskPercent: number) =>
      this.request<Record<string, unknown>>(
        `/wallet/deposit/preview?amount=${amount}&riskPercent=${riskPercent}`,
      ),
    deposit: (body: {
      network: WithdrawalWalletNetwork;
      amount: number;
      riskPercent?: number;
    }) =>
      this.request<Record<string, unknown>>("/wallet/deposit", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    withdraw: (body: { amount: number; savedWalletId: string }) =>
      this.request<{ message: string }>("/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    withdrawalWallets: () =>
      this.request<{ items: SavedWithdrawalWallet[] }>(
        "/wallet/withdrawal-wallets",
      ),
    requestWalletVerification: (body: {
      label: string;
      address: string;
      network: WithdrawalWalletNetwork;
    }) =>
      this.request<{ sessionId: string }>(
        "/wallet/withdrawal-wallets/request-verification",
        { method: "POST", body: JSON.stringify(body) },
      ),
    confirmWallet: (body: { sessionId: string; code: string }) =>
      this.request<SavedWithdrawalWallet>(
        "/wallet/withdrawal-wallets/confirm",
        { method: "POST", body: JSON.stringify(body) },
      ),
    deleteWallet: (id: string) =>
      this.request<void>(`/wallet/withdrawal-wallets/${id}`, {
        method: "DELETE",
      }),
  };

  signals = {
    mt5Terminal: () => this.request<UserMt5Terminal>("/signals/mt5/terminal"),
    mt5Running: () =>
      this.request<UserMt5RunningResult>("/signals/mt5/running"),
    mt5Quotes: () =>
      this.request<UserMt5QuotesResult>("/signals/mt5/quotes"),
    mt5Quote: (symbol: string) =>
      this.request<{ bid: number; ask: number; mid: number }>(
        `/signals/mt5/quote?symbol=${encodeURIComponent(symbol)}`,
      ),
    mt5Ohlc: (symbol: string, timeframe: string, limit = 200) =>
      this.request<{ bars: UserMt5OhlcBar[] }>(
        `/signals/mt5/ohlc?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`,
      ),
    mt5OrderPreview: (symbol: string, direction: "BUY" | "SELL") =>
      this.request<Mt5MarketOrderPreview>(
        `/signals/mt5/order-preview?symbol=${encodeURIComponent(symbol)}&direction=${direction}`,
      ),
    placeMt5Order: (body: {
      symbol: string;
      direction: "BUY" | "SELL";
      stopLoss: number;
      takeProfit: number;
    }) =>
      this.request<Record<string, unknown>>("/signals/mt5/orders", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    closeMt5Position: (positionId: string) =>
      this.request<{ ok: boolean }>(
        `/signals/mt5/positions/${encodeURIComponent(positionId)}/close`,
        { method: "POST" },
      ),
    closeAllMt5Positions: () =>
      this.request<{ closed: number; failed: number }>(
        "/signals/mt5/positions/close-all",
        { method: "POST" },
      ),
    modifyMt5Stops: (
      positionId: string,
      stops: { stopLoss?: number; takeProfit?: number },
    ) =>
      this.request<{ ok: boolean }>(
        `/signals/mt5/positions/${encodeURIComponent(positionId)}/modify-stops`,
        { method: "POST", body: JSON.stringify(stops) },
      ),
    closeTrade: (signalId: string) =>
      this.request<Record<string, unknown>>(
        `/signals/${signalId}/close-trade`,
        { method: "POST" },
      ),
    metaApiAccounts: () =>
      this.request<{ items: MetaApiAccountRow[] }>(
        "/signals/metaapi/accounts",
      ),
  };

  mt5Sync = {
    status: () => this.request<Mt5SyncStatus>("/mt5-sync/status"),
    setEnabled: (enabled: boolean) =>
      this.request<Mt5SyncStatus>("/mt5-sync/enabled", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
    poolAccounts: () =>
      this.request<{ items: MetaApiAccountRow[] }>("/mt5-sync/pool-accounts"),
  };
}
