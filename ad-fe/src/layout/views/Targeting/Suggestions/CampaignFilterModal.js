import React, { useState, useEffect, useContext } from "react";
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import font from "../../../../assets/images/filter.svg";
import { ApiGetKeywordUniqueFilterValues } from "../../../../api-wrapper/targeting/ApiTargeting";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import { StyledCheckbox } from "../../../../common/grid/StyledCheckbox";
import { FiSearch, FiFilter } from "react-icons/fi";
import { useTranslation } from "react-i18next";

export default function CampaignFilterModal(props) {
  const { t } = useTranslation();
  const { displayName, paramId, conditionObj, setConditionObj, fetchData, externalShow, setExternalShow, campaignType } = props;
  const { profileId } = useContext(ProfileContext);
  const [show, setShow] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 992);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 992);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const displayLabel = displayName === "AD GROUP" ? "Adgroup" : "Campaign";

  // Keep internal 'show' explicitly synced with 'externalShow'
  useEffect(() => {
    if (externalShow !== undefined) {
      setShow(externalShow);
    }
  }, [externalShow]);

  const handleClose = () => {
    setShow(false);
    if (setExternalShow) setExternalShow(false);
  };

  const [activeTab, setActiveTab] = useState("SELECT"); // SELECT, EQUALS, CONTAINS, NOT_CONTAINS, NOT_EQUALS
  const [tempValues, setTempValues] = useState({
    EQUALS: "",
    CONTAINS: "",
    NOT_CONTAINS: "",
    NOT_EQUALS: ""
  });
  const [checkboxSearch, setCheckboxSearch] = useState("");

  const fetchOptions = async () => {
    if (!profileId?.value || !paramId) return;
    setLoading(true);
    const res = await ApiGetKeywordUniqueFilterValues({
      profileId: profileId.value,
      fieldName: paramId,
      campaignType: campaignType
    });
    if (res?.isSuccess) {
      setOptions(res.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (show) {
      const currentFilter = conditionObj[paramId] || {};
      const op = currentFilter.operator || "SELECT";
      setActiveTab(op);

      // Initialize tempValues carefully
      const initialTemps = { EQUALS: "", CONTAINS: "", NOT_CONTAINS: "", NOT_EQUALS: "" };
      if (op !== "SELECT") {
        initialTemps[op] = currentFilter.value || "";
      }
      setTempValues(initialTemps);

      if (op === "SELECT") {
        const vals = typeof currentFilter.value === "string" ? currentFilter.value.split("\n") : [];
        setSelectedOptions(vals.filter(Boolean));
        fetchOptions();
      } else {
        setSelectedOptions([]);
      }
    }
  }, [show]); // Only trigger on show to ensure reset behavior

  useEffect(() => {
    if (activeTab === "SELECT" && show && options.length === 0) {
      fetchOptions();
    }
  }, [activeTab]);

  const handleApply = () => {
    let finalValue = "";
    if (activeTab === "SELECT") {
      finalValue = selectedOptions.join("\n");
    } else {
      finalValue = tempValues[activeTab] || "";
    }

    const updatedFilter = {
      ...conditionObj,
      [paramId]: {
        operator: activeTab,
        value: finalValue
      }
    };
    if (!finalValue || finalValue.trim() === "") {
      delete updatedFilter[paramId]; // Remove filter if empty
    }
    setConditionObj(updatedFilter);
    handleClose();
  };

  const handleClear = () => {
    setTempValues({ EQUALS: "", CONTAINS: "", NOT_CONTAINS: "", NOT_EQUALS: "" });
    setSelectedOptions([]);
  };

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(checkboxSearch.toLowerCase())
  );

  const toggleOption = (opt) => {
    setSelectedOptions(prev =>
      prev.includes(opt) ? prev.filter(i => i !== opt) : [...prev, opt]
    );
  };

  return (
    <div style={{ display: "inline-block", marginLeft: "4px" }}>
      {/* Don't show the small filter icon inline if externalShow is controlled. */}
      {externalShow === undefined && (
        <img
          src={font}
          alt={t("Filter")}
          className="custom-filter-icon"
          style={{ cursor: "pointer", width: "12px", opacity: show ? 1 : 0.7 }}
          onClick={() => setShow(true)}
        />
      )}

      <Dialog open={show} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent
          className="max-w-[780px] w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col font-sans"
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
                <FiFilter size={16} />
              </span>
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                {t(displayName)}
              </DialogTitle>
            </div>
          </div>

          {/* Split Content Area */}
          <div className="flex flex-col md:flex-row min-h-[350px]">
            {/* LEFT: Radio Tab Panel */}
            <div className="md:w-[240px] border-r border-slate-100 dark:border-white/10 p-4 bg-slate-50/50 dark:bg-white/5 flex flex-col gap-3 shrink-0">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t("Tab")}</span>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
                <input
                  type="radio"
                  name="campaignFilterTab"
                  className="h-4 w-4 border-slate-300 dark:border-white/20 bg-transparent dark:bg-slate-900 text-sky-500 focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 outline-none"
                  checked={activeTab === "SELECT"}
                  onChange={() => setActiveTab("SELECT")}
                />
                <span>{t("Select")} {t(displayLabel)}(s)</span>
              </label>

              {["EQUALS", "CONTAINS", "NOT_CONTAINS", "NOT_EQUALS"].map((tab) => (
                <label key={tab} className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
                  <input
                    type="radio"
                    name="campaignFilterTab"
                    className="h-4 w-4 border-slate-300 dark:border-white/20 bg-transparent dark:bg-slate-900 text-sky-500 focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 outline-none"
                    checked={activeTab === tab}
                    onChange={() => setActiveTab(tab)}
                  />
                  <span>
                    {tab === "EQUALS" && t("Equals")}
                    {tab === "CONTAINS" && t("Contains")}
                    {tab === "NOT_CONTAINS" && t("Does Not Contain")}
                    {tab === "NOT_EQUALS" && t("Not Equals")}
                  </span>
                </label>
              ))}
            </div>

            {/* RIGHT: Input / Selection List */}
            <div className="flex-1 p-6 flex flex-col bg-white dark:bg-transparent overflow-y-auto">
              {activeTab === "SELECT" ? (
                <div className="h-full flex flex-col gap-3">
                  {/* Search box inside options list */}
                  <div className="relative">
                    <input
                      placeholder={`${t("Search By")} ${t(displayLabel)}s...`}
                      value={checkboxSearch}
                      onChange={(e) => setCheckboxSearch(e.target.value)}
                      className="w-full h-9 pl-9 pr-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-transparent text-slate-900 dark:text-white"
                    />
                    <FiSearch className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" size={14} />
                  </div>

                  {/* List of checkboxes */}
                  <div className="flex-1 min-h-[160px] overflow-y-auto border border-slate-100 dark:border-white/5 rounded-xl p-2 flex flex-col gap-1">
                    {loading ? (
                      <div className="text-center py-10 text-xs text-slate-400 dark:text-slate-500">
                        <div className="flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-sky-500 border-t-transparent" />
                          <span>{t("Loading")} {t(displayName)}...</span>
                        </div>
                      </div>
                    ) : filteredOptions.length > 0 ? (
                      filteredOptions.map((opt, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                          onClick={() => toggleOption(opt)}
                        >
                          <StyledCheckbox
                            checked={selectedOptions.includes(opt)}
                            onChange={() => toggleOption(opt)}
                          />
                          <span className="text-xs text-slate-700 dark:text-slate-300 truncate font-medium" title={opt}>
                            {opt}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-10 text-xs text-slate-400 dark:text-slate-500">
                        {t("No")} {t(displayName)} {t("found")}.
                      </div>
                    )}
                  </div>

                  {/* Footer selection label */}
                  <div className="flex justify-between items-center text-xs shrink-0 mt-1">
                    {selectedOptions.length > 0 ? (
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-700 dark:text-slate-200">{selectedOptions.length} {t("Selected")}</span>
                        <ShadcnButton
                          variant="link"
                          className="p-0 h-auto text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 font-semibold"
                          onClick={() => setSelectedOptions([])}
                        >
                          {t("Deselect All")}
                        </ShadcnButton>
                      </div>
                    ) : (
                      <ShadcnButton
                        variant="link"
                        className="p-0 h-auto text-xs text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 font-semibold"
                        onClick={() => setSelectedOptions(options)}
                      >
                        {t("Select all")} {options.length} {t(displayLabel)}(s) {t("available")}
                      </ShadcnButton>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col gap-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {t("Enter the")} {t(displayName)} {t("separated by new line")}
                  </label>
                  <textarea
                    className="flex-1 min-h-[200px] p-3 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-transparent resize-none"
                    value={tempValues[activeTab]}
                    onChange={(e) => setTempValues({ ...tempValues, [activeTab]: e.target.value })}
                    placeholder={t("Enter names here...")}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 shrink-0">
            <ShadcnButton
              variant="ghost"
              className="h-[36px] px-4 rounded-lg text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              onClick={handleClear}
            >
              {t("Clear")}
            </ShadcnButton>
            <div className="flex gap-2">
              <ShadcnButton
                variant="outline"
                className="h-[36px] px-4 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10"
                onClick={handleClose}
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
    </div>
  );
}
