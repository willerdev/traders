export type Mt5PlaceKind =
  | "BUY"
  | "SELL"
  | "BUY_LIMIT"
  | "SELL_LIMIT"
  | "BUY_STOP"
  | "SELL_STOP";

export type Mt5OrderKind =
  | "MARKET"
  | "BUY_LIMIT"
  | "SELL_LIMIT"
  | "BUY_STOP"
  | "SELL_STOP";

export function mt5PlaceDirection(kind: Mt5PlaceKind): "BUY" | "SELL" {
  return kind.startsWith("SELL") ? "SELL" : "BUY";
}

export function mt5ApiOrderKind(kind: Mt5PlaceKind): Mt5OrderKind {
  if (kind === "BUY" || kind === "SELL") return "MARKET";
  return kind;
}

export function mt5PlaceLabel(kind: Mt5PlaceKind): string {
  switch (kind) {
    case "BUY":
      return "Buy";
    case "SELL":
      return "Sell";
    case "BUY_LIMIT":
      return "Buy Limit";
    case "SELL_LIMIT":
      return "Sell Limit";
    case "BUY_STOP":
      return "Buy Stop";
    case "SELL_STOP":
      return "Sell Stop";
  }
}

export function isMt5PendingKind(kind: Mt5PlaceKind): boolean {
  return kind !== "BUY" && kind !== "SELL";
}
