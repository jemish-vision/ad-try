import React, { useContext, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { ProfileContext } from '../../../helper/usecontext/useContext';
import { ApiGetCampaignAndAdGroupAutoSearch } from '../../../api-wrapper/customer/ApiCustomer';
import { Input } from "../../../components/ui/input";
import { t } from 'i18next';
import { FiChevronLeft, FiX, FiCheck } from 'react-icons/fi';

const CampaignAndAdGroupModel = ({ showModal, handleClose, mode, handleSubmit }) => {
    const { profileId, selectedAdType } = useContext(ProfileContext);

    const [currentView, setCurrentView] = useState("campaigns");
    const [adGroupsData, setAdGroupsData] = useState([]);
    const [currentCampaignForAdGroups, setCurrentCampaignForAdGroups] = useState(null);
    const [campaignSearchTerm, setCampaignSearchTerm] = useState("");
    const [campaignsLoading, setCampaignsLoading] = useState(false);
    const [selectedCampaigns, setSelectedCampaigns] = useState([]);
    const [selectedAdGroups, setSelectedAdGroups] = useState([]);
    const [campaignsData, setCampaignsData] = useState([]);
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const getCampaignsData = async (searchName = "") => {
        if (profileId.value && selectedAdType) {
            setCampaignsLoading(true);
            const data = { profileId: profileId.value, searchName: searchName };
            try {
                const response = await ApiGetCampaignAndAdGroupAutoSearch(data);

                if (response.isSuccess && response.result) {
                    // Group data by campaigns
                    const campaignsMap = new Map();

                    response.result.forEach(item => {
                        const campaignId = item.campaignId;
                        const adGroupId = item.adGroupId;

                        if (!campaignsMap.has(campaignId)) {
                            campaignsMap.set(campaignId, { id: campaignId, name: item.campaign, adGroups: [] });
                        }

                        // Add ad group to campaign
                        campaignsMap.get(campaignId).adGroups.push({ id: adGroupId, name: item.adGroup, campaignId: campaignId, campaignName: item.campaign });
                    });

                    // Convert map to array
                    const campaignsArray = Array.from(campaignsMap.values());
                    setCampaignsData(campaignsArray);
                } else {
                    setCampaignsData([]);
                }
            } catch (error) {
                console.error("Error fetching campaigns data:", error);
                setCampaignsData([]);
            } finally {
                setCampaignsLoading(false);
            }
        }
    }

    useEffect(() => {
        if (showModal && profileId?.value && selectedAdType && campaignsData.length === 0) {
            getCampaignsData();
        }
    }, [showModal, profileId?.value, selectedAdType]);

    // Debounced search for campaigns
    useEffect(() => {
        if (!showModal) return;
        const debounceTimer = setTimeout(() => {
            if (campaignSearchTerm) getCampaignsData(campaignSearchTerm);
        }, 500); // 500ms debounce
        return () => clearTimeout(debounceTimer);
    }, [campaignSearchTerm, showModal]);

    const handleModalClose = () => {
        setCurrentView("campaigns");
        setAdGroupsData([]);
        setCurrentCampaignForAdGroups(null);
        setCampaignSearchTerm("");
        handleClose();
    }

    // Handle showing ad groups for a campaign
    const handleShowAdGroups = (campaign) => {
        setCurrentView("adgroups");
        setCurrentCampaignForAdGroups(campaign);
        setAdGroupsData(campaign.adGroups);
    };

    // Handle going back to campaigns view
    const handleBackToCampaigns = () => {
        setCurrentView("campaigns");
        setCurrentCampaignForAdGroups(null);
        setAdGroupsData([]);
    };

    // Handle ad group removal
    const handleAdGroupRemoval = (adGroupId) => {
        setSelectedAdGroups(prev => prev.filter(adGroup => adGroup.id !== adGroupId));
    };

    // Handle campaign selection
    const handleCampaignSelection = (campaign) => {
        if (selectedCampaigns.some(c => c.id === campaign.id)) {
            return;
        }
        setSelectedCampaigns(prev => [...prev, campaign]);
        setSelectedAdGroups(prev => prev.filter(ag => ag.campaignId !== campaign.id));
    };

    // Handle campaign removal
    const handleCampaignRemoval = (campaignId) => {
        setSelectedCampaigns(prev => prev.filter(campaign => campaign.id !== campaignId));
    };

    // Handle ad group selection
    const handleAdGroupSelection = (adGroup) => {
        if (selectedAdGroups.some(ag => ag.id === adGroup.id)) {
            return;
        }
        setSelectedAdGroups(prev => [...prev, adGroup]);
        setSelectedCampaigns(prev => prev.filter(campaign => campaign.id !== adGroup.campaignId));
    };

    // Handle apply filter (stores filter locally, doesn't call API)
    const handleApplyFilter = () => {
        handleSubmit({ mode, selectedCampaigns, selectedAdGroups })
        handleModalClose();
    };

    // Check if campaign is selected
    const isCampaignSelected = (campaignId) => {
        return selectedCampaigns.some(campaign => campaign.id === campaignId);
    };

    // Check if ad group is selected
    const isAdGroupSelected = (adGroupId) => {
        const isDirectlySelected = selectedAdGroups.some(adGroup => adGroup.id === adGroupId);
        const adGroup = campaignsData.flatMap(campaign => campaign.adGroups).find(ag => ag.id === adGroupId);
        const isCampaignSelected = adGroup ? selectedCampaigns.some(campaign => campaign.id === adGroup.campaignId) : false;
        return isDirectlySelected || isCampaignSelected;
    };

    return (
        <Dialog open={showModal} onOpenChange={(open) => !open && handleModalClose()}>
            <DialogContent 
                className="max-w-[900px] w-[95vw] p-6 rounded-[24px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0f172a] dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[85vh] [&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-white/10 [&>button]:bg-slate-50 dark:[&>button]:bg-white/5 [&>button]:text-slate-500 dark:[&>button]:text-white/70 hover:[&>button]:text-slate-900 dark:hover:[&>button]:text-white [&>button]:rounded-full [&>button]:p-1.5 [&>button]:transition-all"
                onInteractOutside={(e) => e.preventDefault()} 
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                {/* Circuit top glow line indicator */}
                <div 
                    className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                    style={{
                        background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
                        opacity: 0.8
                    }}
                />

                <DialogHeader className="p-0 shrink-0 mb-4 text-left">
                    <DialogTitle className="w-full flex justify-between items-center">
                        <span className="text-base font-bold text-slate-900 dark:text-white leading-tight font-sans">
                            {t("Campaigns and Ad Groups")}
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[350px] overflow-hidden">
                    {/* Left column (list with search) */}
                    <div className="flex flex-col border-r border-slate-100 dark:border-white/10 pr-0 md:pr-6 overflow-hidden">
                        {/* Back button for ad groups view */}
                        {currentView === "adgroups" && (
                            <button
                                type="button"
                                className="flex items-center gap-2 p-2.5 mb-2 rounded-lg bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 text-xs font-semibold transition-all w-full text-left"
                                onClick={handleBackToCampaigns}
                            >
                                <FiChevronLeft size={16} /> {currentCampaignForAdGroups?.name}
                            </button>
                        )}

                        {/* Search box - only show for campaigns view */}
                        {currentView === "campaigns" && (
                            <div className="mb-3">
                                <Input
                                    type="text"
                                    placeholder={t("Search by campaign name")}
                                    value={campaignSearchTerm}
                                    onChange={(e) => setCampaignSearchTerm(e.target.value)}
                                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white focus:ring-1 focus:ring-sky-500"
                                />
                            </div>
                        )}

                        {/* List of campaigns or ad groups */}
                        <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[300px]">
                            {campaignsLoading ? (
                                <div className="flex justify-center items-center py-8 text-slate-500 dark:text-slate-400">
                                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-sky-500 border-t-transparent mr-3" />
                                    <span className="text-sm font-medium">{t("Loading campaigns...")}</span>
                                </div>
                            ) : currentView === "campaigns" ? (
                                campaignsData.length > 0 ? (
                                    campaignsData.map(campaign => (
                                        <div key={campaign.id} className="flex justify-between items-center p-3 border border-slate-100 dark:border-white/5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                                            <div className="text-left max-w-[240px] truncate">
                                                <p className="mb-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{campaign.name}</p>
                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{t("Sponsored Products")}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs">
                                                {["campaign", "target"].includes(mode) && (
                                                    isCampaignSelected(campaign.id) ? (
                                                        <span className="text-slate-400 dark:text-slate-500 italic font-medium flex items-center gap-1">
                                                            <FiCheck size={14} /> {t("Added")}
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCampaignSelection(campaign)}
                                                            className="text-sky-500 hover:text-sky-600 font-bold uppercase tracking-wider text-[11px]"
                                                        >
                                                            {t("Add")}
                                                        </button>
                                                    )
                                                )}
                                                {["adgroup", "target"].includes(mode) && campaign.adGroups && campaign.adGroups.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleShowAdGroups(campaign)}
                                                        className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-semibold"
                                                    >
                                                        {t("Ad groups")} ›
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500 font-sans">
                                        <span className="text-sm font-medium">{t("No campaigns found")}</span>
                                    </div>
                                )
                            ) : (
                                adGroupsData.map(adGroup => (
                                    <div key={adGroup.id} className="flex justify-between items-center p-3 border border-slate-100 dark:border-white/5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                                        <div className="text-left truncate">
                                            <p className="mb-0 text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{adGroup.name}</p>
                                        </div>
                                        <div className="text-xs">
                                            {isAdGroupSelected(adGroup.id) ? (
                                                <span className="text-slate-400 dark:text-slate-500 italic font-medium flex items-center gap-1">
                                                    <FiCheck size={14} /> {t("Added")}
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => handleAdGroupSelection(adGroup)}
                                                    className="text-sky-500 hover:text-sky-600 font-bold uppercase tracking-wider text-[11px]"
                                                >
                                                    {t("Add")}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Right column (selected items) */}
                    <div className="flex flex-col overflow-hidden">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                {selectedCampaigns?.length + selectedAdGroups?.length} {t("Selected")}
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[300px]">
                            {selectedCampaigns.length === 0 && selectedAdGroups.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-white/5 rounded-xl h-full">
                                    <span className="text-xs font-medium">{t("No items selected")}</span>
                                </div>
                            ) : (
                                <>
                                    {/* Selected Campaigns */}
                                    {selectedCampaigns.map(campaign => (
                                        <div key={`campaign-${campaign.id}`} className="flex justify-between items-center p-3 border border-slate-100 dark:border-white/5 rounded-xl bg-slate-50/50 dark:bg-white/[0.02]">
                                            <div className="text-left truncate max-w-[200px]">
                                                <p className="mb-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{campaign.name}</p>
                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{t("Campaign")}</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleCampaignRemoval(campaign.id)}
                                                className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors p-1"
                                            >
                                                <FiX size={16} />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Selected Ad Groups */}
                                    {selectedAdGroups.map(adGroup => (
                                        <div key={`adgroup-${adGroup.id}`} className="flex justify-between items-center p-3 border border-slate-100 dark:border-white/5 rounded-xl bg-slate-50/50 dark:bg-white/[0.02]">
                                            <div className="text-left truncate max-w-[200px]">
                                                <p className="mb-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{adGroup.name}</p>
                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{t("Ad Group")}: {adGroup.campaignName}</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleAdGroupRemoval(adGroup.id)}
                                                className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors p-1"
                                            >
                                                <FiX size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-3 border-t border-slate-100 dark:border-white/10 shrink-0">
                    <button
                        type="button"
                        className="h-[36px] px-4 rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white active:scale-[0.98]"
                        onClick={handleModalClose}
                    >
                        {t("Cancel")}
                    </button>
                    <button
                        type="button"
                        onClick={handleApplyFilter}
                        className="h-[36px] px-4 rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 bg-gradient-to-r from-[#1A9FD4] to-[#2374F2] text-white shadow-[0_4px_12px_rgba(26,159,212,0.25)] hover:opacity-90 active:scale-[0.98]"
                    >
                        {t("Apply")}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default CampaignAndAdGroupModel;