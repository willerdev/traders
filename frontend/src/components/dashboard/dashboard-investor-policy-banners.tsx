"use client";

import { useEffect, useState } from "react";
import { api, type InvestorStatus } from "@/lib/api";
import { InvestorPolicyBanners } from "@/components/investor/investor-policy-banners";

/** Loads investor status and shows policy banners on the main dashboard. */
export function DashboardInvestorPolicyBanners() {
  const [state, setState] = useState<{
    balance: number;
    vipActive: boolean;
    vipYield: number;
    minBalancePolicy: InvestorStatus["minBalancePolicy"] | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.investor
      .status()
      .then((s) => {
        if (cancelled) return;
        const raw = s.investmentBalance ?? s.investmentDeposited ?? 0;
        const n = Number(raw);
        setState({
          balance: Number.isFinite(n) ? n : 0,
          vipActive: Boolean(s.vip?.active),
          vipYield:
            s.vip?.benefits?.dailyYieldPercent ?? s.vipDailyYieldPercent ?? 10,
          minBalancePolicy: s.minBalancePolicy ?? null,
        });
      })
      .catch(() => {
        if (!cancelled)
          setState({
            balance: 0,
            vipActive: false,
            vipYield: 10,
            minBalancePolicy: null,
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;
  if (state.balance <= 0 && !state.vipActive) return null;

  return (
    <InvestorPolicyBanners
      investmentBalance={state.balance}
      vipActive={state.vipActive}
      vipDailyYieldPercent={state.vipYield}
      minBalancePolicy={state.minBalancePolicy}
    />
  );
}
