"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth";
import { api } from "@/lib/api";

export function AuthHydrator() {
  useEffect(() => {
    const syncAuth = () => {
      const { token } = useAuthStore.getState();
      if (token) api.setToken(token);
      useAuthStore.setState({ hasHydrated: true });
    };

    // Zustand may finish rehydrating before this effect runs.
    syncAuth();

    const unsub = useAuthStore.persist.onFinishHydration(syncAuth);
    void Promise.resolve(useAuthStore.persist.rehydrate()).finally(syncAuth);

    return unsub;
  }, []);

  return null;
}
