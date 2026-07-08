export type Mt5ChartDisplaySettings = {
  showOrders: boolean;
  showLimits: boolean;
  showSlTp: boolean;
  showAssistant: boolean;
  showWatermark: boolean;
};

export const MT5_CHART_DISPLAY_SETTINGS_KEY = "mt5-chart-display-settings";

export const DEFAULT_MT5_CHART_DISPLAY_SETTINGS: Mt5ChartDisplaySettings = {
  showOrders: true,
  showLimits: true,
  showSlTp: true,
  showAssistant: true,
  showWatermark: true,
};

export const MT5_CHART_SETTINGS_EVENT = "mt5-chart-settings-change";

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readMt5ChartDisplaySettings(): Mt5ChartDisplaySettings {
  if (!canUseStorage()) return { ...DEFAULT_MT5_CHART_DISPLAY_SETTINGS };
  try {
    const raw = localStorage.getItem(MT5_CHART_DISPLAY_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_MT5_CHART_DISPLAY_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Mt5ChartDisplaySettings>;
    return { ...DEFAULT_MT5_CHART_DISPLAY_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_MT5_CHART_DISPLAY_SETTINGS };
  }
}

export function writeMt5ChartDisplaySettings(
  settings: Mt5ChartDisplaySettings,
): void {
  if (!canUseStorage()) return;
  localStorage.setItem(MT5_CHART_DISPLAY_SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(
    new CustomEvent(MT5_CHART_SETTINGS_EVENT, { detail: settings }),
  );
}
