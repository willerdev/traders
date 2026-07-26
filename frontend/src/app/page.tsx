"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  animate,
} from "framer-motion";
import { ArrowRight, ArrowDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecentPayoutsShowcase } from "@/components/marketing/recent-payouts-showcase";
import { InvestmentRules } from "@/components/marketing/investment-rules";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";

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
    body: "Fund your wallet with USDT. Capital stays yours until you allocate.",
  },
  {
    step: "02",
    title: "Invest",
    body: "Move into Smart Invest, pay the tiered fee, and set your size.",
  },
  {
    step: "03",
    title: "Earn daily",
    body: "After the 24-hour hold, eligible balance earns yield ~16:00 Kampala.",
  },
  {
    step: "04",
    title: "Withdraw",
    body: "Cash out after KYC — or auto-reinvest 90% and keep compounding.",
  },
] as const;

function AnimatedYield() {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!ref.current || shown) return;
    const el = ref.current;
    const controls = animate(0, 8, {
      duration: 1.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = v.toFixed(1);
      },
    });
    setShown(true);
    return () => controls.stop();
  }, [shown]);

  return (
    <span ref={ref} className="tabular-nums">
      0.0
    </span>
  );
}

function YieldCurveVisual() {
  const pathLength = useMotionValue(0);
  const spring = useSpring(pathLength, { stiffness: 40, damping: 28 });

  useEffect(() => {
    const controls = animate(pathLength, 1, {
      duration: 2.4,
      ease: [0.22, 1, 0.36, 1],
      delay: 0.35,
    });
    return () => controls.stop();
  }, [pathLength]);

  return (
    <svg
      viewBox="0 0 640 280"
      className="h-full w-full"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="yieldStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2563EB" stopOpacity="0.2" />
          <stop offset="45%" stopColor="#38BDF8" stopOpacity="1" />
          <stop offset="100%" stopColor="#FBBF24" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="yieldFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563EB" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[40, 90, 140, 190, 240].map((y) => (
        <line
          key={y}
          x1="0"
          x2="640"
          y1={y}
          y2={y}
          stroke="rgba(255,255,255,0.04)"
        />
      ))}
      <motion.path
        d="M0 220 C 80 215, 120 200, 160 185 C 220 160, 260 150, 320 120 C 390 80, 450 70, 520 45 C 560 30, 600 22, 640 18 L 640 280 L 0 280 Z"
        fill="url(#yieldFill)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.5 }}
      />
      <motion.path
        d="M0 220 C 80 215, 120 200, 160 185 C 220 160, 260 150, 320 120 C 390 80, 450 70, 520 45 C 560 30, 600 22, 640 18"
        stroke="url(#yieldStroke)"
        strokeWidth="3"
        strokeLinecap="round"
        style={{ pathLength: spring }}
      />
      <motion.circle
        cx="640"
        cy="18"
        r="6"
        fill="#FBBF24"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 2.2, type: "spring", stiffness: 260, damping: 18 }}
      />
    </svg>
  );
}

