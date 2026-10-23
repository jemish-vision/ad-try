import React, { useState, useEffect } from "react";
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { useTranslation } from "react-i18next";

export default function CampaignTypeModal({ show, onHide, conditionObj, setConditionObj, paramId = "type" }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (show) {
      const current = conditionObj[paramId]?.value || "";
      setSelected(current);
    }
  }, [show, conditionObj]);

  const handleApply = () => {
    const updated = { ...conditionObj };
    if (selected) {
      updated[paramId] = {
        operator: "EQUALS",
        value: selected
      };
    } else {
      delete updated[paramId];
    }
    setConditionObj(updated);
    onHide();
  };

  const options = [
    { label: "Sponsored Products (SP)", value: "Sponsored Products" },
    { label: "Sponsored Brands (SB)", value: "Sponsored Brands" },
    { label: "Sponsored Display (SD)", value: "Sponsored Display" }
  ];

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
      <DialogContent
        className="max-w-[420px] w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col font-sans"
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

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-white/10 shrink-0">
          <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
            {t("Campaign Type")}
          </DialogTitle>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none"
              >
                <input
                  type="radio"
                  name="campaignType"
                  id={`type-${opt.value}`}
                  className="text-sky-500 focus:ring-sky-500"
                  checked={selected === opt.value}
                  onChange={() => setSelected(opt.value)}
                />
                <span>{t(opt.label)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 shrink-0">
          <ShadcnButton
            variant="ghost"
            className="h-[36px] px-4 rounded-lg text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
            onClick={() => setSelected("")}
          >
            {t("Clear")}
          </ShadcnButton>
          <div className="flex gap-2">
            <ShadcnButton
              variant="outline"
              className="h-[36px] px-4 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10"
              onClick={onHide}
            >
              {t("Cancel")}
            </ShadcnButton>
            <ShadcnButton
              className="h-[36px] px-4 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-90 transition-opacity"
              onClick={handleApply}
            >
              {t("Apply")}
            </ShadcnButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
