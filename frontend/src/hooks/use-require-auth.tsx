"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { currentReturnPath, saveReturnTo } from "@/lib/return-to";

export function AuthLoadingScreen() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

/** Wait for persisted auth, then redirect unauthenticated users to login with return path. */
export function useRequireAuth() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!hasHydrated || isAuthenticated) return;

    const returnTo = currentReturnPath();
    saveReturnTo(returnTo);
    router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [hasHydrated, isAuthenticated, router]);

  return {
    hasHydrated,
    isAuthenticated,
    ready: hasHydrated && isAuthenticated,
  };
}
