import { api } from "@/lib/api";
import type { ReviewPayload } from "@/components/submit/submit-review";
import type { MatchedDuplicateSignal } from "@/lib/api";

export type SetupSubmitSuccess = {
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

export type SetupSubmitOutcome =
  | { type: "success"; result: SetupSubmitSuccess }
  | {
      type: "duplicate";
      message: string;
      matchedSignal: MatchedDuplicateSignal;
    }
  | { type: "error"; message: string };

export async function executeSetupSubmit(
  review: ReviewPayload,
  setupFile: File | null,
): Promise<SetupSubmitOutcome> {
  try {
    let imageUrl = review.screenshotUrl;
    if (setupFile && !imageUrl) {
      const upload = await api.uploads.setup(setupFile);
      imageUrl = upload.url;
    }

    if (!imageUrl) {
      return { type: "error", message: "Chart screenshot is missing — re-upload your image." };
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
      return {
        type: "duplicate",
        message: result.message,
        matchedSignal: result.matchedSignal,
      };
    }

    if ("signalId" in result) {
      return {
        type: "success",
        result: {
          signalId: result.signalId as string,
          entryRange:
            "entryRange" in result
              ? (result.entryRange as { min: number; max: number })
              : { min: review.entryMin, max: review.entryMax },
          execution:
            "execution" in result && result.execution
              ? result.execution
              : { status: "pending", forwarded: false },
          executionHub: "executionHub" in result ? result.executionHub : undefined,
          executionValidation:
            "executionValidation" in result ? result.executionValidation : undefined,
        },
      };
    }

    return { type: "error", message: "Unexpected response from server" };
  } catch (err) {
    return {
      type: "error",
      message: err instanceof Error ? err.message : "Submission failed",
    };
  }
}
