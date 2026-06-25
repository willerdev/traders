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
import { api, type SignalDraft, type MatchedDuplicateSignal } from "@/lib/api";
import { normalizeSetupFields, setupValidationError } from "@/lib/chart-setup";
import { RegistrationCheckout } from "@/components/payments/registration-checkout";
import {
  SubmitReviewCard,
  type ReviewPayload,
} from "@/components/submit/submit-review";
import { DuplicateRejectionCard } from "@/components/submit/duplicate-rejection";
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
  const { isAuthenticated } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);
  const skipAutoSave = useRef(false);

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
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [resumingDraftId, setResumingDraftId] = useState<string | null>(null);
  const [accountReady, setAccountReady] = useState<boolean | null>(null);

  const progress = calcProgress(form, screenshotUrl);

  const refreshAccountStatus = useCallback(async () => {
    try {
      const dash = await api.users.dashboard();
      const active = dash?.user.status === "ACTIVE";
      setAccountReady(active);
      const { token, user } = useAuthStore.getState();
      if (token && user && dash?.user.status) {
        useAuthStore.getState().setAuth(token, { ...user, status: dash.user.status });
      }
    } catch {
      setAccountReady(false);
    }
  }, []);

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

  useEffect(() => {
    if (!isAuthenticated) router.push("/login");
    else {
      void loadDrafts();
      void refreshAccountStatus();
    }
  }, [isAuthenticated, router, loadDrafts, refreshAccountStatus]);

  useEffect(() => {
    if (!success || success.executionHub?.id) {
      setHubHealth(null);
      return;
    }
    void api.signals
      .hubHealth()
      .then(setHubHealth)
      .catch(() => setHubHealth(null));
  }, [success]);

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

  const saveDraftNow = useCallback(async () => {
    if (skipAutoSave.current) return;
    const payload = buildDraftPayload();
    if (calcProgress(form, screenshotUrl) === 0) return;

    setSaveStatus("saving");
    try {
      if (draftId) {
        const updated = await api.signals.updateDraft(draftId, payload);
        setDrafts((prev) =>
          prev.map((d) => (d.id === updated.id ? updated : d)).sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          ),
        );
      } else {
        const created = await api.signals.createDraft(payload);
        setDraftId(created.id);
        setDrafts((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
      }
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [buildDraftPayload, draftId, form, screenshotUrl]);

  useEffect(() => {
    if (!isAuthenticated || success || step === "review") return;
    const timer = setTimeout(() => {
      void saveDraftNow();
    }, 1500);
    return () => clearTimeout(timer);
  }, [form, screenshotUrl, aiFilled, isAuthenticated, success, step, saveDraftNow]);

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

    setSetupFile(file);
    setSetupPreview(URL.createObjectURL(file));
    setAiFilled(false);
    setError("");

    setUploading(true);
    try {
      const upload = await api.uploads.setup(file);
      setScreenshotUrl(upload.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }

    void analyzeSetupImage(file);
  }

  async function analyzeSetupImage(file: File) {
    setAnalyzing(true);
    try {
      const { analysis } = await api.uploads.analyzeSetup(file);
      const fixed = normalizeSetupFields({
        direction: analysis.direction,
        entryMin: analysis.entryMin,
        entryMax: analysis.entryMax,
        stopLoss: analysis.stopLoss,
        takeProfit: analysis.takeProfit,
      });
      setForm({
        symbol: analysis.symbol,
        direction: fixed.direction,
        entryMin: String(fixed.entryMin),
        entryMax: String(fixed.entryMax),
        stopLoss: String(fixed.stopLoss),
        takeProfit: String(fixed.takeProfit),
        description: analysis.description,
      });
      setAiFilled(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "AI could not read the chart — fill in the fields manually",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function clearSetup() {
    setSetupFile(null);
    if (setupPreview?.startsWith("blob:")) URL.revokeObjectURL(setupPreview);
    setSetupPreview(null);
    setScreenshotUrl("");
    setAiFilled(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function resetForm() {
    skipAutoSave.current = true;
    setDraftId(null);
    setForm(EMPTY_FORM);
    clearSetup();
    setError("");
    setDuplicateMatch(null);
    setAiFilled(false);
    setSaveStatus("idle");
    setStep("edit");
    setReview(null);
    setTimeout(() => {
      skipAutoSave.current = false;
    }, 0);
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
    skipAutoSave.current = true;
    setResumingDraftId(draft.id);
    setError("");
    try {
      const full = await api.signals.getDraft(draft.id);
      applyDraftToForm(full);
    } catch {
      applyDraftToForm(draft);
    } finally {
      setResumingDraftId(null);
      setTimeout(() => {
        skipAutoSave.current = false;
      }, 1500);
    }
    requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleDeleteDraft(id: string) {
    try {
      await api.signals.deleteDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      if (draftId === id) resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete draft");
    }
  }

  function buildReviewPayload(): ReviewPayload | null {
    const fixed = normalizeSetupFields({
      direction: form.direction,
      entryMin,
      entryMax,
      stopLoss: sl,
      takeProfit: tp,
    });

    const validationErr = setupValidationError(fixed);
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

    if (
      fixed.direction !== form.direction ||
      fixed.entryMin !== entryMin ||
      fixed.entryMax !== entryMax ||
      fixed.stopLoss !== sl ||
      fixed.takeProfit !== tp
    ) {
      setForm({
        ...form,
        direction: fixed.direction,
        entryMin: String(fixed.entryMin),
        entryMax: String(fixed.entryMax),
        stopLoss: String(fixed.stopLoss),
        takeProfit: String(fixed.takeProfit),
      });
    }

    return {
      symbol: form.symbol.trim().toUpperCase(),
      direction: fixed.direction,
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
      setError("Pay registration to submit setups. KYC is only required for payouts.");
      return;
    }
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
    setLoading(true);

    try {
      let imageUrl = review.screenshotUrl;
      if (setupFile && !imageUrl) {
        setUploading(true);
        const upload = await api.uploads.setup(setupFile);
        imageUrl = upload.url;
        setUploading(false);
      }

      const result = await api.signals.submit({
        symbol: review.symbol,
        direction: review.direction,
        entryMin: review.entryMin,
        entryMax: review.entryMax,
        stopLoss: review.stopLoss,
        takeProfit: review.takeProfit,
        riskRewardRatio: review.riskRewardRatio,
        description: review.description,
        screenshotUrl: imageUrl,
      });

      if ("status" in result && result.status === "duplicate_signal") {
        setDuplicateMatch(result.matchedSignal);
        setError(result.message);
        setStep("edit");
        setReview(null);
      } else if ("signalId" in result) {
        if (draftId) {
          try {
            await api.signals.deleteDraft(draftId);
            setDrafts((prev) => prev.filter((d) => d.id !== draftId));
          } catch {
            /* submitted successfully anyway */
          }
        }
        setStep("edit");
        setReview(null);
        setSuccess({
          signalId: result.signalId as string,
          entryRange:
            "entryRange" in result
              ? (result.entryRange as { min: number; max: number })
              : { min: review.entryMin, max: review.entryMax },
          execution: "execution" in result ? result.execution : undefined,
          executionHub: "executionHub" in result ? result.executionHub : undefined,
          executionValidation:
            "executionValidation" in result ? result.executionValidation : undefined,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setLoading(false);
      setUploading(false);
    }
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
    const mt5Queued = Boolean(success.executionHub?.id);
    const validationFailed = success.executionValidation?.approved === false;
    const mt5Failed = !mt5Queued;

    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Card>
          <CardContent className="pt-8">
            <div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-2xl ${
                mt5Failed
                  ? "bg-rank-gold/10 text-rank-gold"
                  : "bg-success/10 text-success"
              }`}
            >
              {mt5Failed ? "!" : "✓"}
            </div>
            <h2 className="text-xl font-bold text-white">
              {mt5Failed ? "Saved — MT5 not queued" : "Signal Submitted"}
            </h2>
            <p className="mt-2 text-gray-400">
              {mt5Failed
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

            {mt5Queued && success.executionHub && (
              <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-4 text-left text-sm">
                <p className="font-medium text-success">Queued for MT5</p>
                <p className="mt-1 text-muted">
                  Hub status: <strong className="text-foreground">{success.executionHub.status}</strong>
                  {success.executionHub.progress?.message && (
                    <> — {success.executionHub.progress.message}</>
                  )}
                </p>
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {accountReady === false && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle>Pay registration to submit</CardTitle>
              <CardDescription>
                You can fill in setups and save drafts now. Complete registration (5 USDT)
                to lock in and send setups. KYC is only required when you request a payout.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RegistrationCheckout onComplete={() => void refreshAccountStatus()} />
            </CardContent>
          </Card>
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
                      onClick={() => void handleDeleteDraft(draft.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div ref={formCardRef}>
        {step === "review" && review ? (
          <SubmitReviewCard
            review={review}
            loading={loading || uploading}
            error={error}
            onEdit={() => {
              setStep("edit");
              setError("");
              setDuplicateMatch(null);
            }}
            onConfirm={() => void handleConfirmSubmit()}
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
            {progress > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                  <span>Progress</span>
                  <span>{progress}%</span>
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
                          {uploading ? "Uploading & saving..." : "Analyzing chart with AI..."}
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
                <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading || uploading || analyzing || accountReady === false}
              >
                {accountReady === false
                  ? "Pay registration to submit"
                  : analyzing
                  ? "Analyzing chart..."
                  : uploading
                    ? "Uploading setup..."
                    : "Review setup before submit"}
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
