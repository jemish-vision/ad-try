import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent } from "../../../../components/ui/dialog";
import { StyledCheckbox } from "../../../../common/grid/StyledCheckbox";
import { FiX, FiEdit, FiTrash, FiAlertTriangle, FiBookOpen } from "react-icons/fi";

export default function AddNegativeKeywordModal({ show, onHide, selectedRows, onSubmit }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [negExact, setNegExact] = useState(true);
  const [negPhrase, setNegPhrase] = useState(false);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (show && selectedRows?.length > 0) {
      setRows(
        selectedRows.map((r) => ({
          id: r.id,
          checked: true,
          keyword: r.searchTerm || "",
          campaignName: r.campaignName || "",
          adGroupName: r.adGroupName || "",
          campaignId: r.campaignId,
          adGroupId: r.adGroupId,
          campaignType: r.campaignType,
        }))
      );
      setEditingId(null);
      setNegExact(true);
      setNegPhrase(false);
    }
  }, [show, selectedRows]);

  const toggleRow = (id) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, checked: !r.checked } : r)));

  const toggleAll = (checked) =>
    setRows((prev) => prev.map((r) => ({ ...r, checked })));

  const updateKeyword = (id, value) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, keyword: value } : r)));

  const allChecked = rows.length > 0 && rows.every((r) => r.checked);
  const someChecked = rows.some((r) => r.checked);
  const canSubmit = someChecked && (negExact || negPhrase);

  const handleSubmit = () => {
    const selected = rows.filter((r) => r.checked);
    const items = [];
    selected.forEach((r) => {
      if (negExact)
        items.push({ searchTerm: r.keyword, campaignId: r.campaignId, adGroupId: r.adGroupId, type: "NEGATIVE_EXACT", campaignType: r.campaignType });
      if (negPhrase)
        items.push({ searchTerm: r.keyword, campaignId: r.campaignId, adGroupId: r.adGroupId, type: "NEGATIVE_PHRASE", campaignType: r.campaignType });
    });
    onSubmit(items);
  };

  return (
    <Dialog open={show} onOpenChange={(isOpen) => { if (!isOpen) onHide(); }}>
      <DialogContent 
        className="max-w-[850px] w-[95vw] p-8 rounded-[24px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/90 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[90vh] [&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-white/10 [&>button]:bg-slate-50 dark:[&>button]:bg-white/5 [&>button]:text-slate-500 dark:[&>button]:text-white/70 hover:[&>button]:text-slate-900 dark:hover:[&>button]:text-white [&>button]:rounded-full [&>button]:p-1.5 [&>button]:transition-all"
        onInteractOutside={(e) => e.preventDefault()} 
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Circuit top glow line indicator */}
        <div 
          className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent 0%, #2374F2 25%, #3ECFA8 60%, #7c64ff 80%, transparent 100%)",
            opacity: 0.8
          }}
        />

        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-white/10 shrink-0 mb-4">
          <span className="bg-sky-500/10 border border-sky-500/20 text-sky-500 dark:text-sky-400 p-2.5 rounded-xl flex items-center justify-center flex-shrink-0">
            <FiBookOpen size={18} />
          </span>
          <div className="flex flex-col text-left">
            <div className="text-lg font-bold text-slate-900 dark:text-white leading-tight font-sans">
              {t("Add Negative Keyword(s)")}
            </div>
            <div className="text-xs text-slate-500 dark:text-white/50 font-medium mt-0.5">
              {t("Review and select keyword exclusions for targeted campaigns and ad groups")}
            </div>
          </div>
        </div>

        {/* Scrollable table container */}
        <div className="flex-1 overflow-y-auto px-1.5 pt-1 pb-4 flex flex-col gap-4 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden" style={{ background: isDark ? "rgba(255, 255, 255, 0.01)" : "rgba(0, 0, 0, 0.01)" }}>
          <table className="w-full text-left border-collapse" style={{ background: "transparent" }}>
            <thead>
              <tr style={{ 
                background: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.02)",
                borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(0, 0, 0, 0.08)"
              }}>
                <th className="w-[48px] px-4 py-3" style={{ background: "transparent" }}>
                  <StyledCheckbox checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider w-[35%]" style={{ 
                  background: "transparent",
                  color: isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)"
                }}>
                  {t("New Keyword")}
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider w-[35%]" style={{
                  background: "transparent",
                  color: isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)"
                }}>
                  {t("Campaign")}
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider" style={{
                  background: "transparent",
                  color: isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)"
                }}>
                  {t("Ad Group")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr 
                  key={row.id} 
                  style={{
                    background: row.checked ? (isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(35, 116, 242, 0.04)") : "transparent",
                    borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.05)" : "1px solid rgba(0, 0, 0, 0.05)",
                    opacity: row.checked ? 1 : 0.65
                  }}
                  className="transition-colors duration-150"
                >
                  <td className="px-4 py-3.5 align-middle" style={{ background: "transparent" }}>
                    <StyledCheckbox checked={row.checked} onChange={() => toggleRow(row.id)} />
                  </td>
                  <td className="px-4 py-3.5 align-middle font-medium text-sm" style={{ background: "transparent" }}>
                    {editingId === row.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={row.keyword}
                        onChange={(e) => updateKeyword(row.id, e.target.value)}
                        onBlur={() => setEditingId(null)}
                        onKeyDown={(e) => e.key === "Enter" && setEditingId(null)}
                        className="h-[32px] px-3.5 w-full rounded-lg border border-[#2374F2] bg-white text-slate-900 dark:bg-[#1e293b] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#2374F2] text-xs font-semibold"
                      />
                    ) : (
                      <div className="flex items-center justify-between w-full group">
                        <span className="font-semibold" style={{ color: isDark ? "#38bdf8" : "#2374F2" }}>{row.keyword}</span>
                        <button 
                          type="button" 
                          onClick={() => setEditingId(row.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-opacity p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg"
                        >
                          <FiEdit size={13} />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 align-middle text-xs font-medium" style={{ 
                    background: "transparent",
                    color: isDark ? "#cbd5e1" : "#475569"
                  }}>
                    {row.campaignName}
                  </td>
                  <td className="px-4 py-3.5 align-middle text-xs font-medium" style={{ 
                    background: "transparent",
                    color: isDark ? "#cbd5e1" : "#475569"
                  }}>
                    {row.adGroupName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer controls section outside overflow container */}
        <div className="pt-5 mt-2 border-t border-slate-100 dark:border-white/10 flex flex-col gap-4 shrink-0">
          <div className="flex flex-col gap-1 text-left">
            <span className="text-[12.5px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              {t("Select Match Type")} <span className="text-red-500 font-bold">*</span>
            </span>
            <div className="flex items-center gap-6 mt-1.5">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer user-select-none text-slate-700 dark:text-slate-300">
                <StyledCheckbox checked={negExact} onChange={() => setNegExact((v) => !v)} />
                {t("Negative Exact")}
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer user-select-none text-slate-700 dark:text-slate-300">
                <StyledCheckbox checked={negPhrase} onChange={() => setNegPhrase((v) => !v)} />
                {t("Negative Phrase")}
              </label>
            </div>
            {!negExact && !negPhrase && (
              <div className="text-[11px] font-semibold text-rose-500 mt-1 flex items-center gap-1.5 animate-bounce">
                <FiAlertTriangle size={12} />
                {t("Please select at least one match type.")}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-1 border-t border-slate-100/50 dark:border-white/5 mt-1">
            <button
              type="button"
              className="h-[40px] px-6 rounded-xl flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white active:scale-[0.98]"
              onClick={onHide}
            >
              {t("Cancel")}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="auth-btn-primary h-[40px] px-6 flex items-center justify-center !py-0 !leading-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                width: "auto",
                marginBottom: 0
              }}
            >
              {t("Submit")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
