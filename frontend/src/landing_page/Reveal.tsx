import React, { useEffect, useRef, useState } from "react";

// Fades + lifts its children into view the first time they enter the
// viewport. Dependency-free (IntersectionObserver), one-shot (never
// re-hides on scroll-up), and fully opt-out via prefers-reduced-motion —
// in that mode children render immediately with no transform.

interface RevealProps {
  children: React.ReactNode;
  /** Extra delay in ms, for staggering siblings. */
  delay?: number;
  /** Wrapper element/component to render as. Defaults to a div. */
  as?: React.ElementType;
  className?: string;
}

function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Honor reduced-motion and browsers without IntersectionObserver:
    // show immediately, skip the animation entirely.
    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={`reveal${shown ? " reveal--in" : ""} ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
