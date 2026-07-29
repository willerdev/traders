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

/** Aligned with web `frontend/src/app/globals.css` (navy + #2563EB). */
export const themes: Record<ThemeMode, AppTheme> = {
  dark: {
    mode: "dark",
    label: "Dark",
    isLight: false,
    statusBar: "light",
    bg: "#121a2e",
    surface: "#161e30",
    surfaceAlt: "#1a2438",
    divider: "rgba(255,255,255,0.08)",
    text: "#F8FAFC",
    muted: "#94A3B8",
    primary: "#2563EB",
    primarySoft: "rgba(37,99,235,0.16)",
    onPrimary: "#FFFFFF",
    success: "#22C55E",
    danger: "#EF4444",
    gold: "#FBBF24",
    error: "#EF4444",
    overlay: "rgba(8,12,24,0.78)",
    inputBg: "#0f1626",
    tabBar: "#0f1626",
    tabBarBorder: "rgba(255,255,255,0.08)",
    iconBtn: "#1a2438",
  },
  light: {
    mode: "light",
    label: "Light",
    isLight: true,
    statusBar: "dark",
    bg: "#F1F5F9",
    surface: "#FFFFFF",
    surfaceAlt: "#E8EEF6",
    divider: "rgba(15,23,42,0.1)",
    text: "#0F172A",
    muted: "#64748B",
    primary: "#2563EB",
    primarySoft: "rgba(37,99,235,0.1)",
    onPrimary: "#FFFFFF",
    success: "#16A34A",
    danger: "#DC2626",
    gold: "#D97706",
    error: "#DC2626",
    overlay: "rgba(15,23,42,0.45)",
    inputBg: "#FFFFFF",
    tabBar: "#FFFFFF",
    tabBarBorder: "rgba(15,23,42,0.08)",
    iconBtn: "#E8EEF6",
  },
};
