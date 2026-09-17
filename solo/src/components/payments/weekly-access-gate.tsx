"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RegistrationCheckout } from "@/components/payments/registration-checkout";

export function WeeklyAccessGate({
  onComplete,
  title = "Weekly access required",
  description = "Pay 5 USDT for 7 trading days to submit setups and use MT5. Access unlocks automatically when payment confirms.",
  renewal = false,
}: {
  onComplete?: () => void;
  title?: string;
  description?: string;
  renewal?: boolean;
}) {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <RegistrationCheckout renewal={renewal} onComplete={onComplete} />
      </CardContent>
    </Card>
  );
}
