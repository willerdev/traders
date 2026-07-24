"use client";

import { AlertTriangle, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

/** Investments below this amount auto-stop from the policy date. */
export const INVESTOR_AUTO_STOP_THRESHOLD_USDT = 500;
/** Minimum investment to see loan / reinvest-profit eligibility messaging. */
export const INVESTOR_LOAN_ELIGIBILITY_USDT = 1000;
export const INVESTOR_AUTO_STOP_DATE_LABEL = "27 July 2026";

type Props = {
  investmentBalance: number;
  className?: string;
};

/**
 * Policy notices for active investors:
 * - Under $500: auto-stop from 27 Jul 2026
 * - $1000+: loan eligibility (borrow up to 80% while capital keeps working)
 */
export function InvestorPolicyBanners({
  investmentBalance,
  className,
}: Props) {
  const balance = Number(investmentBalance);
  if (!Number.isFinite(balance) || balance <= 0) return null;

  const showAutoStop = balance < INVESTOR_AUTO_STOP_THRESHOLD_USDT;
  const showLoan = balance >= INVESTOR_LOAN_ELIGIBILITY_USDT;

  if (!showAutoStop && !showLoan) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {showAutoStop && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-sm text-amber-50">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-100">
                Minimum investment update
              </p>
              <p className="text-amber-100/85 leading-relaxed">
                From <strong>{INVESTOR_AUTO_STOP_DATE_LABEL}</strong>, investments
                below{" "}
                <strong>${INVESTOR_AUTO_STOP_THRESHOLD_USDT.toLocaleString()}</strong>{" "}
                will <strong>automatically stop</strong>. Your current investment is{" "}
                <strong>${balance.toFixed(2)}</strong>. Top up to at least $
                {INVESTOR_AUTO_STOP_THRESHOLD_USDT.toLocaleString()} to keep earning.
              </p>
            </div>
          </div>
        </div>
      )}

      {showLoan && (
        <div className="rounded-xl border border-sky-500/35 bg-sky-500/10 p-3.5 text-sm text-sky-50">
          <div className="flex items-start gap-2.5">
            <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
            <div className="space-y-1">
              <p className="font-semibold text-sky-100">
                Investment loan eligibility
              </p>
              <p className="text-sky-100/85 leading-relaxed">
                With{" "}
                <strong>
                  ${INVESTOR_LOAN_ELIGIBILITY_USDT.toLocaleString()}+
                </strong>{" "}
                invested, you can reinvest profit from your investment and borrow
                up to <strong>80%</strong> of your investment balance — while your
                capital keeps working and earning. Message Support to learn more or
                apply.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
