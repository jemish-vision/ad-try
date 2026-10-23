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

export function ShadcnDateRangePicker({
  value,
  onChange,
  ranges = [],
  placeholder,
  className,
  style,
  disabledDate,
  align = "start",
  defaultOpen = false,
}) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("Select Date");
  const [internalDate, setInternalDate] = React.useState({
    from: value?.[0] ? new Date(value[0]) : undefined,
    to: value?.[1] ? new Date(value[1]) : undefined,
  })

  const [currentMonth, setCurrentMonth] = React.useState(
    value?.[0] ? new Date(value[0]) : new Date()
  )

  const [isOpen, setIsOpen] = React.useState(Boolean(defaultOpen))

  // Sync prop value to internal state when opened or value changes
  React.useEffect(() => {
    if (isOpen) {
      const fromDate = value?.[0] ? new Date(value[0]) : undefined;
      setInternalDate({
        from: fromDate,
        to: value?.[1] ? new Date(value[1]) : undefined,
      })
      if (fromDate) {
        setCurrentMonth(fromDate)
      }
    }
  }, [value, isOpen])

  const handleSelect = (newDate) => {
    setInternalDate(newDate)
    if (newDate?.from) {
      setCurrentMonth(newDate.from)
    }
  }

  const handlePresetSelect = (presetValue) => {
    const val = typeof presetValue === 'function' ? presetValue() : presetValue
    if (val && val.length === 2) {
      const fromDate = new Date(val[0]);
      setInternalDate({ from: fromDate, to: new Date(val[1]) })
      setCurrentMonth(fromDate)
    }
  }

  const getActivePresetIndex = () => {
    if (!internalDate?.from || !internalDate?.to) return -1;
    for (let i = 0; i < ranges.length; i++) {
      const presetValue = ranges[i].value;
      const val = typeof presetValue === 'function' ? presetValue() : presetValue;
      if (val && val.length === 2) {
        if (internalDate.from.toDateString() === new Date(val[0]).toDateString() &&
            internalDate.to.toDateString() === new Date(val[1]).toDateString()) {
          return i;
        }
      }
    }
    return -1;
  }

  const activePresetIndex = React.useMemo(() => getActivePresetIndex(), [internalDate, ranges]);

  const handleOk = () => {
    if (internalDate?.from && internalDate?.to) {
      const dates = [internalDate.from, internalDate.to];
      onChange(dates);
      try {
        const arr = [
          format(internalDate.from, "yyyy-MM-dd"),
          format(internalDate.to, "yyyy-MM-dd")
        ];
        let storeData = JSON.parse(localStorage.getItem('profile')) || {};
        storeData.date = arr;
        localStorage.setItem('profile', JSON.stringify(storeData));
        window.dispatchEvent(new CustomEvent("globalDateChanged", { detail: arr }));
      } catch (e) {}
    } else if (!internalDate?.from && !internalDate?.to) {
      onChange(null);
    }
    setIsOpen(false);
  }

  const handleReset = () => {
    setInternalDate({ from: undefined, to: undefined });
    onChange(null);
    setIsOpen(false);
  }

  return (
    <div className={cn("grid gap-2", className)} style={style}>
      <Popover open={isOpen} onOpenChange={setIsOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            size={"dateRangePicker"}
            className={cn(
              "w-full justify-start text-left font-normal bg-white dark:bg-[#1e293b]",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value?.[0] ? (
              value?.[1] ? (
                <>
                  {format(new Date(value[0]), "yyyy-MM-dd")} -{" "}
                  {format(new Date(value[1]), "yyyy-MM-dd")}
                </>
              ) : (
                format(new Date(value[0]), "yyyy-MM-dd")
              )
            ) : (
              <span>{resolvedPlaceholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[9999] dark:border-white/10" align={align}>
          <div className="flex flex-col sm:flex-row">
            {/* Sidebar Presets */}
            {ranges.length > 0 && (
              <div className="flex flex-col gap-0.5 p-1.5 border-r border-border min-w-[140px] max-h-[350px] overflow-y-auto">
                {ranges.map((range, idx) => {
                  const active = idx === activePresetIndex;
                  return (
                    <Button
                      key={idx}
                      variant="ghost"
                      disabled={range.disabled}
                      className={cn(
                        "justify-start text-left font-normal py-1.5 px-3 h-auto rounded-sm",
                        !range.disabled && "text-blue-500 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-secondary",
                        active && !range.disabled && "border border-blue-500 bg-blue-50 dark:bg-secondary"
                      )}
                      onClick={() => {
                        if (!range.disabled) handlePresetSelect(range.value);
                      }}
                    >
                      {range.label}
                    </Button>
                  )
                })}
              </div>
            )}

            {/* Main Content Area */}
            <div 
              className="flex flex-col"
              ref={(node) => {
                if (!node) return;
                // Use native listener with passive:false to bypass Radix Dialog scroll lock
                if (!node._wheelAttached) {
                  node.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const direction = e.deltaY > 0 ? 1 : -1;
                    setCurrentMonth((prev) => {
                      const newMonth = new Date(prev);
                      newMonth.setMonth(newMonth.getMonth() + direction);
                      return newMonth;
                    });
                  }, { passive: false });
                  node._wheelAttached = true;
                }
              }}
            >
              {/* Top Bar with Date Display */}
              <div className="flex justify-center items-center gap-4 py-3 border-b border-border text-sm">
                <span className={`pb-1 px-2 ${internalDate?.from ? 'border-b-2 border-blue-500 text-foreground' : 'text-muted-foreground'}`}>
                  {internalDate?.from ? format(internalDate.from, "yyyy-MM-dd") : t("Start Date")}
                </span>
                <span className="text-muted-foreground">~</span>
                <span className={`pb-1 px-2 ${internalDate?.to ? 'border-b-2 border-blue-500 text-foreground' : 'text-muted-foreground'}`}>
                  {internalDate?.to ? format(internalDate.to, "yyyy-MM-dd") : t("End Date")}
                </span>
              </div>

              {/* Calendar */}
              <Calendar
                initialFocus
                mode="range"
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                selected={internalDate}
                onSelect={handleSelect}
                numberOfMonths={1}
                disabled={disabledDate}
                className="[&_.data-\[selected-single\=true\]]:bg-blue-500 [&_.data-\[selected-single\=true\]]:text-white [&_.data-\[range-start\=true\]]:bg-blue-500 [&_.data-\[range-start\=true\]]:text-white [&_.data-\[range-end\=true\]]:bg-blue-500 [&_.data-\[range-end\=true\]]:text-white"
              />

              {/* Footer Actions */}
              <div className="flex justify-between items-center p-3 border-t border-border mt-auto">
                <Button variant="secondary" size="sm" onClick={handleReset}>
                  {t("Reset")}
                </Button>
                <Button variant="default" size="sm" onClick={handleOk} className="bg-blue-500 hover:bg-blue-600 text-white px-6">
                  {t("OK")}
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
