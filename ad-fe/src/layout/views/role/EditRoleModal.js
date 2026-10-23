import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { t } from "i18next";
import { useEffect, useState, useMemo } from "react";
import { ApiUserPermission } from "../../../api-wrapper/ApiUsers";
import { MdOutlineClose } from "react-icons/md";

export default function RoleModal({
    open,
    onClose,
    role,
    onSave,
}) {
    const isEdit = Boolean(role?._id);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [modules, setModules] = useState([]);
    const [selectedActions, setSelectedActions] = useState({});
    const [activeModuleId, setActiveModuleId] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (open && role?._id) {
            setSearchQuery("");
            fetchRolePermissions(role._id);
        } else if (open && !role?._id) {
            setSearchQuery("");
            setModules([]);
            setSelectedActions({});
            setActiveModuleId(null);
        }
    }, [open, role]);

    const fetchRolePermissions = async (roleId) => {
        try {
            setLoading(true);
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
                // Sort modules A-Z in ascending order by pageName
                const sortedData = [...res.data].sort((a, b) => (a.pageName || "").localeCompare(b.pageName || ""));
                setModules(sortedData);
                setSelectedActions(initialSelected);
                if (sortedData.length > 0) {
                    setActiveModuleId(sortedData[0]._id);
                }
            }
        } catch (err) {
            console.error("Permission fetch failed", err);
        } finally {
            setLoading(false);
        }
    };

    const handleFinalSubmit = async () => {
        try {
            setSaving(true);
            const pagesPayload = modules.map((page) => {
                const allocatedActions = (page.actions || [])
                    .filter((action) => selectedActions[action._id])
                    .map((action) => ({ actionId: action._id, status: true }));
                return { pageId: page._id, allocatedActions };
            });

            if (onSave) {
                await onSave({
                    roleName: role?.roleName || "Role",
                    roleId: role?._id,
                    pages: pagesPayload,
                });
            }
        } finally {
            setSaving(false);
        }
    };

    // Filter modules and actions based on search, always keeping ASC order A-Z
    const filteredModules = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        const list = modules
            .map((mod) => {
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
    }, [modules, searchQuery]);

    // Ensure activeModuleId is valid among filtered modules
    useEffect(() => {
        if (filteredModules.length > 0 && (!activeModuleId || !filteredModules.some((m) => m._id === activeModuleId))) {
            setActiveModuleId(filteredModules[0]._id);
        } else if (filteredModules.length === 0) {
            setActiveModuleId(null);
        }
    }, [filteredModules, activeModuleId]);

    const activeModule = useMemo(() => {
        return filteredModules.find((m) => m._id === activeModuleId) || null;
    }, [filteredModules, activeModuleId]);

    const allActions = useMemo(() => {
        return modules.flatMap((m) => m.actions || []);
    }, [modules]);

    const totalSelectedCount = useMemo(() => {
        return Object.values(selectedActions).filter(Boolean).length;
    }, [selectedActions]);

    const isAllGranted = useMemo(() => {
        return allActions.length > 0 && allActions.every((a) => selectedActions[a._id]);
    }, [allActions, selectedActions]);

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

    const isActiveModuleAllSelected = useMemo(() => {
        if (!activeModule || !activeModule.actions?.length) return false;
        return activeModule.actions.every((a) => selectedActions[a._id]);
    }, [activeModule, selectedActions]);

    const toggleActiveModulePermissions = () => {
        if (!activeModule || !activeModule.actions) return;
        const nextSelected = { ...selectedActions };
        if (isActiveModuleAllSelected) {
            activeModule.actions.forEach((a) => {
                delete nextSelected[a._id];
            });
        } else {
            activeModule.actions.forEach((a) => {
                nextSelected[a._id] = true;
            });
        }
        setSelectedActions(nextSelected);
    };

    const toggleSingleAction = (actionId) => {
        setSelectedActions((prev) => ({
            ...prev,
            [actionId]: !prev[actionId],
        }));
    };

    const getActionIcon = (actionType = "") => {
        const lower = actionType.toLowerCase().trim();
        if (lower === "view only" || lower.includes("view") || lower.includes("read") || lower.includes("list")) return "fa-solid fa-file-shield";
        if (lower === "create" || lower.includes("create") || lower.includes("add") || lower.includes("new")) return "fa-solid fa-plus";
        if (lower === "update" || lower.includes("update") || lower.includes("edit") || lower.includes("modify")) return "fa-solid fa-pen-to-square";
        if (lower === "remove" || lower.includes("delete") || lower.includes("remove") || lower.includes("destroy")) return "fa-solid fa-trash-can";
        if (lower.includes("report") || lower.includes("export") || lower.includes("log") || lower.includes("analysis")) return "fa-solid fa-file-contract";
        return "fa-solid fa-layer-group";
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

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="max-w-[1140px] p-0 overflow-hidden bg-white dark:bg-slate-900 border-none gap-0 flex flex-col" style={{ maxHeight: "90vh" }}>
            <DialogHeader className="shrink-0" style={{ borderBottom: isDark ? "1px solid #334155" : "1px solid rgba(148, 163, 184, 0.15)", padding: "18px 24px", backgroundColor: isDark ? "#0f172a" : "#ffffff" }}>
                <DialogTitle style={{ fontSize: "18px", fontWeight: "700", color: isDark ? "#f8fafc" : "#0f172a" }}>
                    {t("Edit Role")}
                    {role?.roleName && (
                        <span className="font-normal ml-2" style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "15px" }}>
                            — {role.roleName}
                        </span>
                    )}
                </DialogTitle>
            </DialogHeader>

            <div id="permission-model" className="grow min-h-0" style={{ padding: "24px", overflowY: "hidden", display: "flex", flexDirection: "column", backgroundColor: isDark ? "#0f172a" : "#ffffff" }}>
                {loading ? (
                    <div className="flex flex-col items-center justify-center grow py-5">
                        <i className="fa fa-spinner fa-spin text-blue-500 mb-3" style={{ fontSize: "28px" }} />
                        <span style={{ color: isDark ? "#94a3b8" : "#64748b" }}>{t("Loading permissions...")}</span>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col flex-md-flex flex-wrap -mx-2 items-stretch align-items-md-center justify-between gap-3 mb-3 shrink-0" style={{ zIndex: 10 }}>
                            <div id="roles-modal-search" className="search_option m-0" style={{
                                display: "flex",
                                alignItems: "center",
                                position: "relative",
                                width: "auto",
                                minWidth: "280px",
                                flexGrow: 1,
                                maxWidth: "420px",
                                backgroundColor: isDark ? "#1e293b" : "#fff",
                                border: isDark ? "1px solid #334155" : "1px solid #cbd5e1",
                                borderRadius: "8px"
                            }}>
                                <Input type="text"
                                    placeholder={t("Search menus, features, or permissions...")}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{
                                        width: "100%",
                                        height: "40px",
                                        backgroundColor: "transparent",
                                        color: isDark ? "#f8fafc" : "#1e293b",
                                        border: "none",
                                        paddingLeft: "36px",
                                        paddingRight: searchQuery ? "30px" : "10px",
                                        fontSize: "13px"
                                    }}
                                />
                                {searchQuery && (
                                    <MdOutlineClose
                                        onClick={() => setSearchQuery("")}
                                        style={{
                                            position: "absolute",
                                            right: "10px",
                                            cursor: "pointer",
                                            color: isDark ? "#94a3b8" : "#64748b",
                                            fontSize: "18px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            opacity: 0.7,
                                            transition: "opacity 0.2s"
                                        }}
                                        onMouseEnter={(e) => e.target.style.opacity = 1}
                                        onMouseLeave={(e) => e.target.style.opacity = 0.7}
                                    />
                                )}
                            </div>

                            <div
                                id="role-grant-all"
                                onClick={toggleAllPermissions}
                                className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer shadow-sm"
                                style={{
                                    borderRadius: "8px",
                                    border: isAllGranted
                                        ? "1px solid #3b82f6"
                                        : isDark
                                            ? "1px solid #334155"
                                            : "1px solid #cbd5e1",
                                    backgroundColor: isAllGranted
                                        ? "rgba(59, 130, 246, 0.08)"
                                        : isDark
                                            ? "#1e293b"
                                            : "#ffffff",
                                    transition: "all 0.2s",
                                    userSelect: "none",
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <div
                                        className="flex items-center justify-center"
                                        style={{
                                            width: "26px",
                                            height: "26px",
                                            borderRadius: "6px",
                                            backgroundColor: isAllGranted ? "#3b82f6" : "rgba(100, 116, 139, 0.15)",
                                            color: isAllGranted ? "#ffffff" : "#64748b",
                                            fontSize: "12px",
                                        }}
                                    >
                                        <i className="fa-solid fa-shield-halved" />
                                    </div>
                                    <span className="font-semibold" style={{ fontSize: "13px", color: isDark ? "#f8fafc" : "#0f172a" }}>
                                        {t("Grant All Permissions")}
                                    </span>
                                </div>
                                <input
                                    type="checkbox"
                                    className="form-check-input m-0 cursor-pointer"
                                    checked={isAllGranted}
                                    readOnly
                                    style={{ width: "18px", height: "18px" }}
                                />
                            </div>
                        </div>

                        <div
                            className="flex flex-col md:flex-row grow"
                            style={{
                                border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
                                borderRadius: "10px",
                                overflow: "hidden",
                                minHeight: 0,
                                backgroundColor: isDark ? "#0f172a" : "#ffffff",
                            }}
                        >
                            <div
                                className="w-full md:w-1/3"
                                style={{
                                    borderRight: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
                                    backgroundColor: isDark ? "#162032" : "#f8fafc",
                                    display: "flex",
                                    flexDirection: "column",
                                    height: "100%",
                                    overflowY: "auto",
                                }}
                            >
                                <div
                                    className="flex items-center justify-between px-3 py-3 sticky top-0"
                                    style={{
                                        borderBottom: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
                                        backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                                        zIndex: 5,
                                    }}
                                >
                                    <span className="font-bold" style={{ fontSize: "11px", letterSpacing: "0.5px", color: isDark ? "#94a3b8" : "#64748b" }}>
                                        {t("MODULES")}
                                    </span>
                                    <span
                                        className="badge"
                                        style={{
                                            backgroundColor: "rgba(59, 130, 246, 0.15)",
                                            color: "#3b82f6",
                                            fontSize: "11px",
                                            fontWeight: "600",
                                            padding: "3px 8px",
                                            borderRadius: "12px",
                                        }}
                                    >
                                        {totalSelectedCount} {t("Selected")}
                                    </span>
                                </div>

                                <div className="grow">
                                    {filteredModules.length === 0 ? (
                                        <div className="p-4 text-center" style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "13px" }}>
                                            {t("No modules found")}
                                        </div>
                                    ) : (
                                        filteredModules.map((mod) => {
                                            const isActive = mod._id === activeModuleId;
                                            const modActions = mod.actions || [];
                                            const modSelectedCount = modActions.filter((a) => selectedActions[a._id]).length;
                                            const isModFull = modActions.length > 0 && modSelectedCount === modActions.length;

                                            return (
                                                <div
                                                    key={mod._id}
                                                    onClick={() => setActiveModuleId(mod._id)}
                                                    className="flex items-center justify-between px-3 py-3 cursor-pointer"
                                                    style={{
                                                        borderBottom: isDark ? "1px solid #1e293b" : "1px solid #f1f5f9",
                                                        backgroundColor: isActive
                                                            ? isDark
                                                                ? "#2563eb"
                                                                : "#2563eb"
                                                            : "transparent",
                                                        color: isActive ? "#ffffff" : (isDark ? "#f8fafc" : "#0f172a"),
                                                        transition: "all 0.15s",
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2 overflow-hidden mr-2">
                                                        <i
                                                            className={getPageIcon(mod.pageName)}
                                                            style={{
                                                                fontSize: "15px",
                                                                width: "18px",
                                                                textAlign: "center",
                                                                color: isActive ? "#ffffff" : isDark ? "#64748b" : "#94a3b8",
                                                            }}
                                                        />
                                                        <span className="font-medium truncate" style={{ fontSize: "13px" }}>
                                                            {mod.pageName}
                                                        </span>
                                                    </div>

                                                    {modSelectedCount > 0 && (
                                                        <span
                                                            style={{
                                                                fontSize: "11px",
                                                                fontWeight: "600",
                                                                padding: "2px 6px",
                                                                borderRadius: "10px",
                                                                backgroundColor: isActive
                                                                    ? "rgba(255, 255, 255, 0.25)"
                                                                    : isModFull
                                                                        ? "rgba(16, 185, 129, 0.15)"
                                                                        : "rgba(59, 130, 246, 0.15)",
                                                                color: isActive
                                                                    ? "#ffffff"
                                                                    : isModFull
                                                                        ? "#10b981"
                                                                        : "#3b82f6",
                                                            }}
                                                        >
                                                            {isModFull ? "✓" : `${modSelectedCount}/${modActions.length}`}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <div className="w-full md:w-2/3 flex flex-col" style={{ backgroundColor: isDark ? "#0f172a" : "#ffffff", height: "100%", overflowY: "auto" }}>
                                {activeModule ? (
                                    <>
                                        <div
                                            className="flex items-center justify-between px-4 py-3 sticky top-0"
                                            style={{
                                                borderBottom: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
                                                backgroundColor: isDark ? "#1e293b" : "#f8fafc",
                                                zIndex: 5,
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center justify-center shrink-0 shadow-sm" style={{
                                                    width: "38px",
                                                    height: "38px",
                                                    borderRadius: "10px",
                                                    backgroundColor: "#2563eb",
                                                    color: "#ffffff",
                                                    fontSize: "18px"
                                                }}>
                                                    <i className={getPageIcon(activeModule.pageName)} />
                                                </div>
                                                <div>
                                                    <h6 className="mb-0 font-bold" style={{ fontSize: "16px", color: isDark ? "#f8fafc" : "#0f172a" }}>
                                                        {activeModule.pageName} {t("Permissions")}
                                                    </h6>
                                                    <small style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "12px" }}>
                                                        {t("Configure access levels for")} {activeModule.pageName.toLowerCase()}
                                                    </small>
                                                </div>
                                            </div>

                                            <div
                                                onClick={toggleActiveModulePermissions}
                                                className="flex items-center gap-2 px-3 py-1 cursor-pointer"
                                                style={{
                                                    borderRadius: "6px",
                                                    backgroundColor: isDark ? "#0f172a" : "#ffffff",
                                                    border: isDark ? "1px solid #334155" : "1px solid #cbd5e1",
                                                    userSelect: "none",
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input m-0 cursor-pointer"
                                                    checked={isActiveModuleAllSelected}
                                                    readOnly
                                                    style={{ width: "16px", height: "16px" }}
                                                />
                                                <span className="font-semibold" style={{ fontSize: "12px", color: isDark ? "#f8fafc" : "#0f172a" }}>
                                                    {t("Enable Module")}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="p-4 grow">
                                            {standardActions.length === 0 && customActions.length === 0 ? (
                                                <div className="text-center py-5" style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "13px" }}>
                                                    {t("No permissions defined for this module.")}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-4">
                                                    {standardActions.length > 0 && (
                                                        <div>
                                                            <div className="flex items-center justify-between mb-3">
                                                                <span className="font-bold" style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "11px", letterSpacing: "0.8px" }}>
                                                                    {t("STANDARD PERMISSIONS")}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-wrap -mx-2 gap-3">
                                                                {standardActions.map((action) => {
                                                                    const isSelected = !!selectedActions[action._id];
                                                                    return (
                                                                        <div key={action._id} className="w-full px-2 xl:w-1/2">
                                                                            <div
                                                                                onClick={() => toggleSingleAction(action._id)}
                                                                                className="flex items-center justify-between p-3 cursor-pointer shadow-sm"
                                                                                style={{
                                                                                    borderRadius: "12px",
                                                                                    border: isSelected ? "1px solid #3b82f6" : (isDark ? "1px solid #334155" : "1px solid #e2e8f0"),
                                                                                    backgroundColor: isSelected ? (isDark ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.04)") : (isDark ? "#162032" : "#ffffff"),
                                                                                    transition: "all 0.15s"
                                                                                }}
                                                                            >
                                                                                <div className="flex items-center gap-3">
                                                                                    <div
                                                                                        className="flex items-center justify-center shrink-0 shadow-sm"
                                                                                        style={{
                                                                                            width: "42px",
                                                                                            height: "42px",
                                                                                            borderRadius: "12px",
                                                                                            backgroundColor: isSelected ? "rgba(59, 130, 246, 0.15)" : (isDark ? "#162032" : "#f1f5f9"),
                                                                                            color: isSelected ? "#3b82f6" : (isDark ? "#94a3b8" : "#64748b"),
                                                                                            fontSize: "18px",
                                                                                            transition: "all 0.2s"
                                                                                        }}
                                                                                    >
                                                                                        <i className={getActionIcon(action.actionType)} />
                                                                                    </div>
                                                                                    <div>
                                                                                        <div className="font-bold" style={{ fontSize: "13.5px", color: isDark ? "#f8fafc" : "#0f172a" }}>
                                                                                            {action.actionType}
                                                                                        </div>
                                                                                        <div style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "11.5px" }}>
                                                                                            {t("Allow")} {action.actionType.toLowerCase()}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    className="form-check-input m-0 cursor-pointer shrink-0"
                                                                                    checked={isSelected}
                                                                                    readOnly
                                                                                    style={{ width: "20px", height: "20px", borderRadius: "4px" }}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {customActions.length > 0 && (
                                                        <div className="p-4 shadow-sm" style={{
                                                            borderRadius: "12px",
                                                            border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
                                                            backgroundColor: isDark ? "#162032" : "#f8fafc"
                                                        }}>
                                                            <div className="flex items-center gap-2 mb-3">
                                                                <div className="flex items-center justify-center" style={{
                                                                    width: "28px", height: "28px", borderRadius: "6px",
                                                                    backgroundColor: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", fontSize: "14px"
                                                                }}>
                                                                    <i className="fa-solid fa-network-wired" />
                                                                </div>
                                                                <span className="font-bold" style={{ fontSize: "14px", color: isDark ? "#f8fafc" : "#0f172a" }}>
                                                                    {t("Advanced Data Access")}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-wrap -mx-2 gap-3">
                                                                {customActions.map((action) => {
                                                                    const isSelected = !!selectedActions[action._id];
                                                                    return (
                                                                        <div key={action._id} className="w-full px-2 xl:w-1/2">
                                                                            <div
                                                                                onClick={() => toggleSingleAction(action._id)}
                                                                                className="flex items-center justify-between p-3 cursor-pointer shadow-sm"
                                                                                style={{
                                                                                    borderRadius: "12px",
                                                                                    border: isSelected ? "1px solid #3b82f6" : (isDark ? "1px solid #334155" : "1px solid #e2e8f0"),
                                                                                    backgroundColor: isSelected ? (isDark ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.04)") : (isDark ? "#162032" : "#ffffff"),
                                                                                    transition: "all 0.15s"
                                                                                }}
                                                                            >
                                                                                <div className="flex items-center gap-3">
                                                                                    <div
                                                                                        className="flex items-center justify-center shrink-0 shadow-sm"
                                                                                        style={{
                                                                                            width: "42px",
                                                                                            height: "42px",
                                                                                            borderRadius: "12px",
                                                                                            backgroundColor: isSelected ? "rgba(59, 130, 246, 0.15)" : (isDark ? "#162032" : "#f1f5f9"),
                                                                                            color: isSelected ? "#3b82f6" : (isDark ? "#94a3b8" : "#64748b"),
                                                                                            fontSize: "18px",
                                                                                            transition: "all 0.2s"
                                                                                        }}
                                                                                    >
                                                                                        <i className={getActionIcon(action.actionType)} />
                                                                                    </div>
                                                                                    <div>
                                                                                        <div className="font-bold" style={{ fontSize: "13.5px", color: isDark ? "#f8fafc" : "#0f172a" }}>
                                                                                            {action.actionType}
                                                                                        </div>
                                                                                        <div style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "11.5px" }}>
                                                                                            {t("Allow")} {action.actionType.toLowerCase()}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    className="form-check-input m-0 cursor-pointer shrink-0"
                                                                                    checked={isSelected}
                                                                                    readOnly
                                                                                    style={{ width: "20px", height: "20px", borderRadius: "4px" }}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full p-5" style={{ color: isDark ? "#94a3b8" : "#64748b" }}>
                                        <i className="fa-regular fa-folder-open mb-2" style={{ fontSize: "32px", opacity: 0.5 }} />
                                        <span>{t("Select a module from the left to view and configure permissions.")}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            <DialogFooter className="shrink-0 mt-auto" style={{ borderTop: isDark ? "1px solid #334155" : "1px solid rgba(148, 163, 184, 0.15)", padding: "16px 24px", backgroundColor: isDark ? "#0f172a" : "#ffffff" }}>
                <div className="w-full flex justify-between items-center">
                    <button type="button" id="role-close-btn" variant="" onClick={onClose} className="btn-premium-secondary px-4" disabled={loading || saving}>
                        {t("Cancel")}
                    </button>

                    <button type="button" id="role-submit-btn" variant="" onClick={handleFinalSubmit} className="btn-premium-primary px-4 flex items-center gap-2" disabled={loading || saving}>
                        {saving && <i className="fa-solid fa-spinner fa-spin mr-1.5" />}
                        {saving ? t("Updating...") : t("Update Permissions")}
                    </button>
                </div>
            </DialogFooter>
        </DialogContent>
        </Dialog>
    );
}
