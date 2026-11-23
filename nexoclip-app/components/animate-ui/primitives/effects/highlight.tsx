"use client";

import * as React from "react";
import { motion, useReducedMotion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";

type HighlightContextValue = {
  activeValue: string | null;
  setActiveValue: (value: string | null) => void;
  id: string;
  transition: Transition;
  highlightClassName?: string;
  hover: boolean;
};

const HighlightContext = React.createContext<HighlightContextValue | null>(null);

const DEFAULT_SPRING: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 32,
  mass: 0.85,
};

export interface HighlightProps {
  children: React.ReactNode;
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  hover?: boolean;
  className?: string;
  highlightClassName?: string;
  transition?: Transition;
}

export function Highlight({
  children,
  value,
  defaultValue = null,
  onValueChange,
  hover = false,
  className,
  highlightClassName,
  transition = DEFAULT_SPRING,
}: HighlightProps) {
  const reactId = React.useId();
  const [internalValue, setInternalValue] = React.useState<string | null>(
    defaultValue,
  );
  const activeValue = value !== undefined ? value : internalValue;

  const setActiveValue = React.useCallback(
    (next: string | null) => {
      if (value === undefined) setInternalValue(next);
      onValueChange?.(next);
    },
    [value, onValueChange],
  );

  return (
    <HighlightContext.Provider
      value={{
        activeValue,
        setActiveValue,
        id: `nx-highlight-${reactId}`,
        transition,
        highlightClassName,
        hover,
      }}
    >
      <div
        className={cn("relative", className)}
        onMouseLeave={hover ? () => setActiveValue(value ?? null) : undefined}
      >
        {children}
      </div>
    </HighlightContext.Provider>
  );
}

export interface HighlightItemProps {
  value: string;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
  highlightClassName?: string;
}

export function HighlightItem({
  value,
  active,
  children,
  className,
  highlightClassName,
}: HighlightItemProps) {
  const ctx = React.useContext(HighlightContext);
  const prefersReducedMotion = useReducedMotion();
  const isActive = active ?? ctx?.activeValue === value;

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={ctx?.hover ? () => ctx.setActiveValue(value) : undefined}
    >
      {isActive && ctx && (
        <motion.span
          layoutId={ctx.id}
          aria-hidden="true"
          transition={prefersReducedMotion ? { duration: 0 } : ctx.transition}
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[inherit]",
            ctx.highlightClassName,
            highlightClassName,
          )}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
