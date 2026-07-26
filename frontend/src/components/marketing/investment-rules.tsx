"use client";

import { motion } from "framer-motion";
import { Clock, Crown, Lock, Percent, RefreshCw, ShieldCheck } from "lucide-react";

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
    body: "New allocations only earn after funds have been invested for at least 24 hours. Daily credits post around 16:00 Africa/Kampala.",
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
    <section className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-2xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Smart Invest rules
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Clear terms before you put capital to work
        </h2>
        <p className="mt-3 text-base text-gray-400">
          No prop-firm ladder. These are the live rules for daily yield, fees, and
          withdrawals on TraderRank Pro.
        </p>
      </motion.div>

      <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {RULES.map((rule, i) => {
          const Icon = rule.icon;
          return (
            <motion.div
              key={rule.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{
                delay: 0.06 * i,
                duration: 0.45,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <div className="mb-3 inline-flex text-primary">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <h3 className="text-base font-semibold text-white">{rule.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                {rule.body}
              </p>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.45, delay: 0.15 }}
        className="mt-14 border-t border-white/10 pt-10"
      >
        <h3 className="text-sm font-semibold text-white">Enrollment fee by size</h3>
        <p className="mt-1 text-sm text-gray-500">
          One-time fee deducted when you start Smart Invest
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FEE_TIERS.map((tier) => (
            <div
              key={tier.range}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
            >
              <p className="text-xs text-gray-500">{tier.range}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                {tier.fee}
              </p>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
