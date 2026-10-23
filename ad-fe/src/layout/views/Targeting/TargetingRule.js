import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useContext, useState, useEffect, useRef, useMemo } from "react";
import Filter from "../../../helper/filter/Filter";
import AddRule from "./AddTargetingRule";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import {
    handleLoader,
    Link,
    Toast,
    useDispatch,
    useNavigate,
} from "../../../helper/links/Link";
import { useTranslation } from "react-i18next";
import { ApiDeleteTargetingRule, ApiGetTargetingRule, ApiManualRunTargetingRule, ApiChangeTargetingRuleStatus, ApiUpdateTargetingRule, ApiExportTargetingRule, ApiImportTargetingRule } from "../../../api-wrapper/targeting/ApiTargeting";
import { ApigetCampaign } from "../../../api-wrapper/budgetRule/ApiBudgetRule";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { conditionOperators } from "../budgetRule/column";
import moment from "moment";
import AgTable from "../../../common/grid/AgTable";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Button as ShadcnButton } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../../components/ui/dialog";
import RuleSearch from "../../component/search/RuleSearch";
import List from "../../component/search/List";
import { UpdateTargetingQuery } from "../../../utility/createQuery";
import ImportExportMenu from "../../../helper/ImportExport/ImportExportMenu";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { groupCampaignIdsByType } from "../../../utility/common";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { useTour } from "../../../tour";
import { CheckCircle2, PauseCircle, ChevronDown, X } from "lucide-react";
import KeywordSelectionModal from "../dayparting-stretegy/KeywordSelectionModal";
import TargetingRuleConfirmationModel from "./Targeting/TargetingRuleConfirmationModel";
import { Checkbox } from "../../../components/ui/checkbox";

