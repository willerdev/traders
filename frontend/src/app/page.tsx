"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Tag, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecentPayoutsShowcase } from "@/components/marketing/recent-payouts-showcase";
import { InvestmentRules } from "@/components/marketing/investment-rules";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

type FeaturedPromo = {
  code: string;
  discountPercent: number;
  originalAmount: number;
  finalAmount: number;
};

const FLOW = [
  {
    step: "01",
    title: "Deposit",
    body: "Fund your wallet with USDT. Capital stays under your account until you allocate.",
  },
  {
    step: "02",
    title: "Invest",
    body: "Move funds into Smart Invest, pay the tiered enrollment fee, and set your size.",
  },
  {
    step: "03",
    title: "Earn daily",
    body: "Eligible balance earns daily yield after the 24-hour hold — credited around 16:00.",
  },
  {
    step: "04",
    title: "Withdraw or compound",
    body: "Cash out to a saved wallet after KYC, or turn on auto-reinvest to compound.",
  },
] as const;

export default function HomePage() {
  const [promo, setPromo] = useState<FeaturedPromo | null>(null);
  const isLoggedIn = Boolean(useAuthStore((s) => s.token));

  const primaryHref = isLoggedIn ? "/invest" : "/register";
  const primaryLabel = isLoggedIn ? "Open Invest" : "Start with an invite";

  useEffect(() => {
    api.payments
      .featuredPromo()
      .then((res) => setPromo(res.promo))
      .catch(() => setPromo(null));
  }, []);

  return (
    <div className="relative overflow-hidden">
      {/* Full-bleed atmospheric plane */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <motion.div
          className="gradient-orb absolute -top-32 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 bg-primary/25 sm:h-[36rem] sm:w-[36rem]"
          animate={{ opacity: [0.45, 0.7, 0.45], scale: [1, 1.06, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="gradient-orb absolute top-[40%] -right-24 h-72 w-72 bg-cyan-500/10"
          animate={{ opacity: [0.25, 0.45, 0.25], x: [0, -12, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,var(--background)_70%)]" />
      </div>

      {/* Hero — brand, one headline, one line, one CTA group */}
      <section className="relative mx-auto flex min-h-[min(92vh,900px)] max-w-7xl flex-col justify-center px-4 pb-16 pt-20 sm:px-6 sm:pb-24 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-3xl"
        >
          {promo && (
            <p className="mb-6 inline-flex flex-wrap items-center gap-2 text-sm text-gray-400">
              <Tag className="h-3.5 w-3.5 text-rank-gold" />
              <span className="text-rank-gold">
                {promo.discountPercent}% off
              </span>
              <span>
                with code{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs uppercase text-white">
                  {promo.code}
                </code>
              </span>
            </p>
          )}

          <p className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
            Trader<span className="text-primary">Rank</span> Pro
          </p>
          <p className="mt-1 text-sm font-medium uppercase tracking-[0.22em] text-gray-500">
            Trade Guard · Smart Invest
          </p>

          <h1 className="mt-8 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Put capital to work.
            <span className="mt-1 block text-gradient">Earn daily yield.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-400">
            Smart Invest credits eligible USDT daily to your wallet — clear fees,
            a 24-hour hold on new capital, and withdrawals after KYC.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={primaryHref}>
              <Button size="lg" className="w-full gap-2 sm:w-auto">
                {primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            {!isLoggedIn && (
              <Link href="/login">
                <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                  Sign in
                </Button>
              </Link>
            )}
            {isLoggedIn && (
              <Link href="/wallet">
                <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                  Wallet
                </Button>
              </Link>
            )}
          </div>

          <p className="mt-6 flex items-center gap-1.5 text-sm text-gray-500">
            <Wallet className="h-4 w-4 shrink-0" />
            USDT deposits &amp; withdrawals via NOWPayments
          </p>
        </motion.div>
      </section>

      {/* How returns work */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            How returns work
          </h2>
          <p className="mt-3 max-w-xl text-gray-400">
            Four steps from deposit to daily credit — no competition ladder.
          </p>
        </motion.div>

        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((item, i) => (
            <motion.li
              key={item.step}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.08 * i, duration: 0.45 }}
              className="relative"
            >
              <span className="font-mono text-xs font-semibold tracking-widest text-primary/80">
                {item.step}
              </span>
              <h3 className="mt-2 text-lg font-semibold text-white">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                {item.body}
              </p>
            </motion.li>
          ))}
        </ol>
      </section>

      <InvestmentRules />

      <RecentPayoutsShowcase />

      {/* Closed invite CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-transparent to-cyan-500/5 px-8 py-14 text-center sm:px-12"
        >
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Start investing with an invite
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-gray-400">
            Registrations are referral-only. Ask a current member for their invite
            link, then enroll in Smart Invest from your account.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register">
              <Button size="lg" className="gap-2">
                How to join
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="secondary">
                Sign in
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Direct public registration is disabled
          </p>
        </motion.div>
      </section>
    </div>
  );
}
