"use client";

import { AlertTriangle, Crown, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

/** Investments below this amount auto-stop from the policy date. */
export const INVESTOR_AUTO_STOP_THRESHOLD_USDT = 500;
/** Minimum investment to see loan / reinvest-profit eligibility messaging. */
export const INVESTOR_LOAN_ELIGIBILITY_USDT = 100;
export const INVESTOR_AUTO_STOP_DATE_LABEL = "27 July 2026";
export const INVESTOR_VIP_YIELD_PERCENT = 10;

type Props = {
  investmentBalance: number;
  vipActive?: boolean;
  vipDailyYieldPercent?: number;
  className?: string;
};

/**
 * Policy notices for active investors:
 * - VIP: elevated default daily yield
 * - Under $500: auto-stop from 27 Jul 2026
 * - $1000+: loan eligibility
 */
export function InvestorPolicyBanners({
  investmentBalance,
  vipActive = false,
  vipDailyYieldPercent = INVESTOR_VIP_YIELD_PERCENT,
  className,
}: Props) {
  const balance = Number(investmentBalance);
  const hasBalance = Number.isFinite(balance) && balance > 0;

  const showVip = vipActive;
  const showAutoStop = hasBalance && balance < INVESTOR_AUTO_STOP_THRESHOLD_USDT;
  const showLoan = hasBalance && balance >= INVESTOR_LOAN_ELIGIBILITY_USDT;

  if (!showVip && !showAutoStop && !showLoan) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {showVip && (
        <div className="rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent p-3.5 text-sm text-amber-50">
          <div className="flex items-start gap-2.5">
            <Crown className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-100">VIP privilege</p>
              <p className="text-amber-100/85 leading-relaxed">
                As a VIP investor you earn{" "}
                <strong>{vipDailyYieldPercent}% daily</strong> on your investment
                by default (vs standard platform yield), plus weekend earnings and{" "}
                <strong>$0</strong> withdrawal fees while VIP is active.
              </p>
            </div>
          </div>
        </div>
      )}

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
                invested, you can borrow an advance on your projected daily,
                weekly, or monthly earnings (80% advance + 20% interest). Capital
                keeps earning while the loan is open.{" "}
                <a
                  href="/loans"
                  className="font-semibold text-sky-200 underline underline-offset-2 hover:text-white"
                >
                  Request a loan
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
