const STORAGE_KEY = "trp-return-to";

function isSafeReturnPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.startsWith("/login") || path.startsWith("/register")) return false;
  return true;
}

export function saveReturnTo(path: string) {
  if (typeof window === "undefined") return;
  if (!isSafeReturnPath(path)) return;
  sessionStorage.setItem(STORAGE_KEY, path);
}

export function resolveReturnTo(searchParams: URLSearchParams): string {
  const fromQuery = searchParams.get("returnTo");
  if (fromQuery && isSafeReturnPath(fromQuery)) {
    sessionStorage.removeItem(STORAGE_KEY);
    return fromQuery;
  }

  if (typeof window !== "undefined") {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && isSafeReturnPath(stored)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return stored;
    }
  }

  return "/dashboard";
}

export function currentReturnPath(fallbackPath = "/dashboard"): string {
  if (typeof window === "undefined") return fallbackPath;
  return `${window.location.pathname}${window.location.search}`;
}
