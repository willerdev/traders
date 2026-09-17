export type TxLifecycleStage =
  | "idle"
  | "preparing"
  | "wallet_confirmation"
  | "broadcasting"
  | "waiting_for_block"
  | "confirmed"
  | "completed"
  | "failed";

export const TX_LIFECYCLE_LABELS: Record<TxLifecycleStage, string> = {
  idle: "Idle",
  preparing: "Preparing",
  wallet_confirmation: "Wallet Confirmation",
  broadcasting: "Broadcasting",
  waiting_for_block: "Waiting For Block",
  confirmed: "Confirmed",
  completed: "Completed",
  failed: "Failed",
};

export const TX_LIFECYCLE_ORDER: TxLifecycleStage[] = [
  "preparing",
  "wallet_confirmation",
  "broadcasting",
  "waiting_for_block",
  "confirmed",
  "completed",
];

export type TxProgress = {
  stage: TxLifecycleStage;
  hash?: string;
  message?: string;
  error?: string;
  explorerUrl?: string;
};
