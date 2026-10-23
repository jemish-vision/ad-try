import React, { useEffect, useState } from "react";
import font from "../../assets/images/filter.svg";
import LightFont from "../../assets/images/light-filter.svg";
import { MdFilterAlt } from "react-icons/md";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../../components/ui/select";
import { useTranslation } from "react-i18next";

const CONDITION_OPTIONS = [
  { value: "none", label: "Select Condition" },
  { value: "$lt", label: "Less than" },
  { value: "$lte", label: "Less than or equal" },
  { value: "$eq", label: "Equal to" },
  { value: "$gte", label: "Greater than or equal" },
  { value: "$gt", label: "Greater than" }
];

const OPERATOR_OPTIONS = [
  { value: "none", label: "None" },
  { value: "AND", label: "AND" },
  { value: "OR", label: "OR" }
];

function CustomFilter({
  field,
  showFilter,
  setShowFilter,
  conditionObj,
  setConditionObj,
  setfieldName,
  setCustomFilterFlag,
  defaultValue,
  isLight = false,
  hideOperator = false,
}) {
  const { t } = useTranslation();
  const [localObj, setLocalObj] = useState(defaultValue);
  const [firstvalidation, setfirstvalidation] = useState(false);
  const [secondvalidation, setsecondvalidation] = useState(false);
  const [flag, setflag] = useState(false);

  useEffect(() => {
    if (showFilter) {
      const hasExisting = conditionObj?.firstCondition && conditionObj?.firstValue && conditionObj?.fieldName === field;
      setLocalObj(hasExisting ? conditionObj : defaultValue);
      setflag(false);
      setfirstvalidation(false);
      setsecondvalidation(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFilter, field]);

  const FilterHandler = (field) => {
    setflag(true);

    const isFirstValid =
      localObj?.firstCondition &&
      localObj?.firstCondition !== "none" &&
      localObj?.firstValue !== '' &&
      localObj?.firstValue !== null &&
      localObj?.firstValue !== undefined;

    const isSecondValid =
      !localObj?.operator || localObj?.operator === "none"
        ? true
        : localObj?.secondCondition &&
        localObj?.secondCondition !== "none" &&
        localObj?.secondValue !== '' &&
        localObj?.secondValue !== null &&
        localObj?.secondValue !== undefined;

    setfirstvalidation(isFirstValid);
    if (localObj?.operator && localObj?.operator !== "none") setsecondvalidation(isSecondValid);

    const canApply = localObj?.operator && localObj?.operator !== "none"
      ? isFirstValid && isSecondValid
      : isFirstValid;

    if (canApply) {
      const payload = { ...localObj };
      if (payload.firstCondition === "none") payload.firstCondition = "";
      if (payload.secondCondition === "none") payload.secondCondition = "";
      if (payload.operator === "none") payload.operator = "";

      setConditionObj(payload);
      setfieldName(field);
      setCustomFilterFlag();
      setShowFilter(false);
    }
  };

  return (
    <>
      <img
        className="ml-2 cursor-pointer custom-filter-icon"
        style={{
          width: "14px",
          height: "16px",
          marginBottom: "2px",
          opacity: showFilter ? 1 : 0.7,
          transition: "opacity 0.2s ease",
          filter: showFilter ? "brightness(1.2)" : "brightness(1)"
        }}
        src={isLight ? LightFont : font}
        onClick={() => setShowFilter(!showFilter)}
        alt={t("Filter")}
        title={t("Click to open filter")}
      />

      <div className="customFilter">
        {showFilter && (
          <Dialog open={showFilter} onOpenChange={setShowFilter}>
            <DialogContent
              className="max-w-[450px] w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col font-sans"
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
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-xl flex items-center justify-center bg-sky-500/10 border border-sky-500/20 text-sky-500 dark:text-sky-400">
                    <MdFilterAlt size={16} />
                  </span>
                  <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                    {t("Filter:")} {t(field)}
                  </DialogTitle>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto max-h-[70vh] flex flex-col gap-4">
                {/* First Condition */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t("Condition")} <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={localObj?.firstCondition || "none"}
                    onValueChange={(val) => setLocalObj({ ...localObj, firstCondition: val })}
                  >
                    <SelectTrigger className="w-full h-[42px] border-slate-200 dark:border-white/10 bg-white dark:bg-[#1e293b] rounded-xl">
                      <SelectValue placeholder={t("Select Condition")} />
                    </SelectTrigger>
                    <SelectContent className="z-[9999]">
                      {CONDITION_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{t(opt.label)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* First Value */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t("Value")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    className="w-full h-[42px] px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1e293b] text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder={t("Enter value")}
                    value={localObj?.firstValue || ""}
                    onChange={(e) => setLocalObj({ ...localObj, firstValue: e.target.value })}
                  />
                </div>

                {(!firstvalidation && flag) && (
                  <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-xs border border-red-200 dark:border-red-900/50">
                    {t("Please select a condition and enter a value.")}
                  </div>
                )}

                {/* Operator (optional) */}
                {!hideOperator && (
                  <>
                    <div className="flex items-center gap-3 my-2">
                      <div className="h-px bg-slate-200 dark:bg-white/10 flex-1" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {t("SECOND CONDITION (OPTIONAL)")}
                      </span>
                      <div className="h-px bg-slate-200 dark:bg-white/10 flex-1" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{t("Operator")}</label>
                      <Select
                        value={localObj?.operator || "none"}
                        onValueChange={(val) => setLocalObj({ ...localObj, operator: val })}
                      >
                        <SelectTrigger className="w-full h-[42px] border-slate-200 dark:border-white/10 bg-white dark:bg-[#1e293b] rounded-xl">
                          <SelectValue placeholder={t("None")} />
                        </SelectTrigger>
                        <SelectContent className="z-[9999]">
                          {OPERATOR_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{t(opt.label)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {localObj?.operator && localObj?.operator !== "none" && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{t("Second Condition")}</label>
                      <Select
                        value={localObj?.secondCondition || "none"}
                        onValueChange={(val) => setLocalObj({ ...localObj, secondCondition: val })}
                      >
                        <SelectTrigger className="w-full h-[42px] border-slate-200 dark:border-white/10 bg-white dark:bg-[#1e293b] rounded-xl">
                          <SelectValue placeholder={t("Select Condition")} />
                        </SelectTrigger>
                        <SelectContent className="z-[9999]">
                          {CONDITION_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{t(opt.label)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{t("Second Value")}</label>
                      <input
                        type="number"
                        className="w-full h-[42px] px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1e293b] text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                        placeholder={t("Enter second value")}
                        value={localObj?.secondValue || ""}
                        onChange={(e) => setLocalObj({ ...localObj, secondValue: e.target.value })}
                      />
                    </div>

                    {(!secondvalidation && flag) && (
                      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-xs border border-red-200 dark:border-red-900/50">
                        {t("Please complete the second condition.")}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 px-6 border-t border-slate-100 dark:border-white/10 flex justify-between items-center w-full shrink-0">
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl transition-all"
                  onClick={() => {
                    setShowFilter(false);
                    setflag(false);
                    setLocalObj(defaultValue);
                  }}
                >
                  {t("Clear")}
                </button>
                <button
                  type="button"
                  className="h-[36px] bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] text-white hover:opacity-90 border-0 whitespace-nowrap px-5 rounded-xl font-semibold shadow-sm text-sm transition-all"
                  onClick={() => FilterHandler(field)}
                >
                  {t("Apply Filter")}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </>
  );
}

export default CustomFilter;
