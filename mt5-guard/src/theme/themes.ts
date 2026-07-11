export type ThemeMode = "dark" | "light" | "blue";

export interface AppTheme {
  mode: ThemeMode;
  label: string;
  isLight: boolean;
  statusBar: "light" | "dark";
  bg: string;
  surface: string;
  surfaceAlt: string;
  divider: string;
  text: string;
  muted: string;
  primary: string;
  buy: string;
  sell: string;
  emerald: string;
  amber: string;
  error: string;
  overlay: string;
  chipActiveBg: string;
  inputBg: string;
  tabBar: string;
  tabBarBorder: string;
  chartBg: string;
  chartGrid: string;
  chartText: string;
}

const buy = "#4a9eff";
const sell = "#ff5252";

export const themes: Record<ThemeMode, AppTheme> = {
  dark: {
    mode: "dark",
    label: "Black",
    isLight: false,
    statusBar: "light",
    bg: "#0a0a0a",
    surface: "#141414",
    surfaceAlt: "#1c1c1c",
    divider: "#2a2a2a",
    text: "#fafafa",
    muted: "#a3a3a3",
    primary: "#fafafa",
    buy,
    sell,
    emerald: "#4ade80",
    amber: "#fbbf24",
    error: "#f87171",
    overlay: "rgba(0,0,0,0.72)",
    chipActiveBg: "rgba(250,250,250,0.08)",
    inputBg: "#0f0f0f",
    tabBar: "#111111",
    tabBarBorder: "#2a2a2a",
    chartBg: "#0a0a0a",
    chartGrid: "#222222",
    chartText: "#a3a3a3",
  },
  light: {
    mode: "light",
    label: "White",
    isLight: true,
    statusBar: "dark",
    bg: "#ffffff",
    surface: "#f4f4f5",
    surfaceAlt: "#e4e4e7",
    divider: "#e4e4e7",
    text: "#09090b",
    muted: "#71717a",
    primary: "#09090b",
    buy: "#2563eb",
    sell: "#dc2626",
    emerald: "#16a34a",
    amber: "#d97706",
    error: "#dc2626",
    overlay: "rgba(0,0,0,0.45)",
    chipActiveBg: "rgba(37,99,235,0.1)",
    inputBg: "#ffffff",
    tabBar: "#ffffff",
    tabBarBorder: "#e4e4e7",
    chartBg: "#ffffff",
    chartGrid: "#e4e4e7",
    chartText: "#71717a",
  },
  blue: {
    mode: "blue",
    label: "Blue",
    isLight: false,
    statusBar: "light",
    bg: "#121a2e",
    surface: "#1a2438",
    surfaceAlt: "#243049",
    divider: "rgba(255,255,255,0.08)",
    text: "#f8fafc",
    muted: "#94a3b8",
    primary: "#2563eb",
    buy,
    sell,
    emerald: "#22c55e",
    amber: "#fbbf24",
    error: "#ef4444",
    overlay: "rgba(0,0,0,0.65)",
    chipActiveBg: "rgba(37,99,235,0.18)",
    inputBg: "#121a2e",
    tabBar: "#1a2438",
    tabBarBorder: "rgba(255,255,255,0.08)",
    chartBg: "#121a2e",
    chartGrid: "#243049",
    chartText: "#94a3b8",
  },
};

export const THEME_MODES: ThemeMode[] = ["dark", "light", "blue"];
