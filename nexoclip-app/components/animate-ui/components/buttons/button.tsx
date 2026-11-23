"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45f2] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default: "bg-[#5b45f2] text-white hover:bg-[#4731d8]",
        dark: "bg-[#14141f] text-white hover:bg-[#242436]",
        outline: "border border-[#e6e5f0] bg-white text-[#14141f] hover:border-[#cbc6f5] hover:bg-[#f6f5fd]",
        ghost: "bg-transparent text-inherit hover:bg-black/5",
        subtle: "bg-[#f2f0ff] text-[#4731d8] hover:bg-[#e7e3ff]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-sm",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface AnimatedButtonProps
  extends Omit<HTMLMotionProps<"button">, "ref">,
    VariantProps<typeof buttonVariants> {
  hoverScale?: number;
  tapScale?: number;
}

const Button = React.forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  (
    {
      className,
      variant,
      size,
      hoverScale = 1.03,
      tapScale = 0.96,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const prefersReducedMotion = useReducedMotion();

    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={disabled}
        whileHover={
          disabled || prefersReducedMotion ? undefined : { scale: hoverScale }
        }
        whileTap={
          disabled || prefersReducedMotion ? undefined : { scale: tapScale }
        }
        transition={{
          type: "spring",
          stiffness: 420,
          damping: 26,
          mass: 0.7,
        }}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { Button, buttonVariants };
export default Button;
