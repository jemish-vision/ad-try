import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { useContext, useState, useEffect, useRef, useMemo } from "react";
import { Button as ShadcnButton } from "../../../components/ui/button";
import Filter from "../../../helper/filter/Filter";
import AddSearchTermRule from "./SearchTerms/AddSearchTermRule";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import {
    handleLoader,
    Toast,
    useDispatch,
    useNavigate,
} from "../../../helper/links/Link";
import { useTranslation } from "react-i18next";
import { ApiDeleteSearchTermRule, ApiGetSearchTermRule, ApiManualRunSearchTermRule, ApiChangeSearchTermRuleStatus, ApiUpdateSearchTermRule, ApiExportSearchTermRule, ApiImportSearchTermRule, ApiRuleEffectedSearchTerms } from "../../../api-wrapper/search-term/ApiSearchTerm";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { conditionOperators } from "../budgetRule/column";
import moment from "moment";
import AgTable from "../../../common/grid/AgTable";

import { ApigetCampaign } from "../../../api-wrapper/budgetRule/ApiBudgetRule";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../../components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import RuleSearch from "../../component/search/RuleSearch";
import List from "../../component/search/List";
import { UpdateSearchTermQuery } from "../../../utility/createQuery";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import SearchTermRuleConfirmationModel from "./SearchTerms/SearchTermRuleConfirmationModel";
import SummaryModal from "../../../helper/modal/SummaryModal";
import { groupCampaignIdsByType } from "../../../utility/common";
import { StyledCheckbox } from "../../../common/grid/StyledCheckbox";
import { CustomModal } from "../../../helper/modal/CustomModal";
import ImportExportMenu from "../../../helper/ImportExport/ImportExportMenu";
import { t } from "i18next";
import { useTour } from "../../../tour";
import { Switch } from "../../../components/ui/switch";
import { CheckCircle2, PauseCircle, ChevronDown, X } from "lucide-react";

const ACTION_NAME_OPTIONS = {
    TARGETING: t("Targeting"),
    NEGATIVE_TARGETING: t("Negative Targeting"),
    CREATE_CAMPAIGN: t("Create Campaign"),
};

