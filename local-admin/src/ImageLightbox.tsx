import { useEffect } from "react";

type Props = {
  src: string;
  alt: string;
  onClose: () => void;
};

export function ImageLightbox({ src, alt, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="image-lightbox-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="image-lightbox-panel"
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="image-lightbox-toolbar">
          <span className="image-lightbox-title">{alt}</span>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <img src={src} alt={alt} className="image-lightbox-img" />
      </div>
    </div>
  );
}
