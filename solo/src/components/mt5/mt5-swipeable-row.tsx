"use client";

import {
  type ReactNode,
  type TouchEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export type Mt5SwipeAction = {
  key: string;
  label: string;
  onClick: () => void;
  tone?: "danger" | "primary" | "neutral";
  disabled?: boolean;
};

const ACTION_WIDTH = 76;

export function Mt5SwipeableRow({
  children,
  actions,
  className,
}: {
  children: ReactNode;
  actions: Mt5SwipeAction[];
  className?: string;
}) {
  const panelWidth = actions.length * ACTION_WIDTH;
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const tracking = useRef(false);
  const horizontal = useRef(false);

  const snap = useCallback(
    (nextOffset: number) => {
      const shouldOpen = nextOffset <= -panelWidth / 3;
      setOpen(shouldOpen);
      setOffset(shouldOpen ? -panelWidth : 0);
    },
    [panelWidth],
  );

  const onTouchStart = (e: TouchEvent) => {
    if (actions.length === 0) return;
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    startOffset.current = open ? -panelWidth : offset;
    tracking.current = true;
    horizontal.current = false;
    setDragging(false);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!tracking.current || actions.length === 0) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;

    if (!horizontal.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      horizontal.current = Math.abs(dx) > Math.abs(dy);
      if (!horizontal.current) {
        tracking.current = false;
        return;
      }
    }

    setDragging(true);
    const next = Math.min(0, Math.max(-panelWidth, startOffset.current + dx));
    setOffset(next);
  };

  const onTouchEnd = () => {
    if (!tracking.current) return;
    tracking.current = false;
    if (horizontal.current) snap(offset);
    setDragging(false);
  };

  const close = () => {
    setOpen(false);
    setOffset(0);
  };

  if (actions.length === 0) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={cn("relative overflow-hidden md:overflow-visible", className)}>
      <div
        className="absolute inset-y-0 right-0 flex md:hidden"
        aria-hidden={!open}
      >
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            disabled={action.disabled}
            onClick={() => {
              close();
              action.onClick();
            }}
            className={cn(
              "flex w-[76px] flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold uppercase leading-tight tracking-wide disabled:opacity-40",
              action.tone === "danger" && "bg-[#ff5252] text-white",
              action.tone === "primary" && "bg-[#4a9eff] text-white",
              action.tone !== "danger" &&
                action.tone !== "primary" &&
                "bg-[var(--mt5-row-hover)] text-[var(--mt5-text)]",
            )}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "relative bg-[var(--mt5-bg)] md:transform-none",
          !dragging && "transition-transform duration-200 ease-out",
        )}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
