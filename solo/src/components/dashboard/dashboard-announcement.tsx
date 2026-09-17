"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "trp-notice-min-invest-750-aug5-v1";

/**
 * Platform announcement on the main dashboard.
 * Dismissed state is stored per browser (localStorage).
 */
export function DashboardAnnouncement({ className }: { className?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    setVisible(true);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className={cn(
        "relative rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-50",
        className,
      )}
      role="status"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute right-2.5 top-2.5 rounded-md p-1.5 text-amber-200/70 transition hover:bg-amber-500/15 hover:text-amber-50"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-2.5 pr-8">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="space-y-2">
          <p className="font-semibold text-amber-100">
            Minimum investment update — effective 5 August 2026
          </p>
          <p className="leading-relaxed text-amber-100/85">
            Starting <strong>Monday, 5 August 2026</strong>, Smart Invest
            accounts with a balance below <strong>$750</strong> will no longer
            earn daily yield.
          </p>
          <p className="leading-relaxed text-amber-100/85">
            As the platform has grown, daily yields are supported by capital that
            is actively allocated across our trading categories. Smaller balances
            are not contributing enough to sustain returns at the current scale,
            while larger investments continue to fund the yields shared with
            participants.
          </p>
          <p className="leading-relaxed text-amber-100/85">
            The minimum requirement will remain visible in your account so you
            can top up to stay invested, or withdraw anytime if you prefer not to
            meet the new threshold. Withdrawals remain available at any time.
          </p>
        </div>
      </div>
    </div>
  );
}