function TargetingRule() {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [disablePinning, setDisablePinning] = useState(window.innerWidth < 1100);

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
    const { state: tourState } = useTour();
    const isTourActive = tourState.run && tourState.activeTourId === "rule";

    useEffect(() => {
        if (isTourActive) {
            setTimeout(() => {
                const viewport = document.querySelector('#targeting-rule-table .ag-body-viewport');
                if (viewport) viewport.scrollTop = 0;
            }, 100);
        }
    }, [isTourActive]);
    const [tableData, setTableData] = useState([]);
    const [editId, setEditId] = useState();
    const [existingRulesSchedule, setExistingRulesSchedule] = useState([]);
    const [adminRulesSchedule, setAdminRulesSchedule] = useState([]);

    const [perPage, setPerPage] = useState(firstPageRows);
    const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });

    const [totalRecords, setTotalRecords] = useState(0);
    const [currentPage, setcurrentPage] = useState(1);

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [runCronJob, setRunCronJob] = useState(null);
    const [statusChange, setStatusChange] = useState(null);
    const [deleteId, setDeleteId] = useState();

    const [assignId, setAssignId] = useState();
    const [allIds, setAllIds] = useState([]);
    const [campaignIds, setcampaignIds] = useState();
    const [selectAllCheck, setselectAllCheck] = useState();
    const [listId, setListId] = useState();
    const [editData, setEditData] = useState(null);

    const [searchData, setSearchData] = useState([]);
    const [campaignModal, setCampaignModal] = useState(false);
    const [selectedModal, setSelectedModal] = useState(false);
    const [addModalFlag, setaddModalFlag] = useState(false);

    const gridRef = useRef(null);

    const [loading, setLoading] = useState(true);

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

    const getRule = (queryArg = arg) => {
        if (selectedCampagin?.profileSendID && selectedCampagin?.selectedAdType) {
            setLoading(true);
            const isReload = !!queryArg?.skipLoader || !!queryArg?.isReload;
            const apiOptions = { skipLoader: true };

            let data = {
                profileId: selectedCampagin?.profileSendID,
                fieldName: "createdAt",
                sortType: "DESC",
                ...queryArg
            };
            ApiGetTargetingRule(data, apiOptions)
                .then((res) => {
                    if (res.isSuccess) {
                        setLoading(false);
                        setTableData(res.data);
                        setTotalRecords(res?.totalRecords);
                        setcurrentPage(res.currentPageNo);
                        if (Array.isArray(res?.allRulesSchedule)) setExistingRulesSchedule(res?.allRulesSchedule)
                        if (Array.isArray(res?.adminBlockedSchedule)) setAdminRulesSchedule(res?.adminBlockedSchedule)
                    } else {
                        setLoading(false);
                        Toast.error(res.message);
                    }
                })
                .catch((err) => {
                    setLoading(false);
                    Toast.error(err);
                });
        }
    };
    useEffect(() => {
        getRule(arg);
    }, [selectedCampagin?.profileSendID, selectedCampagin?.selectedAdType]);

    const handlePageChange = (page) => {
        setArg({ pageNo: page, perPage: perPage })
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

    const runHandler = (id, data) => {
        dispatch(handleLoader(true));
        ApiManualRunTargetingRule(id, { data })
            .then((res) => {
                if (res.isSuccess) {
                    Toast.success(res.message);
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

    const mainConditionMaker = (
        index,
        conditionType,
        conditionOperator = [],
        conditionStatus,
        conditionValue,
        conditionValueType,
        targetingTypes,
        campaigns = [],
        adGroups = [],
    ) => {
        const isStatus = conditionType.toLowerCase().includes("status");
        const isDate = conditionType.toLowerCase().includes("date") || conditionType.toLowerCase().includes("creation");

        if (conditionType === "CampaignsAndAdGroups") {
            return (
                <div key={index} className="flex gap-1 my-1">
                    {(campaigns || []).length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                            <strong className="text-gray-500 small" style={{ minWidth: "70px" }}>{t("Campaigns:")}</strong>
                            {(campaigns || []).map((c, i) => (
                                <span key={i} className="rule-chip rule-chip-day">{c.label}</span>
                            ))}
                        </div>
                    )}
                    {(adGroups || []).length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                            <strong className="text-gray-500 small" style={{ minWidth: "70px" }}>{t("Ad Groups:")}</strong>
                            {(adGroups || []).map((g, i) => (
                                <span key={i} className="rule-chip rule-chip-day">{g.label}</span>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        if (conditionType === "TargetingType") {
            return (
                <div key={index} className="flex flex-wrap items-center gap-1 my-1">
                    <strong className="text-gray-500 small" style={{ minWidth: "70px" }}>{conditionType}:</strong>
                    {(targetingTypes || []).map((t, i) => (
                        <span key={i} className="rule-chip rule-chip-day">{t}</span>
                    ))}
                </div>
            );
        }

        if (conditionStatus) {
            return (
                <span
                    key={index}
                    className={`rule-chip rule-chip-condition ${isStatus ? 'status' : isDate ? 'date' : 'other'}`}
                >
                    <i className="fa fa-info-circle mr-1" style={{ fontSize: "10px", opacity: 0.7 }}></i>
                    <strong>{conditionType}:</strong>&nbsp;{conditionStatus}
                </span>
            );
        }

        const operatorObj = conditionOperators?.find(
            (x) => x.key === conditionOperator
        );
        const getOperator = operatorObj ? operatorObj.value : "";
        const getValueType =
            conditionType === "Top of Search IS" ? "%" : conditionValueType === "Percentage" ? "% of bid" : "";

        return (
            <span
                key={index}
                className={`rule-chip rule-chip-condition ${isStatus ? 'status' : isDate ? 'date' : 'other'}`}
            >
                <i className={`fa ${isDate ? "fa-calendar" : "fa-bar-chart"} me-1`} style={{ fontSize: "10px", opacity: 0.7 }}></i>
                <strong>{conditionType}</strong>&nbsp;{getOperator}&nbsp;{conditionValue}{getValueType}
            </span>
        );
    };

    const statusHandler = ({ isActive, id }) => {
        let data = { isActive, ids: [id] };
        ApiChangeTargetingRuleStatus(data)
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

    const deleteHandler = () => {
        dispatch(handleLoader(true));
        ApiDeleteTargetingRule(deleteId)
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

    const selectedCampaginHandler = (ids) => {
        ApigetCampaign({ profileId: selectedCampagin?.profileSendID })
            .then((res) => {
                if (res.isSuccess) {
                    setselectAllCheck(Boolean(res?.data?.length == ids?.length));
                    setSearchData((res?.data ?? []).map((el) => ({ campaignId: el.campaignId, name: el.name, type: el.type, status: el.status })));
                }
                setCampaignModal(true);
            })
            .catch((err) => Toast.error(err));
    };

    const getSelectedId = (ids = []) => {
        ApigetCampaign({ profileId: selectedCampagin?.profileSendID })
            .then((res) => {
                if (res.isSuccess) {
                    setListId((res?.data ?? [])?.filter(el => ids?.includes(el?.campaignId)));
                    setSelectedModal(true);
                }
                else Toast.error(res?.message);
            })
            .catch((err) => Toast.error(err));
    };

    const [keywordModal, setKeywordModal] = useState({ isOpen: false, campaigns: null, selectedCampaigns: [], targetingIds: null });
    const [viewTargetsRule, setViewTargetsRule] = useState({ isOpen: false, campaigns: null, selectedCampaigns: [], targetingIds: null });

    const getSelectedTargetings = (rule) => {
        dispatch(handleLoader(true));
        ApigetCampaign({ profileId: selectedCampagin?.profileSendID })
            .then((res) => {
                if (res.isSuccess) {
                    const cIds = [...(rule?.campaignIds?.SP || []), ...(rule?.campaignIds?.SB || []), ...(rule?.campaignIds?.SD || [])];
                    const selectedCampaigns = (res.data || []).filter(c => cIds.includes(c.campaignId));
                    const groupedCampaigns = groupCampaignIdsByType(cIds, res.data || []);
                    setViewTargetsRule({
                        isOpen: true,
                        campaigns: groupedCampaigns,
                        selectedCampaigns,
                        targetingIds: rule.targetingIds || rule.hourlyConfig?.targetingIds || { SP: [], SB: [], SD: [] },
                    });
                } else {
                    Toast.error(res.message);
                }
            })
            .catch((err) => Toast.error(err))
            .finally(() => dispatch(handleLoader(false)));
    };

    const campaignHandler = () => {
        const isKeywordRule = editData?.hourlyConfig?.targetingType === "KEYWORDS" || editData?.type === "KEYWORDS";
        const campaignIdsByType = groupCampaignIdsByType(allIds, searchData);

        if (isKeywordRule) {
            const selectedCampaigns = searchData.filter((c) => allIds.includes(c.campaignId));
            setKeywordModal({
                isOpen: true,
                campaigns: campaignIdsByType,
                selectedCampaigns,
                targetingIds: editData?.targetingIds || editData?.hourlyConfig?.targetingIds || { SP: [], SB: [], SD: [] },
                assignId: assignId || editData?._id,
                editData: editData,
            });
            setCampaignModal(false);
            return;
        }

        const oldQuery = editData?.query?.SP || editData?.query?.SB || editData?.query?.SD || editData?.query;
        if (!oldQuery) {
            Toast.error(t("Something Went Wrong!"));
            return;
        }

        const finalQuery = {
            SP: UpdateTargetingQuery(oldQuery, campaignIdsByType?.SP),
            SB: UpdateTargetingQuery(oldQuery, campaignIdsByType?.SB),
            SD: UpdateTargetingQuery(oldQuery, campaignIdsByType?.SD),
        };

        const data = { campaignIds: campaignIdsByType, query: finalQuery };

        dispatch(handleLoader(true));
        ApiUpdateTargetingRule(assignId, data)
            .then((res) => {
                if (res.isSuccess) {
                    Toast.success(res.message);
                    getRule(arg);
                    setEditData(null);
                    setCampaignModal(false);
                }
                else Toast.error(res.message);
            })
            .catch((err) => Toast.error(err))
            .finally(() => dispatch(handleLoader(false)));
    };

    const keywordHandler = (targetingIds, validCampaignIds) => {
        let finalCampaigns = keywordModal.campaigns;
        if (validCampaignIds) {
            finalCampaigns = {
                SP: (keywordModal.campaigns?.SP || []).filter((id) => validCampaignIds.includes(id)),
                SB: (keywordModal.campaigns?.SB || []).filter((id) => validCampaignIds.includes(id)),
                SD: (keywordModal.campaigns?.SD || []).filter((id) => validCampaignIds.includes(id)),
            };
        }

        const currentEditData = keywordModal.editData || editData;
        const currentAssignId = keywordModal.assignId || assignId || currentEditData?._id;

        const oldQuery = currentEditData?.query?.SP || currentEditData?.query?.SB || currentEditData?.query?.SD || currentEditData?.query;
        const finalQuery = oldQuery ? {
            SP: UpdateTargetingQuery(oldQuery, finalCampaigns?.SP),
            SB: UpdateTargetingQuery(oldQuery, finalCampaigns?.SB),
            SD: UpdateTargetingQuery(oldQuery, finalCampaigns?.SD),
        } : currentEditData?.query;

        const data = {
            campaignIds: finalCampaigns,
            targetingIds,
            ...(currentEditData?.hourlyConfig && {
                hourlyConfig: {
                    ...currentEditData.hourlyConfig,
                    targetingIds,
                },
            }),
            ...(finalQuery && { query: finalQuery }),
        };

        if (!currentAssignId) {
            Toast.error(t("Something went wrong. Rule ID not found."));
            return;
        }

        dispatch(handleLoader(true));
        ApiUpdateTargetingRule(currentAssignId, data)
            .then((res) => {
                if (res.isSuccess) {
                    Toast.success(res.message || "Rule updated successfully");
                    getRule(arg);
                    setEditData(null);
                } else {
                    Toast.error(res.message || "Failed to update rule");
                }
            })
            .catch((err) => Toast.error(err?.message || "Failed to update rule"))
            .finally(() => dispatch(handleLoader(false)));

        setKeywordModal({ isOpen: false, campaigns: null, selectedCampaigns: [], targetingIds: null });
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
            pinned: (disablePinning || isTourActive) ? null : "left",
            lockPinned: !(disablePinning || isTourActive),
            suppressMovable: true,
            sortable: false,
            resizable: false,
            headerComponent: () => {
                const toggleAll = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (!selectAll) {
                        setSelectedRows(tableData.map(row => row?._id));
                        setSelectAll(true);
                    } else {
                        setSelectedRows([]);
                        setSelectAll(false);
                    }
                };
                return (
                    <div className="flex items-center justify-center w-full h-full cursor-pointer" onClick={toggleAll} onMouseDown={(e) => e.stopPropagation()}>
                        <Checkbox checked={selectAll} className="pointer-events-none" />
                    </div>
                );
            },
            cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const isChecked = selectedRows.includes(row?._id);

                const toggleRow = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const rowId = row?._id;
                    if (!rowId) return;

                    if (!isChecked) {
                        setSelectedRows(prev => [...prev, rowId]);
                    } else {
                        setSelectedRows(prev => prev.filter(id => id !== rowId));
                        setSelectAll(false);
                    }
                };

                return (
                    <div className="flex items-center justify-center w-full h-full cursor-pointer" onClick={toggleRow} onMouseDown={(e) => e.stopPropagation()}>
                        <Checkbox checked={isChecked} disabled={!row?._id} className="pointer-events-none" />
                    </div>
                );
            },
        },

        // ── Action ────────────────────────────────────────────────────────────────
        ...(PermissionCheck(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE) || PermissionCheck(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.REMOVE) ? [
            {
                headerName: t("Action"),
                field: "action",
                title: t("Action"),
                width: 200,
                minWidth: 190,
                pinned: (disablePinning || isTourActive) ? null : "left",
                lockPinned: !(disablePinning || isTourActive),
                suppressMovable: true,
                sortable: false,
                resizable: false,
                cellRenderer: (params) => {
                    const rows = params.data;
                    if (!rows) return null;
                    return (
                        <div className="action_container gap-2 flex items-center" style={{ height: "100%" }}>
                            {PermissionCheck(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE) && (
                                <i
                                    id={params.node.rowIndex === 0 ? "targeting-rule-edit-btn" : undefined}
                                    className="fa fa-pencil cursor-pointer"
                                    onClick={() => {
                                        setEditData(rows);
                                        setaddModalFlag(true);
                                        setEditId(rows?._id);
                                    }}
                                />
                            )}
                            {PermissionCheck(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.REMOVE) && (
                                <i
                                    id={params.node.rowIndex === 0 ? "targeting-rule-delete-btn" : undefined}
                                    className="fa fa-trash cursor-pointer"
                                    onClick={() => {
                                        setShowDeleteModal({ isOpen: true, data: rows });
                                        setDeleteId(rows._id);
                                    }}
                                ></i>
                            )}
                            {PermissionCheck(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE) && (
                                <i
                                    id={params.node.rowIndex === 0 ? "targeting-rule-link-btn" : undefined}
                                    className="fa fa-link cursor-pointer"
                                    title={t("Assign Campaigns")}
                                    onClick={() => {
                                        setAssignId(rows._id);
                                        setEditData(rows)
                                        setcampaignIds([...(rows?.campaignIds?.SP ?? []), ...(rows?.campaignIds?.SB ?? []), ...(rows?.campaignIds?.SD ?? [])]);
                                        selectedCampaginHandler([...(rows?.campaignIds?.SP ?? []), ...(rows?.campaignIds?.SB ?? []), ...(rows?.campaignIds?.SD ?? [])]);
                                    }}
                                />
                            )}
                            {PermissionCheck(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE) && (
                                <ShadcnButton variant="ghost" size="sm" id={params.node.rowIndex === 0 ? "targeting-rule-run-btn" : undefined} disabled={!rows.isActive} title={!rows.isActive ? t("Enable the rule to run it manually") : t("Run Rule")} className="run_icon font-bold h-7 px-2 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setRunCronJob(rows)}>
                                    {t("Run")}
                                </ShadcnButton>
                            )}
                        </div>
                    );
                },
            },
        ] : []),

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
                    <div id={params.node.rowIndex === 0 ? "targeting-rule-status-toggle" : undefined}>
                        <Switch
                            checked={row.isActive}
                            onCheckedChange={(checked) => setStatusChange({ isActive: checked, id: row?._id, row })}
                            disabled={!PermissionCheck(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE)}
                        />
                    </div>
                );
            },
        },

        // ── Rule Name ─────────────────────────────────────────────────────────────
        {
            headerName: t("ruleName"),
            field: "ruleName",
            title: "Rule Name",
            width: 230,
            sortable: true,
            resizable: true,
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                return (
                    <div>
                        <p>{row.ruleName}</p>
                        <p><b>{t("Created By:")}</b> {row.userName}</p>
                    </div>
                );
            },
        },

        // ── Conditions ────────────────────────────────────────────────────────────
        {
            headerName: t("conditions"),
            field: "conditions",
            title: t("Conditions"),
            width: 320,
            sortable: false,
            resizable: true,
            autoHeight: true,
            wrapText: true,
            cellRenderer: (params) => {
                const e = params.data;
                if (!e) return null;
                const isReportDate = Boolean(e?.reportDate) && DATE_FILTER_OPTION.find(day => day?.value === e?.reportDate)
                return (
                    <div className="flex flex-wrap gap-1 py-2">
                        {isReportDate && (
                            <span className="rule-chip rule-chip-date">
                                <i className="fa fa-calendar-check-o mr-1" style={{ fontSize: "10px" }}></i>
                                <b>{t("Date:")} </b>&nbsp;{isReportDate?.label ? t(isReportDate.label) : "—"} {e?.toDate ? `(${e?.toDate})` : ""}
                            </span>
                        )}
                        {e?.conditions?.map((el, index) => {
                            return mainConditionMaker(
                                index,
                                el?.conditionType,
                                el?.conditionOperator,
                                el?.conditionStatus,
                                el?.conditionValue,
                                el?.conditionValueType,
                                el?.targetingTypes,
                                el?.campaigns,
                                el?.adGroups,
                            );
                        })}
                    </div>
                );
            },
        },

        // ── Action Type ───────────────────────────────────────────────────────────
        {
            headerName: t("actionType"),
            field: "actionType",
            title: t("Action Type"),
            width: 280,
            sortable: false,
            resizable: true,
            autoHeight: true,
            wrapText: true,
            cellRenderer: (params) => {
                const e = params.data;
                if (!e) return null;

                const ACTION_LABEL_MAP = {
                    Paused: t("Targeting Paused"),
                    Enabled: t("Targeting Enabled"),
                    CampaignPaused: t("Campaign Paused"),
                    CampaignEnabled: t("Campaign Enabled"),
                    AdGroupPaused: t("AdGroup Paused"),
                    AdGroupEnabled: t("AdGroup Enabled"),
                };

                const { actionName, actionValue, actionValueType } = e?.actionType || {};
                const isHourly = Boolean(e?.isHourlyBid || e?.isHourlyBudget);
                const percentText = actionValueType === "Percentage" ? "% of bid" : "";
                let action = "";
                if (ACTION_LABEL_MAP[actionName]) {
                    action = ACTION_LABEL_MAP[actionName];
                } else if (actionName === "SetBid") {
                    action = isHourly ? t("Set Bid (Hourly)") : `${t("Set Bid to")} ${actionValue}`;
                } else {
                    action = isHourly ? `${t(actionName)} ${t("Bid (Hourly)")}` : `${t(actionName)} ${t("bid by")} ${actionValue}${percentText}`;
                }
                const isIncrease = actionName?.includes("Enabled") || actionName?.includes("Increase") || actionName?.includes("Top");
                const isDecrease = actionName?.includes("Decrease");
                const isPaused = actionName?.includes("Paused");

                const getActionIcon = () => {
                    if (actionName?.includes("Enabled")) return "fa-check-circle text-success";
                    if (actionName?.includes("Paused")) return "fa-pause-circle text-warning";
                    if (actionName?.includes("Increase") || actionName?.includes("Top")) return "fa-arrow-circle-up text-success";
                    if (actionName?.includes("Decrease")) return "fa-arrow-circle-down text-danger";
                    return "fa-info-circle text-primary";
                };

                return (
                    <div className="py-2">
                        <div className="font-bold text-dark" style={{ fontSize: "13px" }}>
                            <i className={`fa ${getActionIcon()} me-1`}></i>
                            {action}
                        </div>
                        <div className="text-gray-500" style={{ fontSize: "11px", marginTop: "4px" }}>
                            <i className="fa fa-history mr-1"></i>
                            <b>{t("Last Run:")} </b>{e.lastRun ? e.lastRun : t("Never")}
                        </div>
                    </div>
                );
            },
        },

        // ── Assign Campaign ───────────────────────────────────────────────────────
        {
            headerName: t("assignCampaign"),
            field: "assignCampaign",
            title: t("Assign Campaign"),
            width: 230,
            minWidth: 200,
            sortable: false,
            resizable: true,
            cellClass: "flex items-center overflow-hidden",
            cellRenderer: (params) => {
                const e = params.data;
                if (!e) return null;
                const cIds = [...(e?.campaignIds?.SP ?? []), ...(e?.campaignIds?.SB ?? []), ...(e?.campaignIds?.SD ?? [])];
                const isKeywordRule = e?.hourlyConfig?.targetingType === "KEYWORDS" || e?.type === "KEYWORDS";
                const targetingCount = (e?.targetingIds?.SP?.length || 0) + (e?.targetingIds?.SB?.length || 0) + (e?.targetingIds?.SD?.length || 0);

                if (isKeywordRule) {
                    return (
                        <div
                            onClick={() => getSelectedTargetings(e)}
                            className="cursor-pointer rule-chip rule-chip-assign max-w-full truncate inline-flex items-center"
                            title={`${cIds?.length} ${t("Campaigns")} (${targetingCount} ${t("Targets")})`}
                        >
                            <i className="fa fa-bullseye mr-1 shrink-0"></i>
                            <span className="truncate">{cIds?.length} {t("Campaigns")} ({targetingCount} {t("Targets")})</span>
                        </div>
                    );
                }

                return (
                    <div
                        onClick={() => getSelectedId(cIds)}
                        className="cursor-pointer rule-chip rule-chip-assign max-w-full truncate inline-flex items-center"
                        title={`${cIds?.length} ${t("Campaigns")}`}
                    >
                        <i className="fa fa-bullseye mr-1 shrink-0"></i>
                        <span className="truncate">{cIds?.length} {t("Campaigns")}</span>
                    </div>
                );
            },
        },

        // ── Trigger At ────────────────────────────────────────────────────────────
        {
            headerName: t("TriggerAt"),
            field: "days",
            title: "Trigger At",
            width: 280,
            minWidth: 280,
            sortable: false,
            resizable: true,
            autoHeight: true,
            wrapText: true,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;

                const chipStyle = {
                    background: "#f1f5f9",
                    color: "#334155",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: "600",
                    border: "1px solid #e2e8f0"
                };

                return (
                    <div className="py-2 flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                            <span className="text-gray-500 font-semibold" style={{ fontSize: "11px" }}>{t("Days:")}</span>
                            <div className="flex flex-wrap gap-1">
                                {row.days?.map((el, index) => (
                                    <span key={index} className="rule-chip rule-chip-day">{t(el)}</span>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-gray-500 font-semibold" style={{ fontSize: "11px" }}>{t("Times:")}</span>
                            <div className="flex flex-wrap gap-1">
                                {(row.isHourlyBid || row.isHourlyBudget) ? (
                                    <span className="rule-chip rule-chip-time" style={{ background: "#e0f2fe", color: "#0369a1", borderColor: "#bae6fd" }}>
                                        <i className="fa fa-clock-o mr-1"></i>
                                        {t("Hourly Schedule")} ({row.hourlyConfig?.slots?.filter(s => s.enabled !== false)?.length || 0} {t("slots")})
                                    </span>
                                ) : (
                                    row.times?.map((el, index) => (
                                        <span key={index} className="rule-chip rule-chip-time">{el}</span>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                );
            },
        },

        // ── Created At ────────────────────────────────────────────────────────────
        {
            headerName: t("createdAt"),
            field: "createdAt",
            title: "Created At",
            width: 150,
            sortable: true,
            resizable: true,
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                if (!params.data) return null;
                return moment(params.value)
                    .tz(params.data?.timezone && params.data?.timezone)
                    .format("MM/DD/YYYY hh:mm:ss A z");
            },
        },

        // ── Updated At ────────────────────────────────────────────────────────────
        {
            headerName: t("updatedAt"),
            field: "updatedAt",
            title: "Updated At",
            width: 150,
            sortable: true,
            resizable: true,
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                if (!params.data) return null;
                return moment(params.value)
                    .tz(params.data?.timezone && params.data?.timezone)
                    .format("MM/DD/YYYY hh:mm:ss A z");
            },
        },
    ], [disablePinning, isTourActive, tableData, selectedRows, selectAll, t]);


    const exportTargetingRules = async (exportIds) => {
        try {
            const response = await ApiExportTargetingRule({ profileId: selectedCampagin?.profileSendID, exportIds });

            const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const url = window.URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;

            link.setAttribute("download", `TargetingRules_${selectedCampagin?.profileSendID}.xlsx`);
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

    const importTargetingRules = async (file, duplicateAction) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("profileId", selectedCampagin?.profileSendID);
        formData.append("duplicateAction", duplicateAction);

        try {
            const res = await ApiImportTargetingRule(formData);

            if (res.isSuccess) {
                if (res.errorCount > 0) {
                    // Show all errors
                    res.errors.forEach(err => Toast.error(`Row ${err.row}: ${err.message}`));
                } else {
                    Toast.success(res.message || "Import completed successfully");
                    getRule();
                }
            } else {
                Toast.error(res.message || "Import failed");
            }

        } catch (err) {
            Toast.error(err.message || "Something went wrong during import");
        }
    };

    const handleAction = (action) => {
        if (action === "enable-all" || action === "disable-all") {
            let data = { isActive: action === "enable-all" ? true : false, ids: [...selectedRows] };
            ApiChangeTargetingRuleStatus(data)
                .then((res) => {
                    if (res.isSuccess) {
                        Toast.success(res.message || "Success");
                        getRule(arg);
                    } else {
                        Toast.error(res.message || "error");
                    }
                })
                .catch((err) => {
                    Toast.error(err.message || "Something went wrong");
                });
        }
    };

    return (
        <div className="targeting-tracking-container" id="rule-page">
            <Filter
                nameShow={false}
                dateShow={false}
                profileShow={true}
            />
            <div className="middle_container budget_container budget-rules">
                {/* Glass Grid Container Wrapper */}
                <div className="data_content data_content_btn m-0" style={{ padding: 0, border: "none", boxShadow: "none" }}>
                    {/* Glass Grid Container */}
                    <div className="glass-grid-container overflow-hidden">
                        {/* Table actions bar */}
                        <div
                            className="data_model_btn camapgin_btn"
                            style={{
                                display: "flex",
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "flex-start",
                                flexWrap: "wrap",
                                gap: 10,
                                padding: isMobile ? "10px 14px" : "12px 24px",
                            }}
                        >
                            {/* Title */}
                            <div className="flex-1 sm:flex-none whitespace-nowrap">
                                <h5 className="m-0 font-bold">{t("Targeting Rules")}</h5>
                            </div>

                            {/* Actions Group (Right Aligned) */}
                            <div className="flex flex-wrap items-center gap-2 ml-auto">

                                {/* History Button */}
                                {PermissionCheck(SYSTEM_PAGES.TARGETING_RULE_HISTORY, PAGE_ACTIONS.VIEW_ONLY) && (
                                    <ShadcnButton
                                        variant="outline"
                                        id="rule-history"
                                        onClick={() => navigate("/targeting-rule-history")}
                                        className="customize-button m-0 gap-0 custom-secondary-btn"
                                    >
                                        {t("History")}
                                    </ShadcnButton>
                                )}

                                {/* Bulk Actions (Contextual) */}
                                {(selectedRows?.length > 0 || isTourActive) && PermissionCheck(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE) && (
                                    <div id="bulk-actions-dropdown" style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <ShadcnButton
                                                    variant="outline"
                                                    className="customize-button m-0 gap-1.5 whitespace-nowrap"
                                                >
                                                    {t("Bulk actions")}
                                                    <ChevronDown className="w-3.5 h-3.5 ml-0.5 opacity-60" />
                                                </ShadcnButton>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="start" className="w-52 p-1.5 bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-xl shadow-lg z-[9999]">
                                                <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg mb-1 border border-slate-100 dark:border-slate-800/80">
                                                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t("Selected")}</span>
                                                    <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-900/40">
                                                        {selectedRows?.length || 0} {selectedRows?.length === 1 ? t("row") : t("rows")}
                                                    </span>
                                                </div>
                                                <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />
                                                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2.5 py-1">
                                                    {t("Status")}
                                                </DropdownMenuLabel>
                                                <DropdownMenuItem
                                                    onClick={() => handleAction("enable-all")}
                                                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 rounded-lg cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-700 dark:hover:text-emerald-400 focus:bg-emerald-50 dark:focus:bg-emerald-950/30 focus:text-emerald-700 dark:focus:text-emerald-400 transition-colors"
                                                >
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                    <span>{t("Enabled All")}</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => handleAction("disable-all")}
                                                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 rounded-lg cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-700 dark:hover:text-amber-400 focus:bg-amber-50 dark:focus:bg-amber-950/30 focus:text-amber-700 dark:focus:text-amber-400 transition-colors"
                                                >
                                                    <PauseCircle className="w-4 h-4 text-amber-500" />
                                                    <span>{t("Disabled All")}</span>
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                )}

                                {/* Add Rule Button */}
                                {PermissionCheck(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.CREATE) && (
                                    <div id="rule-add" style={{ display: "inline-flex", borderRadius: "8px" }}>
                                        <ShadcnButton
                                            className="h-[36px] bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] text-white hover:opacity-90 border-0 whitespace-nowrap px-4 font-semibold shadow-sm"
                                            onClick={() => {
                                                setaddModalFlag(true);
                                                setEditId();
                                            }}
                                        >
                                            <i className="fa fa-plus"></i>
                                            {isMobile ? t("Add") : t("addRule")}
                                        </ShadcnButton>
                                    </div>
                                )}

                                {/* Import/Export Menu */}
                                {PermissionCheck(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE) && (
                                    <div id="rule-import-export">
                                        <ImportExportMenu
                                            title={`${t("Targeting Rules")} (${t("Import/Export")})`}
                                            onExport={exportTargetingRules}
                                            onImport={importTargetingRules}
                                            selectedRows={selectedRows}
                                            permissions={{
                                                export: PermissionCheck(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE),
                                                import: PermissionCheck(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE),
                                            }}
                                            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {PermissionCheck(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.VIEW_ONLY) && (
                            <div className="data_table position-relative" id="targeting-rule-table" style={{ padding: "0 14px 14px 14px" }}>
                                <AgTable
                                    ref={gridRef}
                                    tableId="targeting-rule-table"
                                    height="calc(100vh - 260px)"
                                    loading={loading}
                                    onRefresh={() => getRule({ ...arg, isReload: true, skipLoader: true })}
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
                                    customSaveColumnName={"Targeting Rule"}
                                    handleSaveColumns={undefined}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <Dialog open={addModalFlag} onOpenChange={setaddModalFlag}>
                    <DialogContent id="rule-add-modal" hideCloseButton={true} className="w-[92vw] max-w-5xl p-0 gap-0 overflow-hidden bg-white dark:bg-[#0f172a] border-slate-200 dark:border-white/10" style={{ zIndex: 9999 }}>
                        <DialogHeader className="px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                            <DialogTitle className="text-xl font-bold text-slate-800 dark:text-white flex justify-between items-center w-full" id="rule-close">
                                {t('Targeting Rules')}
                                <button className="absolute right-4 top-4 rounded-full border border-gray-300 dark:border-gray-600 p-1.5 opacity-70 ring-offset-background transition-all text-slate-800 dark:text-slate-200 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground" onClick={() => setaddModalFlag(false)}>
                                    <X className="h-5 w-5" />
                                    <span className="sr-only">{t("Close")}</span>
                                </button>
                            </DialogTitle>
                            <DialogDescription className="hidden"></DialogDescription>
                        </DialogHeader>
                        <div id="modelAddRule" className="max-h-[80vh] overflow-y-auto">
                            <AddRule
                                setaddModalFlag={setaddModalFlag}
                                editData={editData}
                                setEditData={setEditData}
                                getRule={getRule}
                                setEditId={setEditId}
                                editId={editId}
                                allRulesSchedule={existingRulesSchedule}
                                adminRulesSchedule={adminRulesSchedule}
                            />
                        </div>
                    </DialogContent>
                </Dialog>

                <TargetingRuleConfirmationModel
                    showModal={runCronJob?._id}
                    setShowModal={() => setRunCronJob()}
                    ruleId={runCronJob?._id}
                    ruleData={runCronJob}
                    onConfirm={(tableData) => runHandler(runCronJob?._id, tableData)}
                    title={runCronJob?.ruleName ? `${t("Targeting Rule")}: ${runCronJob.ruleName}` : t("Targeting Rule")}
                />

                {/* Delete Modal */}
                <CustomModal
                    show={showDeleteModal?.isOpen ?? false}
                    onHide={() => setShowDeleteModal(false)}
                    title={t("Delete Rule")}
                    icon="delete"
                    iconVariant="danger"
                    message={t("Are you sure want to delete ({{name}}) this rule?", { name: showDeleteModal?.data?.ruleName })}
                    actions={[
                        { label: t('Cancel'), cancel: true, icon: 'close', onClick: () => setShowDeleteModal(false) },
                        { label: t('Remove'), variant: 'danger', icon: 'delete', onClick: deleteHandler },
                    ]}
                />

                {/* Confirmation Modal */}
                <CustomModal
                    show={statusChange?.id}
                    onHide={() => setStatusChange(null)}
                    title={t("Status Change")}
                    icon="history"
                    iconVariant="primary"
                    message={t("Are you sure want to change status of ({{name}}) this rule?", { name: statusChange?.row?.ruleName })}
                    actions={[
                        { label: t('Cancel'), cancel: true, icon: 'close', onClick: () => setStatusChange(null) },
                        { label: t('Yes'), variant: 'primary', icon: 'history', onClick: () => statusHandler(statusChange) },
                    ]}
                />

                {/* campaign modal */}
                <CustomModal
                    show={campaignModal}
                    onHide={() => { setCampaignModal(false); setEditData(null); }}
                    title={t('assignCampaign')}
                    subtitle={t("Campaign assignment")}
                    icon="campaign"
                    iconVariant="primary"
                    size="lg"
                    closeOnBackdrop={true}
                    actions={[
                        {
                            label: t('reset'),
                            cancel: true,
                            icon: 'close',
                            onClick: () => {
                                setCampaignModal(false);
                                setEditData(null);
                            },
                        },
                        {
                            label: (editData?.hourlyConfig?.targetingType === "KEYWORDS" || editData?.type === "KEYWORDS") ? t('Next') : t('save'),
                            variant: 'primary',
                            icon: (editData?.hourlyConfig?.targetingType === "KEYWORDS" || editData?.type === "KEYWORDS") ? 'arrow_right' : 'save',
                            onClick: () => campaignHandler(),
                        },
                    ]}
                >
                    <RuleSearch
                        campaignList={searchData}
                        allIds={allIds}
                        setAllIds={setAllIds}
                        campaignIds={campaignIds}
                        selectAllCheck={selectAllCheck}
                        setselectAllCheck={setselectAllCheck}
                        allRules={existingRulesSchedule}
                        currentRuleId={assignId || editData?._id}
                    />
                </CustomModal>

                {/* selected campaign */}
                <CustomModal
                    show={selectedModal}
                    onHide={() => setSelectedModal(false)}
                    title={t("Associated Campaigns")}
                    subtitle={t("View only")}
                    icon="campaign"
                    iconVariant="primary"
                    size="lg"
                    closeOnBackdrop={true}
                    actions={[
                        {
                            label: t('close'),
                            cancel: true,
                            icon: 'close',
                            onClick: () => setSelectedModal(false),
                        },
                    ]}
                >
                    <List listId={listId} />
                </CustomModal>

                {keywordModal.isOpen && (
                    <KeywordSelectionModal
                        show={keywordModal.isOpen}
                        onHide={() => setKeywordModal({ isOpen: false, campaigns: null, selectedCampaigns: [], targetingIds: null })}
                        campaigns={keywordModal.campaigns}
                        selectedCampaigns={keywordModal.selectedCampaigns || []}
                        initialTargetingIds={keywordModal.targetingIds}
                        profileId={selectedCampagin?.profileSendID}
                        onSave={keywordHandler}
                        onBack={() => {
                            setKeywordModal({ isOpen: false, campaigns: null, selectedCampaigns: [], targetingIds: null });
                            setcampaignIds(allIds);
                            setCampaignModal(true);
                        }}
                    />
                )}

                {viewTargetsRule.isOpen && (
                    <KeywordSelectionModal
                        show={viewTargetsRule.isOpen}
                        onHide={() => setViewTargetsRule({ isOpen: false, campaigns: null, selectedCampaigns: [], targetingIds: null })}
                        campaigns={viewTargetsRule.campaigns}
                        selectedCampaigns={viewTargetsRule.selectedCampaigns || []}
                        initialTargetingIds={viewTargetsRule.targetingIds}
                        profileId={selectedCampagin?.profileSendID}
                        viewOnly={true}
                    />
                )}
            </div>
        </div>
    );
}

export default TargetingRule;
