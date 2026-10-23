import * as React from "react"

import { cn } from "src/lib/utils"

/**
 * Approximates MUI's <Collapse timeout="auto"> (which animates a
 * JS-measured scrollHeight) using a CSS grid-template-rows 0fr/1fr
 * transition, since that requires no height measurement.
 */
const AutoCollapse = React.forwardRef(
  ({ in: open, unmountOnExit = false, className, children, ...props }, ref) => {
    const [shouldRender, setShouldRender] = React.useState(open)

    React.useEffect(() => {
      if (open) setShouldRender(true)
    }, [open])

    const handleTransitionEnd = () => {
      if (!open && unmountOnExit) setShouldRender(false)
    }

    return (
      <div
        ref={ref}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          className
        )}
        onTransitionEnd={handleTransitionEnd}
        {...props}>
        <div className="overflow-hidden">
          {(shouldRender || !unmountOnExit) && children}
        </div>
      </div>
    );
  }
)
AutoCollapse.displayName = "AutoCollapse"

export { AutoCollapse }
