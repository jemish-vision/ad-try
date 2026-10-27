import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useContext, useState, useEffect, useRef, useMemo } from "react";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import AddRule from "./AddRule";
import RecommendationCampaignModal from "./RecommendationCampaignModal";
import { ApiDeleteRule, ApiGetRules, ApiStatusChange, ApiExportRecommandationRule, ApiImportRecommandationRule, ApiUpdateRules } from "../../../api-wrapper/recommendation/ApiRecommendation";
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

function RecomandationRules({ hideFilter = false } = {}) {
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
                                el?.conditionValueType
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

                if (!e.actions || e.actions.length === 0) {
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
                        {e.actions.map((action, index) => (
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

    const getRule = (queryArg = arg) => {
        if (selectedCampagin?.profileSendID && selectedCampagin?.selectedAdType) {
            setLoading(true);
            dispatch(handleLoader(true));
            let data = {
                profileId: selectedCampagin?.profileSendID,
                fieldName: "createdAt",
                sortType: "DESC",
                ...queryArg,
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
                        <div className="flex items-center">
                            <h5 className="m-0 flex items-center cron-title-bar" style={{ fontSize: 14, color: isDark ? "#cbd5e1e0" : "#0F172A" }}>
                                {t("Recommendation")}
                            </h5>
                        </div>

                        <div className={`flex flex-wrap items-center gap-2 ${isMobile ? "w-full justify-start" : "justify-end"}`}>
                            <div className="flex items-center gap-2">
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
                            getRule={getRule}
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
        </>
    );
}

export default RecomandationRules;
