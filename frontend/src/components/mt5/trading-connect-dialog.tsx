"use client";

import { X } from "lucide-react";
import { Mt5LiveSyncCard } from "@/components/mt5/mt5-live-sync-card";

type Props = {
  open: boolean;
  onClose: () => void;
  onLinked: () => void;
};

export function TradingConnectDialog({ open, onClose, onLinked }: Props) {
  if (!open) return null;

  return (
    <div
      className="modal-overlay fixed inset-0 z-[120] flex items-end justify-center p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="modal-panel max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Connect trading account
            </h2>
            <p className="mt-1 text-sm text-muted">
              Enter MT5 credentials to enable Live Sync, or pick an evaluation
              account from the trading page header.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <Mt5LiveSyncCard
          tradingActive
          onAccountLinked={() => {
            onLinked();
            onClose();
          }}
        />
      </div>
    </div>
  );
}
