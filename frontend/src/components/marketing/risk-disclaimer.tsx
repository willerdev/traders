"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, Scale, ShieldAlert, TrendingDown } from "lucide-react";

const POINTS = [
  {
    icon: TrendingDown,
    title: "Capital at risk",
    body: "Trading, investing, and virtual funded accounts can lose value. You may lose some or all of the capital you deposit or allocate.",
  },
  {
    icon: ShieldAlert,
    title: "No guaranteed returns",
    body: "Displayed yields, leaderboard results, and past payouts are illustrative only. They do not promise future performance or profit.",
  },
  {
    icon: AlertTriangle,
    title: "Not financial advice",
    body: "TraderRank Pro does not provide investment, tax, or legal advice. You are solely responsible for your allocation and withdrawal decisions.",
  },
  {
    icon: Scale,
    title: "Regulatory notice",
    body: "Services may not be available in all jurisdictions. Crypto transfers carry network and counterparty risks outside our control.",
  },
] as const;

export function HeroRiskNotice() {
  return (
    <p className="mt-4 max-w-lg rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs leading-relaxed text-amber-200/90">
      <strong className="font-semibold text-amber-100">Risk notice:</strong>{" "}
      Capital is at risk. Yields and payouts are not guaranteed. Read the{" "}
      <a href="#disclosures" className="text-primary hover:underline">
        disclosures
      </a>{" "}
      and{" "}
      <Link href="/terms#risk" className="text-primary hover:underline">
        full terms
      </Link>{" "}
      before you deposit.
    </p>
  );
}

export function RiskDisclaimerSection() {
  return (
    <section
      id="disclosures"
      className="relative mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:px-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-2xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          Disclosures
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Terms, risk &amp; disclaimers
        </h2>
        <p className="mt-4 text-lg text-gray-400">
          Please read this before depositing or allocating capital on Smart
          Invest.
        </p>
      </motion.div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {POINTS.map((point, i) => {
          const Icon = point.icon;
          return (
            <motion.div
              key={point.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{
                delay: 0.06 * i,
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-6"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <h3 className="text-lg font-semibold text-white">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                {point.body}
              </p>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-5 text-sm leading-relaxed text-gray-400"
      >
        <p>
          By using TraderRank Pro you agree to our{" "}
          <Link href="/terms" className="text-primary hover:underline">
            Terms &amp; Conditions
          </Link>
          , including preferred withdrawal schedules, off-schedule penalties,
          fees, and KYC requirements for payouts. Virtual account tiers and
          leaderboard rankings do not constitute a securities offering or
          deposit guarantee.
        </p>
        <p className="mt-3">
          Third-party payment networks may charge separate fees or experience
          delays. We are not a bank, broker-dealer, or licensed investment
          adviser in any jurisdiction unless explicitly stated in writing.
        </p>
      </motion.div>
    </section>
  );
}
