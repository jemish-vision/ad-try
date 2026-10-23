"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X, ChevronDown, ChevronRight, Minus, Building2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "src/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
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
}) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("Select options...");
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [expandedCompanies, setExpandedCompanies] = React.useState(new Set());

  const selectedArray = Array.isArray(value) ? value : [];
  const totalSelected = selectedArray.length;
  const showOverflow = totalSelected > maxCount;
  const visibleItems = showOverflow ? selectedArray.slice(0, maxCount) : selectedArray;
  const overflowCount = totalSelected - maxCount;

  // Check if options are structured with companyName (Grouped Tree mode)
  const hasCompanyGroup = React.useMemo(() => {
    return options.some((opt) => Boolean(opt.companyName));
  }, [options]);

  // Group options by companyName
  const groupedOptions = React.useMemo(() => {
    if (!hasCompanyGroup) return [];
    const map = new Map();
    options.forEach((opt) => {
      const company = opt.companyName || t("Other Profiles");
      if (!map.has(company)) {
        map.set(company, []);
      }
      map.get(company).push(opt);
    });
    return Array.from(map.entries()).map(([companyName, items]) => ({
      companyName,
      options: items,
    }));
  }, [options, hasCompanyGroup]);

  // Expand all companies by default or when options load
  React.useEffect(() => {
    if (hasCompanyGroup && groupedOptions.length > 0) {
      setExpandedCompanies(new Set(groupedOptions.map((g) => g.companyName)));
    }
  }, [groupedOptions, hasCompanyGroup]);

  const toggleCompanyExpand = (e, companyName) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(companyName)) {
        next.delete(companyName);
      } else {
        next.add(companyName);
      }
      return next;
    });
  };

  const handleSelect = (itemValue) => {
    const isSelected = selectedArray.includes(itemValue);
    const nextValue = isSelected
      ? selectedArray.filter((v) => v !== itemValue)
      : [...selectedArray, itemValue];
    onChange?.(nextValue);
  };

  const handleRemove = (e, itemValue) => {
    e.preventDefault();
    e.stopPropagation();
    onChange?.(selectedArray.filter((v) => v !== itemValue));
  };

  const handleCompanyGroupToggle = (companyItems) => {
    const companyValues = companyItems.map((o) => o.value);
    const allSelected = companyValues.every((val) => selectedArray.includes(val));

    if (allSelected) {
      // Deselect all items belonging to this company
      const nextValue = selectedArray.filter((val) => !companyValues.includes(val));
      onChange?.(nextValue);
    } else {
      // Select all items belonging to this company (avoid duplicates)
      const nextSet = new Set([...selectedArray, ...companyValues]);
      onChange?.(Array.from(nextSet));
    }
  };

  // Filter grouped options by search string
  const filteredGroupedOptions = React.useMemo(() => {
    if (!search.trim()) return groupedOptions;
    const query = search.toLowerCase();
    return groupedOptions
      .map((group) => {
        const companyMatch = group.companyName.toLowerCase().includes(query);
        if (companyMatch) return group;
        const matchingProfiles = group.options.filter(
          (opt) =>
            String(opt.label || "").toLowerCase().includes(query) ||
            String(opt.profileName || "").toLowerCase().includes(query) ||
            String(opt.countryCode || "").toLowerCase().includes(query) ||
            String(opt.profileId || "").toLowerCase().includes(query)
        );
        return matchingProfiles.length > 0
          ? { ...group, options: matchingProfiles }
          : null;
      })
      .filter(Boolean);
  }, [groupedOptions, search]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <div
          role="combobox"
          tabIndex={0}
          aria-controls="multi-select-dropdown"
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
            "flex min-h-10 h-auto py-1.5 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer overflow-hidden select-none transition-all",
            className
          )}
        >
          <div className="flex items-center gap-1.5 flex-wrap overflow-hidden pr-2 flex-1">
            {totalSelected === 0 && (
              <span className="text-muted-foreground truncate select-none text-sm font-normal">
                {resolvedPlaceholder}
              </span>
            )}
            {visibleItems.map((val) => {
              const opt = options.find((o) => o.value === val);
              let label = val;
              if (opt) {
                if (opt.countryCode && opt.profileName) {
                  label = `${opt.countryCode} - ${opt.profileName}`;
                } else if (opt.label) {
                  const parts = opt?.label?.split(" | ");
                  label = parts.length > 1 ? parts[1] : opt.label;
                }
              }
              return (
                <span
                  key={val}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap shrink-0 border select-none transition-colors bg-[var(--accent-primary-bg)] text-[var(--accent-primary)] border-[var(--accent-primary-border)] max-w-[180px]"
                >
                  <span className="truncate">{label}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleRemove(e, val)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") handleRemove(e, val);
                    }}
                    className="rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-0.5 -mr-0.5 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer inline-flex items-center justify-center transition-colors shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </span>
              );
            })}
            {showOverflow && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap shrink-0 border select-none transition-colors bg-[var(--accent-primary-bg)] text-[var(--accent-primary)] border-[var(--accent-primary-border)]">
                {t("+ {{count}} more", { count: overflowCount })}
              </span>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-1 text-muted-foreground" />
        </div>
      </PopoverTrigger>

      <PopoverContent
        id="multi-select-dropdown"
        className="z-[100000] p-0 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
        style={{ width: "var(--radix-popover-trigger-width)", minWidth: "300px" }}
      >
        <Command shouldFilter={!onSearch && !hasCompanyGroup}>
          <CommandInput
            placeholder={t("Search profiles or company...")}
            value={search}
            onValueChange={(val) => {
              setSearch(val);
              if (onSearch) onSearch(val);
            }}
          />
          <CommandList className="max-h-[320px] overflow-y-auto p-1.5">
            {loading && (
              <div className="p-4 text-center text-sm text-muted-foreground">{t("Loading...")}</div>
            )}

            {!loading && hasCompanyGroup && (
              <div className="space-y-2 py-1">
                {filteredGroupedOptions.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {t("No matching company or profile found.")}
                  </div>
                )}
                {filteredGroupedOptions.map((group) => {
                  const isExpanded = expandedCompanies.has(group.companyName);
                  const groupValues = group.options.map((o) => o.value);
                  const selectedInGroup = groupValues.filter((v) => selectedArray.includes(v));
                  const allSelected = selectedInGroup.length === group.options.length && group.options.length > 0;
                  const someSelected = selectedInGroup.length > 0 && !allSelected;

                  return (
                    <div
                      key={group.companyName}
                      className="border rounded-md bg-slate-50/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 overflow-hidden transition-colors"
                    >
                      {/* Company Group Header */}
                      <div className="flex items-center justify-between px-2.5 py-2 bg-slate-100/80 dark:bg-slate-800/60 select-none">
                        <div
                          className="flex items-center gap-2.5 flex-1 cursor-pointer overflow-hidden pr-2"
                          onClick={() => handleCompanyGroupToggle(group.options)}
                        >
                          {/* Checkbox for Company */}
                          <div
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                              allSelected
                                ? "bg-[#1A9FD4] dark:bg-[#2374F2] border-[#1A9FD4] dark:border-[#2374F2] text-white"
                                : someSelected
                                  ? "bg-[#1A9FD4] dark:bg-[#2374F2] border-[#1A9FD4] dark:border-[#2374F2] text-white"
                                  : "border-slate-400 dark:border-slate-600 bg-transparent opacity-80"
                            )}
                          >
                            {allSelected && <Check className="h-3 w-3 stroke-[3]" />}
                            {someSelected && <Minus className="h-3 w-3 stroke-[3]" />}
                          </div>

                          <Building2 className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                          <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200 truncate">
                            {group.companyName}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300">
                            {selectedInGroup.length}/{group.options.length}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => toggleCompanyExpand(e, group.companyName)}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors focus:outline-none"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Tree Branch / Profiles list */}
                      {isExpanded && (
                        <div className="p-1.5 space-y-1 bg-white/50 dark:bg-slate-950/30">
                          {group.options.map((option) => {
                            const isSelected = selectedArray.includes(option.value);
                            return (
                              <div
                                key={option.value}
                                onClick={() => handleSelect(option.value)}
                                className="flex items-center gap-2.5 pl-6 pr-2.5 py-1.5 rounded text-xs cursor-pointer select-none transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-medium"
                              >
                                <div
                                  className={cn(
                                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors",
                                    isSelected
                                      ? "bg-[#1A9FD4] dark:bg-[#2374F2] border-[#1A9FD4] dark:border-[#2374F2] text-white"
                                      : "border-slate-300 dark:border-slate-600 bg-transparent opacity-70"
                                  )}
                                >
                                  {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                                </div>
                                <span className="flex-1 truncate">
                                  {option.countryCode ? (
                                    <strong className="text-blue-500 dark:text-blue-400 font-bold mr-1">
                                      [{option.countryCode}]
                                    </strong>
                                  ) : null}
                                  {option.profileName ||
                                    (option.label.includes(" | ")
                                      ? option.label.split(" | ")[1]
                                      : option.label)}
                                  {option.profileId ? (
                                    <span className="text-[10px] text-slate-400 ml-1 font-normal">
                                      ({option.profileId})
                                    </span>
                                  ) : null}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!loading && !hasCompanyGroup && (
              <>
                <CommandEmpty>{t("No results found.")}</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => {
                    const isSelected = selectedArray.includes(option.value);
                    return (
                      <CommandItem
                        key={option.value}
                        value={String(option.label || option.value)}
                        onSelect={() => handleSelect(option.value)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-sm cursor-pointer select-none transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <div
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
                            isSelected
                              ? "bg-[#1A9FD4] dark:bg-[#2374F2] border-[#1A9FD4] dark:border-[#2374F2] text-white"
                              : "border-input bg-transparent opacity-60"
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>
                        <span className="flex-1 truncate">{option.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
