import React from "react";

const defaultWidths = ["92%", "78%", "86%", "64%"];

interface SkeletonProps {
  rows?: number;
  label?: string;
  widths?: string[];
}

// Shimmering placeholder rows with a screen-reader label.
const Skeleton = ({ rows = 3, label = "Loading…", widths = defaultWidths }: SkeletonProps) => (
  <>
    <span className="visually-hidden">{label}</span>
    <div className="skeleton-stack" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <span
          key={i}
          className="skeleton"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  </>
);

export default Skeleton;
