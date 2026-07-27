"use client";

import { motion } from "framer-motion";
import { Clock, Crown, Lock, Percent, RefreshCw, ShieldCheck } from "lucide-react";
import { DailyCreditTimeText } from "@/components/daily-credit-time-text";

const FEE_TIERS = [
  { range: "$100 – $200", fee: "$10" },
  { range: "$201 – $500", fee: "$50" },
  { range: "$501 – under $1,000", fee: "$100" },
  { range: "$1,000 – $5,000", fee: "$200" },
] as const;

const RULES = [
  {
    icon: Percent,
    title: "Tiered enrollment fee",
    body: "Pay a one-time fee by capital size when you enroll. Your investment then earns daily yield on eligible balance.",
  },
  {
    icon: Clock,
    title: "24-hour yield hold",
    body: "yield-hold",
  },
  {
    icon: Crown,
    title: "VIP upgrade",
    body: "VIP ($20/month) raises default daily yield to 10%, unlocks weekend earnings, and removes wallet withdrawal fees while active.",
  },
  {
    icon: Lock,
    title: "Minimum $500",
    body: "From 27 July 2026, investments below $500 automatically stop earning. Top up on Invest to stay active.",
  },
  {
    icon: RefreshCw,
    title: "Optional auto-reinvest",
    body: "Compound daily earnings into investment: 10% fee on the full daily return, 90% added back to principal. Turn off anytime.",
  },
  {
    icon: ShieldCheck,
    title: "KYC for withdrawals",
    body: "You can enroll and earn without KYC. Identity verification is required only before withdrawing to an external wallet.",
  },
] as const;

export function InvestmentRules() {
  return (
    <section className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-2xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          The rules
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-5xl">
          Clear before you commit capital
        </h2>
        <p className="mt-4 text-lg text-gray-400">
          Live Smart Invest terms — fees, hold period, VIP, and withdrawals.
        </p>
      </motion.div>

      <div className="mt-14 grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {RULES.map((rule, i) => {
          const Icon = rule.icon;
          return (
            <motion.div
              key={rule.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{
                delay: 0.05 * i,
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="group border-t border-white/10 pt-6"
            >
              <div className="mb-4 inline-flex text-primary transition-transform duration-300 group-hover:translate-x-0.5">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <h3 className="text-lg font-semibold text-white">{rule.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                {rule.body === "yield-hold" ? (
                  <>
                    New allocations only earn after funds have been invested for
                    at least 24 hours. Daily credits post{" "}
                    <DailyCreditTimeText variant="around" />.
                  </>
                ) : (
                  rule.body
                )}
              </p>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-16"
      >
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
          Enrollment fee by size
        </h3>
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
          {FEE_TIERS.map((tier, i) => (
            <motion.div
              key={tier.range}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.05 * i }}
              className="bg-[#121a2e] px-5 py-5"
            >
              <p className="text-xs text-gray-500">{tier.range}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-white">
                {tier.fee}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
