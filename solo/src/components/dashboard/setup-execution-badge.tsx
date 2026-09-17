"use client";

import { Badge } from "@/components/ui/badge";
import type { SetupResolution } from "@/lib/api";

export type SetupExecutionPhase = NonNullable<SetupResolution["executionPhase"]>;

export function executionPhaseVariant(
  phase?: SetupExecutionPhase | string,
): "success" | "danger" | "secondary" | "gold" {
  switch (phase) {
    case "running":
    case "claimable":
      return "success";
    case "limit_active":
    case "partial":
      return "gold";
    case "closed_win":
      return "success";
    case "closed_loss":
      return "danger";
    case "closed_neutral":
    case "closed":
      return "secondary";
    default:
      return "secondary";
  }
}

export function SetupExecutionBadge({
  phase,
  label,
  className,
}: {
  phase?: SetupExecutionPhase | string;
  label?: string;
  className?: string;
}) {
  if (!phase && !label) return null;
  return (
    <Badge variant={executionPhaseVariant(phase)} className={className}>
      {label ?? phase?.replace(/_/g, " ")}
    </Badge>
  );
}

export function tradeProgressLabel(
  outcome?: SetupResolution["tradeProgressOutcome"],
): string | null {
  if (!outcome) return null;
  if (outcome === "win") return "Win";
  if (outcome === "loss") return "Loss";
  return "Even / neutral";
}
