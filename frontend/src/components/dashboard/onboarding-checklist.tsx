"use client";

import Link from "next/link";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { OnboardingStatus } from "@/lib/api";

const STEPS = [
  {
    key: "emailVerified" as const,
    label: "Verify email",
    href: "/settings",
    action: "Check inbox",
  },
  {
    key: "registrationPaid" as const,
    label: "Pay registration (5 USDT)",
    href: "/dashboard",
    action: "Pay now",
  },
  {
    key: "accountActive" as const,
    label: "Activate virtual account",
    href: "/dashboard",
    action: "View status",
  },
  {
    key: "profileComplete" as const,
    label: "Complete profile",
    href: "/settings",
    action: "Edit profile",
  },
  {
    key: "addressComplete" as const,
    label: "Add address",
    href: "/settings",
    action: "Add address",
  },
  {
    key: "kycApproved" as const,
    label: "Verify identity (KYC)",
    href: "/settings",
    action: "Submit KYC",
  },
  {
    key: "hasSubmittedSignal" as const,
    label: "Submit first signal",
    href: "/submit",
    action: "Submit setup",
  },
];

function normalizeOnboarding(onboarding: OnboardingStatus) {
  return {
    emailVerified: onboarding.emailVerified,
    registrationPaid: onboarding.registrationPaid,
    accountActive: onboarding.accountActive,
    profileComplete: onboarding.profileComplete,
    addressComplete: onboarding.addressComplete,
    kycApproved: onboarding.kycStatus === "APPROVED",
    hasSubmittedSignal: onboarding.hasSubmittedSignal,
  };
}

export function OnboardingChecklist({
  onboarding,
  onPayRegistration,
  payLoading,
}: {
  onboarding: OnboardingStatus;
  onPayRegistration?: () => void;
  payLoading?: boolean;
}) {
  const state = normalizeOnboarding(onboarding);
  const completed = STEPS.filter((s) => {
    if (s.key === "kycApproved") return state.kycApproved;
    return state[s.key];
  }).length;

  if (completed === STEPS.length) return null;

  return (
    <Card className="mb-6 border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Get started</CardTitle>
        <CardDescription>
          Complete these steps to unlock full platform access and payouts ({completed}/{STEPS.length})
        </CardDescription>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(completed / STEPS.length) * 100}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {STEPS.map((step) => {
          const done =
            step.key === "kycApproved"
              ? state.kycApproved
              : state[step.key];
          const isKycPending =
            step.key === "kycApproved" && onboarding.kycStatus === "PENDING";

          return (
            <div
              key={step.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-muted" />
                )}
                <div>
                  <p
                    className={`text-sm font-medium ${done ? "text-muted line-through" : "text-foreground"}`}
                  >
                    {step.label}
                  </p>
                  {isKycPending && (
                    <p className="text-xs text-rank-gold">Under review</p>
                  )}
                </div>
              </div>
              {!done && !isKycPending && (
                step.key === "registrationPaid" && onPayRegistration ? (
                  <Button size="sm" onClick={onPayRegistration} disabled={payLoading}>
                    {payLoading ? "..." : step.action}
                  </Button>
                ) : (
                  <Link href={step.href}>
                    <Button size="sm" variant="secondary" className="gap-1">
                      {step.action}
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </Link>
                )
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
