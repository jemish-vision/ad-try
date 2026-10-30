import React, { useState, useContext, useEffect, useCallback, useMemo, useRef, createContext } from 'react';

import { useTour } from '../../tour';
import { ProfileContext } from '../../helper/usecontext/useContext';
import { handleLoader, Toast, useDispatch } from "../../helper/links/Link";
import { ApiGetPermission } from '../../api-wrapper/auth/ApiAuth';
import moment from "moment-timezone";

import { ShadcnDateRangePicker as DateRangePicker } from "../../components/ui/date-range-picker";
import { useLocation, useNavigate } from "react-router-dom";
import { predefinedRanges } from "../../common/helper/calendarValues/calendarValues";
import { AlertTriangle as WarningAmber } from "lucide-react";
import NotificationPanel from '../notification/NotificationPanel';

import { ApiSelectAccount, ApiAddToFavorite } from '../../api-wrapper/campaign/ApiCampaign';
import ConfigTypeDropdown from './ConfigDropDown/ConfigTypeDropdown';
import ConfigProfileDropdown from './ConfigDropDown/ConfigProfileDropdown';
import { resolveProfileSelection } from './profileSelection';
import LanguageSelector from '../../components/LanguageSelector';

import { ApiGetGlobalSettings, ApiUpdateMaintenanceMode } from "../../api-wrapper/globalSettings/ApiGlobalSettings";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Moon, Sun, ArrowLeft as ArrowBackIosIcon } from "@phosphor-icons/react";
import { AppTooltip } from "../../components/ui/AppTooltip";
import { ROLES } from 'src/common/constants';
import { useTranslation } from 'react-i18next';

export const HeaderContext = createContext({
    headerProps: {},
    setHeaderProps: () => { }
});

export const HeaderProvider = ({ children }) => {
    const [headerProps, setHeaderProps] = useState({});

    const setHeaderPropsSafely = useCallback((newProps) => {
        setHeaderProps((prev) => {
            const next = typeof newProps === "function" ? newProps(prev) : newProps;
            if (!next && !prev) return prev;
            if (next && prev) {
                const prevKeys = Object.keys(prev);
                const nextKeys = Object.keys(next);
                if (
                    prevKeys.length === nextKeys.length &&
                    prevKeys.every((k) => prev[k] === next[k])
                ) {
                    return prev;
                }
            }
            return next;
        });
    }, []);

    const contextValue = useMemo(() => ({
        headerProps,
        setHeaderProps: setHeaderPropsSafely
    }), [headerProps, setHeaderPropsSafely]);

    return (
        <HeaderContext.Provider value={contextValue}>
            {children}
        </HeaderContext.Provider>
    );
};

const routeTitleMap = {
    "/": "Dashboard",
    "/dashboard": "Dashboard",
    "/admin-dashboard": "Dashboard",
    "/campaigns": "Campaigns",
    "/placement": "Placement",
    "/placement-rule": "Placement Rule",
    "/budget-rule": "Budget Rules",
    "/recommandation": "Recommendations",
    "/targeting": "Targeting",
    "/targeting-rule": "Targeting Rule",
    "/keyword-tracker": "Keyword Tracker",
    "/search-term": "Search Term",
    "/search-term-rule": "Search Term Rule",
    "/keyword-analysis": "Keyword Analysis",
    "/hourly-performance-tracking": "Hourly Performance Tracking",
    "/orders": "Orders",
    "/order-report": "Order Report",
    "/product-list": "Product List",
    "/products": "Product Ads",
    "/coupons": "Coupons",
    "/deals": "Deals",
    "/inventory-management": "Inventory Management",
    "/warehouse-inventory": "Warehouse Inventory",
    "/product-performance": "Product Performance",
    "/fba-planning": "FBA Planning",
    "/mfn-to-fba": "MFN to FBA Recommendations",
    "/reconciliation-reimbursement": "Reconciliation & Reimbursement",
    "/returns": "Returns",
    "/brand-analytics": "Brand Analytics",
    "/history": "History",
    "/audit-log": "Audit Log",
    "/cron-schedular": "Cron Job Scheduler",
    "/pl-calculater": "P/L Calculator",
    "/users": "Users",
    "/settings": "Settings",
    "/packages": "Packages",
    "/retention": "Retention",
    "/holiday": "Holidays",
    "/role": "Roles",
    "/cron-job": "Cron Jobs",
    "/asana-users": "Asana Users",
    "/rule-blocked-time": "Rule Blocked Time",
    "/support-ticket": "Support Tickets",
    "/pages": "Pages",
    "/profile": "Profile",
    "/user-guide": "User Guide",
    "/organizations": "Organizations",
};

