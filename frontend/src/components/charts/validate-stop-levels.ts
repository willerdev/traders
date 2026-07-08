import type { ChartPriceLine } from "@/components/charts/chart-types";

function validateAgainstOpenPrice(
  direction: string,
  openPrice: number,
  sl: number | undefined,
  tp: number | undefined,
): string | null {
  if (direction === "BUY") {
    if (sl != null && sl > openPrice) {
      return "For BUY, stop loss cannot be above entry price";
    }
    if (tp != null && tp <= openPrice) {
      return "For BUY, take profit must be above entry price";
    }
  } else {
    if (sl != null && sl < openPrice) {
      return "For SELL, stop loss cannot be below entry price";
    }
    if (tp != null && tp >= openPrice) {
      return "For SELL, take profit must be below entry price";
    }
  }
  return null;
}

export function validateStopDrag(
  line: ChartPriceLine,
  newPrice: number,
  allLines: ChartPriceLine[],
): string | null {
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return "Enter a valid price";
  }

  const direction = line.direction ?? "BUY";
  const prefix = line.id.replace(/-(sl|tp)$/, "");
  const slLine = allLines.find((l) => l.id === `${prefix}-sl`);
  const tpLine = allLines.find((l) => l.id === `${prefix}-tp`);
  const sl = line.kind === "sl" ? newPrice : slLine?.price;
  const tp = line.kind === "tp" ? newPrice : tpLine?.price;

  const openPrice = line.openPrice;
  if (openPrice != null && Number.isFinite(openPrice)) {
    return validateAgainstOpenPrice(direction, openPrice, sl, tp);
  }

  const hasEntryRange =
    line.entryMin != null &&
    line.entryMax != null &&
    Number.isFinite(line.entryMin) &&
    Number.isFinite(line.entryMax);

  if (hasEntryRange && line.signalId) {
    const entryMin = line.entryMin!;
    const entryMax = line.entryMax!;
    if (direction === "BUY") {
      if (sl != null && sl >= entryMin) {
        return "For BUY, stop loss must be below the entry range";
      }
      if (tp != null && tp <= entryMax) {
        return "For BUY, take profit must be above the entry range";
      }
    } else {
      if (sl != null && sl <= entryMax) {
        return "For SELL, stop loss must be above the entry range";
      }
      if (tp != null && tp >= entryMin) {
        return "For SELL, take profit must be below the entry range";
      }
    }
    return null;
  }

  return null;
}
