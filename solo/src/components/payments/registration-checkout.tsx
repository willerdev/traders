"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RegistrationPaymentPanel } from "@/components/payments/registration-payment-panel";
import { PromoCodeForm } from "@/components/payments/promo-code-form";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";

export function RegistrationCheckout({
  onComplete,
  compact = false,
  renewal = false,
}: {
  onComplete?: () => void;
  compact?: boolean;
  /** True when renewing weekly access after expiry */
  renewal?: boolean;
}) {
  const [showPay, setShowPay] = useState(false);
  const [showPromo, setShowPromo] = useState(false);

  return (
    <div className={cn("space-y-3", !compact && "mt-2")}>
      <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Crypto payments are working properly again — choose your network,
          generate an address, and access activates once your transfer confirms.
        </span>
      </div>
      <p className="text-sm text-muted">
        {renewal
          ? "Your 7-day trading window ended. Pay again to unlock Submit and MT5 for another week."
          : "Pay weekly for 7 trading days — submit setups and use MT5. Access activates automatically once payment confirms."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={showPay ? "default" : "secondary"}
          onClick={() => {
            setShowPay((v) => !v);
            setShowPromo(false);
          }}
        >
          {renewal ? "Renew 7 days · 5 USDT" : "Pay 5 USDT · 7 days"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1 text-muted"
          onClick={() => {
            setShowPromo((v) => !v);
            setShowPay(false);
          }}
        >
          Have an invite code?
          {showPromo ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {showPay && (
        <RegistrationPaymentPanel
          renewal={renewal}
          onComplete={() => {
            setShowPay(false);
            onComplete?.();
          }}
        />
      )}

      {showPromo && (
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <PromoCodeForm
            onSuccess={() => {
              setShowPromo(false);
              onComplete?.();
            }}
          />
        </div>
      )}
    </div>
  );
}
