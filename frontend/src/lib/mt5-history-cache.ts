import type { UserMt5HistoryItem } from "@/lib/api";

const PREFIX = "solo-mt5-history";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type Mt5HistoryCache = {
  items: UserMt5HistoryItem[];
  savedAt: string;
};

function key(userId: string) {
  return `${PREFIX}:${userId}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readMt5HistoryCache(userId: string): Mt5HistoryCache | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Mt5HistoryCache;
    if (!Array.isArray(parsed.items)) return null;
    const age = Date.now() - new Date(parsed.savedAt).getTime();
    if (Number.isNaN(age) || age > MAX_AGE_MS) {
      localStorage.removeItem(key(userId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeMt5HistoryCache(
  userId: string,
  items: UserMt5HistoryItem[],
) {
  if (!canUseStorage()) return;
  try {
    const snapshot: Mt5HistoryCache = {
      items,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(key(userId), JSON.stringify(snapshot));
  } catch {
    /* quota */
  }
}
