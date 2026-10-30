import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { CheckCircle as CheckCircleOutlined } from "@phosphor-icons/react";
import React, { useContext, useMemo, useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ProfileContext } from "../../usecontext/useContext";
import { isProfileAvailable } from "../profileSelection";

function ConfigProfileDropdown({ ConfigList, compact = false, toggleFavorite }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [activeTab, setActiveTab] = useState(() => ConfigList.some(cfg => cfg.profiles.some(p => p.isFavorite)) ? "favorites" : "all");

    const [isDark, setIsDark] = useState(
        document.documentElement.getAttribute("data-theme") === "dark" ||
        document.documentElement.getAttribute("data-theme") === "black"
    );

    useEffect(() => {
        const handle = () => {
            const theme = document.documentElement.getAttribute("data-theme");
            setIsDark(theme === "dark" || theme === "black");
        };
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const {
        profileList,
        setProfileId,
        setProfileData,
        selectedConfig: selection,
        setSelectedConfig: setSelection,
    } = useContext(ProfileContext);

    const handleOpenChange = useCallback((visible) => {
        setOpen(visible);
        if (!visible) setSearch("");
        if (!visible) setActiveTab(ConfigList.some(cfg => cfg.profiles.some(p => p.isFavorite)) ? "favorites" : "all");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ConfigList]);

    const profileChange = useCallback((profile, config) => {
        setSelection({ config, profile });
        setOpen(false);
        setSearch("");

        setProfileId({ value: profile?.profileId });

        let findConfig = profileList.find(x => x?.configId === config?.configId);
        let findProfile = findConfig?.profiles.find(x => x?._id === profile?._id);
        setProfileData(findConfig);

        let storeData = JSON.parse(localStorage.getItem("profile")) || {};
        storeData.config = findConfig;
        storeData.profile = findProfile;
        storeData.currencyCode = profile?.currencyCode;
        localStorage.setItem("profile", JSON.stringify(storeData));

        window.dispatchEvent(new CustomEvent("profileChanged", {
            detail: { profile: findProfile || profile, config: findConfig || config }
        }));
    }, [profileList, setProfileId, setProfileData, setSelection]);

    const filteredGroups = useMemo(() => {
        const q = search.toLowerCase();
        return ConfigList.map(cfg => {
            const profiles = cfg.profiles.filter(p => {
                // If ads and seller both are disconnected, do not show in top profile.
                // If any one of them is active, show.
                if (!isProfileAvailable(p)) {
                    return false;
                }

                const matchSearch =
                    p.name?.toLowerCase().includes(q) ||
                    p.countryCode?.toLowerCase().includes(q) ||
                    p.advertiserId?.toLowerCase().includes(q);
                const matchFav = activeTab === "favorites" ? !!p.isFavorite : true;
                return matchSearch && matchFav;
            });
            return { ...cfg, profiles };
        }).filter(cfg => cfg.profiles.length > 0);
    }, [ConfigList, search, activeTab]);

    const renderProfileList = () => {
        if (filteredGroups.length === 0) {
            return (
                <div className="text-gray-500 dark:text-gray-400 text-center py-5 text-[13px]">
                    {activeTab === "favorites" ? "No items in your list" : "No profile found"}
                </div>
            );
        }

        return filteredGroups.map((cfg, gIdx) => (
            <div key={cfg.configId}>
                <div className="company-group-header font-semibold text-gray-900 dark:text-gray-100 text-[13px] px-2 py-1 bg-gray-50 dark:bg-white/5 rounded-md mb-1">
                    {cfg.config?.companyName}
                </div>

                {cfg.profiles.map((profile, pIdx) => {
                    const isSelected = selection?.profile?._id === profile._id;
                    const isFav = !!profile.isFavorite; // 👈 read from DB data, not local state

                    return (
                        <div key={profile._id}>
                            <div
                                onClick={() => profileChange(profile, cfg)}
                                className={`profile-item flex items-center justify-between gap-2 px-2 py-2 cursor-pointer rounded transition-colors ${isSelected ? "bg-[#EEF4FC] hover:bg-[#EEF4FC] dark:bg-[rgba(60,187,242,0.15)] dark:hover:bg-[rgba(60,187,242,0.15)] text-blue-600 dark:text-blue-400 font-semibold" : "text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5"}`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 truncate">
                                        <span className="truncate text-[13px]">
                                            <b>{profile.countryCode}</b> | {profile.name}
                                        </span>
                                    </div>
                                    <span className={`text-[11px] block ${isSelected ? "text-blue-600/80 dark:text-blue-400/80" : "text-gray-500 dark:text-gray-400"}`}>
                                        {profile.advertiserId}
                                    </span>
                                </div>

                                <div title={isFav ? "Remove from list" : "Add to list"}>
                                    <span
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleFavorite(profile, cfg.configId, e);
                                        }}
                                        className="cursor-pointer w-6 h-6 flex-shrink-0 leading-none p-1 transition-colors"
                                    >
                                        <CheckCircleOutlined style={{ color: isFav ? "#1A9FD4" : "#d9d9d9", fontSize: 18 }} />
                                    </span>
                                </div>
                            </div>

                            {pIdx < cfg.profiles.length - 1 && (
                                <hr className="my-[2px] border-gray-100 dark:border-white/5" />
                            )}
                        </div>
                    );
                })}

                {gIdx < filteredGroups.length - 1 && (
                    <hr className="my-[6px] border-gray-300 dark:border-white/10 border-[1px]" />
                )}
            </div>
        ));
    };

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className="glass-dropdown-btn transition-all"
                    style={{ padding: compact ? "4px 10px" : "0 12px", height: compact ? "38px" : "40px" }}
                >
                    <div className="flex items-center gap-1.5">
                        {compact ? (
                            <span className="font-bold text-[13px] text-[var(--button-secondary-text)] flex items-center">
                                <i className="fa-solid fa-globe mr-1.5 text-blue-500 dark:text-blue-400"></i>
                                {selection?.profile?.countryCode || "--"}
                            </span>
                        ) : (
                            <>
                                <span className="font-semibold text-[13px] min-w-[24px] text-[var(--button-secondary-text)]">
                                    {selection?.profile?.countryCode || "--"}
                                </span>
                                <span className="text-[var(--button-secondary-text)] opacity-60">|</span>
                                <span className="font-semibold text-[13px] max-w-[100px] md:max-w-[140px] lg:max-w-[180px] xl:max-w-[240px] truncate text-[var(--button-secondary-text)]">
                                    {selection?.profile?.name || "--"}
                                </span>
                            </>
                        )}
                        <span style={{ fontSize: 9, marginLeft: 4, display: "inline-block", verticalAlign: "middle", color: "var(--button-secondary-text)" }}>▼</span>
                    </div>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="w-[320px] p-3 z-[10000] shadow-xl rounded-xl border"
                style={{
                    background: isDark ? "#0c1222" : "#fff",
                    borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
                }}
            >
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mb-2">
                    <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="all">{t("All profiles")}</TabsTrigger>
                        <TabsTrigger value="favorites">{t("My List")}</TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="p-2">
                    <Input
                        placeholder={t("Search profile...")}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-8 text-[13px]"
                    />
                </div>

                <div
                    className="max-h-[380px] overflow-y-auto overscroll-contain"
                    onWheel={(e) => e.stopPropagation()}
                >
                    {renderProfileList()}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export default React.memo(ConfigProfileDropdown);
