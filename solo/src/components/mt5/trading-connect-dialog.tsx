"use client";

import { X } from "lucide-react";
import { MetaApiAccountPicker } from "@/components/mt5/metaapi-account-picker";

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
              Paste your MetaAPI API token and the account ID you want to
              monitor. No MT5 login or password.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-navy hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <MetaApiAccountPicker
          showTokenField
          onLinked={() => {
            onLinked();
            onClose();
          }}
        />
      </div>
    </div>
  );
}
