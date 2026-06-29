"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api } from "@/lib/api";
import { Loader2, Upload, X } from "lucide-react";

type Props = {
  signalId: string;
  symbol: string;
  claimId?: string;
  claimType?: "full" | "rr_1_1";
  oneToOnePrice?: number;
  onClose: () => void;
  onSubmitted: (message: string) => void;
  onError?: (message: string) => void;
};

export function ClaimTpModal({
  signalId,
  symbol,
  claimId,
  claimType = "full",
  oneToOnePrice,
  onClose,
  onSubmitted,
  onError,
}: Props) {
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [beforePreview, setBeforePreview] = useState<string | null>(null);
  const [afterPreview, setAfterPreview] = useState<string | null>(null);
  const [uploadedBeforeUrl, setUploadedBeforeUrl] = useState<string | null>(null);
  const [uploadedAfterUrl, setUploadedAfterUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const beforePreviewRef = useRef<string | null>(null);
  const afterPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (beforePreviewRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(beforePreviewRef.current);
      }
      if (afterPreviewRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(afterPreviewRef.current);
      }
    };
  }, []);

  function setBeforePreviewSafe(url: string | null) {
    if (beforePreviewRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(beforePreviewRef.current);
    }
    beforePreviewRef.current = url;
    setBeforePreview(url);
  }

  function setAfterPreviewSafe(url: string | null) {
    if (afterPreviewRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(afterPreviewRef.current);
    }
    afterPreviewRef.current = url;
    setAfterPreview(url);
  }

  function reportError(message: string) {
    setSubmitError(message);
    onError?.(message);
  }

  function pickFile(
    file: File | undefined,
    setFile: (f: File | null) => void,
    setPreview: (u: string | null) => void,
    clearUploaded: () => void,
  ) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      reportError("Only JPEG, PNG, and WebP images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reportError("Each image must be under 5MB");
      return;
    }
    setSubmitError(null);
    setFile(file);
    clearUploaded();
    setPreview(URL.createObjectURL(file));
  }

  async function ensureUploadedUrls(): Promise<{
    beforeUrl: string;
    afterUrl: string;
  } | null> {
    if (!beforeFile || !afterFile) {
      reportError("Upload both before and after chart screenshots");
      return null;
    }

    let beforeUrl = uploadedBeforeUrl;
    let afterUrl = uploadedAfterUrl;

    if (!beforeUrl || !afterUrl) {
      const [beforeUpload, afterUpload] = await Promise.all([
        api.uploads.setup(beforeFile),
        api.uploads.setup(afterFile),
      ]);
      beforeUrl = beforeUpload.url;
      afterUrl = afterUpload.url;
      setUploadedBeforeUrl(beforeUrl);
      setUploadedAfterUrl(afterUrl);
    }

    return { beforeUrl, afterUrl };
  }

  async function handleSubmit() {
    setSubmitError(null);
    setLoading(true);
    try {
      const urls = await ensureUploadedUrls();
      if (!urls) return;

      const result = claimId
        ? await api.tpClaims.resubmit(claimId, {
            beforeScreenshotUrl: urls.beforeUrl,
            afterScreenshotUrl: urls.afterUrl,
          })
        : await api.signals.claim(signalId, "tp", {
            beforeScreenshotUrl: urls.beforeUrl,
            afterScreenshotUrl: urls.afterUrl,
            ...(claimType === "rr_1_1" ? { tpClaimType: "rr_1_1" as const } : {}),
          });

      const message =
        result.message ??
        (result.status === "pending_review"
          ? "TP claim submitted for admin review. Track status on TP Claims."
          : "TP claim submitted.");

      onSubmitted(message);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not submit TP claim";
      reportError(message);
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = Boolean(beforeFile && afterFile) && !loading;

  return (
    <div className="modal-overlay fixed inset-0 z-[110] flex items-center justify-center p-4">
      <Card
        className="modal-panel max-h-[90vh] w-full max-w-lg overflow-y-auto border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>
              {claimId
                ? "Reapply take profit"
                : claimType === "rr_1_1"
                  ? "Claim 1:1 RR"
                  : "Claim take profit"}{" "}
              — {symbol}
            </CardTitle>
            <CardDescription className="mt-1">
              {claimId
                ? "Upload new before and after screenshots. Your claim will return to the admin review queue."
                : claimType === "rr_1_1"
                  ? `Upload proof that price reached your 1:1 level${oneToOnePrice != null ? ` (${oneToOnePrice})` : ""}. Admin approval credits half the standard TP reward.`
                  : "Upload before and after screenshots of your chart. An admin will review your evidence before crediting the TP reward."}
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1 text-muted hover:bg-white/5 hover:text-foreground disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </CardHeader>
        <CardContent className="space-y-4">
          {submitError && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {submitError}
            </p>
          )}

          {uploadedBeforeUrl && uploadedAfterUrl && !loading && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Screenshots uploaded — tap Submit for review again if the claim did not go through.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <UploadSlot
              id="before-chart"
              label="Before (entry / open)"
              preview={beforePreview}
              disabled={loading}
              onPick={(f) =>
                pickFile(f, setBeforeFile, setBeforePreviewSafe, () =>
                  setUploadedBeforeUrl(null),
                )
              }
            />
            <UploadSlot
              id="after-chart"
              label={claimType === "rr_1_1" ? "After (1:1 hit)" : "After (TP hit)"}
              preview={afterPreview}
              disabled={loading}
              onPick={(f) =>
                pickFile(f, setAfterFile, setAfterPreviewSafe, () =>
                  setUploadedAfterUrl(null),
                )
              }
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={!canSubmit}>
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : claimId ? (
                "Resubmit for review"
              ) : (
                "Submit for review"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UploadSlot({
  id,
  label,
  preview,
  disabled,
  onPick,
}: {
  id: string;
  label: string;
  preview: string | null;
  disabled?: boolean;
  onPick: (file: File | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <label
        htmlFor={id}
        className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-3 text-center text-xs text-muted hover:border-primary/40 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50"
        data-disabled={disabled ? "true" : "false"}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={label}
            className="max-h-28 w-full rounded object-contain"
          />
        ) : (
          <>
            <Upload className="mb-2 h-5 w-5" />
            Click to upload
          </>
        )}
        <input
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            onPick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
