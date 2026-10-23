import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useContext, useState, useEffect, useRef, useMemo } from "react";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button as ShadcnButton } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { ChevronDown, CheckCircle2, PauseCircle, X } from "lucide-react";
import AddRule from "./AddRule";
import {
  ApigetRule,
  ApideleteRule,
  ApistatusChange,
  ApigetCampaign,
  ApiupdateRule,
  ApiRun,
  ApiExportBudgetRule,
  ApiImportBudgetRule,
} from "../../../api-wrapper/budgetRule/ApiBudgetRule";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import {
  handleLoader,
  Toast,
  useDispatch,
  Link,
  useNavigate,
} from "../../../helper/links/Link";
import { conditionOperators, subValueType } from "./column";
import RuleSearch from "../../component/search/RuleSearch";
import List from "../../component/search/List";
import moment from "moment";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useTranslation } from "react-i18next";
import ImportExportMenu from "../../../helper/ImportExport/ImportExportMenu";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { UpdateBudgetQuery } from "../../../utility/createQuery";
import { groupCampaignIdsByType } from "../../../utility/common";
import BudgetRuleConfirmationModel from "./BudgetRuleConfirmationModel";
import { t } from "i18next";
import { Checkbox } from "../../../components/ui/checkbox";
import { Switch } from "../../../components/ui/switch";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { useTour } from "../../../tour";

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

