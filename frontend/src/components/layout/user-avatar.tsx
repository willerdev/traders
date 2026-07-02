"use client";

import { cn } from "@/lib/utils";

function initials(name?: string | null) {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function UserAvatar({
  name,
  src,
  size = "md",
  className,
}: {
  name?: string | null;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim =
    size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs";

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ? `${name} avatar` : "Profile"}
        className={cn(
          "shrink-0 rounded-full object-cover ring-2 ring-primary/30",
          dim,
          className,
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/20 font-semibold text-primary ring-2 ring-primary/25",
        dim,
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
