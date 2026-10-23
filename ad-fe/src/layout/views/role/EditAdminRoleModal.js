import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { t } from "i18next";
import { useEffect, useState, useMemo } from "react";
import { ApiUserPermission } from "../../../api-wrapper/ApiUsers";
import { ApiCreateRole, ApiUpdateRole, ApiUpdateRolePermission } from "../../../api-wrapper/ApiRoles";
import Toast from "../../../common/helper/toast/Toast";
import { MdOutlineClose } from "react-icons/md";
import { Formik } from "formik";
import * as Yup from "yup";
import moment from "moment";
import { useTour } from "../../../tour";

export default function EditAdminRoleModal({
    open,
    onClose,
    role,
    onSave,
}) {
    const isEdit = Boolean(role?._id);
    const [activeTab, setActiveTab] = useState(0);
    const [createdRoleId, setCreatedRoleId] = useState(null);
    const [createdRoleName, setCreatedRoleName] = useState("");

    // Permission states
    const [loadingPermissions, setLoadingPermissions] = useState(false);
    const [saving, setSaving] = useState(false);
    const [modules, setModules] = useState([]);
    const [selectedActions, setSelectedActions] = useState({});
    const [activeModuleId, setActiveModuleId] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState("ALL");
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    const currentRoleId = role?._id || createdRoleId;
    const currentRoleName = role?.roleName || createdRoleName;

    const { state: tourState } = useTour();
    const isTourActive = tourState.run && tourState.activeTourId === "roles";

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (open) {
            setActiveTab(0);
            if (role?._id) {
                setCreatedRoleId(role._id);
                setCreatedRoleName(role.roleName || "");
            } else {
                setCreatedRoleId(null);
                setCreatedRoleName("");
            }
            setSearchQuery("");
            setActiveCategory("ALL");
            setModules([]);
            setSelectedActions({});
            setActiveModuleId(null);
        }
    }, [open, role]);

    useEffect(() => {
        if (open && activeTab === 1 && currentRoleId) {
            fetchRolePermissions(currentRoleId);
        }
    }, [open, activeTab, currentRoleId]);

    const fetchRolePermissions = async (roleId) => {
        try {
            setLoadingPermissions(true);
            const res = await ApiUserPermission({ roleId });
            if (res?.isSuccess && Array.isArray(res.data)) {
                const initialSelected = {};
                res.data.forEach((page) => {
                    if (Array.isArray(page.actions)) {
                        page.actions.forEach((action) => {
                            if (page.allocatedActions?.some((a) => a.actionId === action._id)) {
                                initialSelected[action._id] = true;
                            }
                        });
                    }
                });
                setSelectedActions(initialSelected);

                const sortedData = [...res.data].sort((a, b) => (a.pageName || "").localeCompare(b.pageName || ""));
                setModules(sortedData);
                if (sortedData.length > 0) {
                    setActiveModuleId(sortedData[0]._id);
                }
            }
        } catch (err) {
            console.error("Permission fetch failed", err);
            Toast.error(t("Failed to fetch permissions"));
        } finally {
            setLoadingPermissions(false);
        }
    };

    const roleSchema = Yup.object().shape({
        roleName: Yup.string().trim().required(t("Role name is required")),
    });

    const handleRoleSubmit = async (values, { setSubmitting }) => {
        try {
            setSaving(true);
            if (!isEdit && !createdRoleId) {
                // Create new role
                const res = await ApiCreateRole({ roleName: values.roleName.trim() });
                if (res?.isSuccess) {
                    Toast.success(res.message || t("Role created successfully"));
                    const newId = res.data?.roleId || res.data?._id;
                    setCreatedRoleId(newId);
                    setCreatedRoleName(values.roleName.trim());
                    if (onSave) onSave();
                    setActiveTab(1); // switch to permissions tab directly
                } else {
                    Toast.error(res?.message || t("Failed to create role"));
                }
            } else {
                // Update existing role
                const res = await ApiUpdateRole({ roleId: currentRoleId, roleName: values.roleName.trim() });
                if (res?.isSuccess) {
                    Toast.success(res.message || t("Role updated successfully"));
                    setCreatedRoleName(values.roleName.trim());
                    if (onSave) onSave();
                    setActiveTab(1);
                } else {
                    Toast.error(res?.message || t("Failed to update role"));
                }
            }
        } catch (error) {
            Toast.error(t("Something went wrong, please try again!"));
        } finally {
            setSaving(false);
            setSubmitting(false);
        }
    };

    const getModuleCategory = (pageName = "") => {
        const lower = pageName.toLowerCase().trim();
        if (lower.includes("analytics") || lower === "dashboard" || lower.includes("audit") || lower.includes("history") || lower.includes("calculat") || lower.includes("guide")) {
            return "Analytics";
        }
        if (lower.includes("campaign") || lower.includes("placement") || lower.includes("budget") || lower.includes("target") || lower.includes("keyword") || lower.includes("search") || lower.includes("coupon") || lower.includes("daypart") || lower.includes("recommend")) {
            return "Advertising";
        }
        if (lower.includes("product") || lower.includes("order") || lower.includes("inventory") || lower.includes("warehouse") || lower.includes("fba") || lower.includes("deal") || lower.includes("cron") || lower.includes("schedul")) {
            return "Operations";
        }
        if (lower.includes("reconcil") || lower.includes("reimburse") || lower.includes("refund") || lower.includes("return") || lower.includes("p/l")) {
            return "Finance";
        }
        return "System";
    };

    // Filter modules based on category and search query
    const filteredModules = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        const list = modules
            .map((mod) => {
                const category = getModuleCategory(mod.pageName);
                if (activeCategory !== "ALL" && category !== activeCategory) {
                    return null;
                }

                if (!query) return mod;
                const modNameMatches = (mod.pageName || "").toLowerCase().includes(query);
                const matchingActions = (mod.actions || []).filter((act) =>
                    (act.actionType || "").toLowerCase().includes(query)
                );
                if (modNameMatches || matchingActions.length > 0) {
                    return {
                        ...mod,
                        actions: modNameMatches ? mod.actions : matchingActions,
                    };
                }
                return null;
            })
            .filter(Boolean);

        return list.sort((a, b) => (a.pageName || "").localeCompare(b.pageName || ""));
    }, [modules, searchQuery, activeCategory]);

    useEffect(() => {
        if (filteredModules.length > 0 && (!activeModuleId || !filteredModules.some((m) => m._id === activeModuleId))) {
            setActiveModuleId(filteredModules[0]._id);
        } else if (filteredModules.length === 0) {
            setActiveModuleId(null);
        }
    }, [filteredModules, activeModuleId]);

    const activeModule = useMemo(() => {
        return modules.find((m) => m._id === activeModuleId) || null;
    }, [modules, activeModuleId]);

    const allActions = useMemo(() => {
        return modules.flatMap((m) => m.actions || []);
    }, [modules]);

    const totalSelectedCount = useMemo(() => {
        return Object.values(selectedActions).filter(Boolean).length;
    }, [selectedActions]);

    const totalActionCount = allActions.length;
    const completionPercentage = totalActionCount > 0 ? Math.round((totalSelectedCount / totalActionCount) * 100) : 0;

    const isAllGranted = useMemo(() => {
        return allActions.length > 0 && allActions.every((a) => selectedActions[a._id]);
    }, [allActions, selectedActions]);

    const isViewOnlyAllActive = useMemo(() => {
        if (allActions.length === 0) return false;
        let viewOnlyCount = 0;
        let viewOnlySelected = 0;
        let nonViewOnlySelected = 0;

        modules.forEach((mod) => {
            (mod.actions || []).forEach((a) => {
                const type = (a.actionType || "").toLowerCase().trim();
                const isView = type === "view only" || type.startsWith("view") || type.includes("read") || type.includes("list");
                if (isView) {
                    viewOnlyCount++;
                    if (selectedActions[a._id]) viewOnlySelected++;
                } else {
                    if (selectedActions[a._id]) nonViewOnlySelected++;
                }
            });
        });

        return viewOnlyCount > 0 && viewOnlySelected === viewOnlyCount && nonViewOnlySelected === 0;
    }, [allActions, modules, selectedActions]);

    const toggleAllPermissions = () => {
        if (isAllGranted) {
            setSelectedActions({});
        } else {
            const nextSelected = {};
            allActions.forEach((a) => {
                nextSelected[a._id] = true;
            });
            setSelectedActions(nextSelected);
        }
    };

    const grantViewOnlyAll = () => {
        if (isViewOnlyAllActive) {
            setSelectedActions({});
            return;
        }
        const nextSelected = {};
        modules.forEach((mod) => {
            (mod.actions || []).forEach((a) => {
                const type = (a.actionType || "").toLowerCase().trim();
                if (type === "view only" || type.startsWith("view") || type.includes("read") || type.includes("list")) {
                    nextSelected[a._id] = true;
                }
            });
        });
        setSelectedActions(nextSelected);
    };

    const clearAllPermissions = () => {
        setSelectedActions({});
    };

    // Preset level for active module
    const currentModuleActiveLevel = useMemo(() => {
        if (!activeModule || !activeModule.actions?.length) return "none";
        const acts = activeModule.actions;
        const selectedInMod = acts.filter((a) => selectedActions[a._id]);

        if (selectedInMod.length === 0) return "none";
        if (selectedInMod.length === acts.length) return "full";

        const viewAction = acts.find((a) => {
            const t = (a.actionType || "").toLowerCase();
            return t.includes("view") || t.includes("read");
        });
        if (selectedInMod.length === 1 && viewAction && selectedActions[viewAction._id]) {
            return "view";
        }

        const deleteAction = acts.find((a) => {
            const t = (a.actionType || "").toLowerCase();
            return t.includes("remove") || t.includes("delete");
        });
        if (!selectedActions[deleteAction?._id] && selectedInMod.length >= 2) {
            return "editor";
        }

        return "custom";
    }, [activeModule, selectedActions]);

    const applyModulePreset = (preset) => {
        if (!activeModule || !activeModule.actions) return;
        const nextSelected = { ...selectedActions };
        const acts = activeModule.actions;

        if (preset === "none") {
            acts.forEach((a) => { delete nextSelected[a._id]; });
        } else if (preset === "view") {
            acts.forEach((a) => {
                const t = (a.actionType || "").toLowerCase();
                if (t.includes("view") || t.includes("read")) {
                    nextSelected[a._id] = true;
                } else {
                    delete nextSelected[a._id];
                }
            });
        } else if (preset === "editor") {
            acts.forEach((a) => {
                const t = (a.actionType || "").toLowerCase();
                if (t.includes("remove") || t.includes("delete")) {
                    delete nextSelected[a._id];
                } else {
                    nextSelected[a._id] = true;
                }
            });
        } else if (preset === "full") {
            acts.forEach((a) => { nextSelected[a._id] = true; });
        }
        setSelectedActions(nextSelected);
    };

    const toggleSingleAction = (actionId) => {
        setSelectedActions((prev) => {
            const isCurrentlySelected = Boolean(prev[actionId]);
            const nextSelected = { ...prev, [actionId]: !isCurrentlySelected };

            if (isCurrentlySelected) {
                const actionObj = allActions.find((a) => a._id === actionId);
                const type = (actionObj?.actionType || "").toLowerCase().trim();

                if (type === "view only" || type.startsWith("view") || type.includes("read") || type.includes("list")) {
                    const moduleOfAction = modules.find(m => m.actions?.some(a => a._id === actionId));
                    if (moduleOfAction) {
                        moduleOfAction.actions.forEach(a => {
                            const aType = (a.actionType || "").toLowerCase().trim();
                            if (aType === "create" || aType.startsWith("create") || aType.includes("add") || aType.includes("new") ||
                                aType === "update" || aType.startsWith("update") || aType.includes("edit") || aType.includes("modify") ||
                                aType === "remove" || aType.startsWith("remove") || aType.includes("delete") || aType.includes("destroy")) {
                                nextSelected[a._id] = false;
                            }
                        });
                    }
                }
            }
            return nextSelected;
        });
    };

    const getActionTheme = (actionType = "") => {
        const lower = actionType.toLowerCase().trim();
        if (lower === "view only" || lower.includes("view") || lower.includes("read") || lower.includes("list")) {
            return {
                icon: "fa-solid fa-eye",
                color: isDark ? "#60a5fa" : "#2563eb",
                bg: isDark ? "rgba(59, 130, 246, 0.2)" : "rgba(37, 99, 235, 0.1)",
                badge: "View",
                description: t("Allows viewing pages, reading analytics, and browsing data tables.")
            };
        }
        if (lower === "create" || lower.includes("create") || lower.includes("add") || lower.includes("new")) {
            return {
                icon: "fa-solid fa-plus",
                color: isDark ? "#34d399" : "#10b981",
                bg: isDark ? "rgba(16, 185, 129, 0.2)" : "rgba(16, 185, 129, 0.1)",
                badge: "Create",
                description: t("Allows adding new entries, profiles, rules, and campaigns.")
            };
        }
        if (lower === "update" || lower.includes("update") || lower.includes("edit") || lower.includes("modify")) {
            return {
                icon: "fa-solid fa-pen-to-square",
                color: isDark ? "#fbbf24" : "#f59e0b",
                bg: isDark ? "rgba(245, 158, 11, 0.2)" : "rgba(245, 158, 11, 0.1)",
                badge: "Edit",
                description: t("Allows updating configuration, editing details, and modifying parameters.")
            };
        }
        if (lower === "remove" || lower.includes("delete") || lower.includes("remove") || lower.includes("destroy")) {
            return {
                icon: "fa-solid fa-trash-can",
                color: isDark ? "#f87171" : "#ef4444",
                bg: isDark ? "rgba(239, 68, 68, 0.2)" : "rgba(239, 68, 68, 0.1)",
                badge: "Delete",
                description: t("Allows permanent deletion, archiving, and cancelling records.")
            };
        }
        return {
            icon: "fa-solid fa-sliders",
            color: isDark ? "#a78bfa" : "#8b5cf6",
            bg: isDark ? "rgba(139, 92, 246, 0.2)" : "rgba(139, 92, 246, 0.1)",
            badge: "Custom",
            description: t("Enables special feature execution and advanced operational commands.")
        };
    };

    const getPageIcon = (pageName = "") => {
        const lower = pageName.toLowerCase().trim();
        if (lower === "dashboard" || lower.includes("dashboard")) return "fa-solid fa-gauge-high";
        if (lower.includes("user guide") || lower.includes("guide")) return "fa-solid fa-book-open";
        if (lower.includes("campaign")) return "fa-solid fa-bullhorn";
        if (lower.includes("placement")) return "fa-solid fa-location-crosshairs";
        if (lower.includes("budget")) return "fa-solid fa-wallet";
        if (lower.includes("recommandation") || lower.includes("recommendation")) return "fa-solid fa-lightbulb";
        if (lower.includes("targeting") || lower.includes("rule")) return "fa-solid fa-bullseye";
        if (lower.includes("keyword")) return "fa-solid fa-key";
        if (lower.includes("search term") || lower.includes("search-term")) return "fa-solid fa-magnifying-glass";
        if (lower.includes("product") || lower.includes("schema") || lower.includes("catalog")) return "fa-solid fa-box-open";
        if (lower.includes("order")) return "fa-solid fa-cart-shopping";
        if (lower.includes("deal")) return "fa-solid fa-handshake";
        if (lower.includes("inventory") || lower.includes("warehouse")) return "fa-solid fa-warehouse";
        if (lower.includes("fba") || lower.includes("shipping") || lower.includes("planning")) return "fa-solid fa-truck-fast";
        if (lower.includes("reconciliation") || lower.includes("reimbursement") || lower.includes("refund")) return "fa-solid fa-file-invoice-dollar";
        if (lower.includes("return")) return "fa-solid fa-rotate-left";
        if (lower.includes("coupon") || lower.includes("discount") || lower.includes("promo")) return "fa-solid fa-ticket";
        if (lower.includes("cron") || lower.includes("scheduler") || lower.includes("job") || lower.includes("schedular")) return "fa-solid fa-clock";
        if (lower === "history" || lower.includes("history")) return "fa-solid fa-clock-rotate-left";
        if (lower.includes("brand") || lower.includes("analytics")) return "fa-solid fa-chart-pie";
        if (lower.includes("audit")) return "fa-solid fa-clipboard-check";
        if (lower.includes("dayparting") || lower.includes("strategy") || lower.includes("stretegy")) return "fa-solid fa-calendar-days";
        if (lower.includes("p/l") || lower.includes("calculater") || lower.includes("calculator") || lower.includes("profit")) return "fa-solid fa-calculator";
        if (lower.includes("setting") || lower.includes("config")) return "fa-solid fa-gear";
        if (lower.includes("user") || lower.includes("asana") || lower.includes("member")) return "fa-solid fa-users";
        if (lower.includes("page")) return "fa-solid fa-file-lines";
        if (lower.includes("role") || lower.includes("permission")) return "fa-solid fa-id-badge";
        if (lower.includes("package") || lower.includes("plan") || lower.includes("subscription")) return "fa-solid fa-cubes";
        if (lower.includes("support") || lower.includes("ticket") || lower.includes("chat")) return "fa-solid fa-headset";
        if (lower.includes("blocked") || lower.includes("ban")) return "fa-solid fa-ban";
        if (lower.includes("holiday") || lower.includes("special")) return "fa-solid fa-calendar-check";
        return "fa-solid fa-folder";
    };

    const standardActionNames = ["view only", "view", "read", "create", "update", "edit", "remove", "delete"];
    const standardActions = [];
    const customActions = [];

    if (activeModule?.actions) {
        activeModule.actions.forEach((act) => {
            const name = (act.actionType || "").toLowerCase().trim();
            if (standardActionNames.some((s) => name === s || name.startsWith(s) || name.includes(s))) {
                standardActions.push(act);
            } else {
                customActions.push(act);
            }
        });

        const getActionPriority = (type = "") => {
            const lower = type.toLowerCase().trim();
            if (lower === "view only" || lower.startsWith("view") || lower.includes("read") || lower.includes("list")) return 1;
            if (lower === "create" || lower.startsWith("create") || lower.includes("add") || lower.includes("new")) return 2;
            if (lower === "update" || lower.startsWith("update") || lower.includes("edit") || lower.includes("modify")) return 3;
            if (lower === "remove" || lower.startsWith("remove") || lower.includes("delete") || lower.includes("destroy")) return 4;
            return 5;
        };
        standardActions.sort((a, b) => getActionPriority(a.actionType) - getActionPriority(b.actionType));
        customActions.sort((a, b) => (a.actionType || "").localeCompare(b.actionType || ""));
    }

    const handlePermissionSubmit = async () => {
        try {
            setSaving(true);
            const pagesPayload = modules.map((page) => {
                const allocatedActions = (page.actions || [])
                    .filter((action) => selectedActions[action._id])
                    .map((action) => ({ actionId: action._id, status: true }));
                return { pageId: page._id, allocatedActions };
            });

            const res = await ApiUpdateRolePermission({
                roleId: currentRoleId,
                pages: pagesPayload,
            });

            if (res?.isSuccess) {
                Toast.success(res.message || t("Permissions updated successfully"));
                if (onSave) onSave();
                onClose();
            } else {
                Toast.error(res?.message || t("Failed to update permissions"));
            }
        } catch (error) {
            Toast.error(t("Something went wrong, please try again!"));
        } finally {
            setSaving(false);
        }
    };

    const categoryStats = useMemo(() => {
        const counts = { ALL: modules.length, Advertising: 0, Analytics: 0, Operations: 0, Finance: 0, System: 0 };
        modules.forEach((mod) => {
            const cat = getModuleCategory(mod.pageName);
            if (counts[cat] !== undefined) counts[cat]++;
        });
        return counts;
    }, [modules]);

    const categories = [
        { id: "ALL", label: t("All"), icon: "fa-solid fa-shapes", count: categoryStats.ALL },
        { id: "Advertising", label: t("Advertising"), icon: "fa-solid fa-bullhorn", count: categoryStats.Advertising },
        { id: "Analytics", label: t("Analytics"), icon: "fa-solid fa-chart-pie", count: categoryStats.Analytics },
        { id: "Operations", label: t("Operations"), icon: "fa-solid fa-boxes-stacked", count: categoryStats.Operations },
        { id: "Finance", label: t("Finance"), icon: "fa-solid fa-wallet", count: categoryStats.Finance },
        { id: "System", label: t("System"), icon: "fa-solid fa-gear", count: categoryStats.System },
    ];

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent
                className={`!gap-0 !p-0 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col transition-all duration-200 ease-in-out ${
                    activeTab === 0
                        ? "w-[92vw] max-w-lg h-auto"
                        : "w-[96vw] max-w-6xl h-[82vh] max-h-[720px] md:max-h-[760px]"
                }`}
            >
                {/* Unified Premium Modal Header */}
                <DialogHeader className="p-4 sm:p-5 pb-0 shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between pb-3 sm:pb-3.5">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 text-sm sm:text-base shrink-0">
                                <i className="fa-solid fa-id-badge" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <DialogTitle className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
                                        {isEdit ? t("Edit Role") : t("Create Role")}
                                    </DialogTitle>
                                    {currentRoleName && (
                                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/60 truncate max-w-[150px] sm:max-w-[220px]">
                                            {currentRoleName}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {activeTab === 0
                                        ? t("Define role identity and configuration parameters")
                                        : t("Configure granular permissions per module")}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Integrated Tab Bar */}
                    <div className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800/80 -mx-4 sm:-mx-5 px-4 sm:px-5 bg-slate-50/50 dark:bg-slate-900/50">
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setActiveTab(0)}
                                className={`py-2.5 px-3 sm:px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 ${
                                    activeTab === 0
                                        ? "border-primary text-primary"
                                        : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                }`}
                            >
                                <i className="fa-regular fa-id-card text-[11px]" />
                                <span>{t("Role Details")}</span>
                            </button>

                            <button
                                type="button"
                                disabled={!currentRoleId}
                                onClick={() => setActiveTab(1)}
                                className={`py-2.5 px-3 sm:px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 ${
                                    activeTab === 1
                                        ? "border-primary text-primary"
                                        : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                } ${!currentRoleId ? "opacity-40 cursor-not-allowed" : ""}`}
                            >
                                <i className="fa-solid fa-key text-[11px]" />
                                <span>{t("Permissions")}</span>
                                {totalSelectedCount > 0 && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-primary/10 dark:bg-primary/20 text-primary text-[10px] font-bold">
                                        {totalSelectedCount} {t("Active")}
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* Progress indicator on the right of tabs */}
                        {activeTab === 1 && (
                            <div className="hidden sm:flex items-center gap-2 py-1">
                                <div className="text-right">
                                    <div className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                                        {totalSelectedCount} / {totalActionCount} {t("Actions Allowed")}
                                    </div>
                                    <div className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">
                                        {completionPercentage}% {t("Access granted")}
                                    </div>
                                </div>
                                <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-300 rounded-full ${
                                            completionPercentage === 100 ? "bg-emerald-500" : "bg-primary"
                                        }`}
                                        style={{ width: `${completionPercentage}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </DialogHeader>

                {/* Body Content */}
                <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
                    {/* Tab 0: Role Details */}
                    {activeTab === 0 && (
                        <Formik
                            initialValues={{
                                roleName: isTourActive && !currentRoleName ? `Admin - ${moment().format("DD/MM/YYYY HH:mm:ss")}` : (currentRoleName || ""),
                            }}
                            validationSchema={roleSchema}
                            enableReinitialize
                            onSubmit={handleRoleSubmit}
                        >
                            {({ values, handleChange, handleBlur, handleSubmit, errors, touched }) => (
                                <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col justify-between">
                                    <div className="p-6 space-y-4">
                                        <div>
                                            <label htmlFor="roleName" className="block text-xs font-bold mb-1.5 text-slate-700 dark:text-slate-200">
                                                {t("Role Name")} <span className="text-red-500">*</span>
                                            </label>
                                            <Input
                                                id="role-name-field"
                                                name="roleName"
                                                type="text"
                                                placeholder={t("e.g. Senior Campaign Manager, Inventory Specialist")}
                                                value={values.roleName}
                                                onChange={handleChange}
                                                onBlur={handleBlur}
                                                className={`h-10 text-xs w-full rounded-lg shadow-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                                                    touched.roleName && errors.roleName
                                                        ? "border-red-500 ring-1 ring-red-500"
                                                        : "border-slate-300 dark:border-slate-700"
                                                }`}
                                            />
                                            {touched.roleName && errors.roleName && (
                                                <div className="text-red-500 text-[11px] mt-1.5 font-medium flex items-center gap-1">
                                                    <i className="fa-solid fa-circle-exclamation text-[10px]" />
                                                    <span>{errors.roleName}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Informational card */}
                                        <div className="p-4 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/30 flex items-start gap-3.5 shadow-2xs">
                                            <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 text-sm">
                                                <i className="fa-solid fa-shield-halved" />
                                            </div>
                                            <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                                <div className="font-bold text-slate-800 dark:text-slate-100 mb-0.5">
                                                    {t("Granular Access Management")}
                                                </div>
                                                {t("After naming your role, proceed to the permissions tab to assign specific View, Create, Edit, and Delete privileges per module.")}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div className="p-4 flex justify-end gap-3 shrink-0 border-t bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                                        <Button
                                            id="role-cancel-btn"
                                            type="button"
                                            variant="outline"
                                            onClick={onClose}
                                            disabled={saving}
                                            className="h-8.5 px-4 rounded-lg text-xs font-semibold border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        >
                                            {t("Cancel")}
                                        </Button>
                                        <Button
                                            id="role-create-continue-btn"
                                            type="submit"
                                            disabled={saving}
                                            className="h-8.5 px-5 rounded-lg font-semibold text-white transition-all hover:opacity-90 flex items-center gap-2 shadow-sm"
                                            style={{
                                                background: "linear-gradient(135deg, #2374F2, #1A9FD4)",
                                                fontSize: "12px",
                                            }}
                                        >
                                            {saving && <i className="fa fa-spinner fa-spin mr-1 text-xs" />}
                                            {isEdit || createdRoleId ? t("Configure Permissions") : t("Create & Continue")}
                                            <i className="fa fa-arrow-right text-[10px]" />
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </Formik>
                    )}

                    {/* Tab 1: Permissions */}
                    {activeTab === 1 && (
                        <div className="flex flex-col h-full min-h-0 overflow-hidden p-3 sm:p-4 gap-2.5 flex-1">
                            {loadingPermissions ? (
                                <div className="flex flex-col items-center justify-center grow py-16">
                                    <i className="fa fa-spinner fa-spin text-primary mb-3" style={{ fontSize: "32px" }} />
                                    <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">{t("Loading permissions matrix...")}</span>
                                </div>
                            ) : (
                                <>
                                    {/* Top Controls: Search + Enhanced Action Buttons in one compact row */}
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
                                        {/* Search Box */}
                                        <div id="role-permissions-search" className="relative flex items-center grow w-full sm:max-w-[240px] md:max-w-xs bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-lg shadow-2xs focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
                                            <i className="fa fa-search text-slate-400 dark:text-slate-500 absolute left-2.5 text-xs pointer-events-none" />
                                            <Input
                                                type="text"
                                                placeholder={t("Filter modules / actions...")}
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full h-8 bg-transparent border-none text-xs pl-7 pr-7 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                            />
                                            {searchQuery && (
                                                <MdOutlineClose
                                                    onClick={() => setSearchQuery("")}
                                                    className="absolute right-2 cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                                    size={14}
                                                />
                                            )}
                                        </div>

                                        {/* Enhanced 3 Action Buttons */}
                                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:flex-nowrap">
                                            {/* Button 1: Read-Only Access */}
                                            <button
                                                type="button"
                                                onClick={grantViewOnlyAll}
                                                className={`h-8 px-2.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer ${
                                                    isViewOnlyAllActive
                                                        ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                                        : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 hover:border-blue-400 dark:hover:border-blue-500"
                                                }`}
                                                title={t("Grant Read-Only permissions across all modules")}
                                            >
                                                <i className={`fa-solid ${isViewOnlyAllActive ? "fa-circle-check" : "fa-eye"} text-[11px] ${isViewOnlyAllActive ? "text-white" : "text-blue-500 dark:text-blue-400"}`} />
                                                <span className="whitespace-nowrap text-[11px] sm:text-xs">{isViewOnlyAllActive ? t("Read-Only Set ✓") : t("Read-Only Access")}</span>
                                            </button>

                                            {/* Button 2: Grant All Full Access */}
                                            <button
                                                id="role-grant-all"
                                                type="button"
                                                onClick={toggleAllPermissions}
                                                className={`h-8 px-3 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 shadow-xs cursor-pointer ${
                                                    isAllGranted
                                                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                                                        : "bg-primary text-white border-transparent hover:opacity-90 shadow-sm"
                                                }`}
                                                title={isAllGranted ? t("Revoke all granted permissions") : t("Grant full administrative access across all modules")}
                                            >
                                                <i className={`fa-solid ${isAllGranted ? "fa-circle-check" : "fa-shield-halved"} text-[11px]`} />
                                                <span className="whitespace-nowrap text-[11px] sm:text-xs">{isAllGranted ? t("Full Access Granted ✓") : t("Grant Full Access")}</span>
                                            </button>

                                            {/* Button 3: Reset All */}
                                            <button
                                                type="button"
                                                onClick={clearAllPermissions}
                                                disabled={totalSelectedCount === 0}
                                                className="h-8 px-2.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                                title={t("Reset all permissions to 0")}
                                            >
                                                <i className="fa-solid fa-rotate-left text-[10px]" />
                                                <span className="whitespace-nowrap text-[11px] sm:text-xs">{t("Reset All")}</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Dual-Pane Layout */}
                                    <div className="flex flex-col md:flex-row flex-1 grow border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden min-h-0 bg-white dark:bg-slate-900 shadow-sm">
                                        {/* Left: Categorized Modules Sidebar */}
                                        <div
                                            id="role-modules-sidebar"
                                            className="w-full md:w-[240px] lg:w-[290px] xl:w-[320px] shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex flex-col h-36 md:h-full min-h-0 overflow-hidden"
                                        >
                                            {/* Category Filter Pills Bar */}
                                            <div className="p-1.5 sm:p-2 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/60 overflow-x-auto flex items-center gap-1 shrink-0 no-scrollbar">
                                                {categories.map((cat) => (
                                                    <button
                                                        key={cat.id}
                                                        type="button"
                                                        onClick={() => setActiveCategory(cat.id)}
                                                        className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1 sm:gap-1.5 ${
                                                            activeCategory === cat.id
                                                                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-600"
                                                                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                                                        }`}
                                                    >
                                                        <i className={`${cat.icon} text-[9px] sm:text-[10px]`} />
                                                        <span>{cat.label}</span>
                                                        <span className={`text-[9px] px-1 py-0.2 rounded ${
                                                            activeCategory === cat.id
                                                                ? "bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-200"
                                                                : "bg-slate-200/70 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                                                        }`}>
                                                            {cat.count}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Scrollable Module List */}
                                            <div className="flex-1 overflow-y-auto min-h-0 p-1.5 sm:p-2 space-y-1">
                                                {filteredModules.length === 0 ? (
                                                    <div className="py-6 px-3 text-center">
                                                        <i className="fa-solid fa-filter-circle-xmark text-xl text-slate-300 dark:text-slate-600 mb-1.5" />
                                                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                                            {t("No matching modules found")}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                                            {t("Try clearing your search query or selecting another category.")}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    filteredModules.map((mod) => {
                                                        const isActive = mod._id === activeModuleId;
                                                        const modActions = mod.actions || [];
                                                        const modSelectedCount = modActions.filter((a) => selectedActions[a._id]).length;
                                                        const isModFull = modActions.length > 0 && modSelectedCount === modActions.length;
                                                        const isModEmpty = modSelectedCount === 0;

                                                        return (
                                                            <div
                                                                key={mod._id}
                                                                onClick={() => setActiveModuleId(mod._id)}
                                                                className={`group relative flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all border ${
                                                                    isActive
                                                                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/15 border-transparent font-semibold"
                                                                        : "border-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/70"
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2 overflow-hidden mr-2 min-w-0">
                                                                    <div className={`w-6.5 h-6.5 rounded-lg flex items-center justify-center text-[11px] shrink-0 transition-all ${
                                                                        isActive
                                                                            ? "bg-white/20 text-white"
                                                                            : "bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-primary group-hover:bg-primary/10 dark:group-hover:bg-primary/20"
                                                                    }`}>
                                                                        <i className={getPageIcon(mod.pageName)} />
                                                                    </div>
                                                                    <div className="truncate min-w-0">
                                                                        <div className="text-xs truncate font-medium">
                                                                            {mod.pageName}
                                                                        </div>
                                                                        <div className={`text-[10px] ${
                                                                            isActive ? "text-blue-100" : "text-slate-400 dark:text-slate-500"
                                                                        }`}>
                                                                            {modActions.length} {t("actions")}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Status indicator */}
                                                                <div className="shrink-0 flex items-center">
                                                                    {isModFull ? (
                                                                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1 ${
                                                                            isActive
                                                                                ? "bg-white/25 text-white"
                                                                                : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80"
                                                                        }`}>
                                                                            <i className="fa-solid fa-check text-[8px]" />
                                                                            <span>{t("Full")}</span>
                                                                        </span>
                                                                    ) : !isModEmpty ? (
                                                                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                                                                            isActive
                                                                                ? "bg-white/25 text-white"
                                                                                : "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/80"
                                                                        }`}>
                                                                            {modSelectedCount}/{modActions.length}
                                                                        </span>
                                                                    ) : (
                                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                                                            isActive ? "text-blue-200" : "text-slate-400 dark:text-slate-500"
                                                                        }`}>
                                                                            -
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>

                                        {/* Right: Rich Actions Matrix Panel */}
                                        <div id="role-actions-panel" className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-white dark:bg-slate-900">
                                            {activeModule ? (
                                                <>
                                                    {/* Module Hero Header */}
                                                    <div className="px-3.5 sm:px-4 py-2.5 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                            <div className="flex items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white w-8 h-8 shadow-sm shadow-blue-500/20 text-xs shrink-0">
                                                                <i className={getPageIcon(activeModule.pageName)} />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 truncate">
                                                                        {activeModule.pageName}
                                                                    </span>
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                                                                        {getModuleCategory(activeModule.pageName)}
                                                                    </span>
                                                                </div>
                                                                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.2">
                                                                    {t("Configure actions permitted on this module.")}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Segmented Quick Presets Bar for active module */}
                                                        <div className="flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/90 self-start sm:self-auto shrink-0 shadow-2xs gap-0.5 overflow-x-auto max-w-full">
                                                            <button
                                                                type="button"
                                                                onClick={() => applyModulePreset("none")}
                                                                className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all ${
                                                                    currentModuleActiveLevel === "none"
                                                                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                                                                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                                                                }`}
                                                            >
                                                                {t("None")}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => applyModulePreset("view")}
                                                                className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all ${
                                                                    currentModuleActiveLevel === "view"
                                                                        ? "bg-blue-600 text-white shadow-xs"
                                                                        : "text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300"
                                                                }`}
                                                            >
                                                                {t("View Only")}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => applyModulePreset("editor")}
                                                                className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all ${
                                                                    currentModuleActiveLevel === "editor"
                                                                        ? "bg-amber-500 text-white shadow-xs"
                                                                        : "text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-300"
                                                                }`}
                                                            >
                                                                {t("Editor")}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => applyModulePreset("full")}
                                                                className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all ${
                                                                    currentModuleActiveLevel === "full"
                                                                        ? "bg-emerald-600 text-white shadow-xs"
                                                                        : "text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-300"
                                                                }`}
                                                            >
                                                                {t("Full Access")}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Action Cards List */}
                                                    <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 flex-1 overflow-y-auto min-h-0">
                                                        {standardActions.length > 0 && (
                                                            <div>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className="font-bold text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                                                                        <i className="fa-solid fa-layer-group text-[9px]" />
                                                                        <span>{t("Standard CRUD Permissions")}</span>
                                                                    </div>
                                                                </div>

                                                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 sm:gap-2.5">
                                                                    {standardActions.map((action) => {
                                                                        const isSelected = Boolean(selectedActions[action._id]);
                                                                        const theme = getActionTheme(action.actionType);

                                                                        return (
                                                                            <div
                                                                                key={action._id}
                                                                                onClick={() => toggleSingleAction(action._id)}
                                                                                className={`group relative p-2.5 sm:p-3 rounded-xl border cursor-pointer select-none transition-all duration-200 shadow-2xs ${
                                                                                    isSelected
                                                                                        ? "border-primary/60 bg-gradient-to-br from-blue-50/40 via-indigo-50/20 to-transparent dark:from-blue-950/30 dark:via-indigo-950/10 dark:to-transparent ring-1 ring-primary/30"
                                                                                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-xs"
                                                                                }`}
                                                                            >
                                                                                <div className="flex items-center justify-between gap-2.5">
                                                                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                                                        <div
                                                                                            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 transition-transform group-hover:scale-105"
                                                                                            style={{
                                                                                                backgroundColor: isSelected ? theme.bg : (isDark ? "#334155" : "#f1f5f9"),
                                                                                                color: isSelected ? theme.color : (isDark ? "#94a3b8" : "#64748b"),
                                                                                            }}
                                                                                        >
                                                                                            <i className={theme.icon} />
                                                                                        </div>
                                                                                        <div className="min-w-0 flex-1">
                                                                                            <div className="flex items-center gap-1.5">
                                                                                                <span className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                                                                                                    {action.actionType}
                                                                                                </span>
                                                                                                <span
                                                                                                    className="text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0"
                                                                                                    style={{
                                                                                                        backgroundColor: theme.bg,
                                                                                                        color: theme.color,
                                                                                                    }}
                                                                                                >
                                                                                                    {theme.badge}
                                                                                                </span>
                                                                                            </div>
                                                                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.2 leading-snug line-clamp-1">
                                                                                                {theme.description}
                                                                                            </p>
                                                                                        </div>
                                                                                    </div>

                                                                                    {/* Switch Toggle */}
                                                                                    <div onClick={(e) => e.stopPropagation()} className="shrink-0 flex items-center">
                                                                                        <Switch
                                                                                            checked={isSelected}
                                                                                            onCheckedChange={() => toggleSingleAction(action._id)}
                                                                                            className="data-[state=checked]:bg-primary"
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {customActions.length > 0 && (
                                                            <div>
                                                                <div className="font-bold text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
                                                                    <i className="fa-solid fa-sliders text-[9px]" />
                                                                    <span>{t("Extended & Specialized Operations")}</span>
                                                                </div>

                                                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 sm:gap-2.5">
                                                                    {customActions.map((action) => {
                                                                        const isSelected = Boolean(selectedActions[action._id]);
                                                                        const theme = getActionTheme(action.actionType);

                                                                        return (
                                                                            <div
                                                                                key={action._id}
                                                                                onClick={() => toggleSingleAction(action._id)}
                                                                                className={`group relative p-2.5 sm:p-3 rounded-xl border cursor-pointer select-none transition-all duration-200 shadow-2xs ${
                                                                                    isSelected
                                                                                        ? "border-primary/60 bg-gradient-to-br from-purple-50/40 via-indigo-50/20 to-transparent dark:from-purple-950/30 dark:via-indigo-950/10 dark:to-transparent ring-1 ring-primary/30"
                                                                                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-xs"
                                                                                }`}
                                                                            >
                                                                                <div className="flex items-center justify-between gap-2.5">
                                                                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                                                        <div
                                                                                            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 transition-transform group-hover:scale-105"
                                                                                            style={{
                                                                                                backgroundColor: isSelected ? theme.bg : (isDark ? "#334155" : "#f1f5f9"),
                                                                                                color: isSelected ? theme.color : (isDark ? "#94a3b8" : "#64748b"),
                                                                                            }}
                                                                                        >
                                                                                            <i className={theme.icon} />
                                                                                        </div>
                                                                                        <div className="min-w-0 flex-1">
                                                                                            <div className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                                                                                                {action.actionType}
                                                                                            </div>
                                                                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.2 leading-snug line-clamp-1">
                                                                                                {theme.description}
                                                                                            </p>
                                                                                        </div>
                                                                                    </div>

                                                                                    {/* Switch Toggle */}
                                                                                    <div onClick={(e) => e.stopPropagation()} className="shrink-0 flex items-center">
                                                                                        <Switch
                                                                                            checked={isSelected}
                                                                                            onCheckedChange={() => toggleSingleAction(action._id)}
                                                                                            className="data-[state=checked]:bg-primary"
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-400 dark:text-slate-500">
                                                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl text-slate-400 dark:text-slate-500 mb-2">
                                                        <i className="fa-regular fa-folder-open" />
                                                    </div>
                                                    <div className="font-bold text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                                                        {t("No Module Selected")}
                                                    </div>
                                                    <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 max-w-sm">
                                                        {t("Choose a module from the left list to review and adjust action permissions.")}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Footer Action Bar */}
                                    <div className="flex items-center justify-between gap-2 shrink-0 pt-2 border-t border-slate-200 dark:border-slate-800">
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab(0)}
                                            className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        >
                                            <i className="fa-solid fa-arrow-left text-[10px]" />
                                            <span className="text-[11px] sm:text-xs">{t("Back to Role Details")}</span>
                                        </button>

                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                id="role-cancel-btn"
                                                type="button"
                                                variant="outline"
                                                onClick={onClose}
                                                disabled={saving}
                                                className="h-8 px-3 rounded-lg text-xs font-semibold border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                            >
                                                {t("Cancel")}
                                            </Button>
                                            <Button
                                                id="role-submit-btn"
                                                type="button"
                                                onClick={handlePermissionSubmit}
                                                disabled={saving}
                                                className="h-8 px-4 rounded-lg font-semibold text-white transition-all hover:opacity-90 flex items-center gap-1.5 shadow-sm"
                                                style={{
                                                    background: "linear-gradient(135deg, #2374F2, #1A9FD4)",
                                                    fontSize: "11px",
                                                }}
                                            >
                                                {saving && <i className="fa fa-spinner fa-spin mr-1" />}
                                                {t("Save Role Permissions")}
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
