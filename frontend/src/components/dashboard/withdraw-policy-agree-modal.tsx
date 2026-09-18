"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth";

const STORAGE_PREFIX = "trp-notice-withdraw-reserve-40-60-sep18-v1";

function storageKey(userId: string | undefined) {
  return userId ? `${STORAGE_PREFIX}:${userId}` : STORAGE_PREFIX;
}

export function WithdrawPolicyAgreeModal() {
  const userId = useAuthStore((s) => s.user?.id);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey(userId)) === "1") return;
    } catch {
      /* ignore */
    }
    setOpen(true);
  }, [userId]);

  function agree() {
    try {
      localStorage.setItem(storageKey(userId), "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="modal-overlay fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="withdraw-policy-title"
    >
      <div className="modal-panel flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl border border-white/10 shadow-2xl sm:rounded-2xl">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Required notice
          </p>
          <h2
            id="withdraw-policy-title"
            className="mt-1 text-lg font-semibold text-white"
          >
            Dear TradeGuard User,
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-300">
            <p>
              We sincerely appreciate your patience and understanding during the
              past two weeks while TradeGuard has been under maintenance.
            </p>
            <p>
              We understand that the delay has caused inconvenience, especially
              for users who are waiting to access their funds. We want to assure
              you that our team has been working continuously to improve the
              system and strengthen its stability.
            </p>
            <h3 className="pt-1 text-sm font-semibold text-white">
              Withdrawal Update
            </h3>
            <p>
              As part of the current transition, withdrawals will initially be
              processed according to the available reserve and the updated
              withdrawal policy. Users will receive{" "}
              <strong className="text-white">40%</strong> of the requested
              withdrawal amount, while the remaining{" "}
              <strong className="text-white">60%</strong> will be retained
              within the system reserves as a cost of future reliability.
            </p>
            <p>
              The purpose of maintaining these reserves is to strengthen the
              platform&apos;s ability to handle periods of increased withdrawal
              demand, unexpected technical issues, and other difficult operating
              conditions without putting the entire system under additional
              pressure.
            </p>
            <p>
              We believe that maintaining adequate reserves is an important part
              of building a more sustainable and resilient platform.
            </p>
            <h3 className="pt-1 text-sm font-semibold text-white">
              Moving to Daily Withdrawals
            </h3>
            <p>
              We are also implementing our new withdrawal system, which is
              designed to allow users to request withdrawals on a{" "}
              <strong className="text-white">daily basis</strong>, rather than
              relying on the previous withdrawal schedule.
            </p>
            <p>
              This new system is being introduced to make withdrawals more
              flexible and improve the overall management of user funds and
              platform reserves.
            </p>
            <p>
              We are currently completing the technical implementation, testing,
              and security checks before the new withdrawal process is fully
              activated.
            </p>
            <p>
              We appreciate your patience while we complete this transition. Our
              objective is to return TradeGuard to normal operation with a
              system that is more stable, transparent, and better prepared for
              future challenges.
            </p>
            <p>
              Thank you for your continued patience and for being part of
              TradeGuard.
            </p>
            <p className="text-gray-400">
              Kind regards,
              <br />
              <span className="font-medium text-white">TradeGuard Team</span>
            </p>
          </div>
        </div>
        <div className="shrink-0 border-t border-white/10 px-5 py-4 sm:px-6">
          <Button type="button" className="w-full" onClick={agree}>
            I agree
          </Button>
        </div>
      </div>
    </div>
  );
}
