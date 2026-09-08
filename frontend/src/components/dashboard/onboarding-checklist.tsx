"use client";

import Link from "next/link";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { OnboardingStatus } from "@/lib/api";

const INVEST_STEPS = [
  {
    key: "accountActive" as const,
    label: "Open Smart Invest and allocate capital",
    href: "/invest",
    action: "Open Invest",
  },
];

function normalizeOnboarding(onboarding: OnboardingStatus) {
  return {
    accountActive: onboarding.accountActive,
    hasSubmittedSignal: onboarding.hasSubmittedSignal,
    emailVerified: onboarding.emailVerified,
  };
}

export function OnboardingChecklist({
  onboarding,
}: {
  onboarding: OnboardingStatus;
  onComplete?: () => void;
}) {
  const state = normalizeOnboarding(onboarding);
  const completed = INVEST_STEPS.filter((s) => state[s.key]).length;

  if (completed === INVEST_STEPS.length) return null;

  return (
    <Card className="mb-6 border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Start investing</CardTitle>
        <CardDescription>
          Allocate capital on Smart Invest to begin earning. KYC is only required
          before withdrawals ({completed}/{INVEST_STEPS.length}).
        </CardDescription>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(completed / INVEST_STEPS.length) * 100}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {INVEST_STEPS.map((step) => {
          const done = state[step.key];

          return (
            <div key={step.key} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-muted" />
                )}
                <p
                  className={`text-sm font-medium ${done ? "text-muted line-through" : "text-foreground"}`}
                >
                  {step.label}
                </p>
              </div>
              {!done && (
                <Link href={step.href}>
                  <Button size="sm" variant="secondary" className="gap-1">
                    {step.action}
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              )}
            </div>
          );
        })}

        {!state.emailVerified && (
          <p className="pt-1 text-xs text-muted">
            Email verification is optional to start investing.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
