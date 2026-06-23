"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PromoCodeForm } from "@/components/payments/promo-code-form";
import { RegistrationPaymentPanel } from "@/components/payments/registration-payment-panel";
import { cn } from "@/lib/utils";

type Panel = "pay" | "promo" | null;

export function RegistrationCheckout({
  onComplete,
  compact = false,
}: {
  onComplete?: () => void;
  compact?: boolean;
}) {
  const [panel, setPanel] = useState<Panel>(null);

  function select(next: Panel) {
    setPanel((current) => (current === next ? null : next));
  }

  return (
    <div className={cn("space-y-3", !compact && "mt-2")}>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={panel === "pay" ? "default" : "secondary"}
          onClick={() => select("pay")}
        >
          Pay 5 USDT
        </Button>
        <Button
          size="sm"
          variant={panel === "promo" ? "default" : "secondary"}
          onClick={() => select("promo")}
        >
          Promo code
        </Button>
      </div>

      {panel === "pay" && (
        <RegistrationPaymentPanel
          onComplete={() => {
            setPanel(null);
            onComplete?.();
          }}
        />
      )}

      {panel === "promo" && (
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <PromoCodeForm
            onSuccess={() => {
              setPanel(null);
              onComplete?.();
            }}
          />
        </div>
      )}
    </div>
  );
}
