"use client";
import * as React from "react";
import { Slot } from "radix-ui";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { LiquidGlass } from "./glass-sidebar-utils/liquid-glass";
import { useActiveIndicator } from "./glass-sidebar-utils/use-active-indicator";
import { AnimateIcon } from "../animate-ui/icons/icon";
import { PanelLeftAnimatedIcon } from "../animate-ui/icons/sidebar-icons";

const SidebarContext = React.createContext({
  collapsed: false,
  setCollapsed: (_value: boolean) => {},
});
export const useGlassSidebar = () => React.useContext(SidebarContext);

export function GlassSidebar({
  collapsed: controlled,
  defaultCollapsed = false,
  onCollapsedChange,
  className,
  children,
  ...props
}: React.ComponentProps<"aside"> & {
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (value: boolean) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [inner, setInner] = React.useState(defaultCollapsed);
  const collapsed = controlled ?? inner;
  const setCollapsed = (value: boolean) => {
    setInner(value);
    onCollapsedChange?.(value);
  };
  const ref = React.useRef<HTMLDivElement>(null);
  const rect = useActiveIndicator(ref, '[aria-current="page"]');

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <LiquidGlass asChild variant="frosted" className={cn("glass-sidebar", className)}>
        <aside data-slot="glass-sidebar" data-collapsed={collapsed || undefined} {...props}>
          <div ref={ref} className="glass-sidebar-content">
            {rect && (
              <motion.div
                aria-hidden="true"
                className="glass-selection"
                initial={false}
                animate={{
                  x: rect.left,
                  y: rect.top,
                  width: rect.width,
                  height: rect.height,
                  opacity: 1,
                }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 34, mass: 0.78 }
                }
              />
            )}
            {children}
          </div>
        </aside>
      </LiquidGlass>
    </SidebarContext.Provider>
  );
}

export function GlassSidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="glass-sidebar-header"
      className={cn("flex min-h-11 items-center gap-2", className)}
      {...props}
    />
  );
}

export function GlassSidebarGroup({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { label?: string }) {
  const { collapsed } = useGlassSidebar();
  return (
    <div role="group" aria-label={label} className={cn("flex flex-col gap-0.5 py-1", className)} {...props}>
      {label && (
        <span aria-hidden className={cn("h-6 truncate px-3 text-xs font-semibold uppercase", collapsed && "invisible")}>
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

export function GlassSidebarItem({
  active,
  asChild,
  icon,
  badge,
  children,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  active?: boolean;
  asChild?: boolean;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const { collapsed } = useGlassSidebar();

  if (asChild) {
    return (
      <AnimateIcon
        animateOnHover
        asChild
        data-slot="glass-sidebar-item"
        aria-current={active ? "page" : undefined}
        title={collapsed && typeof children === "string" ? children : undefined}
        className={cn("glass-item nx-animated-sidebar-item", className)}
        {...(props as any)}
      >
        {children}
      </AnimateIcon>
    );
  }

  return (
    <AnimateIcon animateOnHover asChild>
      <button
        type="button"
        data-slot="glass-sidebar-item"
        aria-current={active ? "page" : undefined}
        title={collapsed && typeof children === "string" ? children : undefined}
        className={cn("glass-item nx-animated-sidebar-item", className)}
        {...props}
      >
        {icon}
        <span className={collapsed ? "sr-only" : "flex-1 truncate"}>{children}</span>
        {badge != null && !collapsed && <span className="rounded-full px-2 text-xs">{badge}</span>}
      </button>
    </AnimateIcon>
  );
}

export function GlassSidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-auto flex flex-col gap-1", className)} {...props} />;
}

export function GlassSidebarToggle({ className, ...props }: React.ComponentProps<"button">) {
  const { collapsed, setCollapsed } = useGlassSidebar();
  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimateIcon animateOnHover asChild>
      <motion.button
        type="button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={() => setCollapsed(!collapsed)}
        whileHover={prefersReducedMotion ? undefined : { scale: 1.06 }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
        transition={{ type: "spring", stiffness: 460, damping: 28 }}
        className={cn("glass-toggle", className)}
        {...(props as any)}
      >
        <motion.span
          className="inline-flex items-center justify-center"
          animate={{ rotate: collapsed ? 180 : 0 }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 360, damping: 28 }
          }
        >
          <PanelLeftAnimatedIcon size={18} />
        </motion.span>
      </motion.button>
    </AnimateIcon>
  );
}

export default GlassSidebar;
