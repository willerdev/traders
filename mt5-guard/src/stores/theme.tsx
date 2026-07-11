import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";
import type { AppTheme, ThemeMode } from "../theme/themes";
import { themes } from "../theme/themes";

const THEME_KEY = "mt5-guard-theme";

type ThemeContextValue = {
  mode: ThemeMode;
  theme: AppTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("blue");

  useEffect(() => {
    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(THEME_KEY);
        if (stored === "dark" || stored === "light" || stored === "blue") {
          setModeState(stored);
        }
      } catch {
        /* keep default */
      }
    })();
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    await SecureStore.setItemAsync(THEME_KEY, next);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      theme: themes[mode],
      setMode,
    }),
    [mode, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
