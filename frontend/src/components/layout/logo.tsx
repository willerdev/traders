import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

export function Logo({
  className,
  compact = false,
  sidebar = false,
}: {
  className?: string;
  compact?: boolean;
  /** Collapsed sidebar: icon mark; expands to full wordmark on hover */
  sidebar?: boolean;
}) {
  if (sidebar) {
    return (
      <>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            "bg-primary/15 text-primary ring-1 ring-primary/25",
            className,
          )}
          aria-hidden
        >
          <TrendingUp className="h-5 w-5" strokeWidth={2.5} />
        </span>
        <span
          className={cn(
            "ml-3 overflow-hidden whitespace-nowrap font-bold text-foreground transition-all duration-300",
            "max-w-0 opacity-0",
            "group-hover/sidebar:max-w-[11rem] group-hover/sidebar:opacity-100",
            "group-focus-within/sidebar:max-w-[11rem] group-focus-within/sidebar:opacity-100",
          )}
        >
          Trader<span className="text-primary">Rank</span> Pro
        </span>
      </>
    );
  }

  if (compact) {
    return (
      <span className={cn("font-bold text-foreground", className)}>
        Trader<span className="text-primary">Rank</span>
      </span>
    );
  }

  return (
    <span className={cn("font-bold text-foreground", className)}>
      Trader<span className="text-primary">Rank</span> Pro
    </span>
  );
}
