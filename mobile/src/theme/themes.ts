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
  error: string;
  overlay: string;
  inputBg: string;
  tabBar: string;
  tabBarBorder: string;
  iconBtn: string;
}

export const themes: Record<ThemeMode, AppTheme> = {
  dark: {
    mode: "dark",
    label: "Dark",
    isLight: false,
    statusBar: "light",
    bg: "#000000",
    surface: "#111111",
    surfaceAlt: "#1a1a1a",
    divider: "rgba(255,255,255,0.08)",
    text: "#FFFFFF",
    muted: "#8A8A8A",
    primary: "#3B82F6",
    primarySoft: "rgba(59,130,246,0.14)",
    onPrimary: "#FFFFFF",
    error: "#FFFFFF",
    overlay: "rgba(0,0,0,0.72)",
    inputBg: "#0a0a0a",
    tabBar: "#000000",
    tabBarBorder: "rgba(255,255,255,0.08)",
    iconBtn: "#1a1a1a",
  },
  light: {
    mode: "light",
    label: "Light",
    isLight: true,
    statusBar: "dark",
    bg: "#FFFFFF",
    surface: "#F5F7FA",
    surfaceAlt: "#EEF2F7",
    divider: "rgba(15,23,42,0.08)",
    text: "#0B1220",
    muted: "#64748B",
    primary: "#2563EB",
    primarySoft: "rgba(37,99,235,0.1)",
    onPrimary: "#FFFFFF",
    error: "#0B1220",
    overlay: "rgba(15,23,42,0.45)",
    inputBg: "#FFFFFF",
    tabBar: "#FFFFFF",
    tabBarBorder: "rgba(15,23,42,0.08)",
    iconBtn: "#EEF2F7",
  },
};
