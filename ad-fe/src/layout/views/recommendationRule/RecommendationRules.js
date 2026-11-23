import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useContext, useState, useEffect, useRef, useMemo } from "react";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import AddRule from "./AddRule";
import { TagList } from "../../../components/recommendation-tags/RecommendationTags";
import RecommendationCampaignModal from "./RecommendationCampaignModal";
import { ApiDeleteRule, ApiGetRules, ApiStatusChange, ApiExportRecommandationRule, ApiImportRecommandationRule, ApiUpdateRules, ApiBulkUpdateRuleDateFilter, ApiCopyRulesToProfiles, ApiGetRecommendationTags } from "../../../api-wrapper/recommendation/ApiRecommendation";
import { ApiSelectAccount } from "../../../api-wrapper/campaign/ApiCampaign";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { MultiSelect } from "../../../components/ui/popover-multi-select";
import { isProfileAvailable } from "../../../helper/filter/profileSelection";
import { FiCopy } from "react-icons/fi";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { handleLoader, Toast, useDispatch, useNavigate } from "../../../helper/links/Link";
import moment from "moment";
import { conditionOperators } from "../budgetRule/column";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useTranslation } from "react-i18next";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { t } from "i18next";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { StyledCheckbox } from "../../../common/grid/StyledCheckbox";
import ImportExportMenu from "../../../helper/ImportExport/ImportExportMenu";
import {
    RECOMMENDATION_FILTER_OPTIONS,
    RecommendationFilterDropdown,
    RecommendationAppliedFilters,
    RecommendationFilterModal,
    buildRecommendationAppliedFilters,
} from "../recommandation/RecommendationFilterBar";

const DATE_FILTER_OPTION = [
    { value: "TODAY", label: t("Today") },
    { value: "YESTERDAY", label: t("Yesterday") },
    { value: "LAST_7_DAYS", label: t("Last 7 days") },
    { value: "THIS_WEEK", label: t("This week") },
    { value: "LAST_WEEK", label: t("Last week") },
    { value: "LAST_30_DAYS", label: t("Last 30 days") },
    { value: "THIS_MONTH", label: t("This month") },
    { value: "LAST_MONTH", label: t("Last month") },
    { value: "YEAR_TO_DATE", label: t("Year to date") },
    { value: "LIFETIME", label: t("Lifetime") },
];

// Action label mapping for display
const ACTION_LABEL_MAP = {
    // Campaign actions
    SetBudget: "Set Budget",
    IncreaseBudget: "Increase Budget",
    DecreaseBudget: "Decrease Budget",
    CampaignEnable: "Campaign Enable",
    CampaignPause: "Campaign Pause",

    // Placement actions
    IncreaseBid: "Increase Bid",
    DecreaseBid: "Decrease Bid",
    SetBid: "Set Bid",

    // Targeting actions
    EnableTargeting: "Enable Targeting",
    PauseTargeting: "Pause Targeting",

    // Search Term actions
    AddAsTargeting: "Add as Targeting",
    AddAsNegativeTargeting: "Add as Negative Targeting",

    // Products actions
    EnableProduct: "Enabled Product",
    DisableProduct: "Disabled Product",
};

// Match type label mapping
const MATCH_TYPE_LABEL = {
    Exact: "Exact",
    Phrase: "Phrase",
};

// Placement label mapping
const PLACEMENT_LABEL = {
    "Top of Search": "Top of Search",
    "Rest of Search": "Rest of Search",
    "Product Page": "Product Page",
};

