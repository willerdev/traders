"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeftRight, X } from "lucide-react";

export function WalletReceiveModal({
  open,
  onClose,
  onDeposit,
}: {
  open: boolean;
  onClose: () => void;
  onDeposit: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="modal-overlay fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="modal-panel w-full max-w-md rounded-t-2xl border border-white/10 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">Receive USDT</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-gray-400">
            To add USDT to your platform wallet, use the{" "}
            <strong className="text-white">Deposit</strong> flow. We generate a
            one-time crypto address — once your transfer confirms, the balance
            appears here automatically.
          </p>
          <Button
            className="w-full gap-2"
            onClick={() => {
              onClose();
              onDeposit();
            }}
          >
            <ArrowLeftRight className="h-4 w-4" />
            Open deposit
          </Button>
        </div>
      </div>
    </div>
  );
}
