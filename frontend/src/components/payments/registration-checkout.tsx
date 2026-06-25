"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RegistrationPaymentPanel } from "@/components/payments/registration-payment-panel";
import { PromoCodeForm } from "@/components/payments/promo-code-form";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

export function RegistrationCheckout({
  onComplete,
  compact = false,
}: {
  onComplete?: () => void;
  compact?: boolean;
}) {
  const [showPay, setShowPay] = useState(false);
  const [showPromo, setShowPromo] = useState(false);

  return (
    <div className={cn("space-y-3", !compact && "mt-2")}>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={showPay ? "default" : "secondary"}
          onClick={() => {
            setShowPay((v) => !v);
            setShowPromo(false);
          }}
        >
          Pay 5 USDT
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
