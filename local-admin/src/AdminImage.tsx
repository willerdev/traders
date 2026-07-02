import { useEffect, useState } from "react";
import { getToken } from "./api";

function setupFilename(url: string): string | null {
  const match = url.match(/\/uploads\/setups\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

function kycFetchPath(url: string): string | null {
  const match = url.match(/\/uploads\/kyc\/([^/?#]+)/i);
  return match ? `/api/v1/uploads/kyc/${match[1]}` : null;
}

/** Load setup/KYC images through the proxied API with admin auth. */
export function AdminImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setDisplaySrc(null);
      setFailed(false);
      return;
    }

    let revoked: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const token = getToken();
        const setup = setupFilename(src);
        const fetchPath = setup
          ? `/api/v1/admin/uploads/setups/${encodeURIComponent(setup)}`
          : kycFetchPath(src);

        if (fetchPath) {
          const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
          let res: Response | null = null;

          if (setup) {
            const encoded = encodeURIComponent(setup);
            res = await fetch(`/uploads/setups/${encoded}`);
            if (!res.ok) {
              res = await fetch(`/api/v1/uploads/setups/${encoded}`);
            }
            if (!res.ok) {
              res = await fetch(`/api/v1/admin/uploads/setups/${encoded}`, { headers });
            }
          } else {
            const kycName = kycFetchPath(src)?.split("/").pop();
            if (kycName) {
              res = await fetch(`/api/v1/admin/uploads/kyc/${kycName}`, { headers });
              if (!res.ok) {
                res = await fetch(`/api/v1/uploads/kyc/${kycName}`, { headers });
              }
            }
          }

          if (!res?.ok) throw new Error("Failed to load image");
          const blob = await res.blob();
          revoked = URL.createObjectURL(blob);
          if (!cancelled) {
            setDisplaySrc(revoked);
            setFailed(false);
          }
          return;
        }

        // Public static path — same-origin via /uploads proxy
        let path = src;
        try {
          const parsed = new URL(src);
          path = parsed.pathname;
        } catch {
          /* keep relative */
        }
        if (!cancelled) {
          setDisplaySrc(path);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setDisplaySrc(null);
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [src]);

  if (failed || !displaySrc) {
    return (
      <div className={className ?? "admin-image-fallback"} aria-label={alt} role="img">
        <span>
          {failed
            ? "Image unavailable — ask the trader to re-upload (file lost before persistent storage)"
            : "Loading…"}
        </span>
      </div>
    );
  }

  return <img src={displaySrc} alt={alt} className={className} />;
}
