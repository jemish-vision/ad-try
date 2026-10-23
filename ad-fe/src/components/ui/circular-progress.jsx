import * as React from "react"

import { cn } from "src/lib/utils"

/**
 * Mirrors MUI's CircularProgress determinate SVG geometry (viewBox 22 22 44 44,
 * r=20.2) so migrated call sites render pixel-identical rings.
 */
const CircularProgress = React.forwardRef(
  ({ className, value = 0, size = 40, thickness = 3.6, style, ...props }, ref) => {
    const r = 20.2
    const circumference = 2 * Math.PI * r
    const offset = ((100 - value) / 100) * circumference

    return (
      <span
        ref={ref}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn("inline-block -rotate-90 shrink-0", className)}
        style={{ width: size, height: size, ...style }}
        {...props}>
        <svg viewBox="22 22 44 44" width="100%" height="100%">
          <circle
            cx="44"
            cy="44"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={thickness}
            strokeDasharray={circumference}
            strokeDashoffset={offset} />
        </svg>
      </span>
    );
  }
)
CircularProgress.displayName = "CircularProgress"

export { CircularProgress }
