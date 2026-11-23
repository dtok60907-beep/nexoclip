"use client";

import * as React from "react";
import { useMotionValue, useSpring, useReducedMotion } from "motion/react";

export interface SlidingNumberProps {
  value: number;
  formatter?: (val: number) => string;
  className?: string;
  duration?: number;
}

const defaultFormatter = (val: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(val);

/**
 * Animate UI-inspired spring-interpolated numeric readout.
 * Smoothly animates between numeric values with tabular numerals
 * and respects prefers-reduced-motion.
 */
export function SlidingNumber({
  value,
  formatter = defaultFormatter,
  className = "",
}: SlidingNumberProps) {
  const prefersReducedMotion = useReducedMotion();
  const safeTarget = Number.isFinite(Number(value)) ? Number(value) : 0;
  const motionValue = useMotionValue(prefersReducedMotion ? safeTarget : 0);
  const spring = useSpring(motionValue, {
    stiffness: 180,
    damping: 26,
    mass: 0.75,
  });

  const [display, setDisplay] = React.useState<string>(() =>
    formatter(prefersReducedMotion ? safeTarget : 0),
  );

  React.useEffect(() => {
    if (prefersReducedMotion) {
      motionValue.jump(safeTarget);
      setDisplay(formatter(safeTarget));
      return;
    }
    motionValue.set(safeTarget);
  }, [safeTarget, prefersReducedMotion, motionValue, formatter]);

  React.useEffect(() => {
    if (prefersReducedMotion) return undefined;
    const unsub = spring.on("change", (latest) => {
      const snapped = Math.abs(latest - safeTarget) < 0.02 ? safeTarget : latest;
      setDisplay(formatter(snapped));
    });
    return unsub;
  }, [spring, formatter, safeTarget, prefersReducedMotion]);

  return (
    <span className={`tabular-nums ${className}`.trim()}>
      {display}
    </span>
  );
}

export default SlidingNumber;
