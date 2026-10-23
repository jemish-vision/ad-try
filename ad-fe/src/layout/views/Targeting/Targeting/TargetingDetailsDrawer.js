import React, { useEffect, useMemo, useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import { X as CloseIcon, Folder as FolderIcon, Package as Inventory2Icon, ChevronDown as ExpandMoreIcon, ChevronUp as ExpandLessIcon } from "lucide-react";
import { ApiTargetingKeywordDetails } from "../../../../api-wrapper/targeting/ApiTargeting";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import { AppTooltip } from "../../../../components/ui/AppTooltip";
import { Sheet, SheetContent } from "../../../../components/ui/sheet";
import { TargetingTypeBadge } from "../../../../utility/targetingUtils";

function TargetingDetailsDrawer({ open, onClose, targeting, matchType, campaignIds = [] }) {
    const { t } = useTranslation();
    const { profileId, selectedAdType } = useContext(ProfileContext);

    const [loading, setLoading] = useState(false);
    const [campaigns, setCampaigns] = useState([]);
    const [expanded, setExpanded] = useState({});
    const [search, setSearch] = useState("");

    /* ------------------ Fetch Data ------------------ */
    useEffect(() => {
        if (!open) {
            setCampaigns([]);
            setExpanded({});
            setSearch("");
            setLoading(false);
            return;
        }

        if (!targeting || !matchType) return;

        setLoading(true);
        setCampaigns([]);
        setExpanded({});
        setSearch("");

        let isMounted = true;

        ApiTargetingKeywordDetails({
            profileId: profileId?.value,
            targeting,
            matchType,
            campaignIds,
        })
            .then((res) => {
                if (isMounted && res?.isSuccess) {
                    setCampaigns(res.data || []);
                }
            })
            .catch((err) => {
                console.error(err);
            })
            .finally(() => {
                if (isMounted) {
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [open, targeting, matchType, campaignIds, profileId?.value, selectedAdType]);

    /* ------------------ Toggle Campaign ------------------ */
    const toggleExpand = (campaignId) => {
        setExpanded((prev) => ({
            ...prev,
            [campaignId]: !prev[campaignId],
        }));
    };

    /* ------------------ Filtered Data ------------------ */
    const filteredCampaigns = useMemo(() => {
        if (!search) return campaigns;

        const keyword = search.toLowerCase();

        return campaigns
            .map((camp) => {
                const matchedProducts = camp.products.filter((p) =>
                    `${p.name || ""} ${p.sku || ""} ${p.asin || ""}`
                        .toLowerCase()
                        .includes(keyword)
                );

                if (
                    camp.campaignName.toLowerCase().includes(keyword) ||
                    matchedProducts.length
                ) {
                    return { ...camp, products: matchedProducts };
                }

                return null;
            })
            .filter(Boolean);
    }, [search, campaigns]);

    return (
        <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
            <SheetContent
                id="keyword-tracker-drawer"
                side="right"
                className="w-[30%] min-w-[500px] p-0 flex flex-col h-full bg-white dark:bg-[#0f172a] border-l border-slate-200 dark:border-slate-850"
            >
                {/* ---------- Header ---------- */}
                <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 dark:border-slate-850 flex-shrink-0">
                    <div>
                        <h6 className="text-base font-extrabold text-slate-800 dark:text-slate-100 mb-0.5">
                            {t("Targeting Details")}
                        </h6>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{targeting}</span>
                            <TargetingTypeBadge matchType={matchType} targeting={targeting} full />
                        </div>
                    </div>
                </div>

                {/* ---------- Search ---------- */}
                <div className="px-5 pt-4 pb-2 flex-shrink-0">
                    <input
                        type="text"
                        placeholder={t("Search campaign or product...")}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full h-9 px-3 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2374F2] transition"
                    />
                </div>

                <div className="h-px bg-slate-100 dark:bg-slate-850 mx-5 my-2 flex-shrink-0" />

                {/* ---------- Content ---------- */}
                <div className="flex-1 overflow-y-auto px-5 py-2">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-28 min-h-[300px]">
                            <i className="fa fa-spinner fa-spin text-[#1A9FD4] mb-3" style={{ fontSize: "32px" }} />
                            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                                Loading targeting details...
                            </span>
                        </div>
                    ) : filteredCampaigns.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center mt-8 font-semibold">
                            {t("No data found")}
                        </p>
                    ) : (
                        <ul className="p-0 m-0">
                            {filteredCampaigns.map((camp) => {
                                const isOpen = expanded[camp.campaignId] === true;

                                return (
                                    <li
                                        key={camp.campaignId}
                                        className="list-none mb-4"
                                    >
                                        {/* ---------- Campaign Header ---------- */}
                                        <div
                                            className="flex items-center gap-2 cursor-pointer group"
                                            onClick={() => toggleExpand(camp.campaignId)}
                                        >
                                            <FolderIcon className="h-4.5 w-4.5 text-[#2374F2] shrink-0" />
                                            <span className="font-bold text-sm text-slate-800 dark:text-slate-100 flex-1 truncate group-hover:text-[#2374F2] transition-colors">
                                                {camp.campaignName}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                                {camp.products.length}
                                            </span>
                                            {isOpen ? (
                                                <ExpandLessIcon className="h-4 w-4 text-slate-400" />
                                            ) : (
                                                <ExpandMoreIcon className="h-4 w-4 text-slate-400" />
                                            )}
                                        </div>

                                        {/* ---------- Products ---------- */}
                                        {isOpen && (
                                            <ul className="ml-6 mt-2.5 flex flex-col gap-2">
                                                {camp.products.map((p) => (
                                                    <li
                                                        key={p.adId}
                                                        className="list-none"
                                                    >
                                                        <div className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                                                            {/* Product Image */}
                                                            <AppTooltip text={p.name || "Product"}>
                                                                <div className="w-12 h-12 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
                                                                    {p.image ? (
                                                                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <Inventory2Icon className="h-5 w-5 text-slate-400" />
                                                                    )}
                                                                </div>
                                                            </AppTooltip>

                                                            {/* Product Text */}
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate m-0">
                                                                    {p.name || "Unnamed Product"}
                                                                </p>
                                                                <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate m-0">
                                                                    {p.sku || p.asin || ""}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

export default TargetingDetailsDrawer;
