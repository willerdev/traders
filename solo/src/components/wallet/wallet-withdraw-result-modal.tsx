"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

export type WalletWithdrawResult = {
  ok: boolean;
  title: string;
  body: string;
  missingCredentials?: boolean;
};

export function WalletWithdrawResultModal({
  result,
  onClose,
}: {
  result: WalletWithdrawResult | null;
  onClose: () => void;
}) {
  if (!result) return null;

  return (
    <div
      className="modal-overlay fixed inset-0 z-[140] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="modal-panel w-full max-w-md rounded-t-2xl border border-white/10 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">{result.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-4 px-5 py-6 text-center">
          {result.ok ? (
            <CheckCircle2 className="h-14 w-14 text-success" />
          ) : (
            <AlertCircle className="h-14 w-14 text-danger" />
          )}
          <p className="text-sm leading-relaxed text-gray-300">{result.body}</p>
          {result.missingCredentials ? (
            <p className="text-sm text-amber-200">
              Save NOWPayments credentials in Settings, or ask the admin to
              switch the source to Render env.
            </p>
          ) : null}
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            {result.missingCredentials ? (
              <Button asChild className="w-full" variant="default">
                <Link href="/settings" onClick={onClose}>
                  Open Settings
                </Link>
              </Button>
            ) : null}
            <Button
              className="w-full"
              variant={result.missingCredentials ? "secondary" : "default"}
              onClick={onClose}
            >
              {result.ok ? "Done" : "Close"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
