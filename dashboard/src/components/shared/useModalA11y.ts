import { RefObject, useEffect, useRef } from "react";

/**
 * Tabbable things, in DOM order. `[tabindex="-1"]` is deliberately excluded:
 * the read-only market-price field opts out that way and should stay skipped.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalA11yOptions {
  /** Where focus should land on open. Defaults to the first tabbable element. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Set false while an action is in flight to stop Escape dismissing it. */
  escapeDismisses?: boolean;
}

/**
 * The keyboard half of a modal: focus moves in on open, Tab cycles inside
 * instead of wandering into the page behind, Escape dismisses, and focus
 * returns to whatever opened it.
 *
 * `onDismiss` is read through a ref rather than a dependency on purpose.
 * Callers pass inline arrow functions, and re-running the effect on every
 * render would drag focus back to the first field mid-keystroke.
 */
export function useModalA11y(
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  { initialFocus, escapeDismisses = true }: ModalA11yOptions = {},
) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  const escapeRef = useRef(escapeDismisses);
  escapeRef.current = escapeDismisses;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const restoreTo = document.activeElement as HTMLElement | null;
    const tabbable = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));

    (initialFocus?.current ?? tabbable()[0] ?? container).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (escapeRef.current) dismissRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const items = tabbable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      // Focus outside the modal at all (a stray click, or the browser's own
      // chrome handing it back) — pull it in rather than continuing the page's
      // tab order.
      if (!container.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Take focus back only if closing dropped it. Checking `contains` alone
      // is not enough: React detaches the modal before this cleanup runs, so
      // by now focus has usually already fallen back to <body>. But if the
      // user clicked something else that is still on the page, leave it there.
      const active = document.activeElement as HTMLElement | null;
      const focusWasLost =
        !active ||
        active === document.body ||
        !active.isConnected ||
        container.contains(active);
      if (focusWasLost) restoreTo?.focus?.();
    };
    // Deliberately empty: this runs once per open. Everything that can change
    // between renders is read through a ref above.
  }, []);
}
