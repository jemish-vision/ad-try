import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { StyledCheckbox } from "../../../../common/grid/StyledCheckbox";
import { FiEdit2, FiX } from "react-icons/fi";

export default function AddKeywordStep1Modal({ show, onHide, selectedRows, onNext }) {
  const { t } = useTranslation();
  // Local list of rows — user can deselect or edit keyword text
  const [rows, setRows] = useState([]);
  const [editingId, setEditingId] = useState(null); // which row is being edited

  const prevSelectedRowsRef = React.useRef();

  useEffect(() => {
    if (show && selectedRows?.length > 0) {
      const rowsChanged = JSON.stringify(prevSelectedRowsRef.current) !== JSON.stringify(selectedRows);
      if (rowsChanged) {
        // Pre-fill each row with full data; all selected by default
        setRows(
          selectedRows.map((r) => ({
            id: r.id,
            checked: true,
            keyword: r.searchTerm || "",
            campaignName: r.campaignName || "",
            adGroupName: r.adGroupName || "",
            campaignId: r.campaignId,
            adGroupId: r.adGroupId,
            targeting: r.targeting,
            keywordType: r.keywordType,
            campaignType: r.campaignType,
            avgCPC: r.days30?.cpc || r.days14?.cpc || r.days7?.cpc || 0,
          }))
        );
        setEditingId(null);
      }
      prevSelectedRowsRef.current = selectedRows;
    }
  }, [show, selectedRows]);

  const toggleRow = (id) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, checked: !r.checked } : r));
  };

  const toggleAll = (checked) => {
    setRows((prev) => prev.map((r) => ({ ...r, checked })));
  };

  const updateKeyword = (id, value) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, keyword: value } : r));
  };

  const allChecked = rows.length > 0 && rows.every((r) => r.checked);
  const someChecked = rows.some((r) => r.checked);

  const handleNext = () => {
    const selected = rows.filter((r) => r.checked);
    if (selected.length === 0) return;
    onNext(selected); // pass selected rows with updated keyword text
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
            {t("Add New Keyword(s)")}
          </DialogTitle>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 max-h-[calc(90vh-140px)]">
          <div className="border border-slate-100 dark:border-white/5 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/10">
                    <th className="w-12 p-3">
                      <StyledCheckbox
                        checked={allChecked}
                        onChange={(e) => toggleAll(e.target.checked)}
                      />
                    </th>
                    <th className="p-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[28%]">
                      {t("New Keyword")}
                    </th>
                    <th className="p-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[36%]">
                      {t("Campaign")}
                    </th>
                    <th className="p-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {t("Ad Group")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`transition-colors hover:bg-slate-50/50 dark:hover:bg-white/5 ${row.checked ? "bg-white dark:bg-transparent" : "bg-slate-50/30 dark:bg-white/5"
                        }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 vertical-align-middle">
                        <StyledCheckbox
                          checked={row.checked}
                          onChange={() => toggleRow(row.id)}
                        />
                      </td>

                      {/* NEW KEYWORD — editable */}
                      <td className="p-3 vertical-align-middle">
                        {editingId === row.id ? (
                          <input
                            autoFocus
                            type="text"
                            value={row.keyword}
                            onChange={(e) => updateKeyword(row.id, e.target.value)}
                            onBlur={() => setEditingId(null)}
                            onKeyDown={(e) => e.key === "Enter" && setEditingId(null)}
                            className="w-full h-8 px-2 text-xs bg-white dark:bg-slate-900 border border-sky-500 dark:border-sky-400 rounded focus:outline-none text-slate-900 dark:text-white"
                          />
                        ) : (
                          <div className="flex items-center justify-between w-full gap-2">
                            <span className="text-xs text-sky-600 dark:text-sky-400 font-semibold">
                              {row.keyword}
                            </span>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors p-1"
                              onClick={() => setEditingId(row.id)}
                              title={t("Edit keyword")}
                            >
                              <FiEdit2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Campaign */}
                      <td className="p-3 vertical-align-middle text-xs text-slate-600 dark:text-slate-300 font-medium">
                        {row.campaignName}
                      </td>

                      {/* Ad Group */}
                      <td className="p-3 vertical-align-middle text-xs text-slate-600 dark:text-slate-300">
                        {row.adGroupName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            onClick={handleNext}
            disabled={!someChecked}
          >
            {t("Next")}
          </ShadcnButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
