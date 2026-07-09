"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchedDuplicateSignal } from "@/lib/api";
import type { ReviewPayload } from "@/components/submit/submit-review";
import {
  bumpPendingSetupRetry,
  clearPendingSetupSubmit,
  getPendingSetupSubmit,
  type PendingSetupSubmitRecord,
  savePendingSetupSubmit,
} from "@/lib/pending-setup-submit";
import {
  executeSetupSubmit,
  type SetupSubmitSuccess,
} from "@/lib/submit-setup-flow";
import { blobToFile } from "@/lib/pending-setup-submit";

type UsePendingSetupSubmitOptions = {
  userId: string | undefined;
  enabled?: boolean;
  onSuccess?: (result: SetupSubmitSuccess) => void;
  onDuplicate?: (message: string, matched: MatchedDuplicateSignal) => void;
  onError?: (message: string) => void;
};

export function usePendingSetupSubmit({
  userId,
  enabled = true,
  onSuccess,
  onDuplicate,
  onError,
}: UsePendingSetupSubmitOptions) {
  const [pending, setPending] = useState<PendingSetupSubmitRecord | null>(null);
  const [autoRetrying, setAutoRetrying] = useState(false);
  const retryInFlightRef = useRef(false);
  const callbacksRef = useRef({ onSuccess, onDuplicate, onError });
  callbacksRef.current = { onSuccess, onDuplicate, onError };

  const refreshPending = useCallback(async () => {
    if (!userId) {
      setPending(null);
      return null;
    }
    const row = await getPendingSetupSubmit(userId);
    setPending(row);
    return row;
  }, [userId]);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  const persistFailure = useCallback(
    async (
      review: ReviewPayload,
      setupFile: File | null,
      screenshotUrl: string,
      lastError: string,
      retryCount = 0,
    ) => {
      if (!userId) return;
      const imageBlob = setupFile ? setupFile : null;
      await savePendingSetupSubmit({
        userId,
        review: { ...review, screenshotUrl: screenshotUrl || review.screenshotUrl },
        imageBlob,
        screenshotUrl: screenshotUrl || review.screenshotUrl,
        lastError,
        retryCount,
      });
      await refreshPending();
    },
    [refreshPending, userId],
  );

  const runSubmit = useCallback(
    async (
      review: ReviewPayload,
      setupFile: File | null,
      opts?: { fromAutoRetry?: boolean },
    ) => {
      if (!userId) {
        return { ok: false as const, message: "Not signed in" };
      }

      const file =
        setupFile ??
        (pending?.imageBlob ? blobToFile(pending.imageBlob) : null);

      const outcome = await executeSetupSubmit(review, file);

      if (outcome.type === "success") {
        await clearPendingSetupSubmit(userId);
        setPending(null);
        callbacksRef.current.onSuccess?.(outcome.result);
        return { ok: true as const, result: outcome.result };
      }

      if (outcome.type === "duplicate") {
        await clearPendingSetupSubmit(userId);
        setPending(null);
        callbacksRef.current.onDuplicate?.(
          outcome.message,
          outcome.matchedSignal,
        );
        return {
          ok: false as const,
          message: outcome.message,
          duplicate: true,
          matchedSignal: outcome.matchedSignal,
        };
      }

      const updated = await bumpPendingSetupRetry(userId, outcome.message);
      if (updated) setPending(updated);
      else {
        await persistFailure(
          review,
          file,
          review.screenshotUrl,
          outcome.message,
          opts?.fromAutoRetry ? 1 : 0,
        );
      }

      callbacksRef.current.onError?.(outcome.message);
      return { ok: false as const, message: outcome.message };
    },
    [pending?.imageBlob, persistFailure, userId],
  );

  const retryNow = useCallback(
    async (review?: ReviewPayload, setupFile?: File | null) => {
      const activeReview = review ?? pending?.review;
      if (!activeReview) return { ok: false as const, message: "Nothing to retry" };
      return runSubmit(activeReview, setupFile ?? null);
    },
    [pending?.review, runSubmit],
  );

  const dismissPending = useCallback(async () => {
    if (!userId) return;
    await clearPendingSetupSubmit(userId);
    setPending(null);
  }, [userId]);

  useEffect(() => {
    if (!enabled || !userId || !pending) return;

    const tick = async () => {
      if (retryInFlightRef.current) return;
      if (document.visibilityState === "hidden") return;
      if (!navigator.onLine) return;
      if (new Date(pending.nextRetryAt).getTime() > Date.now()) return;

      retryInFlightRef.current = true;
      setAutoRetrying(true);
      try {
        await runSubmit(pending.review, null, { fromAutoRetry: true });
      } finally {
        retryInFlightRef.current = false;
        setAutoRetrying(false);
        await refreshPending();
      }
    };

    const interval = window.setInterval(() => void tick(), 15_000);
    void tick();

    const onOnline = () => void tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, pending, refreshPending, runSubmit, userId]);

  return {
    pending,
    autoRetrying,
    refreshPending,
    persistFailure,
    runSubmit,
    retryNow,
    dismissPending,
  };
}
