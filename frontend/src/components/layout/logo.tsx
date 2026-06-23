import { cn } from "@/lib/utils";

export function Logo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("font-bold text-foreground", className)}>
      Trader<span className="text-primary">Rank</span>
      {!compact && " Pro"}
    </span>
  );
}
