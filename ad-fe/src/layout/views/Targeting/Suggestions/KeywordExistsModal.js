import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";

const FIELD = "keywordExistsInAccount";

export default function KeywordExistsModal({ show, onHide, conditionObj, setConditionObj }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(""); // "true" | "false" | ""

  useEffect(() => {
    if (show) {
      const current = conditionObj[FIELD];
      setSelected(current ? current.value : "");
    }
  }, [show]);

  const handleApply = () => {
    const updated = { ...conditionObj };
    if (selected !== "") {
      updated[FIELD] = { operator: "EQUALS", value: selected };
    } else {
      delete updated[FIELD];
    }
    setConditionObj(updated);
    onHide();
  };

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
            {t("Keyword Exists In Account")}
          </DialogTitle>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
              <input
                type="radio"
                name="keyword-exists"
                id="kw-exists-yes"
                className="h-4 w-4 border-slate-300 dark:border-white/20 bg-transparent dark:bg-slate-900 text-sky-500 focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 outline-none"
                checked={selected === "true"}
                onChange={() => setSelected("true")}
              />
              <span>{t("Yes")}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
              <input
                type="radio"
                name="keyword-exists"
                id="kw-exists-no"
                className="h-4 w-4 border-slate-300 dark:border-white/20 bg-transparent dark:bg-slate-900 text-sky-500 focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 outline-none"
                checked={selected === "false"}
                onChange={() => setSelected("false")}
              />
              <span>{t("No")}</span>
            </label>
          </div>
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
            className="h-[36px] px-4 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-90 transition-opacity"
            onClick={handleApply}
          >
            {t("Apply")}
          </ShadcnButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
