import type { UserMt5Terminal, UserMt5Trade } from "@/lib/api";

const TERMINAL_PREFIX = "trp-mt5-terminal";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type Mt5CacheSnapshot = {
  terminal: UserMt5Terminal;
  runningTrades: UserMt5Trade[];
  savedAt: string;
};

function storageKey(userId: string) {
  return `${TERMINAL_PREFIX}:${userId}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readMt5Cache(userId: string): Mt5CacheSnapshot | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Mt5CacheSnapshot;
    if (!parsed?.terminal || !Array.isArray(parsed.runningTrades)) return null;
    const age = Date.now() - new Date(parsed.savedAt).getTime();
    if (Number.isNaN(age) || age > MAX_AGE_MS) {
      localStorage.removeItem(storageKey(userId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeMt5Cache(
  userId: string,
  terminal: UserMt5Terminal,
  runningTrades: UserMt5Trade[],
) {
  if (!canUseStorage()) return;
  try {
    const snapshot: Mt5CacheSnapshot = {
      terminal,
      runningTrades,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey(userId), JSON.stringify(snapshot));
  } catch {
    /* quota or private mode */
  }
}

export function patchMt5RunningCache(
  userId: string,
  runningTrades: UserMt5Trade[],
  stats: { runningCount: number; floatingProfit: number },
  account?: UserMt5Terminal["account"],
) {
  const cached = readMt5Cache(userId);
  if (!cached) return;
  writeMt5Cache(
    userId,
    {
      ...cached.terminal,
      account: account ?? cached.terminal.account,
      stats: { ...cached.terminal.stats, ...stats },
    },
    runningTrades,
  );
}

export function clearMt5Cache(userId: string) {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}

export function runningFromTerminal(terminal: UserMt5Terminal): UserMt5Trade[] {
  return terminal.trades.filter((t) => t.kind === "running");
}
