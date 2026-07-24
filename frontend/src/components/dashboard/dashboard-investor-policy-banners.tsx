"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { InvestorPolicyBanners } from "@/components/investor/investor-policy-banners";

/** Loads investor status and shows policy banners on the main dashboard. */
export function DashboardInvestorPolicyBanners() {
  const [state, setState] = useState<{
    balance: number;
    vipActive: boolean;
    vipYield: number;
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
        });
      })
      .catch(() => {
        if (!cancelled) setState({ balance: 0, vipActive: false, vipYield: 10 });
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
    />
  );
}
