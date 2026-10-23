import React, { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "../../../../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { StyledCheckbox } from "../../../../common/grid/StyledCheckbox";
import { ApiGetCampaignAndAdGroup } from "../../../../api-wrapper/customer/ApiCustomer";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import { FiX, FiEdit, FiAlertTriangle, FiBookOpen, FiSearch, FiLayers, FiList } from "react-icons/fi";

export default function AddNegativeKeywordMultiCampaignModal({ show, onHide, selectedRows, onSubmit }) {
  const { t } = useTranslation();
  const { profileId } = useContext(ProfileContext);

  // ── Theme State ──
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // ── Campaign / Ad Group state ──
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedAdGroups, setSelectedAdGroups] = useState(new Map());
  const [expandedCampaigns, setExpandedCampaigns] = useState(new Set());

  // ── Keyword state ──
  const [keywords, setKeywords] = useState([]);
  const [editingId, setEditingId] = useState(null);

  // ── Match Type state ──
  const [negExact, setNegExact] = useState(true);
  const [negPhrase, setNegPhrase] = useState(false);

  const [selectedCampaignTypes, setSelectedCampaignTypes] = useState(["SP", "SB"]);

  useEffect(() => {
    if (show) {
      setSearch("");
      setSelectedAdGroups(new Map());
      setExpandedCampaigns(new Set());
      setEditingId(null);
      setNegExact(true);
      setNegPhrase(false);
      setSelectedCampaignTypes(["SP", "SB"]);

      setKeywords(
        selectedRows.map((r) => ({
          id: r.id,
          checked: true,
          keyword: r.searchTerm || "",
        }))
      );

      fetchCampaigns();
    }
  }, [show, selectedRows]);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await ApiGetCampaignAndAdGroup({ profileId: profileId?.value || profileId });
      if (res?.isSuccess && res.result) setCampaigns(res.result);
    } catch (e) {
      console.error("Failed to load campaigns", e);
    }
    setLoading(false);
  };

  const toggleCampaignType = (type) => {
    const newTypes = selectedCampaignTypes.includes(type)
      ? selectedCampaignTypes.filter((t) => t !== type)
      : [...selectedCampaignTypes, type];
    setSelectedCampaignTypes(newTypes);
  };

  const toggleCampaign = (camp) => {
    const isExpanded = expandedCampaigns.has(camp.campaignId);
    const newExpanded = new Set(expandedCampaigns);
    const newSelected = new Map(selectedAdGroups);
    if (isExpanded) {
      newExpanded.delete(camp.campaignId);
      camp.adGroups.forEach((ag) => newSelected.delete(ag.adGroupId));
    } else {
      newExpanded.add(camp.campaignId);
      camp.adGroups.forEach((ag) =>
        newSelected.set(ag.adGroupId, { adGroupId: ag.adGroupId, adGroupName: ag.adGroupName, campaignId: camp.campaignId, campaignName: camp.campaignName, campaignType: camp.campaignType })
      );
    }
    setExpandedCampaigns(newExpanded);
    setSelectedAdGroups(newSelected);
  };

  const toggleAdGroup = (camp, ag) => {
    const newSelected = new Map(selectedAdGroups);
    if (newSelected.has(ag.adGroupId)) {
      newSelected.delete(ag.adGroupId);
      const anyLeft = camp.adGroups.some((a) => newSelected.has(a.adGroupId));
      if (!anyLeft) {
        const newExpanded = new Set(expandedCampaigns);
        newExpanded.delete(camp.campaignId);
        setExpandedCampaigns(newExpanded);
      }
    } else {
      newSelected.set(ag.adGroupId, { adGroupId: ag.adGroupId, adGroupName: ag.adGroupName, campaignId: camp.campaignId, campaignName: camp.campaignName, campaignType: camp.campaignType });
      const newExpanded = new Set(expandedCampaigns);
      newExpanded.add(camp.campaignId);
      setExpandedCampaigns(newExpanded);
    }
    setSelectedAdGroups(newSelected);
  };

  const selectAllAdGroups = (checked) => {
    if (checked) {
      const newSelected = new Map();
      const newExpanded = new Set();
      filteredCampaigns.forEach((camp) => {
        newExpanded.add(camp.campaignId);
        camp.adGroups.forEach((ag) =>
          newSelected.set(ag.adGroupId, { adGroupId: ag.adGroupId, adGroupName: ag.adGroupName, campaignId: camp.campaignId, campaignName: camp.campaignName, campaignType: camp.campaignType })
        );
      });
      setSelectedAdGroups(newSelected);
      setExpandedCampaigns(newExpanded);
    } else {
      setSelectedAdGroups(new Map());
      setExpandedCampaigns(new Set());
    }
  };

  const toggleKeyword = (id) => setKeywords((prev) => prev.map((k) => (k.id === id ? { ...k, checked: !k.checked } : k)));
  const toggleAllKeywords = (checked) => setKeywords((prev) => prev.map((k) => ({ ...k, checked })));
  const updateKeyword = (id, value) => setKeywords((prev) => prev.map((k) => (k.id === id ? { ...k, keyword: value } : k)));

  const totalAdGroups = campaigns.reduce((s, c) => s + c.adGroups.length, 0);
  const allSelected = selectedAdGroups.size === totalAdGroups && totalAdGroups > 0;
  const selectedCampaignCount = new Set([...selectedAdGroups.values()].map((a) => a.campaignId)).size;
  const allKwChecked = keywords.length > 0 && keywords.every((k) => k.checked);
  const canSubmit = selectedAdGroups.size > 0 && keywords.some((k) => k.checked) && (negExact || negPhrase);
  const filteredCampaigns = campaigns.filter((c) =>
    c.campaignName.toLowerCase().includes(search.toLowerCase()) &&
    selectedCampaignTypes.includes(c.campaignType)
  );

  const handleSubmit = () => {
    const selectedKws = keywords.filter((k) => k.checked);
    const adGroupList = [...selectedAdGroups.values()];
    const items = [];
    selectedKws.forEach((kw) => {
      adGroupList.forEach((ag) => {
        if (negExact) items.push({ searchTerm: kw.keyword, campaignId: ag.campaignId, adGroupId: ag.adGroupId, type: "NEGATIVE_EXACT", campaignType: ag.campaignType });
        if (negPhrase) items.push({ searchTerm: kw.keyword, campaignId: ag.campaignId, adGroupId: ag.adGroupId, type: "NEGATIVE_PHRASE", campaignType: ag.campaignType });
      });
    });
    onSubmit(items);
  };

  return (
    <Dialog open={show} onOpenChange={(isOpen) => { if (!isOpen) onHide(); }}>
      <DialogContent 
        className="max-w-[1000px] w-[95vw] p-8 rounded-[24px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/90 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[90vh] [&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-white/10 [&>button]:bg-slate-50 dark:[&>button]:bg-white/5 [&>button]:text-slate-500 dark:[&>button]:text-white/70 hover:[&>button]:text-slate-900 dark:hover:[&>button]:text-white [&>button]:rounded-full [&>button]:p-1.5 [&>button]:transition-all"
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
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-white/10 shrink-0 mb-5">
          <span className="bg-sky-500/10 border border-sky-500/20 text-sky-500 dark:text-sky-400 p-2.5 rounded-xl flex items-center justify-center flex-shrink-0">
            <FiLayers size={18} />
          </span>
          <div className="flex flex-col text-left">
            <div className="text-lg font-bold text-slate-900 dark:text-white leading-tight font-sans">
              {t("Add Negative Keyword(s) to Multiple")}
            </div>
            <div className="text-xs text-slate-500 dark:text-white/50 font-medium mt-0.5 font-sans">
              {t("Apply chosen search terms as negative exclusions across multiple campaigns and ad groups simultaneously")}
            </div>
          </div>
        </div>

        {/* Main Panels Body */}
        <div className="flex-1 overflow-hidden flex gap-5 min-h-[400px] max-h-[55vh] rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50/50 dark:bg-white/1 p-1">

          {/* ── LEFT PANEL: CAMPAIGNS ── */}
          <div style={{ flex: "0 0 55%" }} className="flex flex-col border-r border-slate-200 dark:border-white/10 overflow-hidden">
            {/* Campaign Type Filters */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-white/3">
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer user-select-none text-slate-700 dark:text-slate-300">
                  <StyledCheckbox checked={selectedCampaignTypes.includes("SP")} onChange={() => toggleCampaignType("SP")} />
                  {t("Sponsored Products")}
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer user-select-none text-slate-700 dark:text-slate-300">
                  <StyledCheckbox checked={selectedCampaignTypes.includes("SB")} onChange={() => toggleCampaignType("SB")} />
                  {t("Sponsored Brands")}
                </label>
              </div>
            </div>

            {/* Search */}
            <div className="px-4 py-2 border-b border-slate-200 dark:border-white/10 flex items-center relative">
              <FiSearch className="absolute left-7 text-slate-400 dark:text-slate-500" size={14} />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search Campaigns ({{count}} available)", { count: filteredCampaigns.length })}
                className="w-full h-[36px] pl-10 border-0 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none text-xs font-semibold border-b border-slate-200 dark:border-white/10 rounded-none px-0"
              />
            </div>

            {/* Select All */}
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-white/3 flex items-center">
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer user-select-none text-slate-800 dark:text-slate-200">
                <StyledCheckbox checked={allSelected} onChange={(e) => selectAllAdGroups(e.target.checked)} />
                {t("Select All Ad Groups")}
              </label>
            </div>

            {/* Campaign List */}
            <div className="flex-1 overflow-y-auto px-1.5 py-1">
              {loading ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs font-semibold flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-slate-200 border-t-sky-500 dark:border-white/10 dark:border-t-[#38bdf8] rounded-full animate-spin" />
                  {t("Loading campaigns...")}
                </div>
              ) : filteredCampaigns.map((camp) => {
                const isCampChecked = expandedCampaigns.has(camp.campaignId);
                return (
                  <div key={camp.campaignId} className="flex flex-col">
                    <div 
                      onClick={() => toggleCampaign(camp)} 
                      className={`flex items-center gap-3 px-3 py-2.5 border-b border-slate-100/50 dark:border-white/4 cursor-pointer hover:bg-slate-100/20 dark:hover:bg-white/2 transition-colors ${isCampChecked ? "bg-slate-100/10 dark:bg-white/1" : ""}`}
                    >
                      <StyledCheckbox checked={isCampChecked} onChange={() => toggleCampaign(camp)} onClick={(e) => e.stopPropagation()} />
                      <span className={`text-[12.5px] truncate font-medium ${isCampChecked ? "text-[#2374F2] dark:text-sky-400 font-semibold" : "text-slate-700 dark:text-slate-200"}`}>{camp.campaignName}</span>
                    </div>
                    {isCampChecked && camp.adGroups.map((ag) => (
                      <div 
                        key={ag.adGroupId} 
                        onClick={() => toggleAdGroup(camp, ag)} 
                        className={`flex items-center gap-3 py-2 pl-9 pr-3 border-b border-slate-100/30 dark:border-white/2 cursor-pointer hover:bg-slate-100/30 dark:hover:bg-white/3 transition-colors ${selectedAdGroups.has(ag.adGroupId) ? (isDark ? "bg-white/2" : "bg-sky-500/5") : "bg-slate-50/30 dark:bg-[#0c1222]/10"}`}
                      >
                        <StyledCheckbox checked={selectedAdGroups.has(ag.adGroupId)} onChange={() => toggleAdGroup(camp, ag)} onClick={(e) => e.stopPropagation()} />
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">{ag.adGroupName}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Counter */}
            <div className="px-4 py-2 border-t border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-white/3 text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
              {t("{{count}} Campaign(s) Selected", { count: selectedCampaignCount })} &nbsp;|&nbsp; {t("{{count}} Ad Group(s) Selected", { count: selectedAdGroups.size })}
            </div>
          </div>

          {/* ── RIGHT PANEL: KEYWORDS ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Keyword header */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center gap-3 bg-slate-100/50 dark:bg-white/3 shrink-0">
              <StyledCheckbox checked={allKwChecked} onChange={(e) => toggleAllKeywords(e.target.checked)} />
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("New Keyword")}</span>
            </div>

            {/* Keyword rows */}
            <div className="flex-1 overflow-y-auto px-1.5 py-1">
              {keywords.map((kw) => (
                <div 
                  key={kw.id} 
                  className={`flex items-center gap-3 px-3 py-2.5 border-b border-slate-100/50 dark:border-white/4 transition-colors ${kw.checked ? (isDark ? "bg-white/2" : "bg-sky-500/5") : "opacity-75"}`}
                >
                  <StyledCheckbox checked={kw.checked} onChange={() => toggleKeyword(kw.id)} />
                  {editingId === kw.id ? (
                    <Input 
                      autoFocus 
                      type="text" 
                      value={kw.keyword} 
                      onChange={(e) => updateKeyword(kw.id, e.target.value)} 
                      onBlur={() => setEditingId(null)} 
                      onKeyDown={(e) => e.key === "Enter" && setEditingId(null)}
                      className="h-[32px] px-3.5 w-full rounded-lg border border-[#2374F2] bg-white text-slate-900 dark:bg-[#1e293b] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#2374F2] text-xs font-semibold"
                    />
                  ) : (
                    <div className="flex items-center justify-between flex-1 group">
                      <span className="text-xs font-semibold text-[#2374F2] dark:text-sky-400">{kw.keyword}</span>
                      <button 
                        type="button" 
                        onClick={() => setEditingId(kw.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-opacity p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg"
                      >
                        <FiEdit size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Match Type */}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-white/3 shrink-0 flex flex-col gap-1.5 text-left">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t("Select Match Type")} <span className="text-rose-500 font-bold">*</span>
              </span>
              <div className="flex items-center gap-4 mt-0.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer user-select-none text-slate-700 dark:text-slate-300">
                  <StyledCheckbox checked={negExact} onChange={() => setNegExact((v) => !v)} />
                  {t("Negative Exact")}
                </label>
                <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer user-select-none text-slate-700 dark:text-slate-300">
                  <StyledCheckbox checked={negPhrase} onChange={() => setNegPhrase((v) => !v)} />
                  {t("Negative Phrase")}
                </label>
              </div>
              {!negExact && !negPhrase && (
                <div className="text-[10px] font-semibold text-rose-500 flex items-center gap-1 animate-pulse mt-0.5">
                  <FiAlertTriangle size={11} />
                  {t("Please select a match type.")}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer controls section outside overflow container */}
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-white/10 shrink-0">
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
      </DialogContent>
    </Dialog>
  );
}