export default function HomePage() {
  const [promo, setPromo] = useState<FeaturedPromo | null>(null);
  const isLoggedIn = Boolean(useAuthStore((s) => s.token));
  const heroRef = useRef<HTMLElement>(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroFade = useTransform(scrollYProgress, [0, 0.65], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const curveY = useTransform(scrollYProgress, [0, 1], [0, 60]);

  const glowX = useTransform(mouseX, [0, 1], ["18%", "72%"]);
  const glowY = useTransform(mouseY, [0, 1], ["12%", "48%"]);
  const glowBg = useMotionTemplate`radial-gradient(38rem 28rem at ${glowX} ${glowY}, rgba(37,99,235,0.28), transparent 70%)`;

  const primaryHref = isLoggedIn ? "/invest" : "/register";
  const primaryLabel = isLoggedIn ? "Open Invest" : "Request an invite";

  useEffect(() => {
    api.payments
      .featuredPromo()
      .then((res) => setPromo(res.promo))
      .catch(() => setPromo(null));
  }, []);

  return (
    <div className="relative overflow-hidden">
      {/* HERO */}
      <section
        ref={heroRef}
        className="relative min-h-[min(100svh,960px)]"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          mouseX.set((e.clientX - rect.left) / rect.width);
          mouseY.set((e.clientY - rect.top) / rect.height);
        }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <motion.div
            className="absolute inset-0"
            style={{ background: glowBg }}
          />
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
              maskImage:
                "radial-gradient(ellipse 80% 70% at 50% 30%, black, transparent)",
            }}
          />
          <motion.div
            className="absolute -left-20 top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl"
            animate={{ x: [0, 30, 0], opacity: [0.35, 0.55, 0.35] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-rank-gold/10 blur-3xl"
            animate={{ y: [0, -24, 0], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <motion.div
          style={{ opacity: heroFade, y: heroY }}
          className="mx-auto flex min-h-[min(100svh,960px)] max-w-7xl flex-col px-4 pb-10 pt-16 sm:px-6 sm:pt-20 lg:pb-16"
        >
          <div className="grid flex-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
            <div className="relative z-10 max-w-2xl">
              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="text-[clamp(2.75rem,8vw,5.5rem)] font-extrabold leading-[0.92] tracking-tight text-white"
              >
                Trade
                <span className="text-primary">guard</span>
              </motion.p>

              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.55 }}
                className="mt-3 text-sm font-medium uppercase tracking-[0.28em] text-gray-500"
              >
                Smart Invest by TraderRank Pro
              </motion.p>

              <motion.h1
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                className="mt-8 text-[clamp(1.85rem,4.5vw,3.25rem)] font-bold leading-[1.12] tracking-tight text-white"
              >
                Capital that works
                <span className="block text-gradient">while you sleep.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32, duration: 0.55 }}
                className="mt-5 max-w-lg text-base leading-relaxed text-gray-400 sm:text-lg"
              >
                Daily USDT yield on eligible Smart Invest balance — transparent
                fees, a 24-hour hold on new capital, withdrawals after KYC.
              </motion.p>

              {promo && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="mt-4 text-sm text-rank-gold/90"
                >
                  Limited: {promo.discountPercent}% off with code{" "}
                  <span className="font-mono font-semibold uppercase">
                    {promo.code}
                  </span>
                </motion.p>
              )}

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42, duration: 0.55 }}
                className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
              >
                <Link href={primaryHref}>
                  <Button
                    size="lg"
                    className="group w-full gap-2 sm:w-auto"
                  >
                    {primaryLabel}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <Link href={isLoggedIn ? "/wallet" : "/login"}>
                  <Button
                    size="lg"
                    variant="secondary"
                    className="w-full sm:w-auto"
                  >
                    {isLoggedIn ? "Wallet" : "Sign in"}
                  </Button>
                </Link>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55 }}
                className="mt-6 flex items-center gap-1.5 text-sm text-gray-500"
              >
                <Wallet className="h-4 w-4 shrink-0" />
                USDT in and out via NOWPayments
              </motion.p>
            </div>

            {/* Dominant visual — yield curve + live % */}
            <motion.div
              style={{ y: curveY }}
              className="relative hidden min-h-[280px] lg:block"
            >
              <div className="absolute inset-x-0 top-0 flex items-end justify-between px-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    Platform daily yield
                  </p>
                  <p className="mt-1 text-5xl font-extrabold tracking-tight text-white">
                    <AnimatedYield />
                    <span className="text-2xl text-primary">%</span>
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    VIP up to 10% · weekends included
                  </p>
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 h-[72%]">
                <YieldCurveVisual />
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
            className="mt-8 flex justify-center lg:mt-0"
          >
            <a
              href="#how-it-works"
              className="inline-flex flex-col items-center gap-1 text-xs uppercase tracking-[0.2em] text-gray-500 transition-colors hover:text-gray-300"
            >
              Explore
              <motion.span
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <ArrowDown className="h-4 w-4" />
              </motion.span>
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* Mobile yield strip */}
      <div className="border-y border-white/5 bg-white/[0.02] px-4 py-6 lg:hidden">
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
              Platform daily yield
            </p>
            <p className="mt-1 text-4xl font-extrabold text-white">
              <AnimatedYield />
              <span className="text-xl text-primary">%</span>
            </p>
          </div>
          <p className="max-w-[10rem] text-right text-xs text-gray-500">
            VIP 10% · weekends · $0 withdraw fee
          </p>
        </div>
      </div>

      {/* How it works — animated timeline */}
      <section
        id="how-it-works"
        className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6"
      >
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-2xl"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            The loop
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            From deposit to daily credit
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            One path. No leaderboard ladder. Just capital in motion.
          </p>
        </motion.div>

        <div className="relative mt-16">
          <div className="absolute left-0 right-0 top-[1.15rem] hidden h-px bg-white/10 lg:block" />
          <motion.div
            className="absolute left-0 top-[1.15rem] hidden h-px origin-left bg-gradient-to-r from-primary via-cyan-400 to-rank-gold lg:block"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            style={{ width: "100%" }}
          />

          <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {FLOW.map((item, i) => (
              <motion.li
                key={item.step}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{
                  delay: 0.12 * i,
                  duration: 0.55,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="relative"
              >
                <motion.span
                  className={cn(
                    "mb-5 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#121a2e] font-mono text-xs font-semibold text-white",
                  )}
                  whileInView={{ scale: [0.7, 1.08, 1] }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.15 * i, duration: 0.5 }}
                >
                  {item.step}
                </motion.span>
                <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  {item.body}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      <InvestmentRules />

      <RecentPayoutsShowcase />

      {/* Closing CTA */}
      <section className="relative mx-auto max-w-7xl px-4 pb-28 pt-10 sm:px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[2rem] border border-white/10 px-8 py-16 text-center sm:px-16 sm:py-20"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.25),transparent_65%)]"
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -left-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-cyan-400/20 blur-3xl"
            animate={{ opacity: [0.3, 0.55, 0.3] }}
            transition={{ duration: 5, repeat: Infinity }}
          />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              Closed community
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Invest with an invite
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base text-gray-400 sm:text-lg">
              Ask a member for their referral link, activate your account, and
              put capital on Smart Invest.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
          </div>
        </motion.div>
      </section>
    </div>
  );
}
