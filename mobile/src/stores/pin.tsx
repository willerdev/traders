import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "./auth";

const LOCAL_PIN_FLAG = "trp-app-pin-enabled";

type PinContextValue = {
  ready: boolean;
  hasPin: boolean;
  unlocked: boolean;
  refreshStatus: () => Promise<void>;
  setPin: (pin: string, currentPin?: string) => Promise<void>;
  unlock: (pin: string) => Promise<void>;
  lock: () => void;
};

const PinContext = createContext<PinContextValue | null>(null);

export function PinProvider({ children }: { children: React.ReactNode }) {
  const { token, api } = useAuth();
  const [ready, setReady] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!token) {
      setHasPin(false);
      setUnlocked(false);
      setReady(true);
      return;
    }
    try {
      const status = await api.users.appPinStatus();
      setHasPin(Boolean(status.hasPin));
      await SecureStore.setItemAsync(LOCAL_PIN_FLAG, status.hasPin ? "1" : "0");
      setUnlocked(false);
    } catch {
      const local = await SecureStore.getItemAsync(LOCAL_PIN_FLAG);
      const localHas = local === "1";
      setHasPin(localHas);
      setUnlocked(false);
    } finally {
      setReady(true);
    }
  }, [api, token]);

  useEffect(() => {
    setReady(false);
    void refreshStatus();
  }, [refreshStatus]);

  const setPin = useCallback(
    async (pin: string, currentPin?: string) => {
      await api.users.setAppPin(pin, currentPin);
      await SecureStore.setItemAsync(LOCAL_PIN_FLAG, "1");
      setHasPin(true);
      setUnlocked(true);
    },
    [api],
  );

  const unlock = useCallback(
    async (pin: string) => {
      await api.users.verifyAppPin(pin);
      setUnlocked(true);
    },
    [api],
  );

  const lock = useCallback(() => setUnlocked(false), []);

  const value = useMemo(
    () => ({
      ready,
      hasPin,
      unlocked,
      refreshStatus,
      setPin,
      unlock,
      lock,
    }),
    [ready, hasPin, unlocked, refreshStatus, setPin, unlock, lock],
  );

  return <PinContext.Provider value={value}>{children}</PinContext.Provider>;
}

export function usePin() {
  const ctx = useContext(PinContext);
  if (!ctx) throw new Error("usePin must be used within PinProvider");
  return ctx;
}
