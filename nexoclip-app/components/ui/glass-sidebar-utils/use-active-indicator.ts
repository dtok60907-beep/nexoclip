import * as React from "react";

type Rect = { top: number; left: number; width: number; height: number };

const sameRect = (a: Rect | null, b: Rect | null) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
};

export function useActiveIndicator(
  ref: React.RefObject<HTMLDivElement | null>,
  selector: string,
) {
  const [rect, setRect] = React.useState<Rect | null>(null);

  React.useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    let frame = 0;

    const measure = () => {
      const item = root.querySelector<HTMLElement>(selector);
      if (!item) {
        setRect((prev) => (prev === null ? prev : null));
        return;
      }
      const box = item.getBoundingClientRect();
      const base = root.getBoundingClientRect();
      const nav = item.closest("nav");
      if (nav) {
        const navBox = nav.getBoundingClientRect();
        if (box.bottom > navBox.bottom + 2 || box.top < navBox.top - 2) {
          setRect((prev) => (prev === null ? prev : null));
          return;
        }
      }
      const next: Rect = {
        top: Math.round((box.top - base.top + root.scrollTop) * 2) / 2,
        left: Math.round((box.left - base.left + root.scrollLeft) * 2) / 2,
        width: Math.round(box.width * 2) / 2,
        height: Math.round(box.height * 2) / 2,
      };
      setRect((prev) => (sameRect(prev, next) ? prev : next));
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    const resize = new ResizeObserver(schedule);
    resize.observe(root);

    // Only observe active-state or collapsed-state mutations, never hover/icon class mutations.
    const mutation = new MutationObserver(schedule);
    mutation.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-current", "data-collapsed"],
    });

    root.addEventListener("scroll", schedule, { capture: true, passive: true });
    measure();

    return () => {
      resize.disconnect();
      mutation.disconnect();
      root.removeEventListener("scroll", schedule, true);
      cancelAnimationFrame(frame);
    };
  }, [ref, selector]);

  return rect;
}
