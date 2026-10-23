import * as React from "react"

import { cn } from "../../lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-solid border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1 text-sm text-slate-700 dark:text-slate-200 shadow-sm transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-slate-400 outline-none focus:outline-none focus:border-[#2374F2] focus:ring-1 focus:ring-[#2374F2] focus-visible:border-[#2374F2] focus-visible:ring-1 focus-visible:ring-[#2374F2] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props} />
  );
})
Input.displayName = "Input"

export { Input }
