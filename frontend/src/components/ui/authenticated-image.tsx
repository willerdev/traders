"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Load API-protected KYC images with the user's bearer token. */
export function AuthenticatedImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setDisplaySrc(null);
      return;
    }

    if (!src.includes("/uploads/kyc/")) {
      setDisplaySrc(src);
      return;
    }

    let revoked: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const path = src.replace(/^https?:\/\/[^/]+/, "");
        const token = api.getToken();
        const res = await fetch(path.startsWith("/") ? path : `/${path}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("Failed to load image");
        const blob = await res.blob();
        revoked = URL.createObjectURL(blob);
        if (!cancelled) setDisplaySrc(revoked);
      } catch {
        if (!cancelled) setDisplaySrc(null);
      }
    })();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [src]);

  if (!displaySrc) {
    return (
      <div
        className={className}
        aria-label={alt}
        role="img"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={displaySrc} alt={alt} className={className} />
  );
}
