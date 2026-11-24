import React from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function RecommendationBulkSelection({
    id, allSelected, selectedCount, totalCount, onToggle, disabled, loading,
}) {
    const { t, i18n } = useTranslation();
    const format = (count) => count.toLocaleString(i18n.resolvedLanguage);

    return (
        <button
            id={id}
            type="button"
            onClick={onToggle}
            disabled={disabled || loading}
            title={allSelected ? t("Deselect all records") : t("Select all {{count}} records", { count: totalCount })}
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-semibold border transition-all duration-150 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50 ${allSelected
                ? "bg-sky-500 text-white border-sky-600 dark:bg-sky-600 dark:border-sky-500 hover:bg-sky-600"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200/90 dark:border-white/10 hover:border-sky-500/50 hover:bg-sky-50/50 dark:hover:bg-white/5"}`}
        >
            {loading ? (
                <span aria-hidden="true" className="w-3.5 h-3.5 border-2 border-slate-300 border-t-sky-500 rounded-full animate-spin shrink-0" />
            ) : (
                <span aria-hidden="true" className={`flex size-[18px] shrink-0 items-center justify-center rounded border ${allSelected
                    ? "bg-white/20 border-white/60"
                    : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"}`}>
                    {allSelected && <Check size={13} strokeWidth={3} />}
                </span>
            )}
            <span>{t(loading ? "Selecting all..." : allSelected ? "Deselect All" : "Select All")}</span>
            <span aria-live="polite" className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold ${allSelected
                ? "bg-white/25 text-white"
                : "bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-[#38bdf8]"}`}>
                {selectedCount > 0 ? `${format(selectedCount)} / ${format(totalCount)}` : format(totalCount)}
            </span>
        </button>
    );
}