function BudgetRule() {
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
  const isTourActive = tourState.run && tourState.activeTourId === "budget-rules";

  useEffect(() => {
    if (isTourActive) {
      setTimeout(() => {
        const viewport = document.querySelector('#budget-rule-table .ag-body-viewport');
        if (viewport) viewport.scrollTop = 0;
      }, 100);
    }
  }, [isTourActive]);

  const [tableData, setTableData] = useState([]);

  const [selectedRows, setSelectedRows] = useState([]);
  const [selectAll, setSelectAll] = useState(false);

  const [editData, setEditData] = useState(null);
  const gridRef = useRef(null);

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
            setSelectedRows(tableData.map((row) => row?._id));
            setSelectAll(true);
          } else {
            setSelectedRows([]);
            setSelectAll(false);
          }
        };
        return (
          <div
            className="flex items-center justify-center w-full h-full cursor-pointer"
            onClick={toggleAll}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Checkbox checked={selectAll} className="pointer-events-none" />
          </div>
        );
      },
      cellStyle: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      },
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
            setSelectedRows((prev) => [...prev, rowId]);
          } else {
            setSelectedRows((prev) => prev.filter((id) => id !== rowId));
            setSelectAll(false);
          }
        };

        return (
          <div
            className="flex items-center justify-center w-full h-full cursor-pointer"
            onClick={toggleRow}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={isChecked}
              disabled={!row?._id}
              className="pointer-events-none"
            />
          </div>
        );
      },
    },

    // ── Action ────────────────────────────────────────────────────────────────
    ...(PermissionCheck(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE) ||
      PermissionCheck(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.REMOVE)
      ? [
        {
          headerName: t("Action"),
          field: "action",
          title: "Action",
          width: 260,
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
                {PermissionCheck(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE) && (
                  <i
                    id={params.node.rowIndex === 0 ? "budget-rule-edit-btn" : undefined}
                    className="fa fa-pencil cursor-pointer"
                    onClick={() => {
                      setEditData(rows);
                      editHandler(rows);
                    }}
                  ></i>
                )}
                {PermissionCheck(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.REMOVE) && (
                  <i
                    id={params.node.rowIndex === 0 ? "budget-rule-delete-btn" : undefined}
                    className="fa fa-trash cursor-pointer"
                    onClick={() => {
                      setShowDeleteModal({ isOpen: true, data: rows });
                      setDeleteId(rows._id);
                    }}
                  ></i>
                )}
                {PermissionCheck(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE) && (
                  <i
                    id={params.node.rowIndex === 0 ? "budget-rule-link-btn" : undefined}
                    className="fa fa-link cursor-pointer"
                    title={t("Assign Campaigns")}
                    onClick={() => {
                      setAssignId(rows._id);
                      setEditData(rows);
                      setcampaignIds([
                        ...(rows?.campaignIds?.SP ?? []),
                        ...(rows?.campaignIds?.SB ?? []),
                        ...(rows?.campaignIds?.SD ?? []),
                      ]);
                      selectedCampaginHandler([
                        ...(rows?.campaignIds?.SP ?? []),
                        ...(rows?.campaignIds?.SB ?? []),
                        ...(rows?.campaignIds?.SD ?? []),
                      ]);
                    }}
                  ></i>
                )}
                {PermissionCheck(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE) && (
                  <button
                    id={params.node.rowIndex === 0 ? "budget-rule-run-btn" : undefined}
                    disabled={!rows.isActive}
                    title={
                      !rows.isActive
                        ? t("Enable the rule to run it manually")
                        : t("Run Rule")
                    }
                    className="run_icon"
                    onClick={() => setRunCronJob(rows)}
                  >
                    {t("Run")}
                  </button>
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
          <div id={params.node.rowIndex === 0 ? "budget-rule-status-toggle" : undefined} className="flex items-center justify-center">
            <Switch
              disabled={!PermissionCheck(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE)}
              checked={row.isActive}
              onCheckedChange={(checked) => {
                setStatusChange({
                  isActive: checked,
                  id: row?._id,
                  row,
                });
              }}
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
        const e = params.data;
        if (!e) return null;
        return (
          <div>
            <p>{e.ruleName}</p>
            <p>
              <b>{t("Created By:")}</b> {e.userName}
            </p>
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
        const isReportDate =
          Boolean(e?.reportDate) &&
          DATE_FILTER_OPTION.find((day) => day?.value === e?.reportDate);
        return (
          <div className="flex flex-wrap gap-1 py-2">
            {isReportDate && (
              <span className="rule-chip rule-chip-date">
                <i className="fa fa-calendar-check-o mr-1" style={{ fontSize: "10px" }}></i>
                <b>{t("Date:")} </b>&nbsp;{isReportDate?.label ? t(isReportDate.label) : "—"}{" "}
                {e?.toDate ? `(${e?.toDate})` : ""}
              </span>
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
      title: t("Action Type"),
      width: 250,
      sortable: false,
      resizable: true,
      autoHeight: true,
      wrapText: true,
      cellRenderer: (params) => {
        const e = params.data;
        if (!e) return null;
        const getValueType =
          e?.actionType?.actionValueType !== "Percentage" ? "" : t("% of budget");
        const actionName = e?.actionType?.actionName;
        const isHourly = Boolean(e?.isHourlyBudget || e?.isHourlyBid);
        let action = "";
        if (actionName === "Paused") {
          action = t("Campaign Paused");
        } else if (actionName === "Enabled") {
          action = t("Campaign Enabled");
        } else if (actionName === "setBudget") {
          action = isHourly ? t("Set Budget (Hourly)") : `${t("Set Budget to")} ${e?.actionType?.actionValue}`;
        } else {
          action = isHourly
            ? `${t(actionName)} ${t("Budget (Hourly)")}`
            : `${t(actionName)} ${t("budget by")} ${e?.actionType?.actionValue} ${getValueType}`.trim();
        }
        return (
          <div className="py-2">
            <div className="font-bold text-dark" style={{ fontSize: "13px" }}>
              <i className={`fa ${e?.actionType?.actionName?.includes("Increase") ? "fa-arrow-circle-up text-success" :
                e?.actionType?.actionName?.includes("Decrease") ? "fa-arrow-circle-down text-danger" :
                  e?.actionType?.actionName?.includes("Paused") ? "fa-pause-circle text-warning" :
                    e?.actionType?.actionName?.includes("Enabled") ? "fa-check-circle text-success" :
                      "fa-info-circle text-primary"} me-1`}></i>
              {action}
            </div>
            <div className="text-gray-500" style={{ fontSize: "11px", marginTop: "4px" }}>
              <i className="fa fa-history mr-1"></i>
              <b>{t("Last Run:")} </b>
              {e.lastRun ? e.lastRun : t("Never")}
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
      width: 140,
      sortable: false,
      resizable: true,
      cellClass: "flex items-center",
      cellRenderer: (params) => {
        const e = params.data;
        if (!e) return null;
        const cIds = [
          ...(e?.campaignIds?.SP ?? []),
          ...(e?.campaignIds?.SB ?? []),
          ...(e?.campaignIds?.SD ?? []),
        ];
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
                {(row.isHourlyBudget || row.isHourlyBid) ? (
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
          .tz(params.data?.timezone || "")
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
          .tz(params.data?.timezone || "")
          .format("MM/DD/YYYY hh:mm:ss A z");
      },
    },
  ], [disablePinning, isTourActive, selectAll, selectedRows, tableData, t]);

  const runHandler = (id, data) => {
    dispatch(handleLoader(true));
    ApiRun(id, { data })
      .then((res) => {
        if (res.isSuccess) {
          Toast.success(res.message);
          dispatch(handleLoader(false));
          getRule();
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

  const [deleteId, setDeleteId] = useState();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [addModalFlag, setaddModalFlag] = useState(false);
  const [editId, setEditId] = useState();
  const [existingRulesSchedule, setExistingRulesSchedule] = useState([]);
  const [adminRulesSchedule, setAdminRulesSchedule] = useState([]);

  const [perPage, setPerPage] = useState(firstPageRows);
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [totalRecords, setTotalRecords] = useState(0);

  const [searchData, setSearchData] = useState([]);
  const [assignId, setAssignId] = useState();
  const [allIds, setAllIds] = useState([]);
  const [campaignIds, setcampaignIds] = useState();
  const [selectAllCheck, setselectAllCheck] = useState();
  const [campaignModal, setCampaignModal] = useState(false);

  const [selectedModal, setSelectedModal] = useState(false);
  const [runCronJob, setRunCronJob] = useState(null);
  const [statusChange, setStatusChange] = useState(null);

  const [listId, setListId] = useState();

  const deleteHandler = () => {
    dispatch(handleLoader(true));
    ApideleteRule(deleteId)
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
    ApistatusChange(data)
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

  const [loading, setLoading] = useState(true);

  const getRule = (queryArg = arg) => {
    if (selectedCampagin?.profileSendID && selectedCampagin?.selectedAdType) {
      setLoading(true);
      let data = {
        profileId: selectedCampagin?.profileSendID,
        fieldName: 'createdAt',
        sortType: 'DESC',
        ...queryArg,
      };
      ApigetRule(data)
        .then((res) => {
          if (res.isSuccess) {
            setLoading(false);
            setTableData(res.data);
            setTotalRecords(res?.totalRecords);
            if (Array.isArray(res?.allRulesSchedule)) setExistingRulesSchedule(res?.allRulesSchedule)
            if (Array.isArray(res?.adminBlockedSchedule)) setAdminRulesSchedule(res?.adminBlockedSchedule)
          } else {
            setLoading(false);
            Toast.error(res.message);
          }
        })
        .catch((err) => {
          setLoading(false);
          Toast.error(t("Something went wrong!!"));
        });
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
    const isStatus = conditionType.toLowerCase().includes("status");
    const isDate = conditionType.toLowerCase().includes("date") || conditionType.toLowerCase().includes("creation");

    let getOperator = conditionOperators?.find((x) => x.key === conditionOperator)?.value;
    let getValueType = conditionValueType === "Percentage" ? "% of budget" : "";

    if (conditionStatus) {
      return (
        <span
          key={index}
          className={`rule-chip rule-chip-condition ${isStatus ? 'status' : isDate ? 'date' : 'other'}`}
        >
          <i className="fa fa-info-circle mr-1" style={{ fontSize: "10px", opacity: 0.7 }}></i>
          <strong>{t(conditionType)}:</strong>&nbsp;{t(conditionStatus)}
        </span>
      );
    }

    return (
      <span
        key={index}
        className={`rule-chip rule-chip-condition ${isStatus ? 'status' : isDate ? 'date' : 'other'}`}
      >
        <i className={`fa ${isDate ? "fa-calendar" : "fa-bar-chart"} me-1`} style={{ fontSize: "10px", opacity: 0.7 }}></i>
        <strong>{t(conditionType)}</strong>&nbsp;{getOperator}&nbsp;{conditionValue}{getValueType}
      </span>
    );
  };

  const selectedCampaginHandler = (ids) => {
    let arr = [];
    dispatch(handleLoader(true));
    let data = {
      profileId: selectedCampagin?.profileSendID,
    };
    ApigetCampaign(data)
      .then((res) => {
        if (res.isSuccess) {
          dispatch(handleLoader(false));

          if (res.data.length == ids?.length) {
            setselectAllCheck(true);
          } else {
            setselectAllCheck(false);
          }
          res.data.map((el) => {
            arr.push({
              campaignId: el.campaignId,
              name: el.name,
              type: el.type,
              status: el.status,
            });
          });
        } else {
          dispatch(handleLoader(false));
        }
        setSearchData(arr);
        setCampaignModal(true);
      })
      .catch((err) => {
        dispatch(handleLoader(false));
        Toast.error(err);
      });
  };

  const campaignHandler = () => {
    const oldQuery = editData?.query?.SP || editData?.query?.SB || editData?.query?.SD || editData?.query
    if (!oldQuery) {
      Toast.error(t("Something Went Wrong!"))
      return
    }

    const campaignIdsByType = groupCampaignIdsByType(allIds, searchData);

    const finalQuery = {
      SP: UpdateBudgetQuery(oldQuery, campaignIdsByType?.SP),
      SB: UpdateBudgetQuery(oldQuery, campaignIdsByType?.SB),
      SD: UpdateBudgetQuery(oldQuery, campaignIdsByType?.SD),
    }

    const data = { campaignIds: campaignIdsByType, query: finalQuery };

    dispatch(handleLoader(true));

    ApiupdateRule(assignId, data)
      .then((res) => {
        if (res.isSuccess) {
          dispatch(handleLoader(false));
          Toast.success(res.message);
          getRule(arg);
          setEditData(null);
        } else {
          dispatch(handleLoader(false));
          Toast.error(res.message);
        }
      })
      .catch((err) => {
        dispatch(handleLoader(false));
        Toast.error(err);
      });

    setCampaignModal(false);
  };
  // selected campaign  id //
  const getSelectedId = (ids) => {
    let arr = [];
    dispatch(handleLoader(true));
    let data = {
      profileId: selectedCampagin?.profileSendID,
    };
    ApigetCampaign(data)
      .then((res) => {
        if (res.isSuccess) {
          dispatch(handleLoader(false));
          res.data.map((el) => {
            ids.map((item) => {
              if (el.campaignId == item) {
                arr.push(el);
              }
            });
          });
          setSelectedModal(true);
        } else {
          dispatch(handleLoader(false));
          Toast.error(res.message);
        }
      })
      .catch((err) => {
        dispatch(handleLoader(false));
        Toast.error(err);
      });

    setListId(arr);
  };

  useEffect(() => {
    if (!addModalFlag) setEditData(null);
  }, [addModalFlag]);

  const exportBudgetRules = async (exportIds) => {
    try {
      const response = await ApiExportBudgetRule({ profileId: selectedCampagin?.profileSendID, exportIds });

      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;

      link.setAttribute("download", `BudgetRules_${selectedCampagin?.profileSendID}.xlsx`);
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

  const importBudgetRules = async (file, duplicateAction) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("profileId", selectedCampagin?.profileSendID);
    formData.append("duplicateAction", duplicateAction);

    try {
      const res = await ApiImportBudgetRule(formData);

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
      ApistatusChange(data)
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
    <div className="placement-tracking-container" id="budget-rule-page">
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
                <h5 className="m-0 font-bold">{t("budgetRules")}</h5>
              </div>

              {/* Spacer */}
              {!isMobile && <div style={{ marginLeft: "auto" }} />}

              <div className="flex items-center gap-2" style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
                {/* History Button */}
                {PermissionCheck(SYSTEM_PAGES.BUDGET_RULE_HISTORY, PAGE_ACTIONS.VIEW_ONLY) && (
                  <button
                    id="budget-rule-history"
                    onClick={() => navigate("/budget-history")}
                    className="customize-button m-0 gap-0"
                    style={{ height: "36px", whiteSpace: "nowrap" }}
                  >
                    {t("History")}
                  </button>
                )}

                {/* Bulk Actions (Contextual) */}
                {(selectedRows?.length > 0 || isTourActive) && PermissionCheck(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE) && (
                  <div style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <ShadcnButton
                          id="bulk-actions-dropdown"
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
                {PermissionCheck(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.CREATE) && (
                  <ShadcnButton
                    id="budget-rule-add"
                    onClick={() => {
                      setaddModalFlag(true);
                      setEditId();
                    }}
                    className="h-[36px] bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] text-white hover:opacity-90 border-0 whitespace-nowrap px-4 font-semibold shadow-sm"
                  >
                    <i className="fa fa-plus pr-1"></i>
                    {isMobile ? t("Add") : t("addRule")}
                  </ShadcnButton>
                )}

                {/* Import/Export Menu */}
                {PermissionCheck(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE) && (
                  <div id="budget-rule-import-export" className="ml-auto ml-sm-0">
                    <ImportExportMenu
                      title={`${t("budgetRules")} (${t("Import/Export")})`}
                      onExport={exportBudgetRules}
                      onImport={importBudgetRules}
                      selectedRows={selectedRows}
                      permissions={{
                        export: PermissionCheck(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE),
                        import: PermissionCheck(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE),
                      }}
                      accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    />
                  </div>
                )}
              </div>

            </div>

            {PermissionCheck(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.VIEW_ONLY) && (
              <div className="data_table position-relative" id="budget-rule-table" style={{ padding: "0 14px 14px 14px" }}>
                <AgTable
                  onRefresh={getRule}
                  loading={loading}
                  ref={gridRef}
                  tableId="budget-rule-table"
                  height="calc(100vh - 260px)"
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
                  customSaveColumnName={"Budget Rule"}
                  handleSaveColumns={undefined}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={addModalFlag} onOpenChange={setaddModalFlag}>
        <DialogContent hideCloseButton={true} className="w-[92vw] max-w-5xl p-0 gap-0 overflow-hidden bg-white dark:bg-[#0f172a] border-slate-200 dark:border-white/10" id="budget-rule-add-modal">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
            <DialogTitle className="text-xl font-bold text-slate-800 dark:text-white flex justify-between items-center w-full" id="budget-rule-close">
              {t('Budget Rules')}
              <button className="absolute right-4 top-4 rounded-full border border-gray-300 dark:border-gray-600 p-1.5 opacity-70 ring-offset-background transition-all text-slate-800 dark:text-slate-200 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground" onClick={() => setaddModalFlag(false)}>
                <X className="h-5 w-5" />
                <span className="sr-only">{t("Close")}</span>
              </button>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto" id="modelAddRule">
            <AddRule
              setaddModalFlag={setaddModalFlag}
              getRule={getRule}
              setEditId={setEditId}
              editId={editId}
              editData={editData}
              setEditData={setEditData}
              allRulesSchedule={existingRulesSchedule}
              adminRulesSchedule={adminRulesSchedule}
            />
          </div>
        </DialogContent>
      </Dialog>

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

      <BudgetRuleConfirmationModel
        showModal={runCronJob?._id}
        setShowModal={() => setRunCronJob()}
        ruleId={runCronJob?._id}
        onConfirm={(tableData) => runHandler(runCronJob?._id, tableData)}
        title={runCronJob?.ruleName ? `${t("Budget Rule")}: ${runCronJob.ruleName}` : t("Budget Rule")}
      />

      {/* campaign modal */}

      <CustomModal
        show={campaignModal}
        onHide={() => setCampaignModal(false)}
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
              getRule(arg);
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
          allRules={existingRulesSchedule}
          currentRuleId={assignId}
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
  );
}

export default BudgetRule;
