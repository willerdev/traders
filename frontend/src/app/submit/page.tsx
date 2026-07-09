"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { useUrlTab } from "@/hooks/use-url-tab";
import { api, type SignalDraft, type MatchedDuplicateSignal, type HubQuote } from "@/lib/api";
import { hasTradingAccess } from "@/lib/trading-access";
import { normalizeSetupFields, setupValidationError } from "@/lib/chart-setup";
import { compressSetupImage } from "@/lib/compress-setup-image";
import { usePendingSetupSubmit } from "@/hooks/use-pending-setup-submit";
import { blobToFile, clearPendingSetupSubmit } from "@/lib/pending-setup-submit";
import { WeeklyAccessGate } from "@/components/payments/weekly-access-gate";
import {
  SubmitReviewCard,
  type ReviewPayload,
} from "@/components/submit/submit-review";
import { SetupVerifyCard } from "@/components/submit/setup-verify";
import { DuplicateRejectionCard } from "@/components/submit/duplicate-rejection";
import { TradeExecutionNotice } from "@/components/trading/trade-execution-notice";
import {
  Lock,
  AlertCircle,
  Upload,
  X,
  Sparkles,
  Clock,
  Trash2,
  Plus,
  Save,
  RefreshCw,
} from "lucide-react";

const EMPTY_FORM = {
  symbol: "",
  direction: "BUY" as "BUY" | "SELL",
  entryMin: "",
  entryMax: "",
  stopLoss: "",
  takeProfit: "",
  description: "",
};

