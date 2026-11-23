"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

const DEFAULT_POSITION_CLASS =
  "absolute bottom-5 inset-x-0 mx-auto w-[calc(100%-2rem)] max-w-[820px] z-30 animate-fade-in-up";

const DEFAULT_PANEL_CLASS =
  "w-full bg-white/95 backdrop-blur-xl rounded-[24px] border border-[#e4e2f0] p-4 flex flex-col gap-3 shadow-[0_14px_40px_rgba(20,20,31,0.08),0_2px_8px_rgba(91,69,242,0.06)] focus-within:border-[#c8bffb] focus-within:shadow-[0_18px_46px_rgba(91,69,242,0.12)] transition-all";

const DEFAULT_TEXTAREA_CLASS =
  "w-full bg-transparent border-none text-[#14141f] text-[14px] placeholder:text-[#8a8b9e] focus:outline-none resize-none pt-0.5 leading-relaxed min-h-[44px] max-h-[150px] md:max-h-[220px] overflow-y-auto custom-scrollbar disabled:opacity-45 caret-[#5b45f2]";

const DEFAULT_ACTION_CLASS =
  "bg-[#5b45f2] hover:bg-[#4731d8] text-white px-6 py-2.5 rounded-full font-semibold text-[13.5px] active:scale-[0.98] transition-all flex items-center justify-center gap-2 w-full sm:w-auto shadow-[0_6px_18px_rgba(91,69,242,0.26)] hover:shadow-[0_8px_22px_rgba(91,69,242,0.34)] border border-transparent z-10 disabled:opacity-45 disabled:shadow-none disabled:cursor-not-allowed shrink-0";

const CONTROL_LAYOUT_CLASS =
  "nx-prompt-control h-[36px] flex items-center gap-2 rounded-xl transition-all border group whitespace-nowrap focus:outline-none focus-visible:border-[#5b45f2] focus-visible:ring-2 focus-visible:ring-[#5b45f2]/20";

const CONTROL_IDLE_CLASS =
  "text-[#2d2e3f] bg-[#f6f6fa] hover:bg-[#efeff6] border-[#e6e7f0] hover:border-[#d5d7e4]";

const CONTROL_ACTIVE_CLASS =
  "text-[#4c38d6] bg-[#f2f0ff] hover:bg-[#e7e3ff] border-[#c8bffb]";

const MEDIA_CONTROL_LAYOUT_CLASS =
  "nx-prompt-media w-10 h-10 shrink-0 rounded-xl border transition-all flex items-center justify-center relative overflow-hidden group focus:outline-none focus-visible:border-[#5b45f2] focus-visible:ring-2 focus-visible:ring-[#5b45f2]/20";

const DEFAULT_POPOVER_POSITION_CLASS =
  "absolute bottom-[calc(100%+12px)] left-0 z-50";

const DEFAULT_POPOVER_CLASS =
  "nx-prompt-popover bg-white rounded-2xl p-3 shadow-[0_18px_48px_rgba(20,20,31,0.14),0_2px_8px_rgba(20,20,31,0.06)] border border-[#e6e7f0] min-w-[176px] max-h-[44vh] overflow-y-auto custom-scrollbar text-[#14141f]";

