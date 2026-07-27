"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** TP Claims UI removed from the product surface — redirect old bookmarks. */
export default function TpClaimsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
      Redirecting…
    </div>
  );
}
