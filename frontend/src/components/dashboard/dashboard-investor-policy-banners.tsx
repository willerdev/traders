"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { InvestorPolicyBanners } from "@/components/investor/investor-policy-banners";

/** Loads investor balance and shows policy banners on the main dashboard. */
export function DashboardInvestorPolicyBanners() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.investor
      .status()
      .then((s) => {
        if (cancelled) return;
        const raw = s.investmentBalance ?? s.investmentDeposited ?? 0;
        const n = Number(raw);
        setBalance(Number.isFinite(n) ? n : 0);
      })
      .catch(() => {
        if (!cancelled) setBalance(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (balance == null || balance <= 0) return null;
  return <InvestorPolicyBanners investmentBalance={balance} />;
}
