"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";

/** Evaluations are temporarily hidden. */
export default function EvaluationsPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    router.replace(token ? "/dashboard" : "/");
  }, [router, token]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
