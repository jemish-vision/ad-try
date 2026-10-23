import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { StyledCheckbox } from "../../../../common/grid/StyledCheckbox";
import { FiArrowLeft, FiX, FiTrash2 } from "react-icons/fi";

export default function AddKeywordStep2Modal({ show, onHide, onBack, rows: inputRows, onNext }) {
  const { t } = useTranslation();
  // Each row has: id, keyword, campaignName, adGroupName, campaignId, adGroupId
  // + match types: exact, phrase, broad (all true by default)
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (show && inputRows?.length > 0) {
      setRows(
        inputRows.map((r) => ({
          ...r,
          exact: true,
          phrase: true,
          broad: false,
        }))
      );
    }
  }, [show, inputRows]);

  // Toggle a single match type for one row
  const toggleMatch = (id, matchType) => {
    setRows((prev) =>
      prev.map((r) => r.id === id ? { ...r, [matchType]: !r[matchType] } : r)
    );
  };

  // Toggle ALL rows for a match type column
  const toggleAllMatch = (matchType) => {
    const allChecked = rows.every((r) => r[matchType]);
    setRows((prev) => prev.map((r) => ({ ...r, [matchType]: !allChecked })));
  };

  // Remove a row
  const removeRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const allExact = rows.length > 0 && rows.every((r) => r.exact);
  const allPhrase = rows.length > 0 && rows.every((r) => r.phrase);
  const allBroad = rows.length > 0 && rows.every((r) => r.broad);

  const canProceed = rows.length > 0 && rows.some((r) => r.exact || r.phrase || r.broad);

  const handleNext = () => {
    // Build final payload — one entry per keyword+matchType combination
    const payload = [];
    rows.forEach((r) => {
      const baseId = r.id || `${r.campaignId}_${r.adGroupId}_${r.keyword}`;
      if (r.exact) payload.push({ id: `${baseId}_EXACT`, campaignId: r.campaignId, adGroupId: r.adGroupId, keyword: r.keyword, matchType: "EXACT", campaignName: r.campaignName, adGroupName: r.adGroupName, campaignType: r.campaignType, avgCPC: r.avgCPC || 0 });
      if (r.phrase) payload.push({ id: `${baseId}_PHRASE`, campaignId: r.campaignId, adGroupId: r.adGroupId, keyword: r.keyword, matchType: "PHRASE", campaignName: r.campaignName, adGroupName: r.adGroupName, campaignType: r.campaignType, avgCPC: r.avgCPC || 0 });
      if (r.broad) payload.push({ id: `${baseId}_BROAD`, campaignId: r.campaignId, adGroupId: r.adGroupId, keyword: r.keyword, matchType: "BROAD", campaignName: r.campaignName, adGroupName: r.adGroupName, campaignType: r.campaignType, avgCPC: r.avgCPC || 0 });
    });
    onNext(payload);
  };

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
      <DialogContent
        className="max-w-[1100px] w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[90vh] font-sans"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Circuit top glow line indicator */}
        <div
          className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
            opacity: 0.8
          }}
        />

        {/* Top Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-white/10 shrink-0">
          <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
            {t("Add New Keyword(s) > Choose Match Types")}
          </DialogTitle>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 max-h-[calc(90vh-140px)]">
          <div className="border border-slate-100 dark:border-white/5 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/10">
                    <th className="p-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[22%]">
                      {t("Campaign")}
                    </th>
                    <th className="p-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[20%]">
                      {t("Ad Group")}
                    </th>
                    <th className="p-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[20%]">
                      {t("Keyword")}
                    </th>

                    {/* Match type columns with select-all checkboxes */}
                    {[
                      { label: "Exact", key: "exact", all: allExact },
                      { label: "Phrase", key: "phrase", all: allPhrase },
                      { label: "Broad", key: "broad", all: allBroad },
                    ].map(({ label, key, all }) => (
                      <th key={key} className="p-3 w-[10%] text-center">
                        <div className="flex items-center justify-center gap-2">
                          <StyledCheckbox
                            checked={all}
                            onChange={() => toggleAllMatch(key)}
                          />
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t(label)}
                          </span>
                        </div>
                      </th>
                    ))}

                    {/* Delete column */}
                    <th className="w-12" />
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                      <td className="p-3 text-xs text-sky-600 dark:text-sky-400 font-medium">
                        {row.campaignName}
                      </td>
                      <td className="p-3 text-xs text-slate-600 dark:text-slate-300">
                        {row.adGroupName}
                      </td>
                      <td className="p-3 text-xs text-slate-800 dark:text-slate-200 font-semibold">
                        {row.keyword}
                      </td>
                      {["exact", "phrase", "broad"].map((matchType) => (
                        <td key={matchType} className="p-3 text-center vertical-align-middle">
                          <div className="flex items-center justify-center">
                            <StyledCheckbox
                              checked={row[matchType]}
                              onChange={() => toggleMatch(row.id, matchType)}
                            />
                          </div>
                        </td>
                      ))}
                      <td className="p-3 text-center vertical-align-middle">
                        <button
                          type="button"
                          title={t("Remove row")}
                          onClick={() => removeRow(row.id)}
                          className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors p-1"
                        >
                          <FiTrash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-xs text-slate-400 dark:text-slate-500">
                        {t("All rows removed. Go back to re-select keywords.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer: Back | Cancel | Next */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 shrink-0">
          <ShadcnButton
            variant="ghost"
            className="h-[36px] px-4 rounded-lg flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
            onClick={onBack}
          >
            <FiArrowLeft size={14} />
            {t("Back")}
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
              onClick={handleNext}
              disabled={!canProceed}
            >
              {t("Next")}
            </ShadcnButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