function calcProgress(form: typeof EMPTY_FORM, screenshotUrl: string) {
  const fields = [
    form.symbol.trim(),
    form.direction,
    form.entryMin.trim(),
    form.entryMax.trim(),
    form.stopLoss.trim(),
    form.takeProfit.trim(),
    form.description.trim(),
    screenshotUrl.trim(),
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}

function draftLabel(draft: SignalDraft) {
  if (draft.symbol) return draft.symbol;
  if (draft.description) return draft.description.slice(0, 40);
  return "Untitled setup";
}

type SubmitResult = {
  signalId: string;
  entryRange?: { min: number; max: number };
  execution?: {
    status?: "pending" | "queued" | "failed";
    forwarded: boolean;
    hubError?: string;
    sendername?: string;
    orderType?: string;
  };
  executionHub?: {
    id: string;
    status: string;
    duplicate: boolean;
    progress?: { stage: string; message: string; executed: boolean };
  } | null;
  executionValidation?: {
    approved: boolean;
    adjusted: boolean;
    issues: string[];
    rejectReason?: string;
  };
  metaApiOrderId?: string | null;
  hubRecordId?: string | null;
};

function formatHubError(raw?: string): string {
  if (!raw) return "";
  try {
    const match = raw.match(/^Signal Hub \d+: ([\s\S]+)$/);
    const jsonText = match?.[1];
    if (jsonText) {
      const detail = JSON.parse(jsonText) as Array<{
        msg?: string;
        loc?: Array<string | number>;
      }>;
      if (Array.isArray(detail) && detail.length > 0) {
        return detail
          .map((item) => {
            const field = item.loc?.filter((p) => p !== "body").join(".") || "";
            return field && item.msg ? `${field}: ${item.msg}` : item.msg || "";
          })
          .filter(Boolean)
          .join(" ");
      }
    }
  } catch {
    /* fall through */
  }
  return raw;
}

function draftField(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function setupPreviewUrl(screenshotUrl: string | null | undefined): string {
  return screenshotUrl?.trim() || "";
}

export default function SubmitSignalPage() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const userId = useAuthStore((s) => s.user?.id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);
  const skipAutoSave = useRef(false);
  const saveGenerationRef = useRef(0);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedScreenshotRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiFilled, setAiFilled] = useState(false);
  const [error, setError] = useState("");
  const [duplicateMatch, setDuplicateMatch] = useState<MatchedDuplicateSignal | null>(null);
  const [success, setSuccess] = useState<SubmitResult | null>(null);
  const [resending, setResending] = useState(false);
  const [hubHealth, setHubHealth] = useState<{
    configured: boolean;
    keyHint?: string | null;
    baseUrl?: string;
  } | null>(null);
  const [setupFile, setSetupFile] = useState<File | null>(null);
  const [setupPreview, setSetupPreview] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState("");

  const [draftId, setDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<SignalDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [form, setForm] = useState(EMPTY_FORM);
  const [liveQuote, setLiveQuote] = useState<{
    bid: number;
    ask: number;
    mid: number;
    spread: number;
    resolved_symbol?: string;
  } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [step, setStep] = useUrlTab("step", "edit", ["edit", "verify", "review"] as const);
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [aiSuggestedDirection, setAiSuggestedDirection] = useState<
    "BUY" | "SELL" | null
  >(null);
  const [resumingDraftId, setResumingDraftId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [accountReady, setAccountReady] = useState<boolean | null>(null);
  const [hadPaidBefore, setHadPaidBefore] = useState(false);
  const [executionWarmupOk, setExecutionWarmupOk] = useState<boolean | null>(null);

  const progress = calcProgress(form, screenshotUrl);

  const loadDrafts = useCallback(async () => {
    try {
      const list = await api.signals.listDrafts();
      setDrafts(list);
    } catch {
      /* drafts are optional */
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  const applySubmitSuccess = useCallback(
    async (result: SubmitResult) => {
      skipAutoSave.current = true;
      pauseAutoSave(8000);

      const submittedShot = submittedScreenshotRef.current;

      if (draftId) {
        try {
          await api.signals.deleteDraft(draftId);
        } catch {
          /* backend also clears matching drafts */
        }
      }

      setDrafts((prev) =>
        submittedShot
          ? prev.filter((d) => d.screenshotUrl !== submittedShot)
          : prev.filter((d) => d.id !== draftId),
      );
      setDraftId(null);
      submittedScreenshotRef.current = null;

      clearFormState();
      if (userId) {
        await clearPendingSetupSubmit(userId);
      }
      await loadDrafts();

      setStep("edit");
      setReview(null);
      setSuccess(result);
      setError("");
    },
    [draftId, loadDrafts, userId],
  );

  const {
    pending: pendingSubmit,
    autoRetrying,
    runSubmit,
    retryNow,
    dismissPending,
  } = usePendingSetupSubmit({
    userId,
    enabled: ready && !success,
    onSuccess: (result) => {
      void applySubmitSuccess(result);
    },
    onDuplicate: (message, matched) => {
      setDuplicateMatch(matched);
      setError(message);
      setStep("edit");
      setReview(null);
      void loadDrafts();
    },
    onError: (message) => {
      setError(message);
    },
  });

  const refreshAccountStatus = useCallback(async () => {
    try {
      const dash = await api.users.dashboard();
      const active = dash?.user ? hasTradingAccess(dash.user) : false;
      setAccountReady(active);
      setHadPaidBefore(Boolean(dash?.user?.registrationPaid));
      const { token, user } = useAuthStore.getState();
      if (token && user && dash?.user) {
        useAuthStore.getState().setAuth(token, {
          ...user,
          status: dash.user.status,
        });
      }
    } catch {
      setAccountReady(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void loadDrafts();
    void refreshAccountStatus();
    void api.signals
      .warmupExecution()
      .then((res) => setExecutionWarmupOk(res.ready))
      .catch(() => setExecutionWarmupOk(false));
  }, [ready, loadDrafts, refreshAccountStatus]);

  useEffect(() => {
    if (!success?.signalId) return;
    const pending =
      success.execution?.status === "pending" ||
      (!success.metaApiOrderId &&
        !success.hubRecordId &&
        !success.executionHub?.id &&
        success.execution?.forwarded !== true &&
        success.execution?.status !== "failed");
    if (!pending) return;

    let attempts = 0;
    const maxAttempts = 15;
    const timer = setInterval(() => {
      attempts += 1;
      void api.signals.get(success.signalId).then((signal) => {
        const queued = Boolean(
          signal.metaApiOrderId || signal.hubRecordId || signal.metaApiExecutedAt,
        );
        if (queued) {
          setSuccess((prev) =>
            prev
              ? {
                  ...prev,
                  execution: {
                    ...prev.execution,
                    status: "queued",
                    forwarded: true,
                  },
                  executionHub: signal.hubRecordId
                    ? {
                        id: signal.hubRecordId,
                        status: "queued",
                        duplicate: false,
                      }
                    : prev.executionHub,
                  metaApiOrderId: signal.metaApiOrderId,
                  hubRecordId: signal.hubRecordId,
                }
              : prev,
          );
          clearInterval(timer);
          return;
        }
        if (attempts >= maxAttempts) {
          setSuccess((prev) =>
            prev
              ? {
                  ...prev,
                  execution: {
                    ...prev.execution,
                    status: "failed",
                    forwarded: false,
                    hubError:
                      prev.execution?.hubError ||
                      "Order is still queuing — use Resend to MT5 or wait a minute.",
                  },
                }
              : prev,
          );
          clearInterval(timer);
        }
      });
    }, 2000);

    return () => clearInterval(timer);
  }, [success?.signalId, success?.execution?.status, success?.metaApiOrderId, success?.hubRecordId, success?.executionHub?.id, success?.execution?.forwarded]);

  useEffect(() => {
    if (step === "review" && !review) setStep("edit");
  }, [step, review, setStep]);

  useEffect(() => {
    if (
      !success ||
      success.executionHub?.id ||
      success.execution?.status === "pending" ||
      success.metaApiOrderId ||
      success.hubRecordId
    ) {
      setHubHealth(null);
      return;
    }
    void api.signals
      .hubHealth()
      .then(setHubHealth)
      .catch(() => setHubHealth(null));
  }, [success]);

  useEffect(() => {
    const symbol = form.symbol.trim();
    if (!symbol || symbol.length < 3) {
      setLiveQuote(null);
      setQuoteError(null);
      return;
    }

    const timer = setTimeout(() => {
      setQuoteLoading(true);
      setQuoteError(null);
      void api.signals
        .quote(symbol)
        .then((q: HubQuote) => {
          setLiveQuote({
            bid: q.bid,
            ask: q.ask,
            mid: q.mid ?? q.price,
            spread: q.spread,
            resolved_symbol: q.resolved_symbol,
          });
        })
        .catch((err) => {
          setLiveQuote(null);
          setQuoteError(
            err instanceof Error ? err.message : "Live quote unavailable",
          );
        })
        .finally(() => setQuoteLoading(false));
    }, 600);

    return () => clearTimeout(timer);
  }, [form.symbol]);

  const buildDraftPayload = useCallback(() => {
    const payload: Parameters<typeof api.signals.createDraft>[0] = {
      symbol: form.symbol.trim() || undefined,
      direction: form.direction,
      description: form.description.trim() || undefined,
      screenshotUrl: screenshotUrl || undefined,
      aiFilled,
    };

    const entryMin = parseFloat(form.entryMin);
    const entryMax = parseFloat(form.entryMax);
    const stopLoss = parseFloat(form.stopLoss);
    const takeProfit = parseFloat(form.takeProfit);

    if (!isNaN(entryMin)) payload.entryMin = entryMin;
    if (!isNaN(entryMax)) payload.entryMax = entryMax;
    if (!isNaN(stopLoss)) payload.stopLoss = stopLoss;
    if (!isNaN(takeProfit)) payload.takeProfit = takeProfit;

    return payload;
  }, [form, screenshotUrl, aiFilled]);

  const cancelPendingAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    saveGenerationRef.current += 1;
  }, []);

  const pauseAutoSave = useCallback((ms = 2000) => {
    skipAutoSave.current = true;
    cancelPendingAutoSave();
    window.setTimeout(() => {
      skipAutoSave.current = false;
    }, ms);
  }, [cancelPendingAutoSave]);

  const saveDraftNow = useCallback(async () => {
    if (skipAutoSave.current) return;
    const payload = buildDraftPayload();
    if (calcProgress(form, screenshotUrl) === 0) return;

    const generation = saveGenerationRef.current;
    const activeDraftId = draftId;
    setSaveStatus("saving");
    try {
      if (activeDraftId) {
        const updated = await api.signals.updateDraft(activeDraftId, payload);
        if (
          skipAutoSave.current ||
          generation !== saveGenerationRef.current
        ) {
          return;
        }
        setDrafts((prev) =>
          prev.map((d) => (d.id === updated.id ? updated : d)).sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          ),
        );
      } else {
        const created = await api.signals.createDraft(payload);
        if (
          skipAutoSave.current ||
          generation !== saveGenerationRef.current
        ) {
          return;
        }
        setDraftId(created.id);
        setDrafts((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
      }
      setSaveStatus("saved");
    } catch (err) {
      if (generation !== saveGenerationRef.current) return;
      const message = err instanceof Error ? err.message : "";
      if (activeDraftId && /not found/i.test(message)) {
        setDraftId(null);
        setDrafts((prev) => prev.filter((d) => d.id !== activeDraftId));
        setSaveStatus("idle");
        return;
      }
      setSaveStatus("error");
    }
  }, [buildDraftPayload, draftId, form, screenshotUrl]);

  useEffect(() => {
    if (
      !ready ||
      success ||
      step === "review" ||
      step === "verify" ||
      loading ||
      uploading ||
      analyzing ||
      skipAutoSave.current
    ) {
      return;
    }
    autoSaveTimerRef.current = setTimeout(() => {
      void saveDraftNow();
    }, 1500);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    analyzing,
    form,
    loading,
    ready,
    saveDraftNow,
    screenshotUrl,
    aiFilled,
    success,
    step,
    uploading,
  ]);

  const entryMin = parseFloat(form.entryMin);
  const entryMax = parseFloat(form.entryMax);
  const sl = parseFloat(form.stopLoss);
  const tp = parseFloat(form.takeProfit);
  const entryMid =
    !isNaN(entryMin) && !isNaN(entryMax) ? (entryMin + entryMax) / 2 : NaN;
  const risk = !isNaN(entryMid) && !isNaN(sl) ? Math.abs(entryMid - sl) : 0;
  const reward = !isNaN(entryMid) && !isNaN(tp) ? Math.abs(tp - entryMid) : 0;
  const rrRatio = risk > 0 ? (reward / risk).toFixed(2) : "0";
  const rangeValid = !isNaN(entryMin) && !isNaN(entryMax) && entryMin < entryMax;

  async function handleFileSelect(file: File | null) {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Only JPEG, PNG, and WebP images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB");
      return;
    }

    pauseAutoSave(3000);
    setUploading(true);
    setAnalyzing(true);
    setError("");

    try {
      const compressed = await compressSetupImage(file);
      setSetupFile(compressed);
      setSetupPreview(URL.createObjectURL(compressed));
      setAiFilled(false);

      const ingest = await api.uploads.ingestSetup(compressed);
      setScreenshotUrl(ingest.url);

      const fixed = normalizeSetupFields({
        direction: ingest.analysis.direction,
        entryMin: ingest.analysis.entryMin,
        entryMax: ingest.analysis.entryMax,
        stopLoss: ingest.analysis.stopLoss,
        takeProfit: ingest.analysis.takeProfit,
      });
      setForm({
        symbol: ingest.analysis.symbol,
        direction: fixed.direction,
        entryMin: String(fixed.entryMin),
        entryMax: String(fixed.entryMax),
        stopLoss: String(fixed.stopLoss),
        takeProfit: String(fixed.takeProfit),
        description: ingest.analysis.description,
      });
      setAiSuggestedDirection(fixed.direction);
      setAiFilled(true);
      setStep("verify");
      requestAnimationFrame(() => {
        formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Upload or AI analysis failed — fill in the fields manually";
      setError(message);
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  }

  function clearSetup() {
    setSetupFile(null);
    if (setupPreview?.startsWith("blob:")) URL.revokeObjectURL(setupPreview);
    setSetupPreview(null);
    setScreenshotUrl("");
    setAiFilled(false);
    setAiSuggestedDirection(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function clearFormState() {
    setDraftId(null);
    setForm(EMPTY_FORM);
    clearSetup();
    setError("");
    setDuplicateMatch(null);
    setAiFilled(false);
    setAiSuggestedDirection(null);
    setSaveStatus("idle");
    setLiveQuote(null);
    setQuoteError(null);
    setStep("edit");
    setReview(null);
  }

  function resetForm() {
    pauseAutoSave();
    clearFormState();
  }

  function applyDraftToForm(draft: SignalDraft) {
    setDraftId(draft.id);
    setForm({
      symbol: draft.symbol ?? "",
      direction: draft.direction ?? "BUY",
      entryMin: draftField(draft.entryMin),
      entryMax: draftField(draft.entryMax),
      stopLoss: draftField(draft.stopLoss),
      takeProfit: draftField(draft.takeProfit),
      description: draft.description ?? "",
    });
    setAiFilled(draft.aiFilled);
    setSetupFile(null);
    const url = setupPreviewUrl(draft.screenshotUrl);
    if (setupPreview?.startsWith("blob:")) URL.revokeObjectURL(setupPreview);
    setSetupPreview(url || null);
    setScreenshotUrl(url);
    setStep("edit");
    setReview(null);
    setError("");
    setSaveStatus("saved");
  }

  async function resumeDraft(draft: SignalDraft) {
    pauseAutoSave(1500);
    setResumingDraftId(draft.id);
    setError("");
    try {
      const full = await api.signals.getDraft(draft.id);
      applyDraftToForm(full);
    } catch {
      applyDraftToForm(draft);
    } finally {
      setResumingDraftId(null);
    }
    requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function discardCurrentProgress() {
    const idToDelete = draftId;
    pauseAutoSave();
    clearFormState();
    if (!idToDelete) return;

    setDeletingDraftId(idToDelete);
    try {
      await api.signals.deleteDraft(idToDelete);
      setDrafts((prev) => prev.filter((d) => d.id !== idToDelete));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete saved progress");
      void loadDrafts();
    } finally {
      setDeletingDraftId(null);
    }
  }

  async function handleDeleteDraft(id: string) {
    pauseAutoSave();
    setDeletingDraftId(id);
    setError("");
    const wasActive = draftId === id;
    if (wasActive) clearFormState();

    try {
      await api.signals.deleteDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete draft");
      void loadDrafts();
      if (wasActive) {
        try {
          const full = await api.signals.getDraft(id);
          pauseAutoSave(1500);
          applyDraftToForm(full);
        } catch {
          /* draft is gone */
        }
      }
    } finally {
      setDeletingDraftId(null);
    }
  }

  async function retryAiIngest() {
    if (!setupFile) return;
    setError("");
    setAnalyzing(true);
    setUploading(true);
    try {
      const ingest = await api.uploads.ingestSetup(setupFile);
      setScreenshotUrl(ingest.url);
      const fixed = normalizeSetupFields({
        direction: ingest.analysis.direction,
        entryMin: ingest.analysis.entryMin,
        entryMax: ingest.analysis.entryMax,
        stopLoss: ingest.analysis.stopLoss,
        takeProfit: ingest.analysis.takeProfit,
      });
      setForm({
        symbol: ingest.analysis.symbol,
        direction: fixed.direction,
        entryMin: String(fixed.entryMin),
        entryMax: String(fixed.entryMax),
        stopLoss: String(fixed.stopLoss),
        takeProfit: String(fixed.takeProfit),
        description: ingest.analysis.description,
      });
      setAiSuggestedDirection(fixed.direction);
      setAiFilled(true);
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI analysis failed again");
    } finally {
      setAnalyzing(false);
      setUploading(false);
    }
  }

  function buildReviewPayload(): ReviewPayload | null {
    const fixed = normalizeSetupFields(
      {
        direction: form.direction,
        entryMin,
        entryMax,
        stopLoss: sl,
        takeProfit: tp,
      },
      { preserveDirection: true },
    );

    const validationErr = setupValidationError({
      direction: form.direction,
      entryMin: fixed.entryMin,
      entryMax: fixed.entryMax,
      stopLoss: fixed.stopLoss,
      takeProfit: fixed.takeProfit,
    });
    if (validationErr) {
      setError(validationErr);
      return null;
    }

    if (!screenshotUrl && !setupFile) {
      setError("Upload your chart setup screenshot");
      return null;
    }

    if (!form.symbol.trim()) {
      setError("Enter a trading symbol");
      return null;
    }

    if (!form.description.trim()) {
      setError("Add a trade analysis description");
      return null;
    }

    const mid = (fixed.entryMin + fixed.entryMax) / 2;
    const risk = Math.abs(mid - fixed.stopLoss);
    const reward = Math.abs(fixed.takeProfit - mid);
    const rr = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;

    return {
      symbol: form.symbol.trim().toUpperCase(),
      direction: form.direction,
      entryMin: fixed.entryMin,
      entryMax: fixed.entryMax,
      stopLoss: fixed.stopLoss,
      takeProfit: fixed.takeProfit,
      riskRewardRatio: rr,
      description: form.description.trim(),
      screenshotUrl,
      previewUrl: setupPreview || screenshotUrl || null,
    };
  }

  function handleGoToReview(e: React.FormEvent) {
    e.preventDefault();
    if (!accountReady) {
      setError("Pay for weekly access to submit setups. KYC is only required for payouts.");
      return;
    }
    setError("");

    if (!screenshotUrl && !setupFile) {
      setError("Upload your chart setup screenshot");
      return;
    }
    if (!form.symbol.trim()) {
      setError("Enter a trading symbol");
      return;
    }
    if (!form.description.trim()) {
      setError("Add a trade analysis description");
      return;
    }
    if (
      !Number.isFinite(entryMin) ||
      !Number.isFinite(entryMax) ||
      !Number.isFinite(sl) ||
      !Number.isFinite(tp)
    ) {
      setError("Enter valid entry, stop loss, and take profit values");
      return;
    }

    setStep("verify");
    requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleVerifyConfirm() {
    setError("");
    const payload = buildReviewPayload();
    if (!payload) return;
    setReview(payload);
    setStep("review");
    requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleConfirmSubmit() {
    if (!review) return;
    setError("");
    setDuplicateMatch(null);
    submittedScreenshotRef.current = review.screenshotUrl || screenshotUrl || null;
    setLoading(true);

    try {
      const outcome = await runSubmit(review, setupFile);

      if (outcome.ok) {
        return;
      }

      if ("duplicate" in outcome && outcome.duplicate) {
        return;
      }

      setError(outcome.message ?? "Submission failed");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  }

  async function handleRetrySubmit() {
    if (!review && !pendingSubmit?.review) return;
    setError("");
    setDuplicateMatch(null);
    setLoading(true);
    try {
      const activeReview = review ?? pendingSubmit!.review;
      if (!review) {
        setReview(activeReview);
        setStep("review");
      }
      submittedScreenshotRef.current =
        activeReview.screenshotUrl || screenshotUrl || null;
      const outcome = await retryNow(activeReview, setupFile);
      if (!outcome.ok && !("duplicate" in outcome && outcome.duplicate)) {
        setError(outcome.message ?? "Retry failed");
      }
    } finally {
      setLoading(false);
    }
  }

  function restorePendingSubmit() {
    if (!pendingSubmit) return;
    const r = pendingSubmit.review;
    setForm({
      symbol: r.symbol,
      direction: r.direction,
      entryMin: String(r.entryMin),
      entryMax: String(r.entryMax),
      stopLoss: String(r.stopLoss),
      takeProfit: String(r.takeProfit),
      description: r.description,
    });
    setScreenshotUrl(pendingSubmit.screenshotUrl || r.screenshotUrl);
    if (pendingSubmit.imageBlob) {
      const file = blobToFile(pendingSubmit.imageBlob);
      setSetupFile(file);
      setSetupPreview(URL.createObjectURL(file));
    } else if (r.previewUrl) {
      setSetupPreview(r.previewUrl);
    }
    setReview(r);
    setStep("review");
    setError(pendingSubmit.lastError);
  }

  async function handleResendToMt5() {
    if (!success?.signalId) return;
    setResending(true);
    setError("");
    try {
      const result = await api.signals.resendHub(success.signalId);
      setSuccess({
        signalId: result.signalId,
        entryRange: result.entryRange,
        execution: result.execution,
        executionHub: result.executionHub,
        executionValidation: result.executionValidation,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend to MT5");
    } finally {
      setResending(false);
    }
  }

  if (success) {
    const executionPending = success.execution?.status === "pending";
    const mt5Queued = Boolean(
      success.executionHub?.id ||
        success.metaApiOrderId ||
        success.hubRecordId ||
        success.execution?.forwarded,
    );
    const validationFailed = success.executionValidation?.approved === false;
    const mt5Failed = !executionPending && !mt5Queued;

    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Card>
          <CardContent className="pt-8">
            <div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-2xl ${
                executionPending
                  ? "bg-primary/10 text-primary"
                  : mt5Failed
                    ? "bg-rank-gold/10 text-rank-gold"
                    : "bg-success/10 text-success"
              }`}
            >
              {executionPending ? "…" : mt5Failed ? "!" : "✓"}
            </div>
            <h2 className="text-xl font-bold text-white">
              {executionPending
                ? "Setup saved — queuing on MT5…"
                : mt5Failed
                  ? "Saved — MT5 not queued"
                  : "Signal Submitted"}
            </h2>
            <p className="mt-2 text-gray-400">
              {executionPending
                ? "Your setup is locked in. We are placing the pending order on the trading server now."
                : mt5Failed
                  ? "Your setup was saved on TraderRank, but it was not sent to the MT5 execution server."
                  : "Your setup is locked in and sent to the execution queue."}
            </p>
            <Badge variant="secondary" className="mt-4">
              ID: {success.signalId}
            </Badge>
            {success.entryRange && (
              <p className="mt-3 text-sm text-primary">
                Entry range: {success.entryRange.min} – {success.entryRange.max}
              </p>
            )}

            {executionPending && (
              <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4 text-left text-sm">
                <p className="font-medium text-primary">Queuing order…</p>
                <p className="mt-1 text-muted">
                  This usually takes a few seconds. You can stay on this page or go to
                  your dashboard — the order will appear once MT5 accepts it.
                </p>
              </div>
            )}

            {mt5Queued && !executionPending && (success.executionHub || success.metaApiOrderId) && (
              <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-4 text-left text-sm">
                <p className="font-medium text-success">Queued for MT5</p>
                {success.executionHub ? (
                  <p className="mt-1 text-muted">
                    Hub status:{" "}
                    <strong className="text-foreground">{success.executionHub.status}</strong>
                    {success.executionHub.progress?.message && (
                      <> — {success.executionHub.progress.message}</>
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-muted">
                    Pending order placed on MT5
                    {success.metaApiOrderId ? ` (order ${success.metaApiOrderId})` : ""}.
                  </p>
                )}
                {success.execution?.orderType === "limit" && (
                  <p className="mt-2 text-xs text-muted">
                    Order type is <strong>limit</strong> — MT5 opens the trade only when price
                    reaches your entry. It will not show as an open position until filled.
                  </p>
                )}
                {success.execution?.sendername && (
                  <p className="mt-1 text-xs text-muted">
                    Sender: {success.execution.sendername}
                  </p>
                )}
              </div>
            )}

            {mt5Failed && (
              <div className="mt-4 rounded-lg border border-rank-gold/30 bg-rank-gold/5 p-4 text-left text-sm">
                <p className="font-medium text-rank-gold">Why MT5 did not receive it</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
                  {validationFailed && (
                    <li>
                      AI validation rejected:{" "}
                      {success.executionValidation?.rejectReason ||
                        success.executionValidation?.issues.join("; ") ||
                        "signal failed checks"}
                    </li>
                  )}
                  {!validationFailed && success.execution?.hubError && (
                    <li>{formatHubError(success.execution.hubError)}</li>
                  )}
                  {!validationFailed &&
                    !success.execution?.hubError &&
                    success.executionValidation?.issues &&
                    success.executionValidation.issues.length > 0 && (
                      <li>{success.executionValidation.issues.join("; ")}</li>
                    )}
                  {!validationFailed &&
                    !success.execution?.hubError &&
                    hubHealth &&
                    !hubHealth.configured && (
                    <li>
                      Backend API reports Signal Hub key is missing. Add{" "}
                      <code className="text-foreground">SIGNAL_HUB_PROVIDER_KEY</code> on the{" "}
                      <strong className="text-foreground">traders-api</strong> Render service
                      (not the frontend), then redeploy the backend.
                    </li>
                  )}
                  {!validationFailed &&
                    !success.execution?.hubError &&
                    hubHealth?.configured && (
                    <li>
                      Provider key is loaded on the backend ({hubHealth.keyHint}). The Signal
                      Hub API rejected or could not reach MT5 — try resending below or check hub
                      logs on the dashboard.
                    </li>
                  )}
                  {!validationFailed &&
                    !hubHealth &&
                    !success.execution?.hubError && (
                    <li>
                      Could not reach Signal Hub. Redeploy the backend after setting{" "}
                      <code className="text-foreground">SIGNAL_HUB_PROVIDER_KEY</code> on{" "}
                      <strong className="text-foreground">traders-api</strong> in Render.
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              {mt5Failed && (
                <Button
                  className="gap-2"
                  onClick={handleResendToMt5}
                  disabled={resending}
                >
                  <RefreshCw className={`h-4 w-4 ${resending ? "animate-spin" : ""}`} />
                  {resending ? "Resending…" : "Resend to MT5"}
                </Button>
              )}
              <Button onClick={() => router.push("/dashboard")}>
                View Dashboard
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setSuccess(null);
                  resetForm();
                }}
              >
                Submit Another
              </Button>
            </div>
            {error && (
              <p className="mt-4 text-sm text-danger">{error}</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!ready) {
    return <AuthLoadingScreen />;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {executionWarmupOk === false && (
          <div className="mb-4 rounded-lg border border-rank-gold/30 bg-rank-gold/5 px-4 py-3 text-sm text-muted">
            Trading server is still connecting — submit may take a moment longer than usual.
          </div>
        )}

        {accountReady === false && (
          <WeeklyAccessGate
            renewal={hadPaidBefore}
            onComplete={() => void refreshAccountStatus()}
            title={hadPaidBefore ? "Renew weekly access" : "Pay to start trading"}
            description="You can fill in setups and save drafts now. Pay 5 USDT for 7 trading days to lock in and send setups."
          />
        )}

        {!draftsLoading && drafts.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Continue a setup</CardTitle>
                <Button variant="secondary" size="sm" className="gap-1" onClick={resetForm}>
                  <Plus className="h-3 w-3" />
                  New
                </Button>
              </div>
              <CardDescription>
                Pick up where you left off — drafts auto-save as you work.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    draftId === draft.id
                      ? "border-primary/40 bg-primary/5"
                      : "border-white/5 bg-white/[0.02]"
                  }`}
                >
                  {draft.screenshotUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={draft.screenshotUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-white/5 text-xs text-gray-500">
                      No img
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-white">
                        {draftLabel(draft)}
                      </p>
                      {draft.direction && (
                        <Badge variant={draft.direction === "BUY" ? "success" : "danger"}>
                          {draft.direction}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      {new Date(draft.updatedAt).toLocaleString()}
                      <span>· {draft.progress}% complete</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${draft.progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={draftId === draft.id ? "default" : "secondary"}
                      disabled={resumingDraftId !== null}
                      onClick={() => void resumeDraft(draft)}
                    >
                      {resumingDraftId === draft.id
                        ? "Loading…"
                        : draftId === draft.id
                          ? "Editing"
                          : "Resume"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="text-danger"
                      disabled={deletingDraftId !== null}
                      onClick={() => void handleDeleteDraft(draft.id)}
                    >
                      {deletingDraftId === draft.id ? (
                        "Deleting…"
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div ref={formCardRef}>
        {pendingSubmit && step !== "review" && !success && (
          <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-sm">
                <p className="font-medium text-amber-200">
                  Saved setup waiting to submit
                </p>
                <p className="text-muted">
                  {pendingSubmit.review.symbol} {pendingSubmit.review.direction} —{" "}
                  {pendingSubmit.lastError || "Submission interrupted"}
                </p>
                {autoRetrying ? (
                  <p className="text-xs text-amber-200/80">Retrying automatically…</p>
                ) : (
                  <p className="text-xs text-gray-500">
                    Auto-retry scheduled · you can retry manually anytime
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={restorePendingSubmit}>
                  Open review
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  disabled={loading || autoRetrying}
                  onClick={() => void handleRetrySubmit()}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${loading || autoRetrying ? "animate-spin" : ""}`}
                  />
                  Retry now
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void dismissPending()}
                >
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "review" && review ? (
          <SubmitReviewCard
            review={review}
            loading={loading || uploading || autoRetrying}
            error={error}
            onEdit={() => {
              setStep("verify");
              setError("");
              setDuplicateMatch(null);
            }}
            onConfirm={() => void handleConfirmSubmit()}
            showRetry={Boolean(error || pendingSubmit)}
            onRetry={() => void handleRetrySubmit()}
            retryHint={
              pendingSubmit
                ? "Your setup and chart are saved on this device. We will keep retrying in the background if the server is slow."
                : undefined
            }
          />
        ) : step === "verify" ? (
          <SetupVerifyCard
            form={form}
            aiSuggestedDirection={aiSuggestedDirection}
            previewUrl={setupPreview || screenshotUrl || null}
            error={error}
            onFormChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            onBack={() => {
              setStep("edit");
              setError("");
            }}
            onConfirm={handleVerifyConfirm}
          />
        ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                <CardTitle>Submit Trading Setup</CardTitle>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {saveStatus === "saving" && (
                  <>
                    <Save className="h-3 w-3 animate-pulse" />
                    Saving...
                  </>
                )}
                {saveStatus === "saved" && progress > 0 && (
                  <>
                    <Save className="h-3 w-3 text-success" />
                    Saved
                  </>
                )}
                {saveStatus === "error" && (
                  <span className="text-danger">Save failed</span>
                )}
              </div>
            </div>
            <CardDescription>
              Upload your chart setup — AI vision reads the chart and auto-saves
              your progress. When ready, review everything before final submit.
            </CardDescription>
            <TradeExecutionNotice variant="submit" className="mt-3" />
            {progress > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                  <span>Progress</span>
                  <div className="flex items-center gap-3">
                    <span>{progress}%</span>
                    <button
                      type="button"
                      className="text-danger hover:underline disabled:opacity-50"
                      disabled={deletingDraftId !== null}
                      onClick={() => void discardCurrentProgress()}
                    >
                      {deletingDraftId !== null ? "Deleting…" : "Discard progress"}
                    </button>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleGoToReview} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="symbol">Trading Pair</Label>
                  <Input
                    id="symbol"
                    placeholder="EURUSD, BTCUSD, XAUUSD..."
                    value={form.symbol}
                    onChange={(e) =>
                      setForm({ ...form, symbol: e.target.value.toUpperCase() })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Direction</Label>
                  <div className="flex gap-2">
                    {(["BUY", "SELL"] as const).map((dir) => (
                      <Button
                        key={dir}
                        type="button"
                        variant={form.direction === dir ? "default" : "secondary"}
                        className="flex-1"
                        onClick={() => setForm({ ...form, direction: dir })}
                      >
                        {dir}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Entry Range</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <span className="text-xs text-gray-500">Entry Min</span>
                    <Input
                      type="number"
                      step="any"
                      placeholder="1.0820"
                      value={form.entryMin}
                      onChange={(e) =>
                        setForm({ ...form, entryMin: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-gray-500">Entry Max</span>
                    <Input
                      type="number"
                      step="any"
                      placeholder="1.0860"
                      value={form.entryMax}
                      onChange={(e) =>
                        setForm({ ...form, entryMax: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>
                {rangeValid && (
                  <p className="text-xs text-gray-500">
                    Zone width: {(entryMax - entryMin).toFixed(5)} · Mid:{" "}
                    {entryMid.toFixed(5)}
                  </p>
                )}
                {form.symbol.trim().length >= 3 && (
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs">
                    {quoteLoading ? (
                      <span className="text-gray-500">Fetching live quote…</span>
                    ) : liveQuote ? (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-400">
                        <span>
                          Live{" "}
                          {liveQuote.resolved_symbol
                            ? liveQuote.resolved_symbol
                            : form.symbol}
                          :
                        </span>
                        <span>
                          Bid{" "}
                          <strong className="text-gray-300">
                            {liveQuote.bid}
                          </strong>
                        </span>
                        <span>
                          Ask{" "}
                          <strong className="text-gray-300">
                            {liveQuote.ask}
                          </strong>
                        </span>
                        <span>
                          Mid{" "}
                          <strong className="text-primary">
                            {liveQuote.mid}
                          </strong>
                        </span>
                        <span>Spread {liveQuote.spread}</span>
                      </div>
                    ) : quoteError ? (
                      <span className="text-gray-500">{quoteError}</span>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sl">Stop Loss</Label>
                  <Input
                    id="sl"
                    type="number"
                    step="any"
                    placeholder="1.0780"
                    value={form.stopLoss}
                    onChange={(e) =>
                      setForm({ ...form, stopLoss: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tp">Take Profit</Label>
                  <Input
                    id="tp"
                    type="number"
                    step="any"
                    placeholder="1.0950"
                    value={form.takeProfit}
                    onChange={(e) =>
                      setForm({ ...form, takeProfit: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              {parseFloat(rrRatio) > 0 && rangeValid && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-sm text-gray-400">
                    Risk/Reward (mid entry):{" "}
                    <span className="font-bold text-primary">1:{rrRatio}</span>
                    {parseFloat(rrRatio) >= 2 && (
                      <span className="ml-2 text-success">
                        (+{parseFloat(rrRatio) >= 4 ? 15 : parseFloat(rrRatio) >= 3 ? 10 : 5} RR bonus)
                      </span>
                    )}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="description">Trade Analysis</Label>
                <textarea
                  id="description"
                  className="flex min-h-[100px] w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder="Explain your setup, confluence, and why this entry zone..."
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Chart Setup Screenshot</Label>
                  {aiFilled && (
                    <Badge variant="success" className="gap-1">
                      <Sparkles className="h-3 w-3" />
                      AI filled
                    </Badge>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                />

                {setupPreview ? (
                  <div className="relative overflow-hidden rounded-xl border border-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={setupPreview}
                      alt="Setup preview"
                      className="max-h-64 w-full object-contain bg-black/40"
                    />
                    {(analyzing || uploading) && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        <p className="text-sm text-white">
                          {uploading && analyzing
                            ? "Uploading & analyzing chart…"
                            : uploading
                              ? "Uploading…"
                              : "Analyzing chart with AI…"}
                        </p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={clearSetup}
                      className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-3 rounded-xl border border-dashed border-white/20 bg-white/[0.02] px-6 py-10 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="rounded-full bg-primary/10 p-3">
                      <Upload className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">
                        Upload your chart setup
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        PNG, JPEG, or WebP · Max 5MB
                      </p>
                    </div>
                  </button>
                )}

                {!setupPreview && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Sparkles className="h-3 w-3 text-primary" />
                    Upload a chart — AI auto-fills and saves your draft
                  </div>
                )}
              </div>

              {duplicateMatch && (
                <DuplicateRejectionCard match={duplicateMatch} message={error} />
              )}

              {error && !duplicateMatch && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                  {(pendingSubmit || /internal server error|try again|timeout/i.test(error)) && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full gap-2"
                      disabled={loading || autoRetrying}
                      onClick={() => {
                        if (pendingSubmit && !review) {
                          restorePendingSubmit();
                          return;
                        }
                        void handleRetrySubmit();
                      }}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${loading || autoRetrying ? "animate-spin" : ""}`}
                      />
                      {pendingSubmit ? "Retry saved submission" : "Try again"}
                    </Button>
                  )}
                  {setupFile && !aiFilled && error && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full gap-2"
                      disabled={analyzing || uploading}
                      onClick={() => void retryAiIngest()}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${analyzing ? "animate-spin" : ""}`}
                      />
                      Retry AI chart analysis
                    </Button>
                  )}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading || uploading || analyzing || accountReady === false}
              >
                {accountReady === false
                  ? "Pay weekly access to submit"
                  : analyzing
                  ? "Analyzing chart..."
                  : uploading
                    ? "Uploading setup..."
                    : "Confirm direction & levels"}
              </Button>
            </form>
          </CardContent>
        </Card>
        )}
        </div>
      </motion.div>
    </div>
  );
}
