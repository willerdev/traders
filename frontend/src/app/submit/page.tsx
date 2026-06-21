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
import { api, type SignalDraft } from "@/lib/api";
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

export default function SubmitSignalPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skipAutoSave = useRef(false);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiFilled, setAiFilled] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ signalId: string; entryRange?: { min: number; max: number } } | null>(null);
  const [setupFile, setSetupFile] = useState<File | null>(null);
  const [setupPreview, setSetupPreview] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState("");

  const [draftId, setDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<SignalDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [form, setForm] = useState(EMPTY_FORM);

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

  useEffect(() => {
    if (!isAuthenticated) router.push("/login");
    else void loadDrafts();
  }, [isAuthenticated, router, loadDrafts]);

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
    if (!isAuthenticated || success) return;
    const timer = setTimeout(() => {
      void saveDraftNow();
    }, 1500);
    return () => clearTimeout(timer);
  }, [form, screenshotUrl, aiFilled, isAuthenticated, success, saveDraftNow]);

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
      setForm({
        symbol: analysis.symbol,
        direction: analysis.direction,
        entryMin: String(analysis.entryMin),
        entryMax: String(analysis.entryMax),
        stopLoss: String(analysis.stopLoss),
        takeProfit: String(analysis.takeProfit),
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
    setAiFilled(false);
    setSaveStatus("idle");
    setTimeout(() => {
      skipAutoSave.current = false;
    }, 0);
  }

  function resumeDraft(draft: SignalDraft) {
    skipAutoSave.current = true;
    setDraftId(draft.id);
    setForm({
      symbol: draft.symbol ?? "",
      direction: draft.direction ?? "BUY",
      entryMin: draft.entryMin != null ? String(draft.entryMin) : "",
      entryMax: draft.entryMax != null ? String(draft.entryMax) : "",
      stopLoss: draft.stopLoss != null ? String(draft.stopLoss) : "",
      takeProfit: draft.takeProfit != null ? String(draft.takeProfit) : "",
      description: draft.description ?? "",
    });
    setAiFilled(draft.aiFilled);
    setSetupFile(null);
    if (setupPreview?.startsWith("blob:")) URL.revokeObjectURL(setupPreview);
    setSetupPreview(draft.screenshotUrl);
    setScreenshotUrl(draft.screenshotUrl ?? "");
    setError("");
    setSaveStatus("saved");
    setTimeout(() => {
      skipAutoSave.current = false;
    }, 0);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!rangeValid) {
      setError("Enter a valid entry range (min must be less than max)");
      return;
    }

    if (!setupFile && !screenshotUrl) {
      setError("Upload your chart setup screenshot");
      return;
    }

    setLoading(true);

    try {
      let imageUrl = screenshotUrl;
      if (setupFile && !screenshotUrl) {
        setUploading(true);
        const upload = await api.uploads.setup(setupFile);
        imageUrl = upload.url;
        setUploading(false);
      }

      const result = await api.signals.submit({
        symbol: form.symbol.toUpperCase(),
        direction: form.direction,
        entryMin,
        entryMax,
        stopLoss: sl,
        takeProfit: tp,
        riskRewardRatio: parseFloat(rrRatio),
        description: form.description,
        screenshotUrl: imageUrl,
      });

      if ("status" in result && result.status === "duplicate_signal") {
        setError("Duplicate signal detected. Your submission was rejected.");
      } else if ("signalId" in result) {
        if (draftId) {
          try {
            await api.signals.deleteDraft(draftId);
            setDrafts((prev) => prev.filter((d) => d.id !== draftId));
          } catch {
            /* submitted successfully anyway */
          }
        }
        setSuccess({
          signalId: result.signalId as string,
          entryRange:
            "entryRange" in result
              ? (result.entryRange as { min: number; max: number })
              : { min: entryMin, max: entryMax },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Card>
          <CardContent className="pt-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success text-2xl">
              ✓
            </div>
            <h2 className="text-xl font-bold text-white">Signal Submitted</h2>
            <p className="mt-2 text-gray-400">
              Your setup is locked in and tracked immutably.
            </p>
            <Badge variant="secondary" className="mt-4">
              ID: {success.signalId}
            </Badge>
            {success.entryRange && (
              <p className="mt-3 text-sm text-primary">
                Entry range: {success.entryRange.min} – {success.entryRange.max}
              </p>
            )}
            <div className="mt-6 flex gap-3 justify-center">
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
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
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
                      onClick={() => resumeDraft(draft)}
                    >
                      {draftId === draft.id ? "Editing" : "Resume"}
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
              your progress so you can finish later.
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
            <form onSubmit={handleSubmit} className="space-y-5">
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

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading || uploading || analyzing}
              >
                {analyzing
                  ? "Analyzing chart..."
                  : uploading
                    ? "Uploading setup..."
                    : loading
                      ? "Submitting..."
                      : "Submit Setup (Immutable)"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
