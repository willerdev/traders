export function computeOneToOneTakeProfit(
  direction: "BUY" | "SELL",
  entry: number,
  stopLoss: number,
): number {
  const risk = Math.abs(entry - stopLoss);
  return direction === "BUY" ? entry + risk : entry - risk;
}
