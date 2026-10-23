import React from "react";
import { useTranslation } from "react-i18next";
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { FiTrash2, FiSlash, FiInfo } from "react-icons/fi";

export default function DismissConfirmModal({ show, onHide, type, selectedRows, onConfirm }) {
  const { t } = useTranslation();

  const CONFIG = {
    REMOVE_FROM_LIST: {
      title: t("Remove From List"),
      Icon: FiTrash2,
      iconColor: "text-red-500",
      headerBg: "bg-red-500",
      message: (count) =>
        t("Are you sure you want to remove {{count}} selected keywords from the suggestions list?", {
          count,
          defaultValue: `Are you sure you want to remove ${count} selected keyword${count > 1 ? "s" : ""} from the suggestions list?`
        }),
      note: t("These keywords will no longer appear in your suggestions."),
      confirmLabel: t("Remove"),
      confirmClass: "bg-red-500 hover:bg-red-600 text-white shadow-[0_4px_12px_rgba(239,68,68,0.25)]",
    },
    NEVER_RECOMMANDED: {
      title: t("Never Recommend Again"),
      Icon: FiSlash,
      iconColor: "text-amber-500",
      headerBg: "bg-amber-500",
      message: (count) =>
        t("Are you sure you want to mark {{count}} selected keywords as Never Recommend Again?", {
          count,
          defaultValue: `Are you sure you want to mark ${count} selected keyword${count > 1 ? "s" : ""} as "Never Recommend Again"?`
        }),
      note: t("These keywords will be permanently excluded from future suggestions."),
      confirmLabel: t("Confirm"),
      confirmClass: "bg-amber-500 hover:bg-amber-600 text-white shadow-[0_4px_12px_rgba(245,158,11,0.25)]",
    },
  };

  const cfg = CONFIG[type] || CONFIG.REMOVE_FROM_LIST;
  const count = selectedRows?.length || 0;
  const IconComponent = cfg.Icon;

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
      <DialogContent
        className="max-w-[480px] w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col font-sans"
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Glow Line Indicator */}
        <div
          className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
            opacity: 0.8
          }}
        />

        {/* Top Header */}
        <div className={`flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-white/10 shrink-0`}>
          <span className={`p-2 rounded-xl flex items-center justify-center bg-slate-50 dark:bg-white/5 ${cfg.iconColor}`}>
            <IconComponent size={18} />
          </span>
          <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
            {cfg.title}
          </DialogTitle>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-normal">
            {cfg.message(count)}
          </p>

          <div className="flex items-start gap-2 text-slate-400 dark:text-slate-500 text-xs">
            <FiInfo size={14} className="mt-0.5 flex-shrink-0" />
            <span className="leading-normal">{cfg.note}</span>
          </div>

          {/* Preview of selected keywords */}
          {count > 0 && (
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl p-3 flex flex-col gap-2 max-h-[140px] overflow-y-auto">
              {selectedRows.slice(0, 5).map((r, i) => (
                <div
                  key={i}
                  className="text-xs text-slate-600 dark:text-slate-300 py-1.5 flex items-center gap-2 border-b border-slate-200/40 dark:border-white/5 last:border-0"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                  <span className="font-medium truncate">{r.searchTerm}</span>
                </div>
              ))}
              {count > 5 && (
                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 text-center pt-1">
                  + {count - 5} {count - 5 === 1 ? t("more keyword") : t("more keywords")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 shrink-0">
          <ShadcnButton
            variant="outline"
            className="h-[36px] px-4 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10"
            onClick={onHide}
          >
            {t("Cancel")}
          </ShadcnButton>
          <ShadcnButton
            className={`h-[36px] px-4 rounded-lg text-xs font-bold transition-all duration-200 active:scale-[0.98] ${cfg.confirmClass}`}
            onClick={onConfirm}
          >
            {cfg.confirmLabel}
          </ShadcnButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
