import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button as ShadcnButton } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { FiPlay, FiPause, FiInfo } from "react-icons/fi";

export default function StatusConfirmModal({ show, onHide, action, selectedItems = [], onConfirm }) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!show) {
      setIsExpanded(false);
    }
  }, [show]);

  const count = selectedItems.length;
  const isPause = action === "PAUSED";
  
  const IconComponent = isPause ? FiPause : FiPlay;
  const iconColor = isPause ? "text-amber-500" : "text-green-500";
  const title = isPause ? t("Pause Keywords") : t("Enable Keywords");
  
  const message = isPause
    ? t("Are you sure you want to pause {{count}} selected keyword(s) in the respective campaign(s)?", { count })
    : t("Are you sure you want to enable {{count}} selected keyword(s) in the respective campaign(s)?", { count });

  const note = isPause
    ? t("Paused keywords will temporarily stop generating impressions and spend.")
    : t("Enabled keywords will resume bidding and performance tracking.");

  const confirmLabel = isPause ? t("Pause") : t("Enable");
  const confirmClass = isPause
    ? "bg-amber-500 hover:bg-amber-600 text-white shadow-[0_4px_12px_rgba(245,158,11,0.25)] border-0"
    : "bg-green-600 hover:bg-green-700 text-white shadow-[0_4px_12px_rgba(22,163,74,0.25)] border-0";

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
          <span className={`p-2 rounded-xl flex items-center justify-center bg-slate-50 dark:bg-white/5 ${iconColor}`}>
            <IconComponent size={18} />
          </span>
          <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
            {title}
          </DialogTitle>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-normal">
            {message}
          </p>

          <div className="flex items-start gap-2 text-slate-400 dark:text-slate-500 text-xs">
            <FiInfo size={14} className="mt-0.5 flex-shrink-0" />
            <span className="leading-normal">{note}</span>
          </div>

          {/* Preview of selected keywords and campaigns */}
          {count > 0 && (
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl p-3 flex flex-col gap-2 max-h-[180px] overflow-y-auto">
              {(isExpanded ? selectedItems : selectedItems.slice(0, 5)).map((r, i) => (
                <div
                  key={i}
                  className="text-xs text-slate-600 dark:text-slate-300 py-1.5 flex flex-col border-b border-slate-200/40 dark:border-white/5 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                    <span className="font-bold truncate">{r.targeting}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 pl-3.5 truncate">
                    {t("Campaign")}: {r.campaignName}
                  </span>
                </div>
              ))}
              {count > 5 && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-[10px] font-bold text-sky-500 hover:text-sky-600 text-center pt-1 border-0 bg-transparent cursor-pointer outline-none w-full"
                >
                  {isExpanded ? t("Show Less") : `+ ${count - 5} ${t("more keywords")}`}
                </button>
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
            className={`h-[36px] px-4 rounded-lg text-xs font-bold ${confirmClass}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </ShadcnButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