function RecomandationRules({ hideFilter = false, tagOptions: propTagOptions } = {}) {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [disablePinning, setDisablePinning] = useState(window.innerWidth < 1100);
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
            setDisablePinning(window.innerWidth < 1100);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const { t } = useTranslation();
    let selectedCampagin = useContext(ProfileContext);
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const [tableData, setTableData] = useState([]);

    const [editData, setEditData] = useState(null);
    const [showCampaignModal, setShowCampaignModal] = useState(false);
    const [selectedRuleForCampaign, setSelectedRuleForCampaign] = useState(null);
    const gridRef = useRef(null);
    const [loading, setLoading] = useState(false);

    const handleUpdateRuleCampaigns = ({ campaignSelectionType, campaignIds }) => {
        if (!selectedRuleForCampaign?._id) return;
        dispatch(handleLoader(true));
        ApiUpdateRules(selectedRuleForCampaign._id, {
            campaignSelectionType,
            campaignIds,
        })
            .then((res) => {
                dispatch(handleLoader(false));
                if (res.isSuccess) {
                    Toast.success(res.message);
                    getRule(arg);
                } else {
                    Toast.error(res.message);
                }
            })
            .catch((err) => {
                dispatch(handleLoader(false));
                Toast.error(err);
            });
    };

    // Helper function to format action display text
    const formatActionDisplay = (action, gridName) => {
        const actionName = action.actionName;
        const actionLabel = ACTION_LABEL_MAP[actionName] || actionName;

        // For Campaign and Targeting actions
        if (gridName === 'Campaign' || gridName === 'Targeting') {
            if (actionName === 'CampaignEnable' || actionName === 'EnableTargeting') {
                return `${actionLabel}`;
            }
            if (actionName === 'CampaignPause' || actionName === 'PauseTargeting') {
                return `${actionLabel}`;
            }
            // For budget/bid actions with values
            if (action.actionValue && action.actionValueType) {
                const valueSymbol = action.actionValueType === 'Percentage' ? '%' : '';
                return `${actionLabel} by ${action.actionValue}${valueSymbol}`;
            }
            return actionLabel;
        }

        // For Placement grid
        if (gridName === 'Placement') {
            if (action.placementType) {
                const placementLabel = PLACEMENT_LABEL[action.placementType] || action.placementType;
                if (action.actionValue && action.actionValueType) {
                    const valueSymbol = action.actionValueType === 'Percentage' ? '%' : '';
                    return `${actionLabel} ${placementLabel} by ${action.actionValue}${valueSymbol}`;
                }
                return `${actionLabel} ${placementLabel}`;
            }
            if (action.actionValue && action.actionValueType) {
                const valueSymbol = action.actionValueType === 'Percentage' ? '%' : '';
                return `${actionLabel} by ${action.actionValue}${valueSymbol}`;
            }
            return actionLabel;
        }

        // For Search Term grid
        if (gridName === 'Search Term') {
            if (action.matchType) {
                const matchLabel = MATCH_TYPE_LABEL[action.matchType] || action.matchType;
                return `${actionLabel} - ${matchLabel}`;
            }
            return actionLabel;
        }

        return actionLabel;
    };

    const exportRecommandationRules = async (exportIds) => {
        try {
            const response = await ApiExportRecommandationRule({ profileId: selectedCampagin?.profileSendID, exportIds });

            const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const url = window.URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;

            link.setAttribute("download", `RecommandationRules_${selectedCampagin?.profileSendID}.xlsx`);
            document.body.appendChild(link);
            link.click();

            link.remove();
            window.URL.revokeObjectURL(url);

            setSelectedRows([]);

            Toast.success(t("Export completed successfully"));
        } catch (err) {
            console.log(err);
            Toast.error(t("Failed to export rules"));
        }
    };

    const importRecommandationRules = async (file, duplicateAction) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("profileId", selectedCampagin?.profileSendID);
        formData.append("duplicateAction", duplicateAction);

        try {
            const res = await ApiImportRecommandationRule(formData);

            if (res.isSuccess) {
                if (res.errorCount > 0) {
                    // Show all errors
                    res.errors.forEach(err => Toast.error(`Row ${err.row}: ${err.message}`));
                } else {
                    Toast.success(res.message || "Import completed successfully");
                    getRule(arg);
                }
            } else {
                Toast.error(res.message || "Import failed");
            }

        } catch (err) {
            Toast.error(err.message || "Something went wrong during import");
        }
    };

    const [bulkDateFilter, setBulkDateFilter] = useState("");
    const [bulkApplyLoading, setBulkApplyLoading] = useState(false);

    // Copy to other profile states
    const [showCopyProfileModal, setShowCopyProfileModal] = useState(false);
    const [selectedCopyProfiles, setSelectedCopyProfiles] = useState([]);
    const [copyProfileLoading, setCopyProfileLoading] = useState(false);
    const [availableAccountGroups, setAvailableAccountGroups] = useState([]);
    const [loadingProfiles, setLoadingProfiles] = useState(false);

    const handleOpenCopyProfileModal = async () => {
        if (!selectedRows.length) {
            Toast.error(t("Please select at least one recommendation rule"));
            return;
        }
        setSelectedCopyProfiles([]);
        setShowCopyProfileModal(true);

        if (selectedCampagin?.profileList?.length > 0) {
            setAvailableAccountGroups(selectedCampagin.profileList);
        } else {
            setLoadingProfiles(true);
            try {
                const res = await ApiSelectAccount();
                if (res?.isSuccess && Array.isArray(res?.data)) {
                    setAvailableAccountGroups(res.data);
                    selectedCampagin?.setProfileList?.(res.data);
                }
            } catch (err) {
                console.error("Failed to fetch profiles:", err);
            } finally {
                setLoadingProfiles(false);
            }
        }
    };

    const otherProfileOptions = useMemo(() => {
        const currentPId = Number(selectedCampagin?.profileSendID);
        const groups = availableAccountGroups.length > 0 ? availableAccountGroups : (selectedCampagin?.profileList || []);
        const map = new Map();

        groups.forEach((cfg) => {
            const configId = cfg?.configId || cfg?._id;
            const companyName = cfg?.config?.companyName || cfg?.companyName || t("Profiles");
            (cfg?.profiles || []).forEach((p) => {
                if (!isProfileAvailable(p)) return;
                if (Number(p?.profileId) === currentPId) return; // Exclude current profile
                const key = `${configId} || ${p?.profileId}`;
                if (!map.has(key)) {
                    map.set(key, {
                        value: key,
                        label: `${companyName} | ${p?.countryCode ? `${p.countryCode} - ` : ""}${p?.name}`,
                        configId: String(configId),
                        companyName,
                        countryCode: p?.countryCode,
                        profileName: p?.name,
                        profileId: p?.profileId,
                    });
                }
            });
        });

        return Array.from(map.values());
    }, [availableAccountGroups, selectedCampagin?.profileList, selectedCampagin?.profileSendID, t]);

    const handleApplyCopyToProfiles = async () => {
        if (!selectedRows.length) {
            Toast.error(t("Please select at least one recommendation rule"));
            return;
        }
        if (!selectedCopyProfiles.length) {
            Toast.error(t("Please select at least one profile"));
            return;
        }

        const targetProfiles = selectedCopyProfiles.map((val) => {
            const opt = otherProfileOptions.find((o) => o.value === val);
            const [configId, profileId] = String(val).split(" || ");
            return {
                configId: opt?.configId || configId,
                profileId: Number(opt?.profileId || profileId),
                profileName: opt ? `${opt.countryCode ? `${opt.countryCode} - ` : ""}${opt.profileName}` : String(profileId),
            };
        });

        setCopyProfileLoading(true);
        try {
            const res = await ApiCopyRulesToProfiles({
                ruleIds: selectedRows,
                targetProfiles,
            });

            if (res?.insertedCount > 0 && !res?.hasDuplicates) {
                Toast.success(res?.message || t("Configuration copied successfully."));
                setShowCopyProfileModal(false);
                setSelectedCopyProfiles([]);
                setSelectedRows([]);
                setSelectAll(false);
            } else if (res?.insertedCount > 0 && res?.hasDuplicates) {
                Toast.warning ? Toast.warning(res.message) : Toast.success(res.message);
                setShowCopyProfileModal(false);
                setSelectedCopyProfiles([]);
                setSelectedRows([]);
                setSelectAll(false);
            } else if (res?.hasDuplicates) {
                Toast.error(res?.message || t("You already have this configuration in the selected profile, so we didn't add it."));
            } else {
                Toast.error(res?.message || t("Failed to copy configuration"));
            }
        } catch (err) {
            console.error("Copy rules to profiles error:", err);
            Toast.error(t("Failed to copy configuration"));
        } finally {
            setCopyProfileLoading(false);
        }
    };

    const handleBulkApplyDateFilter = async () => {
        if (!selectedRows.length) {
            Toast.error(t("Please select at least one recommendation rule"));
            return;
        }
        if (!bulkDateFilter) {
            Toast.error(t("Please select a date filter"));
            return;
        }

        setBulkApplyLoading(true);
        try {
            const res = await ApiBulkUpdateRuleDateFilter({
                ruleIds: selectedRows,
                reportDate: bulkDateFilter,
                profileId: selectedCampagin?.profileSendID,
            });

            if (res?.isSuccess) {
                Toast.success(res?.message || t("Date filter updated successfully"));
                setSelectedRows([]);
                setSelectAll(false);
                setBulkDateFilter("");
                getRule(arg);
            } else {
                Toast.error(res?.message || t("Failed to update date filter"));
            }
        } catch (err) {
            console.error("Bulk date filter update error:", err);
            Toast.error(t("Failed to update date filter"));
        } finally {
            setBulkApplyLoading(false);
        }
    };

    const [selectedRows, setSelectedRows] = useState([]);
    const [selectAll, setSelectAll] = useState(false);

    // Handle select all state when selectedRows changes
    useEffect(() => {
        if (tableData.length > 0) {
            const allRowIds = tableData.map(row => row?._id);
            setSelectAll(selectedRows.length === allRowIds.length && selectedRows.length > 0);
        }
    }, [selectedRows, tableData]);

    const columns = useMemo(() => [
        // ── Checkbox ──────────────────────────────────────────────────────────────
        {
            headerName: "",
            field: "_checkbox",
            title: "Checkbox",
            maxWidth: 50,
            pinned: disablePinning ? null : "left",
            lockPinned: !disablePinning,
            suppressMovable: true,
            sortable: false,
            resizable: false,
            headerComponent: () => (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
                    <StyledCheckbox
                        checked={selectAll}
                        onChange={(e) => {
                            if (e.target.checked) {
                                setSelectedRows(tableData.map(row => row?._id));
                                setSelectAll(true);
                            } else {
                                setSelectedRows([]);
                                setSelectAll(false);
                            }
                        }}
                    />
                </div>
            ),
            cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                return (
                    <StyledCheckbox
                        checked={selectedRows.includes(row?._id)}
                        disabled={!row?._id}
                        onChange={(e) => {
                            const rowId = row?._id;
                            if (e.target.checked && rowId) {
                                setSelectedRows(prev => [...prev, rowId]);
                            } else {
                                setSelectedRows(prev => prev.filter(id => id !== rowId));
                                setSelectAll(false);
                            }
                        }}
                    />
                );
            },
        },

        // ── Action ────────────────────────────────────────────────────────────────
        ...(PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE) ||
            PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.REMOVE)
            ? [
                {
                    headerName: t("Action"),
                    field: "action",
                    title: "Action",
                    width: 140,
                    pinned: disablePinning ? null : "left",
                    lockPinned: !disablePinning,
                    suppressMovable: true,
                    sortable: false,
                    resizable: false,
                    cellRenderer: (params) => {
                        const rows = params.data;
                        if (!rows) return null;
                        return (
                            <div className="action_container gap-2 flex items-center" style={{ height: "100%" }}>
                                {PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE) && (
                                    <i
                                        className="fa fa-pencil cursor-pointer"
                                        title={t("Edit")}
                                        onClick={() => {
                                            setEditData(rows);
                                            editHandler(rows);
                                        }}
                                    ></i>
                                )}
                                {PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.REMOVE) && (
                                    <i
                                        className="fa fa-trash cursor-pointer"
                                        title={t("Delete")}
                                        onClick={() => {
                                            setShowDeleteModal({ isOpen: true, data: rows });
                                            setDeleteId(rows._id);
                                        }}
                                    ></i>
                                )}
                                {PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE) && (
                                    <i
                                        className="fa fa-link cursor-pointer"
                                        title={t("Assign / Select Campaigns")}
                                        onClick={() => {
                                            setSelectedRuleForCampaign(rows);
                                            setShowCampaignModal(true);
                                        }}
                                    ></i>
                                )}
                            </div>
                        );
                    },
                },
            ]
            : []),

        // ── Is Active toggle ──────────────────────────────────────────────────────
        {
            headerName: t("isActive"),
            field: "isActive",
            title: "Is Active",
            width: 100,
            sortable: false,
            resizable: true,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                return (
                    <div className="flex items-center justify-center w-full h-full pt-3">
                        <Switch
                            name="isActive"
                            onCheckedChange={(checked) =>
                                setStatusChange({
                                    isActive: checked,
                                    id: row?._id,
                                    row,
                                })
                            }
                            checked={row.isActive}
                            disabled={!PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE)}
                        />
                    </div>
                );
            },
        },

        // ── Rule Name ─────────────────────────────────────────────────────────────
        {
            headerName: t("Recommendation Name"),
            field: "ruleName",
            title: "Rule Name",
            width: 230,
            sortable: true,
            resizable: true,
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                const e = params.data;
                if (!e) return null;
                return (
                    <div>
                        <p>{e.ruleName}</p>
                    </div>
                );
            },
        },

        // ── Tags ──────────────────────────────────────────────────────────────────
        {
            headerName: t("Tags"),
            field: "tags",
            title: "Tags",
            width: 200,
            sortable: false,
            resizable: true,
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                const e = params.data;
                if (!e) return null;
                return e.tags?.length
                    ? <TagList tags={e.tags} max={3} className="py-1.5" />
                    : <span className="text-slate-400">—</span>;
            },
        },

        // ── Rule Level ─────────────────────────────────────────────────────────────
        {
            headerName: t("Affected Parameter"),
            field: "gridName",
            title: "Grid Name",
            width: 130,
            sortable: true,
            resizable: true,
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                const e = params.data;
                if (!e) return null;
                return <p>{e.gridName || "—"}</p>;
            },
        },

        // ── Campaign Scope ────────────────────────────────────────────────────────
        {
            headerName: t("Campaign Scope"),
            field: "campaignSelectionType",
            title: "Campaign Scope",
            width: 170,
            sortable: true,
            resizable: true,
            cellRenderer: (params) => {
                const e = params.data;
                if (!e) return null;
                const type = e.campaignSelectionType || "ALL";
                const totalSelected = (e.campaignIds?.SP?.length || 0) + (e.campaignIds?.SB?.length || 0) + (e.campaignIds?.SD?.length || 0);

                if (type === "INCLUDE") {
                    return (
                        <div className="flex items-center gap-1.5 pt-2">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                {t("Included")} ({totalSelected})
                            </span>
                        </div>
                    );
                }
                if (type === "EXCLUDE") {
                    return (
                        <div className="flex items-center gap-1.5 pt-2">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                                {t("Excluded")} ({totalSelected})
                            </span>
                        </div>
                    );
                }
                return (
                    <div className="flex items-center gap-1.5 pt-2">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                            {t("All Campaigns")}
                        </span>
                    </div>
                );
            },
        },

        // ── Conditions ────────────────────────────────────────────────────────────
        {
            headerName: t("conditions"),
            field: "conditions",
            title: "Conditions",
            width: 300,
            sortable: false,
            resizable: true,
            autoHeight: true,
            wrapText: true,
            cellRenderer: (params) => {
                const e = params.data;
                if (!e) return null;
                const isReportDate =
                    Boolean(e?.reportDate) &&
                    DATE_FILTER_OPTION.find((day) => day?.value === e?.reportDate);
                return (
                    <div className="rule_type">
                        {isReportDate && (
                            <p className="py-1 ml-3">
                                <b>Date: </b>
                                {isReportDate?.label ?? "—"}
                            </p>
                        )}
                        {e?.conditions?.map((el, index) =>
                            mainConditionMaker(
                                index,
                                el?.conditionType,
                                el?.conditionOperator,
                                el?.conditionStringValue,
                                el?.conditionValue,
                                el?.conditionValueType,
                                el
                            )
                        )}
                    </div>
                );
            },
        },

        // ── Action Type ───────────────────────────────────────────────────────────
        {
            headerName: t("actionType"),
            field: "actionType",
            title: "Action Type",
            width: 320,
            sortable: false,
            resizable: true,
            autoHeight: true,
            wrapText: true,
            cellRenderer: (params) => {
                const e = params.data;
                if (!e) return null;
                const hasOob = Array.isArray(e.conditions) && e.conditions.some(c => String(c?.conditionType || "").toLowerCase().replace(/[\s_]+/g, "") === "outofbudget");
                const validActions = Array.isArray(e.actions)
                    ? e.actions.filter(a => a && a.actionName && String(a.actionName).toLowerCase() !== "none")
                    : [];

                if (validActions.length === 0) {
                    return (
                        <div className="rule_type">
                            <span className="badge badge-light-warning text-warning" style={{ fontSize: "12px", padding: "4px 8px" }}>
                                {hasOob ? t("No actions (Out of Budget monitoring)") : t("No actions")}
                            </span>
                        </div>
                    );
                }

                const gridName = e.gridName;

                return (
                    <div className="rule_type">
                        {validActions.map((action, index) => (
                            <p key={index} className="py-1 ml-3" style={{ margin: "6px 0", fontSize: "13px" }}>
                                <strong>Action {index + 1}:</strong> {formatActionDisplay(action, gridName)}
                            </p>
                        ))}
                    </div>
                );
            },
        },

        // ── Created At ────────────────────────────────────────────────────────────
        {
            headerName: t("createdAt"),
            field: "createdAt",
            title: "Created At",
            width: 180,
            sortable: true,
            resizable: true,
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                if (!params.data) return null;
                return moment(params.value)
                    .tz(params.data?.timezone || "")
                    .format("MM/DD/YYYY hh:mm:ss A z");
            },
        },

        // ── Updated At ────────────────────────────────────────────────────────────
        {
            headerName: t("updatedAt"),
            field: "updatedAt",
            title: "Updated At",
            width: 180,
            sortable: true,
            resizable: true,
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                if (!params.data) return null;
                return moment(params.value)
                    .tz(params.data?.timezone || "")
                    .format("MM/DD/YYYY hh:mm:ss A z");
            },
        },
    ], [disablePinning, tableData, selectedRows, selectAll, t]);

    const [deleteId, setDeleteId] = useState();
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [addModalFlag, setaddModalFlag] = useState(false);
    const [editId, setEditId] = useState();
    const [existingRulesSchedule, setExistingRulesSchedule] = useState([]);

    const [perPage, setPerPage] = useState(firstPageRows);
    const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
    const [totalRecords, setTotalRecords] = useState(0);

    const [statusChange, setStatusChange] = useState(null);

    // Filter states (Affected Parameter, Action & Tags)
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [selectedFilterOption, setSelectedFilterOption] = useState(null);
    const [appliedGridNames, setAppliedGridNames] = useState([]);
    const [appliedActions, setAppliedActions] = useState([]);
    const [appliedTagIds, setAppliedTagIds] = useState([]);
    const [tagOptions, setTagOptions] = useState(propTagOptions || []);
    const [tempGridNames, setTempGridNames] = useState([]);
    const [tempActions, setTempActions] = useState([]);
    const [tempTagIds, setTempTagIds] = useState([]);

    useEffect(() => {
        if (Array.isArray(propTagOptions) && propTagOptions.length > 0) {
            setTagOptions(propTagOptions);
        }
    }, [propTagOptions]);

    const fetchTags = () => {
        if (!selectedCampagin?.profileSendID) return;
        ApiGetRecommendationTags({ profileId: selectedCampagin?.profileSendID })
            .then((res) => {
                if (res?.isSuccess && Array.isArray(res?.data)) {
                    setTagOptions(res.data);
                    setAppliedTagIds((prev) => {
                        if (!prev || !prev.length) return prev;
                        const filtered = prev.filter((id) => res.data.some((tg) => String(tg._id) === id));
                        return filtered.length === prev.length ? prev : filtered;
                    });
                }
            })
            .catch(() => {});
    };

    useEffect(() => {
        fetchTags();
    }, [selectedCampagin?.profileSendID]);

    const appliedFilters = useMemo(
        () => buildRecommendationAppliedFilters(appliedGridNames, appliedActions, t, appliedTagIds, tagOptions),
        [appliedGridNames, appliedActions, appliedTagIds, tagOptions, t]
    );

    const handleFilterOptionClick = (option) => {
        setTempGridNames([...appliedGridNames]);
        setTempActions([...appliedActions]);
        setTempTagIds([...appliedTagIds]);
        setSelectedFilterOption(option);
        setShowFilterModal(true);
    };

    const handleApplyFilter = () => {
        let nextGridNames = appliedGridNames;
        let nextActions = appliedActions;
        let nextTagIds = appliedTagIds;
        if (selectedFilterOption?.value === "AffectedParameter") {
            nextGridNames = [...tempGridNames];
            setAppliedGridNames(nextGridNames);
        } else if (selectedFilterOption?.value === "Action") {
            nextActions = [...tempActions];
            setAppliedActions(nextActions);
        } else if (selectedFilterOption?.value === "Tags") {
            nextTagIds = [...tempTagIds];
            setAppliedTagIds(nextTagIds);
        }
        setShowFilterModal(false);
        const nextArg = { pageNo: 1, perPage };
        setArg(nextArg);
        getRule(nextArg, { gridName: nextGridNames, actionName: nextActions, tagIds: nextTagIds });
    };

    const handleRemoveFilter = (filterId) => {
        let nextGridNames = appliedGridNames;
        let nextActions = appliedActions;
        let nextTagIds = appliedTagIds;
        if (filterId === "AffectedParameter") {
            nextGridNames = [];
            setAppliedGridNames([]);
        } else if (filterId === "Action") {
            nextActions = [];
            setAppliedActions([]);
        } else if (filterId === "Tags") {
            nextTagIds = [];
            setAppliedTagIds([]);
        }
        const nextArg = { pageNo: 1, perPage };
        setArg(nextArg);
        getRule(nextArg, { gridName: nextGridNames, actionName: nextActions, tagIds: nextTagIds });
    };

    const handleClearAllFilters = () => {
        setAppliedGridNames([]);
        setAppliedActions([]);
        setAppliedTagIds([]);
        const nextArg = { pageNo: 1, perPage };
        setArg(nextArg);
        getRule(nextArg, { gridName: [], actionName: [], tagIds: [] });
    };

    const handleEditFilter = (filter) => {
        const opt = RECOMMENDATION_FILTER_OPTIONS.find((o) => o.value === filter.type);
        if (opt) handleFilterOptionClick(opt);
    };

    const deleteHandler = () => {
        dispatch(handleLoader(true));
        ApiDeleteRule(deleteId)
            .then((res) => {
                if (res.isSuccess) {
                    Toast.success(res.message);
                    setShowDeleteModal(false)
                    dispatch(handleLoader(false));
                    getRule(arg);
                } else {
                    Toast.error(res.message);
                    dispatch(handleLoader(false));
                }
                setDeleteId();
            })
            .catch((err) => {
                dispatch(handleLoader(false));
                Toast.error(t("Something went wrong!!"));
            });
    };

    const statusHandler = ({ isActive, id }) => {
        let data = { isActive, ids: [id] };
        ApiStatusChange(data)
            .then((res) => {
                if (res.isSuccess) {
                    Toast.success(res.message || "Success");
                    setStatusChange(null);
                    getRule(arg);
                } else {
                    Toast.error(res.message || "error");
                }
            })
            .catch((err) => {
                Toast.error(err.message || "Something went wrong");
            });
    };

    const editHandler = (rows) => {
        setaddModalFlag(true);
        setEditId(rows._id);
    };

    const getRule = (queryArg = arg, filterOverrides = {}) => {
        if (selectedCampagin?.profileSendID && selectedCampagin?.selectedAdType) {
            setLoading(true);
            dispatch(handleLoader(true));
            const safeQueryArg = (queryArg && typeof queryArg === "object" && "pageNo" in queryArg) ? queryArg : arg;
            const gridNameFilter = filterOverrides.gridName ?? appliedGridNames;
            const actionNameFilter = filterOverrides.actionName ?? appliedActions;
            const tagIdsFilter = filterOverrides.tagIds ?? appliedTagIds;
            let data = {
                profileId: selectedCampagin?.profileSendID,
                fieldName: "createdAt",
                sortType: "DESC",
                ...safeQueryArg,
                ...(Array.isArray(gridNameFilter) && gridNameFilter.length > 0 ? { gridName: gridNameFilter } : {}),
                ...(Array.isArray(actionNameFilter) && actionNameFilter.length > 0 ? { actionName: actionNameFilter } : {}),
                ...(Array.isArray(tagIdsFilter) && tagIdsFilter.length > 0 ? { tagIds: tagIdsFilter } : {}),
            };
            ApiGetRules(data)
                .then((res) => {
                    setLoading(false);
                    dispatch(handleLoader(false));
                    if (res.isSuccess) {
                        setTableData(res.data);
                        setTotalRecords(res?.totalRecords);
                        if (Array.isArray(res?.allRulesSchedule)) setExistingRulesSchedule(res?.allRulesSchedule)
                    } else {
                        Toast.error(res.message);
                    }
                })
                .catch((err) => {
                    setLoading(false);
                    dispatch(handleLoader(false));
                    Toast.error(t("Something went wrong!!"));
                });
        } else {
            setLoading(false);
            dispatch(handleLoader(false));
        }
    };

    const handlePageChange = (page) => {
        setArg({ pageNo: page, perPage: perPage });
        getRule({ pageNo: page, perPage: perPage });
    };

    const handlePerRowsChange = async (newPerPage) => {
        setPerPage(newPerPage);
        setArg({ pageNo: 1, perPage: newPerPage });
        getRule({ pageNo: 1, perPage: newPerPage });
    };

    const handleSortChanged = (e) => {
        const sortModel = e.columns;
        if (!sortModel || sortModel.length === 0) return;
        const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
        getRule({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), ...arg });
    };

    useEffect(() => {
        setTableData([]);
        getRule(arg);
    }, [selectedCampagin?.profileSendID, selectedCampagin?.selectedAdType]);

    const mainConditionMaker = (
        index,
        conditionType,
        conditionOperator = [],
        conditionStatus,
        conditionValue,
        conditionValueType,
        rawCondition,
    ) => {
        const outerStyle = {
            fontSize: "13px",
            margin: "6px 0",
            paddingLeft: "15px",
            listStyleType: "none",
        };

        const isOob = String(conditionType || "").toLowerCase().replace(/[\s_]+/g, "") === "outofbudget";
        if (isOob) {
            return (
                <ul key={index} style={outerStyle}>
                    <li>
                        <span className="badge badge-light-warning text-warning" style={{ fontSize: "12px", padding: "4px 8px" }}>
                            {t("Out of Budget")}
                            {(() => {
                                const p = String(rawCondition?.oobPeriod || "").toUpperCase();
                                const days = { LAST_7_DAYS: 7, LAST_14_DAYS: 14, LAST_30_DAYS: 30 }[p] || (p === "CUSTOM" ? Number(rawCondition?.oobDays) : 0);
                                return days ? ` · ${t("Last")} ${days} ${t("days")}` : "";
                            })()}
                        </span>
                    </li>
                </ul>
            );
        }

        if (conditionStatus) {
            return (
                <ul key={index} style={outerStyle}>
                    <li>
                        <strong>{conditionType}:</strong> {conditionStatus}
                    </li>
                </ul>
            );
        }

        const operatorObj = conditionOperators?.find((x) => x.key === conditionOperator);
        const getOperator = operatorObj ? operatorObj.value : conditionOperator || "";
        const getValueType = conditionValueType === "Percentage" ? "%" : "";

        return (
            <ul key={index} style={outerStyle}>
                <li>
                    <strong>{conditionType}</strong> {getOperator} {conditionValue}{getValueType}
                </li>
            </ul>
        );
    };

    useEffect(() => {
        if (!addModalFlag) setEditData(null);
    }, [addModalFlag]);

    return (
        <>
            {!hideFilter && (
                <Filter
                    name={"Recommendation"}
                    nameShow={false}
                    dateShow={false}
                    profileShow={true}
                />
            )}
            <div className="middle_container budget_container budget-rules">
                <div className="data_content data_content_btn glass-grid-container h-maxContent" style={{ marginTop: "12px" }}>
                    <div className="camapgin_btn flex flex-wrap justify-between items-center gap-3 pt-4 pb-2 px-6">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h5 className="m-0 flex items-center cron-title-bar" style={{ fontSize: 14, color: isDark ? "#cbd5e1e0" : "#0F172A" }}>
                                {t("Recommendation")}
                            </h5>
                        </div>

                        <div className={`flex flex-wrap items-center gap-2 ${isMobile ? "w-full justify-start" : "justify-end"}`}>
                            {selectedRows.length > 0 && PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE) && (
                                <div className="flex items-center gap-2 flex-wrap mr-1">
                                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        {t("Selected")}: <span className="text-sky-600 dark:text-[#38bdf8] font-bold">{selectedRows.length}</span>
                                    </span>
                                    <div className="w-[195px]">
                                        <Select
                                            value={bulkDateFilter}
                                            onValueChange={(val) => setBulkDateFilter(val)}
                                        >
                                            <SelectTrigger className="h-[34px] text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10">
                                                <SelectValue placeholder={t("Bulk Update Date Filter")} />
                                            </SelectTrigger>
                                            <SelectContent className="z-[99999]">
                                                {DATE_FILTER_OPTION.map((opt) => (
                                                    <SelectItem key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button
                                        type="button"
                                        className="customize-button m-0 h-[34px] px-3 text-xs"
                                        disabled={!bulkDateFilter || bulkApplyLoading}
                                        onClick={handleBulkApplyDateFilter}
                                    >
                                        {bulkApplyLoading ? t("Applying...") : t("Apply")}
                                    </Button>
                                    <Button
                                        id="copy-to-other-profile-btn"
                                        type="button"
                                        className="customize-button m-0 h-[34px] px-3 text-xs flex items-center gap-1.5"
                                        onClick={handleOpenCopyProfileModal}
                                    >
                                        <FiCopy size={13} />
                                        <span>{t("Copy to Other Profile")}</span>
                                    </Button>
                                </div>
                            )}

                            <div className="flex items-center gap-2 flex-wrap">
                                <RecommendationFilterDropdown
                                    appliedFilters={appliedFilters}
                                    onSelectOption={handleFilterOptionClick}
                                    id="rule-config-filter-by-btn"
                                />
                                {PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.CREATE) && (
                                    <Button
                                        id="add-recommendation-btn"
                                        className="customize-button m-0 gap-0"
                                        style={{ height: "36px", whiteSpace: "nowrap" }}
                                        onClick={() => {
                                            setaddModalFlag(true);
                                            setEditId();
                                        }}
                                    >
                                        {isMobile ? t("Add") : t("Add Recommendation")}
                                    </Button>
                                )}


                                {PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE) && (
                                    <ImportExportMenu
                                        title={`${t("Recommendation")} (${t("Import/Export")})`}
                                        onExport={exportRecommandationRules}
                                        onImport={importRecommandationRules}
                                        selectedRows={selectedRows}
                                        permissions={{
                                            export: PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE),
                                            import: PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE),
                                        }}
                                        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                        style={{ height: "38px" }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                    {appliedFilters.length > 0 && (
                        <div style={{ padding: "0 24px" }}>
                            <RecommendationAppliedFilters
                                appliedFilters={appliedFilters}
                                onRemove={handleRemoveFilter}
                                onClearAll={handleClearAllFilters}
                                onEdit={handleEditFilter}
                                id="rule-config-applied-filters"
                            />
                        </div>
                    )}
                    {PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.VIEW_ONLY) && (
                        <div className="p-0">
                            <div className="data_table" id="recommandation-rule-table" style={{ padding: "0 24px 24px 24px" }}>
                                <AgTable
                                    onRefresh={getRule}
                                    loading={loading}
                                    ref={gridRef}
                                    tableId="recommandation-rule-table"
                                    height={"55vh"}
                                    rowData={tableData}
                                    columnDefs={columns}
                                    totalRecords={totalRecords}
                                    perPage={perPage}
                                    currentPage={arg.pageNo}
                                    onPageChange={handlePageChange}
                                    onPerPageChange={handlePerRowsChange}
                                    onSortChanged={handleSortChanged}
                                    paginationOptions={paginationRowsPerPageOptions}
                                    isCustomSaveColumns={true}
                                    customSaveColumnName={"Recommendation Rules"}
                                    handleSaveColumns={undefined}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <Dialog
                open={addModalFlag}
                onOpenChange={(isOpen) => { if (!isOpen) setaddModalFlag(false); }}
            >
                <DialogContent
                    className="sm:max-w-[1000px] premium-modal modal-content p-0 flex flex-col max-h-[90vh] overflow-hidden gap-0"
                    onInteractOutside={(e) => e.preventDefault()}
                    onEscapeKeyDown={(e) => e.preventDefault()}
                >
                    <DialogHeader className="modal-header border-b-0 p-4 pb-0">
                        <DialogTitle className="text-xl font-bold text-slate-800 dark:text-white flex justify-between items-center w-full">
                            {t('Recommendation')}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="max-h-[80vh] overflow-y-auto flex-1 !p-0 modal-body">
                        <AddRule
                            setaddModalFlag={setaddModalFlag}
                            getRule={() => {
                                getRule();
                                fetchTags();
                            }}
                            setEditId={setEditId}
                            editId={editId}
                            editData={editData}
                            setEditData={setEditData}
                            allRulesSchedule={existingRulesSchedule}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Modal */}
            <CustomModal
                show={showDeleteModal?.isOpen ?? false}
                onHide={() => setShowDeleteModal(false)}
                title={t("Delete Recommendation")}
                icon="delete"
                iconVariant="danger"
                message={`Are you sure want to delete <b>(${showDeleteModal?.data?.ruleName})</b> this recommendation?`}
                actions={[
                    { label: 'Cancel', cancel: true, icon: 'close', onClick: () => setShowDeleteModal(false) },
                    { label: 'Remove', variant: 'danger', icon: 'delete', onClick: deleteHandler },
                ]}
            />

            {/* Confirmation Modal */}
            <CustomModal
                show={statusChange?.id}
                onHide={() => setStatusChange(null)}
                title={t("Status Change")}
                icon="history"
                iconVariant="primary"
                message={`Are you sure want to change status of <b>(${statusChange?.row?.ruleName})</b> this recommendation?`}
                actions={[
                    { label: 'Cancel', cancel: true, icon: 'close', onClick: () => setStatusChange(null) },
                    { label: 'Yes', variant: 'primary', icon: 'history', onClick: () => statusHandler(statusChange) },
                ]}
            />

            {/* Campaign Selection Modal */}
            <RecommendationCampaignModal
                isOpen={showCampaignModal}
                onClose={() => {
                    setShowCampaignModal(false);
                    setSelectedRuleForCampaign(null);
                }}
                onConfirm={handleUpdateRuleCampaigns}
                initialSelectionType={selectedRuleForCampaign?.campaignSelectionType || "ALL"}
                initialCampaignIds={selectedRuleForCampaign?.campaignIds || { SP: [], SB: [], SD: [] }}
                profileId={selectedCampagin?.profileSendID}
                gridName={selectedRuleForCampaign?.gridName}
                actions={selectedRuleForCampaign?.actions || []}
                ruleName={selectedRuleForCampaign?.ruleName || ""}
            />

            {/* Copy to Other Profile Modal */}
            <Dialog
                open={showCopyProfileModal}
                onOpenChange={(open) => {
                    if (!open && !copyProfileLoading) {
                        setShowCopyProfileModal(false);
                        setSelectedCopyProfiles([]);
                    }
                }}
            >
                <DialogContent
                    className="sm:max-w-[520px] p-0 rounded-[16px] bg-white text-slate-900 border border-slate-200 dark:bg-[#0c1222] dark:border-white/10 dark:text-white flex flex-col overflow-visible gap-0 shadow-2xl"
                    onInteractOutside={(e) => {
                        if (copyProfileLoading) e.preventDefault();
                    }}
                >
                    <DialogHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131b2e] rounded-t-[16px]">
                        <DialogTitle className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <FiCopy className="text-[#1A9FD4]" />
                            {t("Copy Configuration to Other Profile")}
                        </DialogTitle>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-0">
                            {t("Select one or more profiles to copy the selected")} <b>{selectedRows.length}</b> {t("recommendation configuration(s) into.")}
                        </p>
                    </DialogHeader>

                    <div className="p-6 flex flex-col gap-4">
                        <div>
                            <label className="block mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                {t("Select Profile(s)")} <span className="text-danger">*</span>
                            </label>
                            <MultiSelect
                                options={otherProfileOptions}
                                value={selectedCopyProfiles}
                                onChange={setSelectedCopyProfiles}
                                loading={loadingProfiles}
                                placeholder={t("Select profile(s)...")}
                                maxCount={2}
                                disabled={copyProfileLoading}
                            />
                        </div>
                    </div>

                    <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 rounded-b-[16px] flex justify-end items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="px-4 py-2 text-xs font-semibold h-9"
                            disabled={copyProfileLoading}
                            onClick={() => {
                                setShowCopyProfileModal(false);
                                setSelectedCopyProfiles([]);
                            }}
                        >
                            {t("Cancel")}
                        </Button>
                        <Button
                            id="apply-copy-to-profile-btn"
                            type="button"
                            disabled={!selectedCopyProfiles.length || copyProfileLoading}
                            onClick={handleApplyCopyToProfiles}
                            className="px-4 py-2 bg-[#1A9FD4] text-white hover:opacity-90 rounded-md text-xs font-semibold h-9 flex items-center justify-center"
                        >
                            {copyProfileLoading ? (
                                <>
                                    <i className="fa fa-spinner fa-spin mr-1.5" />
                                    {t("Applying...")}
                                </>
                            ) : (
                                t("Apply")
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Filter Modal */}
            <RecommendationFilterModal
                showFilterModal={showFilterModal}
                handleModalClose={() => setShowFilterModal(false)}
                selectedFilterOption={selectedFilterOption}
                selectedGridNames={tempGridNames}
                setSelectedGridNames={setTempGridNames}
                selectedActions={tempActions}
                setSelectedActions={setTempActions}
                tagOptions={tagOptions}
                selectedTagIds={tempTagIds}
                setSelectedTagIds={setTempTagIds}
                onApply={handleApplyFilter}
                isDark={isDark}
            />
        </>
    );
}

export default RecomandationRules;
