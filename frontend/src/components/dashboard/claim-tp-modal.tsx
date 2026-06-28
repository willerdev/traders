"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api } from "@/lib/api";
import { Loader2, Upload, X } from "lucide-react";

type Props = {
  signalId: string;
  symbol: string;
  claimId?: string;
  onClose: () => void;
  onSubmitted: (message: string) => void;
  onError: (message: string) => void;
};

export function ClaimTpModal({
  signalId,
  symbol,
  claimId,
  onClose,
  onSubmitted,
  onError,
}: Props) {
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [beforePreview, setBeforePreview] = useState<string | null>(null);
  const [afterPreview, setAfterPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function pickFile(
    file: File | undefined,
    setFile: (f: File | null) => void,
    setPreview: (u: string | null) => void,
  ) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      onError("Only JPEG, PNG, and WebP images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onError("Each image must be under 5MB");
      return;
    }
    setFile(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!beforeFile || !afterFile) {
      onError("Upload both before and after chart screenshots");
      return;
    }

    setLoading(true);
    try {
      const [beforeUpload, afterUpload] = await Promise.all([
        api.uploads.setup(beforeFile),
        api.uploads.setup(afterFile),
      ]);

      const result = claimId
        ? await api.tpClaims.resubmit(claimId, {
            beforeScreenshotUrl: beforeUpload.url,
            afterScreenshotUrl: afterUpload.url,
          })
        : await api.signals.claim(signalId, "tp", {
            beforeScreenshotUrl: beforeUpload.url,
            afterScreenshotUrl: afterUpload.url,
          });

      if (result.status === "pending_review") {
        onSubmitted(
          result.message ??
            "TP claim submitted for admin review. Track status on TP Claims.",
        );
        onClose();
      } else {
        onSubmitted("TP claim submitted.");
        onClose();
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not submit TP claim");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>
              {claimId ? "Reapply take profit" : "Claim take profit"} — {symbol}
            </CardTitle>
            <CardDescription className="mt-1">
              {claimId
                ? "Upload new before and after screenshots. Your claim will return to the admin review queue."
                : "Upload before and after screenshots of your chart. An admin will review your evidence before crediting the TP reward."}
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-white/5 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <UploadSlot
              id="before-chart"
              label="Before (entry / open)"
              preview={beforePreview}
              onPick={(f) => pickFile(f, setBeforeFile, setBeforePreview)}
            />
            <UploadSlot
              id="after-chart"
              label="After (TP hit)"
              preview={afterPreview}
              onPick={(f) => pickFile(f, setAfterFile, setAfterPreview)}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={loading || !beforeFile || !afterFile}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
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
  onPick,
}: {
  id: string;
  label: string;
  preview: string | null;
  onPick: (file: File | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <label
        htmlFor={id}
        className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-3 text-center text-xs text-muted hover:border-primary/40"
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
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </label>
    </div>
  );
}
