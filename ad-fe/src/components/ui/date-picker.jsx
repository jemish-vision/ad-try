import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover"

export function ShadcnDatePicker({ value, onChange, placeholder, className, disabled, disabledDate }) {
  const { t } = useTranslation();
  const date = value ? new Date(value) : undefined;
  const resolvedPlaceholder = placeholder ?? t("Select Date");

  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal bg-white dark:bg-[#1e293b]",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "yyyy-MM-dd") : <span>{resolvedPlaceholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[288px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl z-[9999] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        align="end"
        sideOffset={6}
        collisionPadding={16}
      >
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : null)}
          initialFocus
          disabled={disabledDate}
          className="w-full text-slate-900 dark:text-slate-100"
        />
      </PopoverContent>
    </Popover>
  )
}
