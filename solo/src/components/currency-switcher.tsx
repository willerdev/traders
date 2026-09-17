"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type DisplayCurrencyInfo } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  displayCurrency?: DisplayCurrencyInfo | null;
  onChanged?: () => void | Promise<void>;
  className?: string;
  size?: "sm" | "default";
};

export function CurrencySwitcher({
  displayCurrency,
  onChanged,
  className,
  size = "sm",
}: Props) {
  const [saving, setSaving] = useState(false);
  const localCode = displayCurrency?.localCurrencyCode?.toUpperCase() || null;
  const showingLocal =
    Boolean(localCode) &&
    displayCurrency?.code?.toUpperCase() === localCode;
  const showingUsdt =
    !displayCurrency ||
    displayCurrency.code === "USDT" ||
    (displayCurrency.source === "fallback" &&
      displayCurrency.code === "USDT");

  async function setMode(mode: "USDT" | "LOCAL") {
    if (saving) return;
    if (mode === "LOCAL" && !localCode) return;
    setSaving(true);
    try {
      await api.users.updateCurrency(mode === "USDT" ? "USDT" : "LOCAL");
      await onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5",
        className,
      )}
    >
      <Button
        type="button"
        size={size}
        variant={showingUsdt ? "default" : "ghost"}
        className={cn(
          "h-7 px-2.5 text-xs",
          !showingUsdt && "text-gray-400 hover:text-white",
        )}
        disabled={saving}
        onClick={() => void setMode("USDT")}
      >
        USDT
      </Button>
      <Button
        type="button"
        size={size}
        variant={showingLocal ? "default" : "ghost"}
        className={cn(
          "h-7 px-2.5 text-xs",
          !showingLocal && "text-gray-400 hover:text-white",
        )}
        disabled={saving || !localCode}
        title={
          localCode
            ? `Show amounts in ${localCode}`
            : "Set your country in Settings to enable local currency"
        }
        onClick={() => void setMode("LOCAL")}
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          localCode || "Local"
        )}
      </Button>
    </div>
  );
}
