"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { Tag } from "lucide-react";

export function PromoCodeForm({ onSuccess }: { onSuccess?: () => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const result = await api.payments.applyPromo(code.trim());
      if (result.alreadyPaid) {
        setSuccess("Registration already complete.");
      } else {
        setSuccess(result.message || "Promo applied successfully.");
      }
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid promo code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleApply} className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Tag className="h-4 w-4 shrink-0 text-primary" />
        <span>Enter the invite code you received from TraderRank.</span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1 space-y-1">
          <Label htmlFor="promo-code" className="sr-only">
            Invite code
          </Label>
          <Input
            id="promo-code"
            placeholder="Invite code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="uppercase"
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={loading || !code.trim()}>
          {loading ? "Applying…" : "Apply code"}
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {success && <p className="text-sm text-success">{success}</p>}
    </form>
  );
}