const getDefaultTitle = (path) => {
    let title = routeTitleMap[path];
    if (!title) {
        const matchedKey = Object.keys(routeTitleMap)
            .filter(key => key !== "/" && (path.startsWith(key + "/") || path.startsWith(key)))
            .sort((a, b) => b.length - a.length)[0];
        if (matchedKey) title = routeTitleMap[matchedKey];
    }
    return title || "";
};

const NOOP_FN = () => { };

function ChildFilterConfig({
    nameShow = false,
    name,
    dateShow = false,
    profileShow = true,
    isShowBackIcon = false,
    handleClick = NOOP_FN,
    tourId: propTourId
}) {
    const headerCtx = useContext(HeaderContext);
    const setHeaderProps = headerCtx?.setHeaderProps;
    const handleClickRef = useRef(handleClick);
    handleClickRef.current = handleClick;

    const stableHandleClick = useCallback((...args) => {
        if (typeof handleClickRef.current === "function") {
            handleClickRef.current(...args);
        }
    }, []);

    useEffect(() => {
        if (setHeaderProps) {
            setHeaderProps({
                nameShow,
                name,
                dateShow,
                profileShow,
                isShowBackIcon,
                handleClick: handleClick !== NOOP_FN ? stableHandleClick : NOOP_FN,
                propTourId,
                tourId: propTourId
            });
        }
    }, [nameShow, name, dateShow, profileShow, isShowBackIcon, handleClick === NOOP_FN, propTourId, stableHandleClick, setHeaderProps]);

    return null;
}

