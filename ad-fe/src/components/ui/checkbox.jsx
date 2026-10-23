import * as React from "react"
import { cn } from "../../lib/utils"

const Checkbox = React.forwardRef(({ className, checked, onCheckedChange, onChange, ...props }, ref) => {
  const handleChange = (e) => {
    if (onCheckedChange) {
      onCheckedChange(e.target.checked);
    }
    if (onChange) {
      onChange(e);
    }
  };
  return (
    <input
      type="checkbox"
      ref={ref}
      checked={checked}
      onChange={handleChange}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-slate-200 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:focus-visible:ring-slate-300 accent-[#1A9FD4] dark:accent-[#2374F2] cursor-pointer dark:[color-scheme:dark]",
        className
      )}
      {...props}
    />
  );
})
Checkbox.displayName = "Checkbox"

export { Checkbox }