function SearchTermRule() {
    const { t } = useTranslation();
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
    const [disablePinning, setDisablePinning] = useState(window.innerWidth < 1100);

    useEffect(() => {
        const handleResize = () => setDisablePinning(window.innerWidth < 1100);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 1024);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    let selectedCampagin = useContext(ProfileContext);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { state: tourState } = useTour();
    const isTourActive = tourState.run && tourState.activeTourId === "search-term-rule";

    useEffect(() => {
        if (isTourActive) {
            setTimeout(() => {
                const viewport = document.querySelector('#search-term-rule-table .ag-body-viewport');
                if (viewport) viewport.scrollTop = 0;
            }, 100);
        }
    }, [isTourActive]);
    const [tableData, setTableData] = useState([]);
    const [editId, setEditId] = useState();

    const [perPage, setPerPage] = useState(firstPageRows);
    const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });

    const [totalRecords, setTotalRecords] = useState(0);

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [runCronJob, setRunCronJob] = useState(null);
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
    const [showSummary, setShowSummary] = useState(null);
    const [level, setLevel] = useState("Ad Group");
    const [addModalFlag, setaddModalFlag] = useState(false);

    const [statusChange, setStatusChange] = useState(null);

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
            let data = {
                profileId: selectedCampagin?.profileSendID,
                fieldName: "createdAt",
                sortType: "DESC",
                ...queryArg
            };
            ApiGetSearchTermRule(data)
                .then((res) => {
                    if (res.isSuccess) {
                        setLoading(false);
                        setTableData(res.data);
                        setTotalRecords(res?.totalRecords);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const runHandler = async (id, searchTermData) => {
        dispatch(handleLoader(true));
        try {
            let tableData = searchTermData;
            if (!tableData) {
                const effectedRes = await ApiRuleEffectedSearchTerms(id);
                if (effectedRes?.isSuccess) {
                    tableData = effectedRes?.data;
                }
            }
            const data = { ruleId: id, level, data: tableData };
            const res = await ApiManualRunSearchTermRule(data);
            if (res.isSuccess) {
                Toast.success(res.message);
                setRunCronJob(null);
                dispatch(handleLoader(false));
                getRule(arg);
                setShowSummary(res?.summary);
            } else {
                Toast.error(res.message);
                dispatch(handleLoader(false));
            }
            setDeleteId();
        } catch (err) {
            dispatch(handleLoader(false));
            Toast.error(t("Something went wrong!!"));
        }
    };

    const mainConditionMaker = (
        index,
        operator,
        conditionType,
        conditionOperator = [],
        conditionStatus,
        conditionValue,
        conditionMaxValue,
        conditionValueType,
        useTargetAcos,
    ) => {
        const isStatus = conditionType.toLowerCase().includes("status");
        const isDate = conditionType.toLowerCase().includes("date") || conditionType.toLowerCase().includes("creation");

        // -------- AND / OR Separator (skip for first condition) --------
        const operatorBadge = index !== 0 && operator ? (
            <div className="flex items-center gap-2 my-2 px-2">
                <div className="flex-grow-1 border-top" style={{ opacity: 0.2 }} />
                <span
                    className={`badge preserve-color rounded-pill ${operator === "OR"
                        ? "text-amber-600 bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                        : "text-sky-600 bg-sky-50 border border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20"
                        }`}
                    style={{ fontSize: "10px", padding: "3px 8px", fontWeight: "700", letterSpacing: "0.5px" }}
                >
                    {operator}
                </span>
                <div className="flex-grow-1 border-top" style={{ opacity: 0.2 }} />
            </div>
        ) : null;

        // -------- Status Type Condition --------
        if (conditionStatus) {
            return (
                <div key={index}>
                    {operatorBadge}
                    <span className={`rule-chip rule-chip-condition ${isStatus ? 'status' : isDate ? 'date' : 'other'}`}>
                        <i className="fa fa-info-circle mr-1" style={{ fontSize: "10px", opacity: 0.7 }}></i>
                        <strong>{conditionType}:</strong>&nbsp;{conditionStatus}
                    </span>
                </div>
            );
        }

        const operatorObj = conditionOperators?.find((x) => x.key === conditionOperator);
        const getOperator = operatorObj ? operatorObj.value : "";
        const getValueType = conditionValueType === "Percentage" ? ` ${t("% of bid")}` : "";

        // -------- BETWEEN Type Condition --------
        if (conditionOperator === "BETWEEN") {
            return (
                <div key={index}>
                    {operatorBadge}
                    <span className={`rule-chip rule-chip-condition ${isStatus ? 'status' : isDate ? 'date' : 'other'}`}>
                        <i className="fa fa-exchange mr-1" style={{ fontSize: "10px", opacity: 0.7 }}></i>
                        <strong>{conditionType}</strong>&nbsp;
                        <span className="text-gray-500 mx-1">{t("between")}</span> <b>{conditionValue}</b>
                        <span className="text-gray-500 mx-1">{t("and")}</span> <b>{conditionMaxValue}</b>{getValueType}
                    </span>
                </div>
            );
        }

        // -------- Normal Condition --------
        return (
            <div key={index}>
                {operatorBadge}
                <span className={`rule-chip rule-chip-condition ${isStatus ? 'status' : isDate ? 'date' : 'other'}`}>
                    <i className={`fa ${isDate ? "fa-calendar" : "fa-bar-chart"} me-1`} style={{ fontSize: "10px", opacity: 0.7 }}></i>
                    <strong>{conditionType}</strong>&nbsp;{getOperator}&nbsp;
                    {useTargetAcos ? `${t("Target ACOS")} (${conditionValue})` : conditionValue}{getValueType}
                </span>
            </div>
        );
    };

    const statusHandler = ({ isActive, id }) => {
        let data = { isActive, ids: [id] };
        ApiChangeSearchTermRuleStatus(data)
            .then((res) => {
                if (res.isSuccess) {
                    Toast.success(res.message || "Success");
                    setStatusChange(null)
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
        ApiDeleteSearchTermRule(deleteId)
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
                    setselectAllCheck(Boolean(res?.data?.length === ids?.length));
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

    const campaignHandler = () => {
        const oldQuery = editData?.query?.SP || editData?.query?.SB || editData?.query?.SD || editData?.query
        if (!oldQuery) {
            Toast.error(t("Something Went Wrong!"))
            return
        }

        const campaignIdsByType = groupCampaignIdsByType(allIds, searchData);

        const finalQuery = {
            SP: UpdateSearchTermQuery(oldQuery, campaignIdsByType?.SP),
            SB: UpdateSearchTermQuery(oldQuery, campaignIdsByType?.SB),
            SD: UpdateSearchTermQuery(oldQuery, campaignIdsByType?.SD),
        }

        const data = { campaignIds: campaignIdsByType, query: finalQuery };

        ApiUpdateSearchTermRule(assignId, data)
            .then((res) => {
                if (res.isSuccess) {
                    Toast.success(res.message);
                    getRule(arg);
                    setEditData(null)
                    setCampaignModal(false);
                }
                else Toast.error(res.message);
            })
            .catch((err) => Toast.error(err));
    };


    const exportSearchTermRules = async (exportIds) => {
        try {
            const response = await ApiExportSearchTermRule({ profileId: selectedCampagin?.profileSendID, exportIds });

            const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const url = window.URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;

            link.setAttribute("download", `SearchTermRules_${selectedCampagin?.profileSendID}.xlsx`);
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

    const importSearchTermRules = async (file, duplicateAction) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("profileId", selectedCampagin?.profileSendID);
        formData.append("duplicateAction", duplicateAction);

        try {
            const res = await ApiImportSearchTermRule(formData);

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
            pinned: (isMobile || isTourActive) ? null : "left",
            lockPinned: !(isMobile || isTourActive),
            suppressMovable: true,
            sortable: false,
            resizable: false,
            headerComponent: () => (
                <div className="flex items-center justify-center" style={{ width: "100%" }}>
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
        ...(PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.UPDATE) || PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.REMOVE) ? [
            {
                headerName: t("Action"),
                field: "action",
                title: "Action",
                width: 260,
                pinned: (isMobile || isTourActive) ? null : "left",
                lockPinned: !(isMobile || isTourActive),
                suppressMovable: true,
                sortable: false,
                resizable: false,
                cellRenderer: (params) => {
                    const rows = params.data;
                    if (!rows) return null;
                    return (
                        <div className="action_container gap-2 flex items-center" style={{ height: "100%" }}>
                            {PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.UPDATE) && (
                                <i
                                    id={params.node.rowIndex === 0 ? "search-term-rule-edit-btn" : undefined}
                                    className="fa fa-pencil cursor-pointer"
                                    onClick={() => {
                                        setEditData(rows);
                                        setaddModalFlag(true);
                                        setEditId(rows?._id);
                                    }}
                                />
                            )}
                            {PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.REMOVE) && (
                                <i
                                    id={params.node.rowIndex === 0 ? "search-term-rule-delete-btn" : undefined}
                                    className="fa fa-trash cursor-pointer"
                                    onClick={() => {
                                        setShowDeleteModal({ isOpen: true, data: rows });
                                        setDeleteId(rows._id);
                                    }}
                                ></i>
                            )}
                            {PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.UPDATE) && (
                                <i
                                    id={params.node.rowIndex === 0 ? "search-term-rule-link-btn" : undefined}
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
                            {PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.UPDATE) && (
                                <ShadcnButton id={params.node.rowIndex === 0 ? "search-term-rule-run-btn" : undefined} disabled={!rows.isActive} title={!rows.isActive ? "Enable the rule to run it manually" : "Run Rule"} className="run_icon font-bold" onClick={() => setRunCronJob(rows)}>
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
                    <div id={params.node.rowIndex === 0 ? "search-term-rule-status-toggle" : undefined} className="flex items-center">
                        <Switch
                            checked={row.isActive}
                            onCheckedChange={(checked) => setStatusChange({ isActive: checked, id: row?._id, row })}
                            disabled={!PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.UPDATE)}
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

        // ── Rule Type ─────────────────────────────────────────────────────────────
        {
            headerName: t("rule Type"),
            field: "ruleType",
            title: "Rule Type",
            sortable: true,
            resizable: true,
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                if (!params.data) return null;
                return t(params.value);
            },
        },

        // ── Conditions ────────────────────────────────────────────────────────────
        {
            headerName: t("conditions"),
            field: "conditions",
            title: "Conditions",
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
                    <div className="flex flex-col py-2">
                        {isReportDate && (
                            <div className="mb-2">
                                <span className="rule-chip rule-chip-date">
                                    <i className="fa fa-calendar-check-o mr-1" style={{ fontSize: "10px" }}></i>
                                    <b>{t("Date:")} </b>&nbsp;{isReportDate?.label ? t(isReportDate.label) : "—"} {e?.toDate ? `(${e?.toDate})` : ""}
                                </span>
                            </div>
                        )}
                        <div className="flex flex-col gap-1">
                            {e?.conditions?.map((el, index) => {
                                return mainConditionMaker(
                                    index,
                                    el?.operator,
                                    el?.conditionType,
                                    el?.conditionOperator,
                                    el?.conditionStatus,
                                    el?.conditionValue,
                                    el?.conditionMaxValue,
                                    el?.conditionValueType,
                                    el?.useTargetAcos,
                                );
                            })}
                        </div>
                    </div>
                );
            },
        },

        // ── Action Type ───────────────────────────────────────────────────────────
        {
            headerName: t("actionType"),
            field: "actionType",
            title: "Action Type",
            width: 280,
            sortable: false,
            resizable: true,
            autoHeight: true,
            wrapText: true,
            cellRenderer: (params) => {
                const e = params.data;
                if (!e) return null;
                const isNegative = e.actionType?.actionName?.toLowerCase().includes("negative");
                return (
                    <div className="py-2">
                        <div className="font-bold text-dark" style={{ fontSize: "13px" }}>
                            <i className={`fa ${isNegative ? "fa-minus-circle text-danger" : "fa-plus-circle text-success"} me-1`}></i>
                            {t(ACTION_NAME_OPTIONS[e.actionType?.actionName] || e.actionType?.actionName || "—")}
                        </div>
                        <div className="text-gray-500 mt-1" style={{ fontSize: "12px" }}>
                            <b>{t("Type:")} </b>{t(e.actionType?.actionValueType)}
                        </div>
                        <div className="text-gray-500 mt-2" style={{ fontSize: "11px" }}>
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
            title: "Assign Campaign",
            width: 140,
            sortable: false,
            resizable: true,
            cellClass: "flex items-center",
            cellRenderer: (params) => {
                const e = params.data;
                if (!e) return null;
                const cIds = [...(e?.campaignIds?.SP ?? []), ...(e?.campaignIds?.SB ?? []), ...(e?.campaignIds?.SD ?? [])];
                return (
                    <div
                        onClick={() => getSelectedId(cIds)}
                        className="cursor-pointer rule-chip rule-chip-assign"
                    >
                        <i className="fa fa-bullseye mr-1"></i>
                        {cIds?.length} {t("Campaigns")}
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [isMobile, isTourActive, selectAll, selectedRows, tableData, t]);

    const handleAction = (action) => {
        if (action === "enable-all" || action === "disable-all") {
            let data = { isActive: action === "enable-all" ? true : false, ids: [...selectedRows] };
            ApiChangeSearchTermRuleStatus(data)
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
        <div className="search-term-rule-tracking-container" id="search-term-rule-page">
            <Filter
                name={"Search Term Rule"}
                nameShow={false}
                dateShow={false}
                profileShow={true}
            />
            <div className="middle_container budget_container budget-rules">
                <div className="data_content data_content_btn m-0" style={{ padding: 0, border: "none", boxShadow: "none" }}>
                    <div className="glass-grid-container overflow-hidden">
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
                            <div style={{ flex: isMobile ? "1 1 100%" : "1 1 auto", whiteSpace: "nowrap" }}>
                                <h5 className="m-0 font-bold">{t("Search Term Rules")}</h5>
                            </div>

                            {PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE_HISTORY, PAGE_ACTIONS.VIEW_ONLY) && (
                                <ShadcnButton
                                    id="search-term-rule-history"
                                    onClick={() => navigate("/search-term-history")}
                                    className="border-none customize-button m-0 gap-0"
                                    style={{ height: "36px", whiteSpace: "nowrap" }}
                                >
                                    {t("History")}
                                </ShadcnButton>
                            )}

                            {(selectedRows?.length > 0 || isTourActive) && PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.UPDATE) && (
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

                            {PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.CREATE) && (
                                <div id="search-term-rule-add" style={{ display: "inline-flex", borderRadius: "8px" }}>
                                    <ShadcnButton
                                        className="h-[36px] bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] text-white hover:opacity-90 border-0 whitespace-nowrap px-4 font-semibold shadow-sm"
                                        style={{ height: "36px", display: "flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" }}
                                        onClick={() => {
                                            setaddModalFlag(true);
                                            setEditId();
                                        }}
                                    >
                                        <i className="fa fa-plus pr-1"></i>
                                        {isMobile ? t("Add") : t("addRule")}
                                    </ShadcnButton>
                                </div>
                            )}

                            {PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.UPDATE) && (
                                <ImportExportMenu
                                    title={`${t("Search Term Rule")} (${t("Import/Export")})`}
                                    onExport={exportSearchTermRules}
                                    onImport={importSearchTermRules}
                                    selectedRows={selectedRows}
                                    permissions={{
                                        export: PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.UPDATE),
                                        import: PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.UPDATE),
                                    }}
                                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                    style={{ height: "38px" }}
                                />
                            )}
                        </div>

                        {PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.VIEW_ONLY) && (
                            <div className="data_table position-relative" id="search-term-rule-table" style={{ padding: "0 14px 14px 14px" }}>
                                <AgTable
                                    ref={gridRef}
                                    tableId="search-term-rule-table"
                                    height={"70vh"}
                                    loading={loading}
                                    onRefresh={() => getRule()}
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
                                    customSaveColumnName={"Search Term Rule"}
                                    handleSaveColumns={undefined}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Confirmation Modal */}
                <CustomModal
                    show={runCronJob?._id && runCronJob?.ruleType === "AUTO"}
                    onHide={() => setRunCronJob(null)}
                    title={t("Run Auto Rule")}
                    icon="apply"
                    iconVariant="primary"
                    message={t("Are you sure want to run ({{name}}) this rule?", { name: runCronJob?.ruleName })}
                    actions={[
                        { label: t('Cancel'), cancel: true, icon: 'close', onClick: () => setRunCronJob(null) },
                        { label: t('Run'), variant: 'primary', icon: 'apply', onClick: () => runHandler(runCronJob?._id) },
                    ]}
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

                <SearchTermRuleConfirmationModel
                    showModal={runCronJob?._id && runCronJob?.ruleType === "MANUAL"}
                    level={level}
                    setLevel={setLevel}
                    type={runCronJob?.actionType?.actionName}
                    actionValue={runCronJob?.actionType?.actionValueType}
                    setShowModal={() => setRunCronJob()}
                    ruleId={runCronJob?._id}
                    onConfirm={(tableData) => runHandler(runCronJob?._id, tableData)}
                    title={runCronJob?.ruleName ? `${t("Search Term Rule")}: ${runCronJob.ruleName}` : t("Search Term Rule")}
                />

                <SummaryModal show={showSummary} onClose={() => setShowSummary(null)} summary={showSummary} />

                <Dialog open={addModalFlag} onOpenChange={setaddModalFlag}>
                    <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden bg-white dark:bg-[#0f172a] border-slate-200 dark:border-white/10" id="search-term-rule-modal">
                        <DialogHeader className="px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                            <DialogTitle className="text-xl font-bold text-slate-800 dark:text-white" id="search-term-rule-modal-title">
                                {editId ? t("Edit Search Term Rule") : t("Create Search Term Rule")}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="max-h-[80vh] overflow-y-auto" id="search-term-rule-modal-body">
                            <AddSearchTermRule
                                setaddModalFlag={setaddModalFlag}
                                editData={editData}
                                setEditData={setEditData}
                                getRule={getRule}
                                setEditId={setEditId}
                                editId={editId}
                            />
                        </div>
                    </DialogContent>
                </Dialog>

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
                            label: t('save'),
                            variant: 'primary',
                            icon: 'save',
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
            </div>
        </div>
    );
}

export default SearchTermRule;