function joinClasses(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function promptControlClassName({
  active = false,
  compact = false,
  iconOnly = false,
  className = "",
} = {}) {
  return joinClasses(
    CONTROL_LAYOUT_CLASS,
    iconOnly
      ? "w-[36px] px-0 justify-center"
      : compact
        ? "px-2.5"
        : "px-3.5",
    active ? CONTROL_ACTIVE_CLASS : CONTROL_IDLE_CLASS,
    className,
  );
}

export function promptMediaButtonClassName({
  active = false,
  className = "",
} = {}) {
  return joinClasses(
    MEDIA_CONTROL_LAYOUT_CLASS,
    active
      ? "border-[#c8bffb] bg-[#f2f0ff] text-[#5b45f2] hover:border-[#5b45f2]"
      : "border-[#e4e2f0] bg-[#f6f6fa] text-[#5e5e72] hover:bg-[#f2f0ff] hover:border-[#c8bffb] hover:text-[#5b45f2]",
    className,
  );
}

export const PROMPT_MEDIA_PREVIEW_CLASS =
  "relative w-10 h-10 shrink-0 rounded-xl border border-[#e4e2f0] overflow-hidden shadow-sm group bg-[#f3f4f8]";

export const PROMPT_CONTROL_LABEL_CLASS =
  "text-[12.5px] font-medium text-current transition-colors";

export function PromptChevronIcon({ className = "" }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={joinClasses(
        "text-current opacity-55 group-hover:opacity-90 flex-shrink-0 transition-opacity",
        className,
      )}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function PromptAspectRatioIcon({ className = "" }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={joinClasses("text-current opacity-65 flex-shrink-0", className)}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
    </svg>
  );
}

export function PromptDurationIcon({ className = "" }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={joinClasses("text-current opacity-65 flex-shrink-0", className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function PromptQualityIcon({ className = "" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={joinClasses("text-current opacity-70 flex-shrink-0", className)}
      aria-hidden="true"
    >
      <path d="M6.5 3.5h11L22 9 12 21 2 9l4.5-5.5Z" />
      <path d="M2 9h20" />
      <path d="m6.5 3.5 3 5.5L12 21" />
      <path d="m17.5 3.5-3 5.5L12 21" />
    </svg>
  );
}

export const PromptPopover = forwardRef(function PromptPopover(
  {
    children,
    className = "",
    positionClassName = DEFAULT_POPOVER_POSITION_CLASS,
    ...props
  },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={joinClasses(
        positionClassName,
        DEFAULT_POPOVER_CLASS,
        className,
      )}
    >
      {children}
    </div>
  );
});

export function PromptPopoverHeader({ children, className = "" }) {
  return (
    <div
      className={joinClasses(
        "text-[11px] font-semibold text-[#7a7b90] uppercase tracking-wider pb-2 border-b border-[#efeff5] mb-2 px-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PromptMenuList({ children, className = "" }) {
  return (
    <div role="menu" className={joinClasses("flex flex-col gap-0.5", className)}>
      {children}
    </div>
  );
}

export function PromptMenuItem({
  children,
  description,
  selected = false,
  className = "",
  type = "button",
  ...props
}) {
  return (
    <button
      {...props}
      type={type}
      aria-checked={selected}
      role="menuitemradio"
      className={joinClasses(
        "w-full min-h-9 flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left cursor-pointer transition-colors group/menu-item",
        selected
          ? "bg-[#f2f0ff] text-[#4c38d6] font-semibold"
          : "text-[#2d2e3f] font-medium hover:bg-[#f6f6fa] hover:text-[#14141f]",
        "text-[12.5px] focus:outline-none focus-visible:bg-[#f2f0ff] focus-visible:text-[#4c38d6]",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block truncate">{children}</span>
        {description && (
          <span className="block text-[11px] font-normal text-[#7a7b90] mt-0.5 truncate">
            {description}
          </span>
        )}
      </span>
      {selected && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#5b45f2"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

export function PromptSegmentedControl({ children, className = "" }) {
  return (
    <div
      className={joinClasses(
        "inline-flex items-center gap-1 bg-[#f3f4f8] border border-[#e6e7f0] rounded-full p-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PromptSegmentOption({
  children,
  selected = false,
  className = "",
  type = "button",
  ...props
}) {
  return (
    <button
      {...props}
      type={type}
      aria-pressed={selected}
      className={joinClasses(
        "min-h-7 px-3.5 py-1 rounded-full text-[12px] font-semibold transition-all flex items-center justify-center gap-1.5",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45f2]/30",
        selected
          ? "bg-[#5b45f2] text-white shadow-sm"
          : "text-[#5e5e72] hover:text-[#14141f]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PromptComposer({
  children,
  className = "",
  panelClassName = "",
  positionClassName = DEFAULT_POSITION_CLASS,
  style = { animationDelay: "0.08s" },
}) {
  return (
    <div className={joinClasses(positionClassName, className)} style={style}>
      <div data-tour="prompt-composer" className={joinClasses(DEFAULT_PANEL_CLASS, panelClassName)}>
        {children}
      </div>
    </div>
  );
}

export const PromptTextarea = forwardRef(function PromptTextarea(
  {
    value,
    onChange,
    onInput,
    className = "",
    maxHeightMobile = 150,
    maxHeightDesktop = 220,
    rows = 1,
    ...props
  },
  forwardedRef,
) {
  const internalRef = useRef(null);

  useImperativeHandle(forwardedRef, () => internalRef.current);

  const resize = useCallback(
    (element = internalRef.current) => {
      if (!element) return;

      element.style.height = "auto";
      const maxHeight =
        window.innerWidth < 768 ? maxHeightMobile : maxHeightDesktop;
      element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
    },
    [maxHeightDesktop, maxHeightMobile],
  );

  useEffect(() => {
    resize();
  }, [resize, value]);

  const handleChange = (event) => {
    onChange?.(event);
    resize(event.currentTarget);
  };

  const handleInput = (event) => {
    onInput?.(event);
    resize(event.currentTarget);
  };

  return (
    <textarea
      data-tour="prompt-input"
      {...props}
      ref={internalRef}
      value={value}
      onChange={handleChange}
      onInput={handleInput}
      rows={rows}
      className={joinClasses(DEFAULT_TEXTAREA_CLASS, className)}
    />
  );
});

export function PromptFooter({ children, className = "" }) {
  return (
    <div
      className={joinClasses(
        "flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-[#efeff5] relative",
        className,
      )}
    >
      {children}
    </div>
  );
}

export const PromptControls = forwardRef(function PromptControls(
  { children, className = "" },
  ref,
) {
  return (
    <div
      ref={ref}
      data-tour="prompt-controls"
      className={joinClasses(
        "flex items-center gap-2 relative flex-wrap pb-0.5 md:pb-0",
        className,
      )}
    >
      {children}
    </div>
  );
});

export const PromptAction = forwardRef(function PromptAction(
  { children, className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      data-tour="prompt-generate"
      {...props}
      ref={ref}
      type={type}
      className={joinClasses(DEFAULT_ACTION_CLASS, className)}
    >
      {children}
    </button>
  );
});
