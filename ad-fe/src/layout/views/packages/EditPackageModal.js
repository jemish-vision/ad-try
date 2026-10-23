import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { SUPER_ADMIN_BLOCKED_ROUTES } from "src/common/constants";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Switch } from "../../../components/ui/switch";
import { t } from "i18next";
import { Formik } from "formik";
import * as Yup from "yup";
import { useEffect, useState, useMemo, useRef } from "react";
import { ApiPackagePermissions, ApiUpdatePackagePermissions } from "../../../api-wrapper/ApiPackages";
import Toast from "../../../common/helper/toast/Toast";
import { MdOutlineClose } from "react-icons/md";

export default function SubscriptionPlanModal({
    open,
    onClose,
    plan,
    onSave,
}) {
    const { t } = useTranslation();
    const isEdit = Boolean(plan?._id);
    const [activeTab, setActiveTab] = useState("details"); // "details" | "permissions"
    const [loadingPermissions, setLoadingPermissions] = useState(false);
    const [saving, setSaving] = useState(false);
    const [modules, setModules] = useState([]);
    const [selectedActions, setSelectedActions] = useState({});
    const [activeModuleId, setActiveModuleId] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    const formikSubmitRef = useRef(null);

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (open) {
            setActiveTab("details");
            setSearchQuery("");
            fetchPermissions(plan?._id || null);
        } else {
            setModules([]);
            setSelectedActions({});
            setActiveModuleId(null);
            setSearchQuery("");
        }
    }, [open, plan]);

    const fetchPermissions = async (packageId) => {
        try {
            setLoadingPermissions(true);
            const res = await ApiPackagePermissions({ packageId: packageId || "" });
            if (res?.isSuccess && Array.isArray(res.data)) {
                const initialSelected = {};
                res.data.forEach((page) => {
                    if (Array.isArray(page.actions)) {
                        page.actions.forEach((action) => {
                            if (page.allocatedActions?.some((a) => a.actionId === action._id || a === action._id)) {
                                initialSelected[action._id] = true;
                            }
                        });
                    }
                });
                const sortedData = [...res.data]
                    .filter((page) => !SUPER_ADMIN_BLOCKED_ROUTES.includes(page.pageName))
                    .sort((a, b) => (a.pageName || "").localeCompare(b.pageName || ""));
                setModules(sortedData);
                setSelectedActions(initialSelected);
                if (sortedData.length > 0) {
                    setActiveModuleId(sortedData[0]._id);
                }
            }
        } catch (err) {
            console.error("Package permissions fetch failed", err);
        } finally {
            setLoadingPermissions(false);
        }
    };

    /* ----------------------------- VALIDATION ----------------------------- */

    const validationSchema = Yup.object().shape({
        name: Yup.string().trim().required(t("Plan name is required")),
        monthlyPrice: Yup.number().min(0, t("Price must be 0 or greater")).required(t("Monthly price is required")),
        yearlyPrice: Yup.number().min(0, t("Price must be 0 or greater")),
        trialDays: Yup.number().min(0, t("Must be 0 or greater")).required(t("Trial days are required")),
        allowAmazonConnection: Yup.number().min(0, t("Must be 0 or greater")).required(t("Amazon connection is required")),
        profileLimit: Yup.number().min(0, t("Must be 0 or greater")),
        numberOfInvites: Yup.number().min(0, t("Must be 0 or greater")),
        isActive: Yup.boolean(),
        isPublic: Yup.boolean(),
    });

    /* ----------------------------- INITIAL VALUES ----------------------------- */

    const initialValues = {
        name: plan?.name || "",
        monthlyPrice: plan?.monthlyPrice !== undefined ? plan?.monthlyPrice : (plan?.price !== undefined ? plan?.price : ""),
        yearlyPrice: plan?.yearlyPrice !== undefined ? plan?.yearlyPrice : 0,
        trialDays: plan?.trialDays || 0,
        allowAmazonConnection: plan?.amazonConnectLimit !== undefined ? plan?.amazonConnectLimit : (plan?.allowAmazonConnection ?? 0),
        profileLimit: plan?.profileLimit || 0,
        numberOfInvites: plan?.numberOfInvites || 0,
        isActive: plan?.isActive ?? true,
        isPublic: plan?.isPublic ?? true,
    };

    /* ----------------------------- SUBMIT ----------------------------- */

    const handleFormSubmit = async (values) => {
        try {
            setSaving(true);
            const pagesPayload = modules.map((page) => {
                const allocatedActions = (page.actions || [])
                    .filter((action) => selectedActions[action._id])
                    .map((action) => ({ actionId: action._id, status: true }));
                return { pageId: page._id, allocatedActions };
            });

            const payload = {
                ...values,
                price: values.monthlyPrice !== "" ? Number(values.monthlyPrice) : 0,
                monthlyPrice: values.monthlyPrice !== "" ? Number(values.monthlyPrice) : 0,
                yearlyPrice: values.yearlyPrice !== "" ? Number(values.yearlyPrice) : 0,
                allowAmazonConnection: Number(values.allowAmazonConnection || 0),
                amazonConnectLimit: Number(values.allowAmazonConnection || 0),
                profileLimit: Number(values.profileLimit || 0),
                numberOfInvites: Number(values.numberOfInvites || 0),
                trialDays: Number(values.trialDays || 0),
                isActive: values.isActive,
                isPublic: values.isPublic,
                pages: pagesPayload,
                packageId: plan?._id,
            };

            if (onSave) {
                await onSave(payload);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleUpdatePermissionsOnly = async () => {
        if (!plan?._id) return;
        setSaving(true);
        const pagesPayload = modules.map((page) => {
            const allocatedActions = (page.actions || [])
                .filter((action) => selectedActions[action._id])
                .map((action) => ({ actionId: action._id, status: true }));
            return { pageId: page._id, allocatedActions };
        });

        try {
            const res = await ApiUpdatePackagePermissions({ packageId: plan._id, pages: pagesPayload });
            if (res?.isSuccess) {
                Toast.success(res.message || "Permissions updated successfully");
                onClose(false);
            } else {
                Toast.error(res?.message || "Failed to update permissions");
            }
        } catch {
            Toast.error(t("Something went wrong while updating permissions"));
        } finally {
            setSaving(false);
        }
    };

    /* ----------------------------- PERMISSIONS FILTER / COMPUTED ----------------------------- */

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

    /* ----------------------------- UI ----------------------------- */

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(false); }}>
            <DialogContent
                className="max-w-[1140px] premium-modal modal-content p-0 overflow-hidden bg-white dark:bg-slate-900 border-none gap-0"
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
                id="package-modal"
            >
                {/* Modal Header + Tabs */}
                <DialogHeader className="modal-header border-b border-gray-200 dark:border-slate-800 p-4 pb-0 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="modal-title font-bold text-lg" style={{ color: isDark ? "#f8fafc" : "#0f172a" }}>
                            {isEdit ? t("Edit Subscription Plan") : t("Add Subscription Plan")}
                            {plan?.name && (
                                <span className="font-normal ml-2 text-sm text-gray-500 dark:text-gray-400">
                                    — {plan.name}
                                </span>
                            )}
                        </DialogTitle>
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex items-center gap-6 mt-1 border-b border-transparent">
                        <button
                            type="button"
                            onClick={() => setActiveTab("details")}
                            className={`pb-3 px-1 font-semibold text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer ${activeTab === "details"
                                    ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                }`}
                        >
                            <i className="fa-solid fa-cubes text-xs" />
                            {t("1. Plan Details")}
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab("permissions")}
                            className={`pb-3 px-1 font-semibold text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer ${activeTab === "permissions"
                                    ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                }`}
                        >
                            <i className="fa-solid fa-shield-halved text-xs" />
                            {t("2. Package Permissions")}
                            {totalSelectedCount > 0 && (
                                <span className="ml-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                    {totalSelectedCount}
                                </span>
                            )}
                        </button>
                    </div>
                </DialogHeader>

                <Formik
                    initialValues={initialValues}
                    validationSchema={validationSchema}
                    enableReinitialize
                    onSubmit={handleFormSubmit}
                >
                    {({ values, errors, touched, handleChange, handleSubmit, setFieldValue }) => {
                        formikSubmitRef.current = handleSubmit;
                        return (
                            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col h-[70vh] max-h-[70vh]">
                                <div className="grow overflow-y-auto">
                                    {/* Tab 1: Plan Details */}
                                    {activeTab === "details" && (
                                        <div className="p-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                                {/* Plan Name */}
                                                <div className="md:col-span-2 lg:col-span-3" id="package-name-field">
                                                    <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-1.5 block">
                                                        {t("Plan Name")} *
                                                    </label>
                                                    <Input
                                                        name="name"
                                                        value={values.name}
                                                        onChange={handleChange}
                                                        placeholder={t("e.g. Enterprise Pro")}
                                                        className={`form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white ${touched.name && !!errors.name ? "!border-red-500" : ""}`}
                                                    />
                                                    {touched.name && !!errors.name && (
                                                        <div className="text-red-500 text-sm mt-1">{errors.name}</div>
                                                    )}
                                                </div>

                                                {/* Monthly Price */}
                                                <div id="package-monthly-price-field">
                                                    <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-1.5 block">
                                                        {t("Monthly Price")} *
                                                    </label>
                                                    <Input
                                                        type="number"
                                                        name="monthlyPrice"
                                                        value={values.monthlyPrice}
                                                        onChange={handleChange}
                                                        placeholder={t("0")}
                                                        className={`form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white ${touched.monthlyPrice && !!errors.monthlyPrice ? "!border-red-500" : ""}`}
                                                    />
                                                    {touched.monthlyPrice && !!errors.monthlyPrice && (
                                                        <div className="text-red-500 text-sm mt-1">{errors.monthlyPrice}</div>
                                                    )}
                                                </div>

                                                {/* Yearly Price */}
                                                <div id="package-yearly-price-field">
                                                    <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-1.5 block">
                                                        {t("Yearly Price")}
                                                    </label>
                                                    <Input
                                                        type="number"
                                                        name="yearlyPrice"
                                                        value={values.yearlyPrice}
                                                        onChange={handleChange}
                                                        placeholder={t("0")}
                                                        className={`form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white ${touched.yearlyPrice && !!errors.yearlyPrice ? "!border-red-500" : ""}`}
                                                    />
                                                    {touched.yearlyPrice && !!errors.yearlyPrice && (
                                                        <div className="text-red-500 text-sm mt-1">{errors.yearlyPrice}</div>
                                                    )}
                                                </div>

                                                {/* Trial Days */}
                                                <div id="package-trial-field">
                                                    <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-1.5 block">
                                                        {t("Trial Days")} *
                                                    </label>
                                                    <Input
                                                        type="number"
                                                        name="trialDays"
                                                        value={values.trialDays}
                                                        onChange={handleChange}
                                                        placeholder={t("14")}
                                                        className={`form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white ${touched.trialDays && !!errors.trialDays ? "!border-red-500" : ""}`}
                                                    />
                                                    {touched.trialDays && !!errors.trialDays && (
                                                        <div className="text-red-500 text-sm mt-1">{errors.trialDays}</div>
                                                    )}
                                                </div>

                                                {/* Amazon Connection Limit */}
                                                <div id="package-amazon-field">
                                                    <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-1.5 block">
                                                        {t("Amazon Connect Limit")} *
                                                    </label>
                                                    <Input
                                                        type="number"
                                                        name="allowAmazonConnection"
                                                        value={values.allowAmazonConnection}
                                                        onChange={handleChange}
                                                        placeholder={t("5")}
                                                        className={`form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white ${touched.allowAmazonConnection && !!errors.allowAmazonConnection ? "!border-red-500" : ""}`}
                                                    />
                                                    {touched.allowAmazonConnection && !!errors.allowAmazonConnection && (
                                                        <div className="text-red-500 text-sm mt-1">{errors.allowAmazonConnection}</div>
                                                    )}
                                                </div>

                                                {/* Profile Limit */}
                                                <div id="package-profile-limit-field">
                                                    <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-1.5 block">
                                                        {t("Profile Limit")}
                                                    </label>
                                                    <Input
                                                        type="number"
                                                        name="profileLimit"
                                                        value={values.profileLimit}
                                                        onChange={handleChange}
                                                        placeholder={t("10")}
                                                        className={`form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white ${touched.profileLimit && !!errors.profileLimit ? "!border-red-500" : ""}`}
                                                    />
                                                    {touched.profileLimit && !!errors.profileLimit && (
                                                        <div className="text-red-500 text-sm mt-1">{errors.profileLimit}</div>
                                                    )}
                                                </div>

                                                {/* Number of Invites */}
                                                <div id="package-invites-limit-field">
                                                    <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-1.5 block">
                                                        {t("Number Of Invites")}
                                                    </label>
                                                    <Input
                                                        type="number"
                                                        name="numberOfInvites"
                                                        value={values.numberOfInvites}
                                                        onChange={handleChange}
                                                        placeholder={t("20")}
                                                        className={`form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white ${touched.numberOfInvites && !!errors.numberOfInvites ? "!border-red-500" : ""}`}
                                                    />
                                                    {touched.numberOfInvites && !!errors.numberOfInvites && (
                                                        <div className="text-red-500 text-sm mt-1">{errors.numberOfInvites}</div>
                                                    )}
                                                </div>

                                                {/* Active Status */}
                                                <div className="flex items-center pt-6" id="package-active-switch">
                                                    <div>
                                                        <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] block mr-3">
                                                            {t("Active Status")}
                                                        </label>
                                                        <div className="mt-2 pt-[3px]">
                                                            <Switch
                                                                checked={values.isActive}
                                                                onCheckedChange={(checked) => setFieldValue("isActive", checked)}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div id="package-public-switch" className="ml-8">
                                                        <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] block mr-3">
                                                            {t("Public Plan")}
                                                        </label>
                                                        <div className="mt-2 pt-[3px]">
                                                            <Switch
                                                                checked={values.isPublic}
                                                                onCheckedChange={(checked) => setFieldValue("isPublic", checked)}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tab 2: Package Permissions */}
                                    {activeTab === "permissions" && (
                                        <div id="permission-model" className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 p-5">
                                            {loadingPermissions ? (
                                                <div className="flex flex-col items-center justify-center grow py-10">
                                                    <i className="fa fa-spinner fa-spin text-blue-500 mb-3 text-3xl" />
                                                    <span className="text-gray-600 dark:text-gray-400 font-medium">
                                                        {t("Loading package permissions...")}
                                                    </span>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Search and Grant All bar */}
                                                    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-4 shrink-0">
                                                        <div id="package-permissions-search" className="relative flex items-center grow max-w-md bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg shadow-sm">
                                                            <i className="fa-solid fa-magnifying-glass absolute left-3.5 text-gray-400 text-sm" />
                                                            <Input
                                                                type="text"
                                                                placeholder={t("Search pages, modules, or actions...")}
                                                                value={searchQuery}
                                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                                className="w-full h-10 bg-transparent border-none pl-9 pr-8 text-sm focus:ring-0 text-gray-800 dark:text-gray-100"
                                                            />
                                                            {searchQuery && (
                                                                <MdOutlineClose
                                                                    onClick={() => setSearchQuery("")}
                                                                    className="absolute right-3 cursor-pointer text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg"
                                                                />
                                                            )}
                                                        </div>

                                                        <div
                                                            id="package-grant-all"
                                                            onClick={toggleAllPermissions}
                                                            className={`flex items-center justify-between gap-3 px-3.5 py-2 cursor-pointer rounded-lg border transition-all shadow-sm select-none ${isAllGranted
                                                                    ? "border-blue-500 bg-blue-500/10 dark:bg-blue-500/20"
                                                                    : "border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-2.5">
                                                                <div className={`flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold ${isAllGranted ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-300"
                                                                    }`}>
                                                                    <i className="fa-solid fa-shield-halved" />
                                                                </div>
                                                                <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">
                                                                    {t("Grant All Permissions")}
                                                                </span>
                                                            </div>
                                                            <input
                                                                type="checkbox"
                                                                className="form-check-input m-0 cursor-pointer w-4 h-4 rounded"
                                                                checked={isAllGranted}
                                                                readOnly
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Split Modules List & Actions Panel */}
                                                    <div className="flex flex-col md:flex-row grow border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden min-h-0 bg-white dark:bg-slate-900 shadow-sm">
                                                        {/* Left Sidebar: MODULES */}
                                                        <div id="package-modules-sidebar" className="w-full md:w-1/3 border-r border-gray-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 flex flex-col h-full overflow-y-auto">
                                                            <div className="flex items-center justify-between px-3.5 py-3 sticky top-0 border-b border-gray-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur z-10">
                                                                <span className="font-bold text-[11px] tracking-wider text-gray-500 dark:text-gray-400">
                                                                    {t("MODULES / PAGES")}
                                                                </span>
                                                                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400">
                                                                    {totalSelectedCount} {t("Selected")}
                                                                </span>
                                                            </div>

                                                            <div className="grow divide-y divide-gray-100 dark:divide-slate-800/60">
                                                                {filteredModules.length === 0 ? (
                                                                    <div className="p-5 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                        {t("No pages found")}
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
                                                                                className={`flex items-center justify-between px-3.5 py-3 cursor-pointer transition-colors ${isActive
                                                                                        ? "bg-blue-600 text-white font-semibold shadow-sm"
                                                                                        : "hover:bg-slate-100 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-200"
                                                                                    }`}
                                                                            >
                                                                                <div className="flex items-center gap-2.5 overflow-hidden mr-2">
                                                                                    <i className={`${getPageIcon(mod.pageName)} w-4 text-center ${isActive ? "text-white" : "text-gray-400 dark:text-gray-500"
                                                                                        }`} />
                                                                                    <span className="text-sm truncate">
                                                                                        {mod.pageName}
                                                                                    </span>
                                                                                </div>

                                                                                {modSelectedCount > 0 && (
                                                                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${isActive
                                                                                            ? "bg-white/20 text-white"
                                                                                            : isModFull
                                                                                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                                                                                : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                                                                                        }`}>
                                                                                        {isModFull ? "✓" : `${modSelectedCount}/${modActions.length}`}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Right Main Area: ACTIONS */}
                                                        <div id="package-actions-panel" className="w-full md:w-2/3 flex flex-col h-full overflow-y-auto bg-white dark:bg-slate-900">
                                                            {activeModule ? (
                                                                <>
                                                                    <div className="flex items-center justify-between px-5 py-3.5 sticky top-0 border-b border-gray-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur z-10">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 text-white text-lg shadow-sm shrink-0">
                                                                                <i className={getPageIcon(activeModule.pageName)} />
                                                                            </div>
                                                                            <div>
                                                                                <h6 className="mb-0 font-bold text-base text-gray-800 dark:text-gray-100">
                                                                                    {activeModule.pageName} {t("Permissions")}
                                                                                </h6>
                                                                                <small className="text-xs text-gray-500 dark:text-gray-400">
                                                                                    {t("Configure capabilities for")} {activeModule.pageName}
                                                                                </small>
                                                                            </div>
                                                                        </div>

                                                                        <div
                                                                            onClick={toggleActiveModulePermissions}
                                                                            className="flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded-lg border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 select-none transition-all"
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                className="form-check-input m-0 cursor-pointer w-4 h-4 rounded"
                                                                                checked={isActiveModuleAllSelected}
                                                                                readOnly
                                                                            />
                                                                            <span className="font-semibold text-xs text-gray-700 dark:text-gray-200">
                                                                                {t("Enable Module")}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="p-5 grow">
                                                                        {standardActions.length === 0 && customActions.length === 0 ? (
                                                                            <div className="text-center py-10 text-gray-500 dark:text-gray-400 text-sm">
                                                                                {t("No actions defined for this page.")}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex flex-col gap-6">
                                                                                {/* Standard Permissions */}
                                                                                {standardActions.length > 0 && (
                                                                                    <div>
                                                                                        <div className="mb-3">
                                                                                            <span className="font-bold text-[11px] tracking-wider text-gray-400 dark:text-gray-500 uppercase">
                                                                                                {t("STANDARD ACTIONS")}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                                                                            {standardActions.map((action) => {
                                                                                                const isSelected = !!selectedActions[action._id];
                                                                                                return (
                                                                                                    <div
                                                                                                        key={action._id}
                                                                                                        onClick={() => toggleSingleAction(action._id)}
                                                                                                        className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${isSelected
                                                                                                                ? "border-blue-500 bg-blue-50/60 dark:bg-blue-900/20 shadow-sm"
                                                                                                                : "border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40"
                                                                                                            }`}
                                                                                                    >
                                                                                                        <div className="flex items-center gap-3">
                                                                                                            <div className={`flex items-center justify-center w-10 h-10 rounded-xl text-base shrink-0 transition-colors ${isSelected
                                                                                                                    ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                                                                                                                    : "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400"
                                                                                                                }`}>
                                                                                                                <i className={getActionIcon(action.actionType)} />
                                                                                                            </div>
                                                                                                            <div>
                                                                                                                <div className="font-bold text-sm text-gray-800 dark:text-gray-100">
                                                                                                                    {action.actionType}
                                                                                                                </div>
                                                                                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                                                                                    {t("Allow")} {action.actionType.toLowerCase()}
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                        <input
                                                                                                            type="checkbox"
                                                                                                            className="form-check-input m-0 cursor-pointer w-4 h-4 rounded shrink-0"
                                                                                                            checked={isSelected}
                                                                                                            readOnly
                                                                                                        />
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {/* Custom / Advanced Permissions */}
                                                                                {customActions.length > 0 && (
                                                                                    <div className="p-4 rounded-xl border border-gray-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                                                                                        <div className="flex items-center gap-2 mb-3">
                                                                                            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 text-xs">
                                                                                                <i className="fa-solid fa-network-wired" />
                                                                                            </div>
                                                                                            <span className="font-bold text-sm text-gray-800 dark:text-gray-100">
                                                                                                {t("Advanced & Custom Actions")}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                                                                            {customActions.map((action) => {
                                                                                                const isSelected = !!selectedActions[action._id];
                                                                                                return (
                                                                                                    <div
                                                                                                        key={action._id}
                                                                                                        onClick={() => toggleSingleAction(action._id)}
                                                                                                        className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${isSelected
                                                                                                                ? "border-purple-500 bg-purple-50/60 dark:bg-purple-900/20 shadow-sm"
                                                                                                                : "border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/80"
                                                                                                            }`}
                                                                                                    >
                                                                                                        <div className="flex items-center gap-3">
                                                                                                            <div className={`flex items-center justify-center w-10 h-10 rounded-xl text-base shrink-0 transition-colors ${isSelected
                                                                                                                    ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                                                                                                                    : "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400"
                                                                                                                }`}>
                                                                                                                <i className={getActionIcon(action.actionType)} />
                                                                                                            </div>
                                                                                                            <div>
                                                                                                                <div className="font-bold text-sm text-gray-800 dark:text-gray-100">
                                                                                                                    {action.actionType}
                                                                                                                </div>
                                                                                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                                                                                    {t("Allow")} {action.actionType.toLowerCase()}
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                        <input
                                                                                                            type="checkbox"
                                                                                                            className="form-check-input m-0 cursor-pointer w-4 h-4 rounded shrink-0"
                                                                                                            checked={isSelected}
                                                                                                            readOnly
                                                                                                        />
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
                                                                <div className="flex flex-col items-center justify-center h-full text-gray-400 p-10">
                                                                    <i className="fa-solid fa-folder-open text-4xl mb-3 opacity-40" />
                                                                    <span className="text-sm font-medium">
                                                                        {t("Select a module from the left to configure actions")}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Modal Footer */}
                                <div className="p-4 px-6 border-t border-gray-200 dark:border-slate-800 bg-gray-50/80 dark:bg-slate-800/50 flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                            {activeTab === "details" ? t("Step 1 of 2: Plan Configuration") : t("Step 2 of 2: Page Permissions Allocation")}
                                        </span>
                                        {totalSelectedCount > 0 && (
                                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                                                {totalSelectedCount} {t("actions granted")}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2.5">
                                        {activeTab === "permissions" && isEdit && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={saving}
                                                className="btn-premium-secondary border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center gap-1.5"
                                                onClick={handleUpdatePermissionsOnly}
                                            >
                                                {saving ? <i className="fa-solid fa-spinner fa-spin mr-1" /> : <i className="fa-solid fa-shield-halved mr-1.5" />}
                                                {saving ? t("Saving...") : t("Save Permissions Only")}
                                            </Button>
                                        )}

                                        {activeTab === "details" && (
                                            <Button
                                                id="package-next-btn"
                                                type="button"
                                                variant="outline"
                                                disabled={saving}
                                                className="btn-premium-secondary border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                                                onClick={() => setActiveTab("permissions")}
                                            >
                                                {t("Next: Configure Permissions")}
                                                <i className="fa-solid fa-arrow-right ml-1.5" />
                                            </Button>
                                        )}

                                        <Button
                                            id="package-cancel-btn"
                                            variant="outline"
                                            type="button"
                                            disabled={saving}
                                            className="btn-premium-secondary"
                                            onClick={() => onClose(false)}
                                        >
                                            {t("Cancel")}
                                        </Button>

                                        <Button
                                            id="package-create-btn"
                                            type="button"
                                            disabled={saving}
                                            className="btn-premium-primary px-5 font-bold flex items-center gap-1.5"
                                            onClick={() => {
                                                if (formikSubmitRef.current) formikSubmitRef.current();
                                            }}
                                        >
                                            {saving ? (
                                                <i className="fa-solid fa-spinner fa-spin mr-1" />
                                            ) : (
                                                <i className={`fa-solid ${isEdit ? "fa-check" : "fa-plus"} mr-1.5`} />
                                            )}
                                            {saving
                                                ? t("Saving...")
                                                : isEdit
                                                    ? t("Update Plan & Permissions")
                                                    : t("Create Plan & Permissions")}
                                        </Button>
                                    </div>
                                </div>
                            </form>
                        );
                    }}
                </Formik>
            </DialogContent>
        </Dialog>
    );
}
