"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import {
  useAnimation,
  useReducedMotion,
  type SVGMotionProps,
  type Variants,
} from "motion/react";
import { cn } from "@/lib/utils";

type AnimateIconControls = ReturnType<typeof useAnimation>;

export const staticAnimations = {
  path: {
    initial: { pathLength: 1 },
    animate: {
      pathLength: [0.05, 1],
      transition: { duration: 0.65, ease: "easeInOut" },
    },
  },
  "path-loop": {
    initial: { pathLength: 1 },
    animate: {
      pathLength: [1, 0.05, 1],
      transition: { duration: 1.2, ease: "easeInOut" },
    },
  },
} as const;

type StaticAnimations = keyof typeof staticAnimations;
type TriggerProp<T = string> = boolean | StaticAnimations | T;

export interface AnimateIconContextValue {
  controls: AnimateIconControls | undefined;
  animation: StaticAnimations | string;
  loop: boolean;
  loopDelay: number;
  active: boolean;
  animate?: TriggerProp;
  initialOnAnimateEnd?: boolean;
  completeOnStop?: boolean;
  persistOnAnimateEnd?: boolean;
  delay?: number;
}

const AnimateIconContext = React.createContext<AnimateIconContextValue | null>(null);

export function useAnimateIconContext(): AnimateIconContextValue {
  const context = React.useContext(AnimateIconContext);
  if (!context) {
    return {
      controls: undefined,
      animation: "default",
      loop: false,
      loopDelay: 0,
      active: false,
      animate: undefined,
      initialOnAnimateEnd: false,
      completeOnStop: false,
      persistOnAnimateEnd: false,
      delay: 0,
    };
  }
  return context;
}

export interface AnimateIconProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean;
  animate?: TriggerProp;
  animateOnHover?: TriggerProp;
  animateOnTap?: TriggerProp;
  animation?: StaticAnimations | string;
  loop?: boolean;
  loopDelay?: number;
  initialOnAnimateEnd?: boolean;
  completeOnStop?: boolean;
  persistOnAnimateEnd?: boolean;
  delay?: number;
  children?: React.ReactNode;
}

export function AnimateIcon({
  asChild = true,
  animate = false,
  animateOnHover = false,
  animateOnTap = false,
  animation = "default",
  loop = false,
  loopDelay = 0,
  initialOnAnimateEnd = false,
  completeOnStop = false,
  persistOnAnimateEnd = false,
  delay = 0,
  children,
  onMouseEnter,
  onMouseLeave,
  onPointerDown,
  onPointerUp,
  ...props
}: AnimateIconProps) {
  const controls = useAnimation();
  const prefersReducedMotion = useReducedMotion();
  const [hovered, setHovered] = React.useState(false);
  const [tapped, setTapped] = React.useState(false);

  const isActive = React.useMemo(() => {
    if (prefersReducedMotion) return false;
    if (animate) return true;
    if (animateOnHover && hovered) return true;
    if (animateOnTap && tapped) return true;
    return false;
  }, [prefersReducedMotion, animate, animateOnHover, hovered, animateOnTap, tapped]);

  const resolvedAnimation = React.useMemo(() => {
    if (typeof animate === "string") return animate;
    if (typeof animateOnHover === "string" && hovered) return animateOnHover;
    if (typeof animateOnTap === "string" && tapped) return animateOnTap;
    return animation;
  }, [animate, animateOnHover, hovered, animateOnTap, tapped, animation]);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      if (isActive) {
        if (delay > 0) {
          await new Promise<void>((resolve) => {
            timer = setTimeout(resolve, delay);
          });
        }
        if (cancelled) return;
        await controls.start("animate");
        if (cancelled) return;
        if (initialOnAnimateEnd && !persistOnAnimateEnd) {
          controls.set("initial");
        }
      } else {
        if (!persistOnAnimateEnd) {
          if (completeOnStop) {
            await controls.start("initial");
          } else {
            controls.start("initial");
          }
        }
      }
    };

    run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isActive, controls, delay, initialOnAnimateEnd, persistOnAnimateEnd, completeOnStop]);

  const contextValue = React.useMemo<AnimateIconContextValue>(
    () => ({
      controls,
      animation: resolvedAnimation,
      loop,
      loopDelay,
      active: isActive,
      animate,
      initialOnAnimateEnd,
      completeOnStop,
      persistOnAnimateEnd,
      delay,
    }),
    [
      controls,
      resolvedAnimation,
      loop,
      loopDelay,
      isActive,
      animate,
      initialOnAnimateEnd,
      completeOnStop,
      persistOnAnimateEnd,
      delay,
    ],
  );

  const Comp = asChild ? Slot.Root : "span";

  return (
    <AnimateIconContext.Provider value={contextValue}>
      <Comp
        {...props}
        onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
          setHovered(true);
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
          setHovered(false);
          setTapped(false);
          onMouseLeave?.(e);
        }}
        onPointerDown={(e: React.PointerEvent<HTMLElement>) => {
          setTapped(true);
          onPointerDown?.(e);
        }}
        onPointerUp={(e: React.PointerEvent<HTMLElement>) => {
          setTapped(false);
          onPointerUp?.(e);
        }}
      >
        {children}
      </Comp>
    </AnimateIconContext.Provider>
  );
}

export interface IconProps<T extends string = string>
  extends Omit<SVGMotionProps<SVGSVGElement>, "animate"> {
  size?: number;
  animate?: TriggerProp<T>;
  animateOnHover?: TriggerProp<T>;
  animateOnTap?: TriggerProp<T>;
  animation?: T | StaticAnimations;
  loop?: boolean;
  loopDelay?: number;
  initialOnAnimateEnd?: boolean;
  completeOnStop?: boolean;
  persistOnAnimateEnd?: boolean;
  delay?: number;
}

export function getVariants<V extends Record<string, Record<string, Variants>>>(
  animations: V,
): V[keyof V] {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { animation } = useAnimateIconContext();
  if (animation in animations) {
    return animations[animation as keyof V];
  }
  return animations.default ?? Object.values(animations)[0];
}

export function IconWrapper<T extends string = string>({
  icon: IconComponent,
  size = 18,
  className,
  animate,
  animateOnHover,
  animateOnTap,
  animation = "default",
  loop = false,
  loopDelay = 0,
  initialOnAnimateEnd = false,
  completeOnStop = false,
  persistOnAnimateEnd = false,
  delay = 0,
  ...props
}: IconProps<T> & { icon: React.ComponentType<IconProps<T>> }) {
  const parentContext = React.useContext(AnimateIconContext);
  const hasOwnTrigger =
    animate !== undefined ||
    animateOnHover !== undefined ||
    animateOnTap !== undefined;

  if (parentContext && !hasOwnTrigger) {
    return (
      <IconComponent
        size={size}
        className={cn("od-icon", className)}
        {...(props as IconProps<T>)}
      />
    );
  }

  return (
    <AnimateIcon
      asChild={false}
      animate={animate}
      animateOnHover={animateOnHover}
      animateOnTap={animateOnTap}
      animation={animation}
      loop={loop}
      loopDelay={loopDelay}
      initialOnAnimateEnd={initialOnAnimateEnd}
      completeOnStop={completeOnStop}
      persistOnAnimateEnd={persistOnAnimateEnd}
      delay={delay}
      className="inline-flex items-center justify-center"
    >
      <IconComponent
        size={size}
        className={cn("od-icon", className)}
        {...(props as IconProps<T>)}
      />
    </AnimateIcon>
  );
}
