import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";
import { ApiClient } from "../lib/api";
import type { AuthUser, DashboardData, LoginResponse } from "../lib/types";

const TOKEN_KEY = "mt5-guard-token";
const USER_KEY = "mt5-guard-user";

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  dashboard: DashboardData | null;
  api: ApiClient;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  verifyOtp: (loginSessionId: string, code: string) => Promise<void>;
  resendOtp: (loginSessionId: string) => Promise<number>;
  logout: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
  setSession: (token: string, user: AuthUser) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const logoutRef = useRef<(() => Promise<void>) | null>(null);

  const api = useMemo(
    () =>
      new ApiClient(() => token, () => {
        void logoutRef.current?.();
      }),
    [token],
  );

  const persistSession = useCallback(async (nextToken: string, nextUser: AuthUser) => {
    setToken(nextToken);
    setUser(nextUser);
    await SecureStore.setItemAsync(TOKEN_KEY, nextToken);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(nextUser));
  }, []);

  const setSession = useCallback(
    async (nextToken: string, nextUser: AuthUser) => {
      await persistSession(nextToken, nextUser);
    },
    [persistSession],
  );

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    setDashboard(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  }, []);

  logoutRef.current = logout;

  const refreshDashboard = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.users.dashboard();
      setDashboard(data);
    } catch {
      /* keep last snapshot */
    }
  }, [api, token]);

  useEffect(() => {
    void (async () => {
      try {
        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        const storedUser = await SecureStore.getItemAsync(USER_KEY);
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser) as AuthUser);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (token) void refreshDashboard();
  }, [token, refreshDashboard]);

  const login = useCallback(
    async (email: string, password: string) => {
      const client = new ApiClient(() => null);
      return client.auth.login({ email, password });
    },
    [],
  );

  const verifyOtp = useCallback(
    async (loginSessionId: string, code: string) => {
      const client = new ApiClient(() => null);
      const res = await client.auth.verifyLoginOtp({ loginSessionId, code });
      await persistSession(res.accessToken, res.user);
    },
    [persistSession],
  );

  const resendOtp = useCallback(async (loginSessionId: string) => {
    const client = new ApiClient(() => null);
    const res = await client.auth.resendLoginOtp(loginSessionId);
    return res.expiresIn;
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      dashboard,
      api,
      loading,
      login,
      verifyOtp,
      resendOtp,
      logout,
      refreshDashboard,
      setSession,
    }),
    [
      token,
      user,
      dashboard,
      api,
      loading,
      login,
      verifyOtp,
      resendOtp,
      logout,
      refreshDashboard,
      setSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
