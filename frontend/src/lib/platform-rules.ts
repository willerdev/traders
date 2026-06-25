/** Keep in sync with backend/src/common/constants.ts */
export const RISK_PERCENT = 5;
export const MAX_RISK_PER_TRADE = 50;
export const STARTING_BALANCE = 1000;

export const MT5_PANEL_STORAGE_KEY = "trp-show-mt5-panel";

export function readMt5PanelVisible(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MT5_PANEL_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeMt5PanelVisible(visible: boolean) {
  try {
    localStorage.setItem(MT5_PANEL_STORAGE_KEY, visible ? "true" : "false");
  } catch {
    /* ignore */
  }
}
