"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsSection({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24 space-y-4", className)}>
      <header className="border-b border-[var(--color-border)] pb-3">
        <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

const JUMP_LINKS = [
  { id: "profile", label: "Profile" },
  { id: "money", label: "Money" },
  { id: "verification", label: "KYC" },
  { id: "trading", label: "Trading" },
  { id: "referrals", label: "Referrals" },
  { id: "preferences", label: "App" },
] as const;

export function SettingsJumpNav() {
  return (
    <nav
      aria-label="Settings sections"
      className="-mx-1 overflow-x-auto px-1 pb-1"
    >
      <ul className="flex min-w-max gap-2">
        {JUMP_LINKS.map((link) => (
          <li key={link.id}>
            <a
              href={`#${link.id}`}
              className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
