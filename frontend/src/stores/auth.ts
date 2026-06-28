import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, type LoginResponse } from "@/lib/api";

interface User {
  id: string;
  displayName: string;
  email?: string;
  role: string;
  status: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  startLogin: (email: string, password: string) => Promise<LoginResponse>;
  verifyLoginOtp: (loginSessionId: string, code: string) => Promise<void>;
  resendLoginOtp: (loginSessionId: string) => Promise<{ loginSessionId: string }>;
  register: (email: string, password: string, displayName: string, acceptTerms?: boolean) => Promise<void>;
  logout: () => void;
  setAuth: (token: string, user: User) => void;
  setHasHydrated: (value: boolean) => void;
}

function applyAuth(
  set: (partial: Partial<AuthState>) => void,
  accessToken: string,
  user: Record<string, unknown>,
) {
  api.setToken(accessToken);
  set({
    token: accessToken,
    user: user as unknown as User,
    isAuthenticated: true,
  });
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      hasHydrated: false,

      startLogin: async (email, password) => {
        const res = await api.auth.login({ email, password });
        if ("accessToken" in res && typeof res.accessToken === "string") {
          applyAuth(set, res.accessToken, res.user);
        }
        return res;
      },

      verifyLoginOtp: async (loginSessionId, code) => {
        const res = await api.auth.verifyLoginOtp({ loginSessionId, code });
        applyAuth(set, res.accessToken, res.user);
      },

      resendLoginOtp: async (loginSessionId) => {
        const res = await api.auth.resendLoginOtp({ loginSessionId });
        return { loginSessionId: res.loginSessionId };
      },

      register: async (email, password, displayName, acceptTerms = true) => {
        await api.auth.register({ email, password, displayName, acceptTerms });
      },

      logout: () => {
        api.setToken(null);
        set({ user: null, token: null, isAuthenticated: false });
      },

      setAuth: (token, user) => {
        api.setToken(token);
        set({ token, user, isAuthenticated: true });
      },

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "trp-auth",
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          api.setToken(state.token);
        }
        useAuthStore.setState({ hasHydrated: true });
      },
    },
  ),
);

interface DashboardState {
  data: import("@/lib/api").DashboardData | null;
  loading: boolean;
  error: string | null;
  fetchDashboard: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  data: null,
  loading: false,
  error: null,
  fetchDashboard: async () => {
    const token = useAuthStore.getState().token ?? api.getToken();
    if (token) api.setToken(token);

    set({ loading: true, error: null });
    try {
      const data = await api.users.dashboard();
      if (!data) {
        throw new Error("Dashboard data unavailable");
      }
      set({ data, loading: false, error: null });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load dashboard",
      });
    }
  },
}));
