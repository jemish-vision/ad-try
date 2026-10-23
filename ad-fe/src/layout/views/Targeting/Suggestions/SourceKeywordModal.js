import React, { useState, useEffect } from "react";
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { FiX } from "react-icons/fi";
import { useTranslation } from "react-i18next";

const OPERATORS = [
  { label: "Equals", value: "EQUALS" },
  { label: "Contains", value: "CONTAINS" },
  { label: "Does Not Contain", value: "NOT_CONTAINS" },
  { label: "Not Equals", value: "NOT_EQUALS" },
];

const FIELD = "targeting";

export default function SourceKeywordModal({ show, onHide, conditionObj, setConditionObj }) {
  const { t } = useTranslation();
  const [operator, setOperator] = useState("EQUALS");
  const [tempValues, setTempValues] = useState({
    EQUALS: "",
    CONTAINS: "",
    NOT_CONTAINS: "",
    NOT_EQUALS: ""
  });
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Count non-empty lines as keywords for current operator
  const keywordCount = (tempValues[operator] || "").split("\n").filter((v) => v.trim() !== "").length;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (show) {
      const current = conditionObj[FIELD] || {};
      const currentOp = current.operator || "EQUALS";
      setOperator(currentOp);

      setTempValues({
        EQUALS: currentOp === "EQUALS" ? current.value || "" : "",
        CONTAINS: currentOp === "CONTAINS" ? current.value || "" : "",
        NOT_CONTAINS: currentOp === "NOT_CONTAINS" ? current.value || "" : "",
        NOT_EQUALS: currentOp === "NOT_EQUALS" ? current.value || "" : ""
      });
    }
  }, [show]);

  const handleApply = () => {
    const updated = { ...conditionObj };
    const currentVal = tempValues[operator] || "";
    const trimmed = currentVal.trim();
    if (trimmed) {
      updated[FIELD] = { operator, value: trimmed };
    } else {
      delete updated[FIELD];
    }
    setConditionObj(updated);
    onHide();
  };

  const handleClear = () => {
    setOperator("EQUALS");
    setTempValues({
      EQUALS: "",
      CONTAINS: "",
      NOT_CONTAINS: "",
      NOT_EQUALS: ""
    });
  };

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
      <DialogContent
        className="max-w-[720px] w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col font-sans"
        onInteractOutside={(e) => e.preventDefault()}
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
            {t("Source Keyword")}
          </DialogTitle>
        </div>

        {/* Body content split */}
        <div className="flex flex-col md:flex-row min-h-[300px]">
          {/* LEFT: Radio operators panel */}
          <div className="md:w-[220px] border-r border-slate-100 dark:border-white/10 p-4 bg-slate-50/50 dark:bg-white/5 flex flex-col gap-3 shrink-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t("Operator")}</span>
            {OPERATORS.map((op) => (
              <label
                key={op.value}
                className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none"
              >
                <input
                  type="radio"
                  name="src-kw-operator"
                  className="text-sky-500 focus:ring-sky-500"
                  id={`src-kw-op-${op.value}`}
                  checked={operator === op.value}
                  onChange={() => setOperator(op.value)}
                />
                <span>{t(op.label)}</span>
              </label>
            ))}
          </div>

          {/* RIGHT: Textarea input */}
          <div className="flex-1 p-4 flex flex-col">
            <textarea
              className="w-full flex-1 p-3 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 text-slate-800 dark:text-slate-200 resize-none min-h-[220px]"
              placeholder={t("Enter keyword (one per line)...")}
              value={tempValues[operator]}
              onChange={(e) => setTempValues({ ...tempValues, [operator]: e.target.value })}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 dark:border-white/10 shrink-0 bg-white dark:bg-[#0c1222]/95">
          <ShadcnButton
            variant="ghost"
            onClick={handleClear}
            className="h-[36px] px-3 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            {t("Clear")}
          </ShadcnButton>

          <div className="flex gap-2">
            <ShadcnButton
              variant="outline"
              onClick={onHide}
              className="h-[36px] px-4 text-xs font-bold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10"
            >
              {t("cancel")}
            </ShadcnButton>
            <ShadcnButton
              onClick={handleApply}
              className="bg-[#2374F2] hover:bg-[#2374F2]/90 border-0 rounded-lg px-6 h-[36px] font-semibold text-[13px] text-white shadow-none"
            >
              {t("Apply")}
            </ShadcnButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
