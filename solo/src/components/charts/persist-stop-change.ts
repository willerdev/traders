import { api } from "@/lib/api";
import type { ChartPriceLine } from "@/components/charts/chart-types";

export async function persistStopChange(
  line: ChartPriceLine,
  newPrice: number,
): Promise<string> {
  if (line.kind !== "sl" && line.kind !== "tp") {
    throw new Error("Only stop loss and take profit can be adjusted");
  }

  const payload =
    line.kind === "sl"
      ? { stopLoss: newPrice }
      : { takeProfit: newPrice };

  if (line.signalId) {
    const result = await api.signals.updateStops(line.signalId, payload);
    return result.message;
  }

  const positionId = line.positionId ?? line.orderId;
  if (!positionId) {
    throw new Error("No position id — cannot update stops");
  }

  const result = await api.signals.modifyMt5PositionStops(positionId, payload);
  return result.message;
}
