export type ThemeMode = "dark" | "light";

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
  primarySoft: string;
  primaryMuted: string;
  onPrimary: string;
  success: string;
  danger: string;
  gold: string;
  error: string;
  overlay: string;
  inputBg: string;
  tabBar: string;
  tabBarBorder: string;
  iconBtn: string;
}

/** Crypto-wallet dark UI: near-black + neon lime. */
export const themes: Record<ThemeMode, AppTheme> = {
  dark: {
    mode: "dark",
    label: "Dark",
    isLight: false,
    statusBar: "light",
    bg: "#0A0A0A",
    surface: "#161616",
    surfaceAlt: "#1F1F1F",
    divider: "rgba(255,255,255,0.08)",
    text: "#FFFFFF",
    muted: "#9CA3AF",
    primary: "#C8F53A",
    primarySoft: "rgba(200,245,58,0.14)",
    primaryMuted: "rgba(200,245,58,0.35)",
    onPrimary: "#0A0A0A",
    success: "#C8F53A",
    danger: "#FF6B8A",
    gold: "#FBBF24",
    error: "#FF6B8A",
    overlay: "rgba(0,0,0,0.72)",
    inputBg: "#121212",
    tabBar: "#0A0A0A",
    tabBarBorder: "rgba(255,255,255,0.06)",
    iconBtn: "#C8F53A",
  },
  light: {
    mode: "light",
    label: "Light",
    isLight: true,
    statusBar: "dark",
    bg: "#F7F8F4",
    surface: "#FFFFFF",
    surfaceAlt: "#EEF0E8",
    divider: "rgba(15,23,42,0.08)",
    text: "#0A0A0A",
    muted: "#6B7280",
    primary: "#84CC16",
    primarySoft: "rgba(132,204,22,0.14)",
    primaryMuted: "rgba(132,204,22,0.35)",
    onPrimary: "#0A0A0A",
    success: "#65A30D",
    danger: "#DC2626",
    gold: "#D97706",
    error: "#DC2626",
    overlay: "rgba(15,23,42,0.45)",
    inputBg: "#FFFFFF",
    tabBar: "#FFFFFF",
    tabBarBorder: "rgba(15,23,42,0.08)",
    iconBtn: "#84CC16",
  },
};
