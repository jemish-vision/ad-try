"use client"

import * as React from "react"
import { Check, X, ChevronDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "src/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command"

export function MultiSelect({
  options = [],
  value = [],
  onChange,
  onSearch,
  loading = false,
  placeholder,
  className,
  maxCount = 2,
  disabled = false,
  dropdownWidth = "w-full",
  useSummaryDisplay = false,
  summaryTitle,
  showSelectAll = true,
}) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("Select options");
  const resolvedSummaryTitle = summaryTitle ?? t("Statuses");
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef(null);

  const [isDark, setIsDark] = React.useState(false);
  React.useEffect(() => {
    setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleOutsideClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open]);

  const handleSelect = (itemValue) => {
    const current = Array.isArray(value) ? value : [];
    const isSelected = current.includes(itemValue);
    const nextValue = isSelected
      ? current.filter((v) => v !== itemValue)
      : [...current, itemValue];
    onChange?.(nextValue);
  };

  const handleRemove = (e, itemValue) => {
    e.preventDefault();
    e.stopPropagation();
    const current = Array.isArray(value) ? value : [];
    onChange?.(current.filter((v) => v !== itemValue));
  };

  const selectedArray = Array.isArray(value) ? value : [];
  const totalSelected = selectedArray.length;
  const showOverflow = totalSelected > maxCount;
  const visibleItems = showOverflow ? selectedArray.slice(0, maxCount) : selectedArray;
  const overflowCount = totalSelected - maxCount;

  const isAllSelected = selectedArray.length === options.length && options.length > 0;

  const handleSelectAllToggle = () => {
    if (isAllSelected) {
      onChange?.([]);
    } else {
      onChange?.(options.map((o) => o.value));
    }
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Trigger Box */}
      <div
        role="combobox"
        tabIndex={0}
        aria-expanded={open}
        aria-disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(!open);
          }
        }}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-xs transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer overflow-hidden select-none",
          open
            ? "border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/15"
            : (isDark ? "border-slate-800 bg-slate-950/40 text-slate-200 hover:border-slate-700" : "border-slate-200 bg-white text-slate-800 hover:border-slate-300")
        )}
      >
        <div className="flex items-center gap-1.5 flex-nowrap overflow-hidden pr-2 flex-1 h-full">
          {useSummaryDisplay ? (
            <div className="flex items-center gap-2 truncate">
              {totalSelected === 0 && (
                <span className={`truncate select-none text-xs font-normal ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                  {resolvedPlaceholder}
                </span>
              )}
              {totalSelected === options.length && options.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className={`truncate text-xs font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    {t("All {{summaryTitle}}", { summaryTitle: resolvedSummaryTitle })}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-[var(--accent-primary-bg)] text-[var(--accent-primary)] border-[var(--accent-primary-border)]">
                    {options.length}
                  </span>
                </div>
              )}
              {totalSelected === 1 && (
                <span className={`truncate text-xs font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  {(() => {
                    const opt = options.find((o) => o.value === selectedArray[0]);
                    return opt ? (opt.badgeLabel || opt.searchLabel || opt.label) : selectedArray[0];
                  })()}
                </span>
              )}
              {totalSelected > 1 && totalSelected < options.length && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    {resolvedSummaryTitle}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-[var(--accent-primary-bg)] text-[var(--accent-primary)] border-[var(--accent-primary-border)]">
                    {t("{{count}} Selected", { count: totalSelected })}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <>
              {totalSelected === 0 && (
                <span className={`truncate select-none text-xs font-normal ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                  {resolvedPlaceholder}
                </span>
              )}
              {visibleItems.map((val) => {
                const opt = options.find((o) => o.value === val);
                const label = opt ? (opt.badgeLabel || opt.searchLabel || opt.label) : val;
                return (
                  <span
                    key={val}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap shrink-0 border select-none transition-colors bg-[var(--accent-primary-bg)] text-[var(--accent-primary)] border-[var(--accent-primary-border)] max-w-[150px]"
                  >
                    <span className="truncate">{label}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleRemove(e, val)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") handleRemove(e, val);
                      }}
                      className="rounded-full hover:bg-[var(--accent-primary)]/10 p-0.5 -mr-0.5 focus:outline-none cursor-pointer inline-flex items-center justify-center transition-colors shrink-0 text-[var(--accent-primary)]"
                    >
                      <X className="h-2.5 w-2.5" />
                    </span>
                  </span>
                );
              })}
              {showOverflow && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap shrink-0 border select-none bg-[var(--accent-primary-bg)] text-[var(--accent-primary)] border-[var(--accent-primary-border)]">
                  {t("+{{count}} more", { count: overflowCount })}
                </span>
              )}
            </>
          )}
        </div>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-50 ml-1.5 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
      </div>

      {/* Dropdown Popover */}
      {open && (
        <div className={`absolute top-full left-0 mt-1.5 z-[99999] overflow-hidden rounded-lg border shadow-xl animate-in fade-in-0 zoom-in-95 duration-150 ${dropdownWidth} ${isDark ? "bg-[#0f172a] border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"}`}>
          <Command shouldFilter={!onSearch} className={isDark ? "bg-transparent text-slate-100" : ""}>
            <CommandInput
              placeholder={t("Search")}
              value={search}
              onValueChange={(val) => {
                setSearch(val);
                if (onSearch) onSearch(val);
              }}
              className={cn(
                "h-9 text-xs border-0 bg-transparent focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none",
                isDark ? "text-slate-100 placeholder:text-slate-500" : "placeholder:text-slate-400 text-slate-800"
              )}
            />
            <CommandList className="max-h-[260px] overflow-y-auto p-1">
              {loading && <div className="p-4 text-center text-xs text-muted-foreground">{t("Loading...")}</div>}
              {!loading && <CommandEmpty className="p-3 text-center text-xs text-muted-foreground">{t("No results found.")}</CommandEmpty>}
              {!loading && (
                <CommandGroup>
                  {/* Select All Item Row inside the scrollable list */}
                  {showSelectAll && options.length > 0 && (
                    <CommandItem
                      onSelect={handleSelectAllToggle}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 my-0.5 rounded-sm text-xs cursor-pointer select-none transition-all duration-150 ${isDark
                        ? "text-slate-200 hover:bg-slate-800 data-[selected=true]:bg-slate-800"
                        : "text-slate-700 hover:bg-slate-100 data-[selected=true]:bg-slate-100"
                        }`}
                    >
                      <div
                        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-all duration-200"
                        style={{
                          backgroundColor: isAllSelected ? "var(--accent-primary)" : "transparent",
                          borderColor: isAllSelected ? "var(--accent-primary)" : (isDark ? "rgba(255,255,255,0.15)" : "#cbd5e1"),
                        }}
                      >
                        {isAllSelected && (
                          <Check
                            className="h-2.5 w-2.5 stroke-[3] text-white"
                          />
                        )}
                      </div>
                      <span className="flex-1 font-medium text-[13px]">{t("Select All")}</span>
                    </CommandItem>
                  )}

                  {options.map((option) => {
                    const isSelected = selectedArray.includes(option.value);
                    const displayLabel = typeof option.label === "string"
                      ? option.label
                      : (option.badgeLabel || option.searchLabel || option.label);
                    return (
                      <CommandItem
                        key={option.value}
                        value={String(option.searchLabel || option.label || option.value)}
                        onSelect={() => handleSelect(option.value)}
                        className={`flex items-center gap-2.5 px-2.5 py-1.5 my-0.5 rounded-sm text-xs cursor-pointer select-none transition-all duration-150 ${isDark
                          ? "text-slate-200 hover:bg-slate-800 data-[selected=true]:bg-slate-800"
                          : "text-slate-700 hover:bg-slate-100 data-[selected=true]:bg-slate-100"
                          }`}
                      >
                        <div
                          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-all duration-200"
                          style={{
                            backgroundColor: isSelected ? "var(--accent-primary)" : "transparent",
                            borderColor: isSelected ? "var(--accent-primary)" : (isDark ? "rgba(255,255,255,0.15)" : "#cbd5e1"),
                          }}
                        >
                          {isSelected && (
                            <Check
                              className="h-2.5 w-2.5 stroke-[3] text-white"
                            />
                          )}
                        </div>
                        <span className="flex-1 text-[13px]">{displayLabel}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}

