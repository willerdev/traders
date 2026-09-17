"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type FlutterwavePublicConfig = {
  enabled: boolean;
  currency: string;
  countryCode: string;
  usdRate: number;
  minDepositUsd: number;
  networks: Array<{ id: string; label: string }>;
};

export function MomoPaymentFields({
  phone,
  onPhoneChange,
  network,
  onNetworkChange,
  config,
  className,
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  network: string;
  onNetworkChange: (value: string) => void;
  config: FlutterwavePublicConfig | null;
  className?: string;
}) {
  const networks = config?.networks ?? [
    { id: "MTN", label: "MTN MoMo" },
    { id: "AIRTEL", label: "Airtel Money" },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          Mobile network
        </p>
        <div className="grid grid-cols-2 gap-2">
          {networks.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onNetworkChange(n.id)}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                network === n.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-[var(--color-border)] text-muted hover:border-primary/40",
              )}
            >
              {n.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          MoMo phone number
        </p>
        <div className="flex gap-2">
          <span className="flex h-10 items-center rounded-lg border border-[var(--color-border)] bg-white/5 px-3 text-sm text-muted">
            +{config?.countryCode ?? "256"}
          </span>
          <Input
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, ""))}
            placeholder="7XXXXXXXX"
            inputMode="numeric"
            className="flex-1"
          />
        </div>
        <p className="mt-1 text-[10px] text-muted">
          You will receive a prompt on this number to approve with your PIN.
        </p>
      </div>
    </div>
  );
}

export function formatLocalAmount(usd: number, rate: number, currency: string) {
  const local = Math.ceil(usd * rate);
  return `${local.toLocaleString()} ${currency}`;
}