function LayoutHeader({ nameShow = false, name, dateShow = false, profileShow, isShowBackIcon = false, handleClick = NOOP_FN, tourId: propTourId }) {
    const { t } = useTranslation();

    const headerCtx = useContext(HeaderContext);
    const headerProps = headerCtx?.headerProps || {};
    const setHeaderProps = headerCtx?.setHeaderProps;

    let { setToday, setSelectedDate, setProfileId, pagePermission, setPagePermission, setTypeValue, profileList, setProfileList, setSelectedConfig } = useContext(ProfileContext)
    const location = useLocation();
    const navigate = useNavigate();
    const currentOrgName = localStorage.getItem("organizationName");
    const { startTour, dispatch: tourDispatch } = useTour();

    // Reset child overrides on route change for layout header
    useEffect(() => {
        if (setHeaderProps) {
            setHeaderProps({});
        }
    }, [location.pathname, setHeaderProps]);

    const activeName = headerProps.name !== undefined ? headerProps.name : (name !== undefined ? name : getDefaultTitle(location.pathname));
    const activeNameShow = headerProps.nameShow !== undefined ? headerProps.nameShow : (nameShow !== undefined ? nameShow : false);
    const activeDateShow = headerProps.dateShow !== undefined ? headerProps.dateShow : (dateShow !== undefined ? dateShow : false);
    const activeProfileShow = headerProps.profileShow !== undefined ? headerProps.profileShow : (profileShow !== undefined ? profileShow : true);
    const activeIsShowBackIcon = headerProps.isShowBackIcon !== undefined ? headerProps.isShowBackIcon : isShowBackIcon;
    const activeHandleClick = headerProps.handleClick || handleClick;
    const activeTourId = headerProps.tourId || headerProps.propTourId || propTourId;

    const routeToTourMap = {
        "/": "dashboard",
        "/dashboard": "dashboard",
        "/admin-dashboard": "admin-dashboard",
        "/campaigns": "campaign",
        "/placement": "placement",
        "/placement-rule": "bid-placement-rule",
        "/budget-rule": "budget-rules",
        "/recommandation": "recommandation",
        "/targeting": "targeting",
        "/targeting/detail": "targeting-detail",
        "/targeting-rule": "rule",
        "/keyword-tracker": "keyword-tracker",
        "/search-term": "search-term",
        "/search-term-rule": "search-term-rule",
        "/keyword-analysis": "keyword-analysis",
        "/hourly-performance-tracking": "dayparting-strategy",
        "/orders": "orders",
        "/order-report": "order-report",
        "/product-list": "product-list",
        "/products": "product-ads",
        "/coupons": "coupons",
        "/deals": "deals-dashboard",
        "/inventory-management": "inventory",
        "/fba-planning": "fba-planning",
        "/reconciliation-reimbursement": "reconciliation",
        "/returns": "returns",
        "/brand-analytics": "brand-analysis",
        "/history": "history",
        "/audit-log": "audit-log",
        "/cron-schedular": "cron-schedular",
        "/pl-calculater": "pl-calculater",
        "/users": "users",
        "/settings": "settings",
        "/packages": "packages",
        "/retention": "retention",
        "/holiday": "holiday",
        "/role": "roles",
        "/cron-job": "cron-job",
        "/asana-users": "asana-users",
        "/rule-blocked-time": "rule-blocked-time",
        "/support-ticket": "support-ticket",
        "/placement-rule-history": "placementRuleHistoryTour",
        "/budget-history": "budgetRuleHistoryTour",
        "/targeting-rule-history": "targetingRuleHistoryTour",
        "/hourly-performance-tracking/rule-history": "daypartingRuleHistoryTour",
        "/search-term-history": "searchTermRuleHistoryTour",
        "/cron-history": "cronJobHistoryTour",
        "/campaign/setting": "campaignSettingTour",
        "/targeting/history": "history",
        "/product-list/schema": "productTypeSchemaTour",
        "/pages": "pages",
        "/add-campagin": "add-new-campaign",
        "/add-campaign": "add-new-campaign",
        "/organizations": "organizationsTour",
        "/profile": "profileTour",
        "/profit-analysis": "profit-analysis",
        "/warehouse-inventory": "warehouse",
        "/warehouse-details": "warehouse",
    };

    // Check whether the current path has a mapped tour
    const getMatchedTourId = (path) => {
        if (propTourId) return propTourId;
        if (`${path}`.startsWith("/product-list/schema/") && document.getElementById("df-header")) {
            return "dynamicFormFieldTour";
        }
        // 1. Exact match
        let tourId = routeToTourMap[path];
        // 2. Prefix match — pick the longest matching prefix
        if (!tourId) {
            const matchedKey = Object.keys(routeToTourMap)
                .filter(key => key !== "/" && (path.startsWith(key + "/") || path.startsWith(key)))
                .sort((a, b) => b.length - a.length)[0];
            if (matchedKey) tourId = routeToTourMap[matchedKey];
        }
        return tourId;
    };

    const isAppstoreFlowActive = localStorage.getItem("amazon_appstore_flow") === "true" || sessionStorage.getItem("amazon_appstore_flow") === "true" || Boolean(localStorage.getItem("appstore_seller_id") || sessionStorage.getItem("appstore_seller_id"));
    const hasTour = !isAppstoreFlowActive && Boolean(getMatchedTourId(location.pathname));

    const handleGuideTourClick = () => {
        const tourId = getMatchedTourId(location.pathname);
        if (tourId) {
            tourDispatch({ type: 'START_TOUR', payload: { tourId } });
        } else {
            startTour('app');
        }
    };

    const getActiveTheme = () => {
        const storedTheme = localStorage.getItem("theme");
        if (storedTheme) return storedTheme;
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    };

    const [theme, setTheme] = useState(getActiveTheme());
    const toggleTheme = (e) => {
        const nextTheme = theme === "light" ? "dark" : "light";

        const x = e && e.clientX !== undefined ? `${e.clientX}px` : "50%";
        const y = e && e.clientY !== undefined ? `${e.clientY}px` : "50%";
        document.documentElement.style.setProperty("--vt-x", x);
        document.documentElement.style.setProperty("--vt-y", y);

        // Amazon Ads click ripple & spark effect
        const origin = document.createElement("div");
        origin.className = "ad-click-origin";
        origin.style.setProperty("--vt-x", x);
        origin.style.setProperty("--vt-y", y);

        for (let i = 0; i < 3; i++) {
            const ring = document.createElement("div");
            ring.className = "ad-click-ring";
            origin.appendChild(ring);
        }

        const spark = document.createElement("div");
        spark.className = "ad-click-spark";
        origin.appendChild(spark);

        const smile = document.createElement("div");
        smile.className = "ad-smile-arc";
        origin.appendChild(smile);

        document.body.appendChild(origin);
        setTimeout(() => origin.remove(), 1000);

        const updateTheme = () => {
            setTheme(nextTheme);
            localStorage.setItem("theme", nextTheme);
            document.documentElement.setAttribute("data-theme", nextTheme);
            window.dispatchEvent(new Event("themeChanged"));
        };

        if (!document.startViewTransition) {
            updateTheme();
            return;
        }

        document.startViewTransition(() => {
            updateTheme();
        });
    };

    useEffect(() => {
        const handleThemeChange = () => {
            setTheme(getActiveTheme());
        };
        window.addEventListener("themeChanged", handleThemeChange);
        return () => window.removeEventListener("themeChanged", handleThemeChange);
    }, []);

    const [sidebarWidth, setSidebarWidth] = useState(0);
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    const [isCompact, setIsCompact] = useState(() => window.innerWidth < 1150);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
            setIsCompact(window.innerWidth < 1150);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const dispatch = useDispatch()

    const [accountList, setAccountList] = useState([]);
    const [date, setDate] = useState();

    const [connected, setConnected] = useState(() => localStorage.getItem('connection'));
    const [role, setRole] = useState(() => localStorage.getItem('role'));

    useEffect(() => {
        const syncAuth = () => {
            setConnected(localStorage.getItem('connection'));
            setRole(localStorage.getItem('role'));
        };
        syncAuth();
        window.addEventListener("organizationChanged", syncAuth);
        window.addEventListener("storage", syncAuth);
        return () => {
            window.removeEventListener("organizationChanged", syncAuth);
            window.removeEventListener("storage", syncAuth);
        };
    }, [location.pathname]);

    const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
    const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
    const [pendingMaintenanceState, setPendingMaintenanceState] = useState(false);
    const [isUpdatingMaintenance, setIsUpdatingMaintenance] = useState(false);

    const pendingFavRef = useRef({});

    useEffect(() => {
        if (role === ROLES.SUPER_ADMIN) {
            ApiGetGlobalSettings().then(res => {
                if (res && res.isSuccess && res.data) {
                    setIsMaintenanceMode(res.data.isMaintenanceMode || false);
                } else if (res && typeof res.isMaintenanceMode === 'boolean') {
                    setIsMaintenanceMode(res.isMaintenanceMode);
                }
            });
        }
    }, [role]);

    const handleMaintenanceToggleClick = (e) => {
        e.preventDefault();
        setPendingMaintenanceState(!isMaintenanceMode);
        setShowMaintenanceModal(true);
    };

    const handleMaintenanceConfirm = async () => {
        setIsUpdatingMaintenance(true);
        try {
            const res = await ApiUpdateMaintenanceMode({ isMaintenanceMode: pendingMaintenanceState });
            if (res && (res.isSuccess || res.message)) {
                setIsMaintenanceMode(pendingMaintenanceState);
                Toast.success(pendingMaintenanceState ? t("Maintenance Mode Enabled") : t("Maintenance Mode Disabled"));
            } else {
                Toast.error(t("Unable to update Maintenance Mode."));
            }
        } catch {
            Toast.error(t("Error updating Maintenance Mode."));
        } finally {
            setIsUpdatingMaintenance(false);
            setShowMaintenanceModal(false);
        }
    };

    const checkAndSetDefaultProfile = useCallback((list) => {
        const storedProfileObj = (() => {
            try {
                return JSON.parse(localStorage.getItem('profile'));
            } catch (e) {
                return null;
            }
        })();
        const selection = resolveProfileSelection(list, storedProfileObj);
        if (!selection) {
            localStorage.removeItem('profile');
            setSelectedConfig(null);
            setProfileId({ value: null });
            window.dispatchEvent(new CustomEvent('profileChanged'));
            return;
        }
        const dates = storedProfileObj?.date ?? [moment().startOf('month').format('YYYY-MM-DD'), moment().format('YYYY-MM-DD')];
        const sendData = { ...storedProfileObj, ...selection, currencyCode: selection.profile.currencyCode, date: dates };
        localStorage.setItem('profile', JSON.stringify(sendData));
        setSelectedDate(dates);
        setSelectedConfig(selection);
        setProfileId({ value: selection.profile.profileId });
        window.dispatchEvent(new CustomEvent('profileChanged', { detail: selection }));
    }, [setSelectedDate, setSelectedConfig, setProfileId]);

    const profileHandler = useCallback(() => {
        ApiSelectAccount()
            .then((res) => {
                if (res.isSuccess && res.data) {
                    setToday(moment(new Date())?.format("YYYY-MM-DD"))
                    checkAndSetDefaultProfile(res.data);
                    setProfileList(res.data)
                    setAccountList(res.data)
                }
            }).catch((err) => {
                dispatch(handleLoader(false))
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileList, checkAndSetDefaultProfile]);

    const refreshProfileList = useCallback(() => {
        ApiSelectAccount()
            .then((res) => {
                if (res.isSuccess && res.data) {
                    checkAndSetDefaultProfile(res.data);
                    setProfileList(res.data)
                    setAccountList(res.data)
                }
            }).catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checkAndSetDefaultProfile]);

    useEffect(() => {
        window.addEventListener('profileAvailabilityChanged', refreshProfileList);
        return () => window.removeEventListener('profileAvailabilityChanged', refreshProfileList);
    }, [refreshProfileList]);

    const toggleFavorite = useCallback(async (profile, configId, e) => {
        e.stopPropagation();
        const profileMongoId = profile._id;
        if (pendingFavRef.current[profileMongoId]) return;
        pendingFavRef.current[profileMongoId] = true;
        try {
            const res = await ApiAddToFavorite({ configId, profileId: profile.profileId });
            if (res?.isSuccess) refreshProfileList();
            else Toast.error(t("Failed to update favorite."));
        } catch (err) {
            Toast.error(t("Failed to update favorite."));
            console.error("toggleFavorite error:", err);
        } finally {
            pendingFavRef.current[profileMongoId] = false;
        }
    }, [refreshProfileList]);

    useEffect(() => {
        const isConn = localStorage.getItem('connection');
        if (isConn === "true" || connected === "true") {
            profileHandler();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname, connected]);

    useEffect(() => {
        const handleOrgChange = () => {
            setConnected(localStorage.getItem('connection'));
            setRole(localStorage.getItem('role'));
            setProfileList([]);
            setAccountList([]);
            setPagePermission(undefined);
            ApiSelectAccount()
                .then((res) => {
                    if (res?.isSuccess && res.data) {
                        checkAndSetDefaultProfile(res.data);
                        setProfileList(res.data);
                        setAccountList(res.data);
                    }
                }).catch(() => { });
            ApiGetPermission()
                .then((res) => {
                    if (res?.data?.pages) {
                        setPagePermission(res.data.pages);
                        localStorage.setItem('permission', JSON.stringify(res.data.pages));
                    }
                }).catch(() => { });
        };
        window.addEventListener("organizationChanged", handleOrgChange);
        return () => window.removeEventListener("organizationChanged", handleOrgChange);
    }, [checkAndSetDefaultProfile, setPagePermission, setProfileList]);

    useEffect(() => {
        if (pagePermission) return;
        let dataArr = []
        ApiGetPermission()
            .then((res) => {

                setPagePermission(res.data.pages)
                localStorage.setItem('permission', JSON.stringify(res.data.pages))
                res.campaignTypes.forEach(el => {

                    dataArr.push({
                        label: el,
                        value: el
                    })
                })
                setTypeValue(dataArr)

            }).catch((err) => {
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const dateChangeHandler = e => {
        let storeData = JSON.parse(localStorage.getItem('profile'));

        let arr;
        if (e?.length === 0) {
            arr = [];
        } else {
            arr = [moment(e && e[0]).format("YYYY-MM-DD"), moment(e && e[1]).format("YYYY-MM-DD")];
        }
        setDate(arr)
        setSelectedDate(arr)
        storeData.date = arr;
        localStorage.setItem('profile', JSON.stringify(storeData))
    }

    useEffect(() => {
        let storeData = JSON.parse(localStorage.getItem('profile'));
        if (storeData?.date && Array.isArray(storeData.date) && storeData.date.length >= 2) {
            const d0 = storeData.date[0];
            const d1 = storeData.date[1];
            setDate(prev => (prev && prev[0] === d0 && prev[1] === d1) ? prev : [d0, d1]);
            setSelectedDate(prev => (prev && prev[0] === d0 && prev[1] === d1) ? prev : [d0, d1]);
        } else if (storeData?.date?.[0] && storeData?.date?.[1]) {
            const d0 = storeData.date[0];
            const d1 = storeData.date[1];
            setDate(prev => (prev && prev[0] === d0 && prev[1] === d1) ? prev : [d0, d1]);
            setSelectedDate(prev => (prev && prev[0] === d0 && prev[1] === d1) ? prev : [d0, d1]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localStorage.getItem('profile')]);


    useEffect(() => {
        const getSidebar = () => document.getElementById("sidebar-wrapper") || document.getElementById("owner-sidebar");
        const updateSidebarWidth = () => {
            if (window.innerWidth < 992) {
                setSidebarWidth(0);
                return;
            }
            const sidebar = getSidebar();
            if (sidebar) {
                const isOwner = document.getElementById("wrapper")?.classList.contains("owner-layout");
                const isToggled = document.getElementById("wrapper")?.classList.contains("toggled");
                setSidebarWidth(isOwner ? (isToggled ? 70 : 290) : sidebar.offsetWidth);
            }
        };

        updateSidebarWidth();

        const resizeObserver = new ResizeObserver(() => updateSidebarWidth());
        const sidebarElement = getSidebar();

        if (sidebarElement) resizeObserver.observe(sidebarElement);
        window.addEventListener("resize", updateSidebarWidth);
        window.addEventListener("toggleSidebar", updateSidebarWidth);

        return () => {
            if (sidebarElement) resizeObserver.unobserve(sidebarElement);
            window.removeEventListener("resize", updateSidebarWidth);
            window.removeEventListener("toggleSidebar", updateSidebarWidth);
        };
    }, []);

    return (
        <React.Fragment>
            <div className='filter_section flex justify-between items-center fixed top-0 right-0' style={{ zIndex: "90", width: `calc(100% - ${sidebarWidth}px )` }}>
                <div className={'flex items-center gap-2'}>
                    <span
                        className='cursor-pointer pr-2 header-toggle-btn lg:hidden flex items-center justify-center'
                        onClick={() => window.dispatchEvent(new Event("toggleSidebar"))}
                        style={{ color: "var(--text-secondary)", transition: "opacity 0.2s" }}
                        title={t("Toggle Sidebar")}
                    >
                        <i className="fa-solid fa-bars" style={{ fontSize: "18px" }}></i>
                    </span>
                    {
                        role === ROLES.SUPER_ADMIN && (
                            <div className="flex flex-col items-start leading-none pl-1 hidden sm:flex select-none">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                    <span className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 font-extrabold">
                                        {t("Super Admin Console")}
                                    </span>
                                </div>
                                <span className="text-[14px] font-bold text-slate-800 dark:text-white flex items-center gap-1 leading-none">
                                    {t("Welcome back,")} <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent font-extrabold">{localStorage.getItem("userName") || localStorage.getItem("sellerAdminLoginUser") || "Admin"}</span>
                                </span>
                            </div>
                        )
                    }
                    {
                        activeIsShowBackIcon &&
                        <span
                            className='cursor-pointer flex items-center justify-center'
                            onClick={activeHandleClick}
                            style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "8px",
                                background: "var(--input-bg, rgba(255, 255, 255, 0.8))",
                                border: "1px solid var(--input-border, rgba(226, 232, 240, 0.8))",
                                color: "var(--text-heading, #1e293b)",
                                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                                transition: "all 0.2s ease",
                                flexShrink: 0
                            }}
                            title={t("Go Back")}
                        >
                            <ArrowBackIosIcon size={18} weight="bold" />
                        </span>
                    }
                    {
                        activeNameShow && activeName &&
                        <div className=' inner_filter pb-0'  >
                            <p className='heading hidden md:block'>{t(activeName)}</p>
                        </div>
                    }
                    {
                        role !== ROLES.SUPER_ADMIN && (
                            <div id="adtype-dropdown" className="adType-dropdown">
                                <ConfigTypeDropdown compact={isCompact} />
                            </div>
                        )
                    }
                </div>
                <div className="hidden md:flex flex-1 justify-center">
                    {
                        activeDateShow && (
                            <div className='inner_filter date_range pb-2 lg:pb-0'>
                                <DateRangePicker
                                    className='filter_date'
                                    style={{ width: "240px" }}
                                    ranges={predefinedRanges}
                                    value={[
                                        date &&
                                        date[0] !== undefined &&
                                        moment(date[0], "YYYY-MM-DD").toDate(),

                                        date &&
                                        date[1] !== undefined &&
                                        moment(date[1], "YYYY-MM-DD").toDate(),
                                    ]}
                                    placeholder={t("Select Date")}
                                    onChange={(e) => dateChangeHandler(e)}
                                />
                            </div>
                        )
                    }
                </div>
                <div className="flex gap-1 md:gap-3 xl:gap-3 justify-end items-center">
                    <div className="flex items-center gap-1 md:gap-3">
                        {hasTour && role && (
                            <AppTooltip text={t("Guided Tour")} side="bottom">
                                <div id="help-center">
                                    <button
                                        onClick={handleGuideTourClick}
                                        className="theme-toggle-btn"
                                        style={{ position: "relative" }}
                                        aria-label={t("Open guided tours")}
                                    >
                                        <i className="fa-regular fa-circle-question" style={{ fontSize: "18px", color: "var(--text-secondary)" }} />
                                    </button>
                                </div>
                            </AppTooltip>
                        )}
                        <AppTooltip text={t("Notifications")} side="bottom">
                            <div id="notification">
                                <NotificationPanel />
                            </div>
                        </AppTooltip>
                        <AppTooltip text={theme === "light" ? t("Switch to Dark Mode") : t("Switch to Light Mode")} side="bottom">
                            <div id="theme-toggle">
                                <button
                                    onClick={(e) => {
                                        toggleTheme(e);
                                        e.currentTarget.blur();
                                    }}
                                    className="theme-toggle-btn"
                                >
                                    {theme === "light" ? <Moon size={18} weight="regular" /> : <Sun size={18} weight="regular" />}
                                </button>
                            </div>
                        </AppTooltip>
                        <div id="language-selector" className="flex items-center">
                            <LanguageSelector />
                        </div>

                    </div>
                    {
                        role !== ROLES.SUPER_ADMIN && activeProfileShow && Boolean(accountList?.length) && (
                            <div id="profile-selection" className='select_icon inner_filter last_inner' style={{ visibility: activeProfileShow ? 'visible' : 'hidden' }}>
                                <ConfigProfileDropdown ConfigList={accountList} toggleFavorite={toggleFavorite} compact={isCompact} />
                            </div>
                        )
                    }
                    {Boolean(localStorage.getItem("superAdminToken")) && (
                        <button
                            onClick={() => {
                                const superAdminToken = localStorage.getItem("superAdminToken");
                                const superAdminRole = localStorage.getItem("superAdminRole") || ROLES.SUPER_ADMIN;
                                localStorage.setItem("sellerToken", superAdminToken);
                                localStorage.setItem("role", superAdminRole);
                                localStorage.removeItem("superAdminToken");
                                localStorage.removeItem("superAdminRole");
                                localStorage.removeItem("impersonatedUserName");
                                localStorage.removeItem("organizationId");
                                localStorage.removeItem("organizationName");
                                localStorage.removeItem("profile");
                                window.location.href = "/users";
                            }}
                            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-all shadow-sm shrink-0 ml-1 cursor-pointer"
                            style={{ height: "36px" }}
                        >
                            <i className="fa fa-shield text-white" />
                            <span className="hidden xl:inline font-bold whitespace-nowrap">
                                {t("Back to Super Admin")}
                            </span>
                            <span className="hidden sm:inline xl:hidden font-bold whitespace-nowrap">
                                {t("Super Admin")}
                            </span>
                            <i className="fa fa-arrow-right text-[10px] opacity-90 ml-0.5" />
                        </button>
                    )}
                </div>
                {role === ROLES.SUPER_ADMIN && false && (
                    <div className="flex items-center justify-end">
                        <div
                            className="flex items-center gap-2 px-2 py-1 rounded-full border"
                            style={{ cursor: "pointer", background: "var(--bs-body-bg)" }}
                            onClick={handleMaintenanceToggleClick}
                        >
                            <div
                                className="flex items-center justify-center rounded-full"
                                style={{
                                    width: 28, height: 28,
                                    background: isMaintenanceMode ? "#FCEBEB" : "#EAF3DE",
                                    transition: "background 0.2s"
                                }}
                            >
                                {isMaintenanceMode
                                    ? <WarningAmber style={{ fontSize: 15, color: "#A32D2D" }} />
                                    : <span style={{ fontSize: 13 }}>✓</span>
                                }
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>Maintenance mode</div>
                                <div style={{ fontSize: 11, color: "#888" }}>
                                    {isMaintenanceMode ? "Maintenance active" : "Platform is live"}
                                </div>
                            </div>
                            <div
                                style={{
                                    width: 36, height: 20, borderRadius: 999, position: "relative",
                                    background: isMaintenanceMode ? "#E24B4A" : "#CCC",
                                    transition: "background 0.2s", flexShrink: 0
                                }}
                            >
                                <div style={{
                                    position: "absolute", top: 2, width: 16, height: 16,
                                    borderRadius: "50%", background: "#fff",
                                    left: isMaintenanceMode ? 18 : 2,
                                    transition: "left 0.2s",
                                    boxShadow: "0 1px 2px rgba(0,0,0,0.15)"
                                }} />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <Dialog open={showMaintenanceModal} onOpenChange={(open) => { if (!open && !isUpdatingMaintenance) setShowMaintenanceModal(false); }}>
                <DialogContent className="max-w-md" hideCloseButton={isUpdatingMaintenance}>
                    <DialogHeader className="border-0 pb-0">
                        <div className="flex items-center gap-3">
                            <div
                                className="flex items-center justify-center rounded-lg h-10 w-10 shrink-0"
                                style={{
                                    background: pendingMaintenanceState ? "#FCEBEB" : "#EAF3DE"
                                }}
                            >
                                {pendingMaintenanceState
                                    ? <WarningAmber className="h-5 w-5 text-[#A32D2D]" />
                                    : <span className="text-[#3B6D11] font-semibold text-lg">✓</span>
                                }
                            </div>
                            <DialogTitle className="text-base font-medium text-slate-800 dark:text-slate-200">
                                {pendingMaintenanceState ? "Enable maintenance mode?" : "Disable maintenance mode?"}
                            </DialogTitle>
                        </div>
                    </DialogHeader>
                    <div className="py-3 text-slate-600 dark:text-slate-300 text-sm">
                        {pendingMaintenanceState
                            ? "This will restrict platform access for all users until maintenance mode is turned off."
                            : "This will restore full platform access for all users."
                        }
                    </div>
                    <DialogFooter className="flex justify-end gap-2 pt-2 border-0">
                        <Button variant="outline" onClick={() => setShowMaintenanceModal(false)} disabled={isUpdatingMaintenance}>
                            Cancel
                        </Button>
                        <Button
                            variant={pendingMaintenanceState ? "destructive" : "default"}
                            className={!pendingMaintenanceState ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                            onClick={handleMaintenanceConfirm}
                            disabled={isUpdatingMaintenance}
                        >
                            {isUpdatingMaintenance ? "Processing…" : (pendingMaintenanceState ? "Enable maintenance" : "Restore access")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </React.Fragment>
    );
}

function Filter(props) {
    if (!props.isLayoutHeader) {
        return <ChildFilterConfig {...props} />;
    }
    return <LayoutHeader {...props} />;
}

export default React.memo(Filter);
