"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { InvestorOptOutPanel } from "@/components/investor/investor-opt-out-panel";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { api } from "@/lib/api";

export default function RedeemPage() {
  const { ready } = useRequireAuth();
  const [enrolled, setEnrolled] = useState(false);

  const refreshEnrolled = useCallback(async () => {
    try {
      const s = await api.investor.status();
      setEnrolled(Boolean(s.active));
    } catch {
      setEnrolled(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void refreshEnrolled();
  }, [ready, refreshEnrolled]);

  if (!ready) return <AuthLoadingScreen />;

  return (
    <div className="relative isolate overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-0 h-72 w-72 rounded-full bg-[#800020]/30 blur-[110px]" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-[#5C0A1A]/25 blur-[120px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#5C0A1A]/45 via-white/[0.03] to-transparent" />
      </div>

      <div className="relative mx-auto max-w-lg space-y-4 px-4 py-4 sm:max-w-xl sm:px-6 sm:py-6 xl:max-w-3xl xl:px-8 xl:py-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="xl:flex xl:items-end xl:justify-between"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#E8D4D6]">
              Exit Smart Invest
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white xl:text-3xl">
              Redeem
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-white/75">
              Close Smart Invest through a 5-day procedure. Capital is
              protected; full profits are not guaranteed. Manage deposits and
              partial transfers on{" "}
              <Link
                href="/invest"
                className="text-white underline underline-offset-2"
              >
                Smart Invest
              </Link>
              .
            </p>
          </div>
        </motion.div>

        <InvestorOptOutPanel enrolled={enrolled} onChanged={refreshEnrolled} />
      </div>
    </div>
  );
}
