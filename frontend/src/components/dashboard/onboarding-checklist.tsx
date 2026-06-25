"use client";

import Link from "next/link";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RegistrationCheckout } from "@/components/payments/registration-checkout";
import type { OnboardingStatus } from "@/lib/api";

const TRADING_STEPS = [
  {
    key: "registrationPaid" as const,
    label: "Pay registration fee (5 USDT)",
    href: "/dashboard",
    action: "Pay now",
  },
  {
    key: "hasSubmittedSignal" as const,
    label: "Submit your first setup",
    href: "/submit",
    action: "Submit setup",
  },
];

function normalizeOnboarding(onboarding: OnboardingStatus) {
  return {
    registrationPaid: onboarding.registrationPaid,
    accountActive: onboarding.accountActive,
    hasSubmittedSignal: onboarding.hasSubmittedSignal,
    emailVerified: onboarding.emailVerified,
  };
}

export function OnboardingChecklist({
  onboarding,
  onComplete,
}: {
  onboarding: OnboardingStatus;
  onComplete?: () => void;
}) {
  const state = normalizeOnboarding(onboarding);
  const completed = TRADING_STEPS.filter((s) => state[s.key]).length;

  if (completed === TRADING_STEPS.length) return null;

  return (
    <Card className="mb-6 border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Start trading</CardTitle>
        <CardDescription>
          Pay registration to unlock setup submission. Identity verification is only
          required when you request a payout ({completed}/{TRADING_STEPS.length}).
        </CardDescription>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(completed / TRADING_STEPS.length) * 100}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {TRADING_STEPS.map((step) => {
          const done = state[step.key];
          const isRegistration = step.key === "registrationPaid";

          return (
            <div key={step.key} className="space-y-0">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2.5">
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
                {!done && !isRegistration && (
                  <Link href={step.href}>
                    <Button size="sm" variant="secondary" className="gap-1">
                      {step.action}
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </Link>
                )}
              </div>
              {isRegistration && !done && (
                <RegistrationCheckout onComplete={onComplete} compact />
              )}
            </div>
          );
        })}

        {!state.emailVerified && (
          <p className="pt-1 text-xs text-muted">
            Email verification is optional for trading.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
