import type { UserMt5AccountSource, UserMt5InvestorSummary } from "@/lib/api";

export type Mt5AccountMode = "demo" | "real";

export function mt5AccountModeFromSource(
  accountSource?: UserMt5AccountSource,
  investor?: UserMt5InvestorSummary | null,
): Mt5AccountMode {
  if (
    accountSource === "copy_live" ||
    accountSource === "linked_live" ||
    accountSource === "investor_live" ||
    accountSource === "evaluation_live"
  ) {
    return "real";
  }
  if (investor && investor.investmentDeposited > 0) {
    return "real";
  }
  return "demo";
}

export function mt5AccountModeDetail(
  accountSource?: UserMt5AccountSource,
): string | null {
  switch (accountSource) {
    case "copy_live":
      return "MT5 Copy";
    case "linked_live":
      return "Linked MT5";
    case "investor_live":
      return "Investor";
    case "evaluation_live":
      return "Evaluation";
    default:
      return null;
  }
}
