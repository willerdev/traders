import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";
import { themes, type AppTheme, type ThemeMode } from "../theme/themes";

const THEME_KEY = "trp-mobile-theme";

type ThemeContextValue = {
  mode: ThemeMode;
  theme: AppTheme;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(THEME_KEY);
        if (stored === "dark" || stored === "light") setModeState(stored);
      } catch {
        /* keep default */
      }
    })();
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void SecureStore.setItemAsync(THEME_KEY, next);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  const value = useMemo(
    () => ({
      mode,
      theme: themes[mode],
      setMode,
      toggleMode,
    }),
    [mode, setMode, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
