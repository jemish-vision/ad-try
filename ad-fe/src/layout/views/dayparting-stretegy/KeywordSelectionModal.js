import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { ApiGetTargetingByCampaigns } from "../../../api-wrapper/targeting/ApiTargeting";
import { StyledCheckbox } from "src/common/grid/StyledCheckbox";
import { Toast, useDispatch } from "../../../helper/links/Link";
import { useTranslation } from "react-i18next";
import { MdOutlineClose, MdSearch, MdKeyboardArrowDown, MdSave, MdVerified, MdArrowBack } from "react-icons/md";
import { HiOutlineSpeakerphone } from "react-icons/hi";

import { CustomModal } from "../../../helper/modal/CustomModal";

const KeywordSelectionModal = ({ show, onHide, campaigns, selectedCampaigns = [], profileId, onSave, initialTargetingIds, viewOnly = false, onBack, confirmEmptyCampaigns = true }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [keywords, setKeywords] = useState([]);
  const [selectedIds, setSelectedIds] = useState({ SP: [], SB: [], SD: [] });
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    totalCampaigns: 0,
    campaignsWithSelections: 0,
    emptyCampaignsCount: 0,
    validCampaignIds: []
  });

  useEffect(() => {
    if (show && campaigns) {
      fetchKeywords();
      setActiveCampaignId(selectedCampaigns.length > 0 ? selectedCampaigns[0].campaignId : null);
      setSearchQuery("");
    }
  }, [show, campaigns, selectedCampaigns, initialTargetingIds]);

  const fetchKeywords = async () => {
    setIsLoading(true);
    try {
      const res = await ApiGetTargetingByCampaigns({
        profileId,
        campaigns: campaigns || { SP: [], SB: [], SD: [] }
      });
      if (res.isSuccess) {
        const fetchedKeywords = res.data || [];
        setKeywords(fetchedKeywords);

        const validIds = { SP: [], SB: [], SD: [] };
        fetchedKeywords.forEach(kw => {
          const id = kw.keywordId || kw.targetId || kw._id;
          const adType = kw.adType;
          if (adType && initialTargetingIds?.[adType]?.includes(id)) {
            if (!validIds[adType].includes(id)) {
              validIds[adType].push(id);
            }
          }
        });
        setSelectedIds(validIds);
      } else {
        Toast.error(res.message || "Failed to fetch keywords");
      }
    } catch (e) {
      Toast.error(t("Failed to fetch keywords"));
    }
    setIsLoading(false);
  };

  const keywordsByCampaign = useMemo(() => {
    const grouped = {};
    keywords.forEach(kw => {
      // Use campaignId from target if available, otherwise it will be undefined and won't match properly
      if (kw.campaignId) {
        if (!grouped[kw.campaignId]) grouped[kw.campaignId] = [];
        grouped[kw.campaignId].push(kw);
      }
    });
    return grouped;
  }, [keywords]);

  const handleToggleTarget = (id, adType) => {
    if (viewOnly) return;
    setSelectedIds(prev => {
      const newIds = { ...prev, SP: [...prev.SP], SB: [...prev.SB], SD: [...prev.SD] };
      if (newIds[adType].includes(id)) {
        newIds[adType] = newIds[adType].filter(i => i !== id);
      } else {
        newIds[adType].push(id);
      }
      return newIds;
    });
  };

  const getCampaignSelectedCount = (campaignId) => {
    const targets = keywordsByCampaign[campaignId] || [];
    let count = 0;
    targets.forEach(t => {
      const id = t.keywordId || t.targetId || t._id;
      if (selectedIds[t.adType]?.includes(id)) count++;
    });
    return count;
  };

  const isCampaignFullySelected = (campaignId) => {
    const targets = keywordsByCampaign[campaignId] || [];
    if (targets.length === 0) return false;
    return targets.every(t => {
      const id = t.keywordId || t.targetId || t._id;
      return selectedIds[t.adType]?.includes(id);
    });
  };

  const handleToggleCampaign = (campaignId) => {
    if (viewOnly) return;
    const targets = keywordsByCampaign[campaignId] || [];
    const isSelected = isCampaignFullySelected(campaignId);

    setSelectedIds(prev => {
      const newIds = { ...prev, SP: [...prev.SP], SB: [...prev.SB], SD: [...prev.SD] };

      if (isSelected) {
        // Deselect all
        targets.forEach(t => {
          const id = t.keywordId || t.targetId || t._id;
          newIds[t.adType] = newIds[t.adType].filter(i => i !== id);
        });
      } else {
        // Select all
        targets.forEach(t => {
          const id = t.keywordId || t.targetId || t._id;
          if (!newIds[t.adType].includes(id)) {
            newIds[t.adType].push(id);
          }
        });
      }
      return newIds;
    });
  };

  let filteredCampaigns = selectedCampaigns.filter(c =>
    (c.name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );
  if (viewOnly) {
    filteredCampaigns = filteredCampaigns.filter(c => getCampaignSelectedCount(c.campaignId) > 0);
  }

  const activeCampaign = selectedCampaigns.find(c => c.campaignId === activeCampaignId);
  let activeTargets = keywordsByCampaign[activeCampaignId] || [];
  if (viewOnly) {
    activeTargets = activeTargets.filter(kw => {
      const id = kw.keywordId || kw.targetId || kw._id;
      return selectedIds[kw.adType]?.includes(id);
    });
  }

  const activeSelectedCount = getCampaignSelectedCount(activeCampaignId);
  const isActiveFullySelected = isCampaignFullySelected(activeCampaignId);

  // Total selected across all
  const totalSelected = selectedIds.SP.length + selectedIds.SB.length + selectedIds.SD.length;

  const totalPossibleTargets = keywords.length;
  const isAllFullySelected = totalPossibleTargets > 0 && totalSelected === totalPossibleTargets;
  const isAllPartiallySelected = totalSelected > 0 && totalSelected < totalPossibleTargets;

  const handleSaveClick = () => {
    if (viewOnly) {
      onHide();
      return;
    }
    const allSelectedTargetingIds = [...selectedIds.SP, ...selectedIds.SB, ...selectedIds.SD];
    if (allSelectedTargetingIds.length === 0) {
      Toast.error(t("Please select at least one keyword or target before saving."));
      return;
    }

    const campaignsWithTargets = new Set();
    keywords.forEach(kw => {
      const id = kw.keywordId || kw.targetId || kw._id;
      if (allSelectedTargetingIds.includes(id) && kw.campaignId) {
        campaignsWithTargets.add(kw.campaignId);
      }
    });

    const totalCampaigns = selectedCampaigns.length;
    const campaignsWithSelections = campaignsWithTargets.size;
    const emptyCampaignsCount = totalCampaigns - campaignsWithSelections;
    const validCampaignIds = Array.from(campaignsWithTargets);

    if (confirmEmptyCampaigns && emptyCampaignsCount > 0) {
      setConfirmModal({
        isOpen: true,
        totalCampaigns,
        campaignsWithSelections,
        emptyCampaignsCount,
        validCampaignIds
      });
    } else {
      onSave(selectedIds, validCampaignIds);
    }
  };

  const handleToggleAll = () => {
    if (viewOnly) return;
    if (isAllFullySelected) {
      setSelectedIds({ SP: [], SB: [], SD: [] });
    } else {
      const newIds = { SP: [], SB: [], SD: [] };
      keywords.forEach(t => {
        const id = t.keywordId || t.targetId || t._id;
        if (!newIds[t.adType].includes(id)) {
          newIds[t.adType].push(id);
        }
      });
      setSelectedIds(newIds);
    }
  };

  return (
    <>
      <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
        <DialogContent
          hideCloseButton={true}
          style={{ zIndex: 100002 }}
          className="max-w-[1000px] w-[95vw] p-0 rounded-[20px] bg-white dark:bg-[#1E2330] text-slate-900 dark:text-white overflow-hidden flex flex-col h-[80vh] shadow-2xl border-none gap-0 !z-[100002]"
        >
          <DialogHeader className="p-6 border-b border-slate-100 dark:border-slate-700 flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                {viewOnly ? t("Associated Targetings") : t("Select Campaigns & Targets")}
              </DialogTitle>
              <p className="text-sm text-slate-500 dark:text-slate-400 m-0 font-medium">
                {viewOnly ? t("View assigned campaigns and their targets.") : t("Choose campaigns and their targets. Selecting a campaign will include all its targets.")}
              </p>
            </div>
            <button onClick={onHide} className="p-2 rounded-full border bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700 transition-colors">
              <MdOutlineClose className="w-5 h-5" />
            </button>
          </DialogHeader>

          <div className="flex-1 flex overflow-hidden bg-slate-50/50 dark:bg-[#1E2330]">

            {/* Left Pane - Campaigns */}
            <div className="w-[400px] border-r border-slate-200 dark:border-slate-700 flex flex-col bg-white dark:bg-[#1E2330]">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700">
                <div className="relative flex items-center">
                  <MdSearch className="w-5 h-5 text-slate-400 dark:text-slate-500 absolute left-3" />
                  <input
                    type="text"
                    placeholder={t("Search campaigns...")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 transition-all bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-blue-500/20 dark:bg-[#131722] dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-blue-500/50"
                  />
                  <div className="absolute right-3 text-[11px] font-bold px-2 py-1 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                    {totalSelected} {t("Selected")}
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-[#1E2330] flex items-center justify-between shadow-[0_4px_6px_-1px_rgba(0,0,0,0.02)] z-10">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{t("Campaigns")}</div>
                {!viewOnly && (
                  <div className="flex items-center gap-2 cursor-pointer group" onClick={handleToggleAll}>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">{t("Select All")}</span>
                    <StyledCheckbox checked={isAllFullySelected} indeterminate={isAllPartiallySelected} onChange={handleToggleAll} />
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto custom-scroll p-3">
                <div className="flex flex-col gap-1">
                  {filteredCampaigns.map((camp) => {
                    const isFullySelected = isCampaignFullySelected(camp.campaignId);
                    const isPartiallySelected = !isFullySelected && getCampaignSelectedCount(camp.campaignId) > 0;
                    const isActive = activeCampaignId === camp.campaignId;
                    const selectedCount = getCampaignSelectedCount(camp.campaignId);
                    const totalCount = (keywordsByCampaign[camp.campaignId] || []).length;

                    return (
                      <div
                        key={camp.campaignId}
                        onClick={() => setActiveCampaignId(camp.campaignId)}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${isActive ? 'bg-blue-50/50 border-blue-100 dark:bg-[#2A3142] dark:border-slate-600 shadow-sm' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                      >
                        <HiOutlineSpeakerphone className={`w-5 h-5 text-blue-500`} />
                        <span className={`text-sm flex-1 truncate ${isActive ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                          {camp.name}
                        </span>
                        {totalCount === 0 ? (
                          <div className="text-[11px] font-bold px-2 py-1 rounded-md whitespace-nowrap bg-slate-50 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border border-slate-200 dark:border-slate-700">
                            N/A
                          </div>
                        ) : isFullySelected ? (
                          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                            <span style={{ fontSize: '13px', fontWeight: 'bold' }}>✓</span>
                          </div>
                        ) : (
                          <div className="text-[11px] font-bold px-2 py-1 rounded-md whitespace-nowrap bg-blue-50 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400">
                            {selectedCount}/{totalCount}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filteredCampaigns.length === 0 && (
                    <div className="text-center py-10 text-sm font-medium text-slate-400 dark:text-slate-500">{t("No campaigns found.")}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Pane - Targets */}
            <div className="flex-1 flex flex-col bg-white dark:bg-[#3A4253]">
              {activeCampaign ? (
                <>
                  <div className="p-6 border-b flex items-start justify-between bg-white border-slate-100 dark:bg-transparent dark:border-slate-600">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
                        <HiOutlineSpeakerphone className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">{activeCampaign.name}</h3>
                        <p className="text-sm m-0 font-medium text-slate-500 dark:text-slate-300">{activeSelectedCount} {t("targets selected")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isActiveFullySelected && activeTargets.length > 0 && (
                        <div className="bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold p-1.5 rounded-full flex items-center gap-1.5">
                          <MdVerified className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-[#1E2330] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.02)] z-10 flex items-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t("Targets")}</div>
                    {!viewOnly && activeTargets.length > 0 && (
                      <div className="flex items-center gap-2 cursor-pointer group" onClick={() => handleToggleCampaign(activeCampaignId)}>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">{t("Select All")}</span>
                        <StyledCheckbox checked={isActiveFullySelected} indeterminate={!isActiveFullySelected && activeSelectedCount > 0} onChange={() => handleToggleCampaign(activeCampaignId)} />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scroll p-6 bg-slate-50/30 dark:bg-transparent">

                    {isLoading ? (
                      <div className="flex flex-col items-center justify-center h-40">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-400 dark:border-white"></div>
                        <p className="text-sm mt-4 font-medium text-slate-400">{t("Loading targets...")}</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {activeTargets.map((kw, idx) => {
                          const id = kw.keywordId || kw.targetId || kw._id;
                          const isChecked = selectedIds[kw.adType]?.includes(id);

                          let badgeColor = "bg-green-100 text-green-700 border-green-200";
                          if (kw.adType === "SB") badgeColor = "bg-blue-100 text-blue-700 border-blue-200";
                          if (kw.adType === "SD") badgeColor = "bg-emerald-100 text-emerald-700 border-emerald-200";

                          return (
                            <div
                              key={`${kw.adType}-${id}-${idx}`}
                              onClick={() => handleToggleTarget(id, kw.adType)}
                              className="flex items-center gap-4 p-4 rounded-xl cursor-pointer shadow-sm transition-all border bg-white border-slate-200 hover:border-slate-300 dark:bg-[#1E2330] dark:border-slate-600 dark:hover:border-slate-400"
                            >
                              {!viewOnly && (
                                <div onClick={(e) => e.stopPropagation()}>
                                  <StyledCheckbox checked={isChecked} onChange={() => handleToggleTarget(id, kw.adType)} />
                                </div>
                              )}
                              <div className="flex-1 flex flex-col">
                                <span className="text-sm font-semibold text-slate-800 dark:text-white">{kw.keywordText || kw.targetingText || kw.targeting || kw.resolvedText || t("Target")}</span>
                                {kw.matchType && <span className="text-xs font-medium mt-0.5 text-slate-400">{t("Match Type")}: {kw.matchType}</span>}
                              </div>
                              <div className={`text-[10px] font-bold px-2 py-1 rounded border ${badgeColor}`}>
                                {kw.adType}
                              </div>
                            </div>
                          );
                        })}
                        {activeTargets.length === 0 && (
                          <div className="text-center py-12 text-sm font-medium text-slate-400">
                            {viewOnly ? t("No targets assigned for this campaign.") : t("No targets available for this campaign.")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm font-medium text-slate-400">
                  {t("Select a campaign to view its targets")}
                </div>
              )}
            </div>

          </div>

          <div className="p-4 border-t flex justify-end gap-3 bg-white border-slate-100 dark:bg-[#1E2330] dark:border-slate-700">
            {viewOnly ? (
              <Button type="button" variant="outline" onClick={onHide} className="rounded-lg h-10 px-6 font-medium transition-colors border bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-transparent dark:border-slate-600 dark:text-white dark:hover:bg-slate-800">{t("Close")}</Button>
            ) : (
              <>
                {onBack ? (
                  <Button type="button" variant="outline" onClick={onBack} className="rounded-lg h-10 px-6 font-medium transition-colors border bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-transparent dark:border-slate-600 dark:text-white dark:hover:bg-slate-800 flex items-center gap-2"><MdArrowBack className="w-[18px] h-[18px]" /> {t("Back")}</Button>
                ) : (
                  <Button type="button" variant="outline" onClick={onHide} className="rounded-lg h-10 px-6 font-medium transition-colors border bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-transparent dark:border-slate-600 dark:text-white dark:hover:bg-slate-800">{t("Close")}</Button>
                )}
                <Button type="button" onClick={handleSaveClick} className="rounded-lg h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm shadow-blue-500/20 flex items-center gap-2 border-none">
                  <MdSave className="w-[18px] h-[18px]" /> {t("save")}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <CustomModal
        show={confirmModal.isOpen}
        onHide={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        title={t('Unsaved Campaigns Warning', 'Unsaved Campaigns Warning')}
        icon="warning"
        iconVariant="warning"
        style={{ zIndex: 100010 }}
        message={`You selected a total of <b>${confirmModal.totalCampaigns} campaign(s)</b>, but only selected targets for <b>${confirmModal.campaignsWithSelections} campaign(s)</b>.<br/><br/>The remaining <b>${confirmModal.emptyCampaignsCount} campaign(s)</b> have no targets selected and will be excluded from this rule. Do you want to proceed and save, or go back?`}
        actions={[
          {
            label: t('Go Back', 'Go Back'),
            cancel: true,
            icon: 'undo',
            onClick: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
          },
          {
            label: t('Proceed & Save', 'Proceed & Save'),
            variant: 'primary',
            icon: 'save',
            onClick: () => {
              setConfirmModal(prev => ({ ...prev, isOpen: false }));
              onSave(selectedIds, confirmModal.validCampaignIds);
            },
          },
        ]}
      />
    </>
  );
};

export default KeywordSelectionModal;
