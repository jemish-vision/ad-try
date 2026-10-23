import { cn } from "src/lib/utils"

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-200/90 dark:bg-slate-700/60", className)}
      {...props} />
  );
}

export { Skeleton }
