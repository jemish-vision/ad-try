import React, { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { StyledCheckbox } from "../../../../common/grid/StyledCheckbox";
import { ApiGetCampaignAndAdGroup } from "../../../../api-wrapper/customer/ApiCustomer";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import { FiSearch, FiEdit2, FiX } from "react-icons/fi";

export default function AddKeywordMultiCampaignModal({ show, onHide, selectedRows, onNext }) {
  const { t } = useTranslation();
  const { profileId } = useContext(ProfileContext);

  // ── Campaign / Ad Group state ─────────────────────────────────
  const [campaigns, setCampaigns] = useState([]);    // full list from API
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [selectedCampaignTypes, setSelectedCampaignTypes] = useState(["SP", "SB", "SD"]);

  // selectedAdGroups: Map<adGroupId, { adGroupId, adGroupName, campaignId, campaignName, campaignType }>
  const [selectedAdGroups, setSelectedAdGroups] = useState(new Map());
  // expandedCampaigns: Set of campaignIds that are open (campaign checkbox checked)
  const [expandedCampaigns, setExpandedCampaigns] = useState(new Set());

  // ── Keyword state (right panel) ───────────────────────────────
  const [keywords, setKeywords] = useState([]);
  const [editingId, setEditingId] = useState(null);

  const prevSelectedRowsRef = React.useRef();

  // ── Load data on open ─────────────────────────────────────────
  useEffect(() => {
    if (show) {
      const rowsChanged = JSON.stringify(prevSelectedRowsRef.current) !== JSON.stringify(selectedRows);
      if (rowsChanged) {
        setSearch("");
        setSelectedAdGroups(new Map());
        setExpandedCampaigns(new Set());
        setEditingId(null);
        setSelectedCampaignTypes(["SP", "SB", "SD"]);

        // Init keyword list from selectedRows
        setKeywords(
          selectedRows.map((r) => ({
            id: r.id,
            checked: true,
            keyword: r.searchTerm || "",
            avgCPC: r.days30?.cpc || r.days14?.cpc || r.days7?.cpc || 0,
          }))
        );
      }
      prevSelectedRowsRef.current = selectedRows;
      fetchCampaigns();
    }
  }, [show, selectedRows]);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await ApiGetCampaignAndAdGroup({ profileId: profileId?.value || profileId });
      if (res?.isSuccess && res.result) {
        setCampaigns(res.result);
      }
    } catch (e) {
      console.error("Failed to load campaigns", e);
    }
    setLoading(false);
  };

  // ── Campaign type toggle ──────────────────────────────────────
  const toggleCampaignType = (type) => {
    const newTypes = selectedCampaignTypes.includes(type)
      ? selectedCampaignTypes.filter((t) => t !== type)
      : [...selectedCampaignTypes, type];
    setSelectedCampaignTypes(newTypes);
  };

  // ── Campaign toggle ───────────────────────────────────────────
  const toggleCampaign = (camp) => {
    const isExpanded = expandedCampaigns.has(camp.campaignId);
    const newExpanded = new Set(expandedCampaigns);
    const newSelected = new Map(selectedAdGroups);

    if (isExpanded) {
      // Uncheck campaign → remove all its adGroups
      newExpanded.delete(camp.campaignId);
      camp.adGroups.forEach((ag) => newSelected.delete(ag.adGroupId));
    } else {
      // Check campaign → add all its adGroups
      newExpanded.add(camp.campaignId);
      camp.adGroups.forEach((ag) =>
        newSelected.set(ag.adGroupId, {
          adGroupId: ag.adGroupId,
          adGroupName: ag.adGroupName,
          campaignId: camp.campaignId,
          campaignName: camp.campaignName,
          campaignType: camp.campaignType,
        })
      );
    }
    setExpandedCampaigns(newExpanded);
    setSelectedAdGroups(newSelected);
  };

  // ── Ad Group toggle ───────────────────────────────────────────
  const toggleAdGroup = (camp, ag) => {
    const newSelected = new Map(selectedAdGroups);
    if (newSelected.has(ag.adGroupId)) {
      newSelected.delete(ag.adGroupId);
      // If no adGroups of this campaign remain, collapse it
      const anyLeft = camp.adGroups.some((a) => newSelected.has(a.adGroupId));
      if (!anyLeft) {
        const newExpanded = new Set(expandedCampaigns);
        newExpanded.delete(camp.campaignId);
        setExpandedCampaigns(newExpanded);
      }
    } else {
      newSelected.set(ag.adGroupId, {
        adGroupId: ag.adGroupId,
        adGroupName: ag.adGroupName,
        campaignId: camp.campaignId,
        campaignName: camp.campaignName,
        campaignType: camp.campaignType,
      });
      // Ensure campaign is expanded
      const newExpanded = new Set(expandedCampaigns);
      newExpanded.add(camp.campaignId);
      setExpandedCampaigns(newExpanded);
    }
    setSelectedAdGroups(newSelected);
  };

  // ── Select All Ad Groups ──────────────────────────────────────
  const selectAllAdGroups = (checked) => {
    if (checked) {
      const newSelected = new Map();
      const newExpanded = new Set();
      filteredCampaigns.forEach((camp) => {
        newExpanded.add(camp.campaignId);
        camp.adGroups.forEach((ag) =>
          newSelected.set(ag.adGroupId, {
            adGroupId: ag.adGroupId,
            adGroupName: ag.adGroupName,
            campaignId: camp.campaignId,
            campaignName: camp.campaignName,
            campaignType: camp.campaignType,
          })
        );
      });
      setSelectedAdGroups(newSelected);
      setExpandedCampaigns(newExpanded);
    } else {
      setSelectedAdGroups(new Map());
      setExpandedCampaigns(new Set());
    }
  };

  // ── Keyword panel handlers ────────────────────────────────────
  const toggleKeyword = (id) =>
    setKeywords((prev) => prev.map((k) => (k.id === id ? { ...k, checked: !k.checked } : k)));

  const toggleAllKeywords = (checked) =>
    setKeywords((prev) => prev.map((k) => ({ ...k, checked })));

  const updateKeyword = (id, value) =>
    setKeywords((prev) => prev.map((k) => (k.id === id ? { ...k, keyword: value } : k)));

  // ── Derived counts ────────────────────────────────────────────
  const totalAdGroups = campaigns.reduce((s, c) => s + c.adGroups.length, 0);
  const allSelected = selectedAdGroups.size === totalAdGroups && totalAdGroups > 0;

  const selectedCampaignCount = new Set(
    [...selectedAdGroups.values()].map((a) => a.campaignId)
  ).size;

  const allKwChecked = keywords.length > 0 && keywords.every((k) => k.checked);
  const canProceed = selectedAdGroups.size > 0 && keywords.some((k) => k.checked);

  // ── Filtered campaigns by search ──────────────────────────────
  const filteredCampaigns = campaigns.filter((c) =>
    c.campaignName.toLowerCase().includes(search.toLowerCase()) &&
    selectedCampaignTypes.includes(c.campaignType)
  );

  const handleNext = () => {
    const selectedKws = keywords.filter((k) => k.checked);
    const adGroupList = [...selectedAdGroups.values()];

    // Cross-product: each keyword × each selected adGroup
    const rows = [];
    selectedKws.forEach((kw) => {
      adGroupList.forEach((ag) => {
        rows.push({
          id: `${kw.id}_${ag.adGroupId}`,
          keyword: kw.keyword,
          campaignId: ag.campaignId,
          adGroupId: ag.adGroupId,
          campaignName: ag.campaignName,
          adGroupName: ag.adGroupName,
          campaignType: ag.campaignType,
          avgCPC: kw.avgCPC || 0,
        });
      });
    });
    onNext(rows); // goes to Step 2 (Choose Match Types)
  };

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
      <DialogContent
        className="max-w-[1100px] w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[90vh] font-sans"
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
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-white/10 shrink-0">
          <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
            {t("Add New Keyword(s)")}
          </DialogTitle>
        </div>

        {/* Split Side Content Panels */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-[460px] max-h-[calc(90vh-140px)]">
          {/* ── LEFT PANEL: Campaign / Ad Group selector ── */}
          <div className="md:w-[60%] border-r border-slate-100 dark:border-white/10 flex flex-col overflow-hidden bg-slate-50/30 dark:bg-transparent">
            {/* Campaign Type Filters */}
            <div className="p-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
              <div className="flex gap-4 flex-wrap">
                {[
                  { label: "Sponsored Products", key: "SP" },
                  { label: "Sponsored Brand", key: "SB" },
                  { label: "Sponsored Display", key: "SD" }
                ].map(({ label, key }) => (
                  <label key={key} className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                    <StyledCheckbox checked={selectedCampaignTypes.includes(key)} onChange={() => toggleCampaignType(key)} />
                    {t(label)}
                  </label>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="p-4 border-b border-slate-100 dark:border-white/5">
              <div className="relative w-full">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("Search Campaigns ({{count}} available)...", { count: filteredCampaigns.length })}
                  className="w-full h-9 pl-9 pr-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-transparent text-slate-900 dark:text-white"
                />
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={14} />
              </div>
            </div>

            {/* Select All Checkbox */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 flex items-center">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                <StyledCheckbox checked={allSelected} onChange={(e) => selectAllAdGroups(e.target.checked)} />
                {t("Select All Ad Groups")}
              </label>
            </div>

            {/* Campaign List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="text-center py-10 text-xs text-slate-400 dark:text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-sky-500 border-t-transparent" />
                    <span>{t("Loading campaigns...")}</span>
                  </div>
                </div>
              ) : filteredCampaigns.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400 dark:text-slate-500">
                  {t("No campaigns found.")}
                </div>
              ) : (
                filteredCampaigns.map((camp) => {
                  const isCampChecked = expandedCampaigns.has(camp.campaignId);
                  return (
                    <div key={camp.campaignId} className="border-b border-slate-100 dark:border-white/5 last:border-0">
                      {/* Campaign row */}
                      <div
                        className="flex items-center gap-3 p-3 hover:bg-slate-50/50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                        onClick={() => toggleCampaign(camp)}
                      >
                        <StyledCheckbox checked={isCampChecked} onChange={() => toggleCampaign(camp)} onClick={(e) => e.stopPropagation()} />
                        <span className={`text-xs ${isCampChecked ? "font-bold text-sky-600 dark:text-sky-400" : "font-medium text-slate-700 dark:text-slate-300"}`}>
                          {camp.campaignName}
                        </span>
                      </div>

                      {/* Ad Group rows */}
                      {isCampChecked &&
                        camp.adGroups.map((ag) => (
                          <div
                            key={ag.adGroupId}
                            className="flex items-center gap-3 py-2 pl-9 pr-3 hover:bg-slate-100/50 dark:hover:bg-white/10 bg-slate-50/30 dark:bg-white/5/20 cursor-pointer transition-colors border-t border-slate-100/50 dark:border-white/5"
                            onClick={() => toggleAdGroup(camp, ag)}
                          >
                            <StyledCheckbox checked={selectedAdGroups.has(ag.adGroupId)} onChange={() => toggleAdGroup(camp, ag)} onClick={(e) => e.stopPropagation()} />
                            <span className="text-xs text-slate-600 dark:text-slate-300">{ag.adGroupName}</span>
                          </div>
                        ))}
                    </div>
                  );
                })
              )}
            </div>

            {/* Counter bar */}
            <div className="px-4 py-2 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
              {t("{{count}} Campaign(s) selected", { count: selectedCampaignCount })} &nbsp;|&nbsp; {t("{{count}} Ad Group(s) selected", { count: selectedAdGroups.size })}
            </div>
          </div>

          {/* ── RIGHT PANEL: Keyword list ── */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-transparent">
            {/* Table Header */}
            <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center gap-3 bg-slate-50/50 dark:bg-white/5 shrink-0">
              <StyledCheckbox checked={allKwChecked} onChange={(e) => toggleAllKeywords(e.target.checked)} />
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("New Keyword")}
              </span>
            </div>

            {/* Keyword rows list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
              {keywords.map((kw) => (
                <div
                  key={kw.id}
                  className={`flex items-center gap-3 p-3 transition-colors ${kw.checked ? "bg-white dark:bg-transparent" : "bg-slate-50/30 dark:bg-white/5"
                    }`}
                >
                  <StyledCheckbox checked={kw.checked} onChange={() => toggleKeyword(kw.id)} />
                  {editingId === kw.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={kw.keyword}
                      onChange={(e) => updateKeyword(kw.id, e.target.value)}
                      onBlur={() => setEditingId(null)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingId(null)}
                      className="flex-grow h-8 px-2 text-xs bg-white dark:bg-slate-900 border border-sky-500 dark:border-sky-400 rounded focus:outline-none text-slate-900 dark:text-white"
                    />
                  ) : (
                    <div className="flex items-center justify-between flex-grow gap-2">
                      <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">{kw.keyword}</span>
                      <button
                        type="button"
                        onClick={() => setEditingId(kw.id)}
                        className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors p-1"
                      >
                        <FiEdit2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
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
            disabled={!canProceed}
          >
            {t("Next")}
          </ShadcnButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
