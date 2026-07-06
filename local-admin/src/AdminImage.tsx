import { useEffect, useState } from "react";
import { getToken } from "./api";
import { ImageLightbox } from "./ImageLightbox";

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
  expandable = true,
}: {
  src: string;
  alt: string;
  className?: string;
  expandable?: boolean;
}) {
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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

  const img = (
    <img
      src={displaySrc}
      alt={alt}
      className={className ?? "admin-image-thumb"}
    />
  );

  if (!expandable) {
    return img;
  }

  return (
    <>
      <button
        type="button"
        className="admin-image-button"
        onClick={() => setLightboxOpen(true)}
        title="Click to view full size"
      >
        {img}
        <span className="admin-image-hint">Click to enlarge</span>
      </button>
      {lightboxOpen && (
        <ImageLightbox
          src={displaySrc}
          alt={alt}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
