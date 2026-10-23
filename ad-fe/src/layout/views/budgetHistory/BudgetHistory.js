import { getRuleHistorySnapshot } from "../History/ruleHistorySnapshot";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useContext, useState, useEffect, useRef, useMemo } from "react";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import moment from "moment-timezone";
import { Toast, useDispatch, handleLoader } from "../../../helper/links/Link";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import success from "../../../assets/images/success.svg";
import { ApiRevertRuleHistory, ApiRuleHistory } from "../../../api-wrapper/budgetRule/ApiBudgetRule";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import BlockedCampaignModal from "../../../helper/modal/BlockedCampaignModal";
import AffectedHistoryModel from "../../../helper/modal/AffectedHistoryModel";
import { FiTarget, FiAlertTriangle } from "react-icons/fi";
import { MdOutlineClose } from "react-icons/md";
import Breadcrumb from "../../../common/components/Breadcrumb";
import { formatRunTime, formatRuleDate } from "../../../utility/common";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import RuleConditionChips from "../../../common/components/RuleConditionChips";

function BudgetHistory() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { t } = useTranslation();
  const navigate = useNavigate();

  let { profileId, profileSendID, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);
  const activeProfileId = profileId?.value || profileSendID;

  const [date, setDate] = useState(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      return [moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()];
    }
    return [new Date(moment().startOf("month")), new Date()];
  });

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      const newDate = [moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()];
      if (newDate[0].getTime() !== date[0]?.getTime() || newDate[1].getTime() !== date[1]?.getTime()) {
        setDate(newDate);
      }
    }
  }, [selectedDate]);

  const onChangeDate = (arr) => {
    if (arr) {
      setDate(arr);
      setSelectedDate(arr);
    }
  };
  const [perPage, setPerPage] = useState(firstPageRows);
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [historyData, setHistoryData] = useState();
  const [tableData, setTableData] = useState([]);
  const [affectedFilter, setAffectedFilter] = useState("AFFECTED");
  const [loadingGrid, setLoadingGrid] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");

  const displayTableData = useMemo(() => {
    if (!affectedFilter || affectedFilter === "ALL") return tableData;
    if (affectedFilter === "AFFECTED") {
      return tableData.filter((row) => (row.affectedCampaigns?.length || 0) > 0);
    }
    if (affectedFilter === "UNAFFECTED") {
      return tableData.filter((row) => (row.affectedCampaigns?.length || 0) === 0);
    }
    return tableData;
  }, [tableData, affectedFilter]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  const [showHistoryModal, setShowHistoryModal] = useState(null);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [selectedRule, setSelectedRule] = useState(null);

  const dispatch = useDispatch();
  const gridRef = useRef(null);

  const redirectToCampaign = async (row) => {
    localStorage.setItem("AffectedCampaigns", JSON.stringify(row.affectedCampaigns));
    navigate("/");
  }

  const columns = useMemo(() => [
    // ── Run Date ──────────────────────────────────────────────────────────────
    {
      headerName: t("runDate", "Run Date"),
      field: "ruleDate",
      title: "Run Date",
      width: 150,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        if (!params.data) return null;
        return <span className="font-semibold text-dark">{formatRuleDate(params.value)}</span>;
      },
    },

    // ── Rule Name ─────────────────────────────────────────────────────────────
    {
      headerName: t("ruleName"),
      field: "ruleName",
      title: "Rule Name",
      width: 350,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex flex-col gap-1 py-1 leading-normal">
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{row.ruleName}</span>
            <RuleConditionChips
              conditions={row.conditions}
              reportDate={row.reportDate}
              toDate={row.toDate}
            />
          </div>
        );
      },
    },

    // ── Created At ────────────────────────────────────────────────────────────
    {
      headerName: t("createdAt"),
      field: "createdAt",
      valueGetter: (params) => {
        const snapshot = getRuleHistorySnapshot(params.data);
        return snapshot?.capturedAt || params.data?.createdAt || null;
      },
      title: "Created At",
      width: 245,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const snapshot = getRuleHistorySnapshot(params.data);
        const rawDate = snapshot?.capturedAt || params.data?.createdAt;
        if (!rawDate || !moment(rawDate).isValid()) return <span>-</span>;
        const timezone = params.data?.timezone;
        const m = timezone ? moment(rawDate).tz(timezone) : moment(rawDate);
        return <span>{m.format("DD/MM/YYYY hh:mm:ss A")}</span>;
      },
    },

    // ── Status ────────────────────────────────────────────────────────────────
    {
      headerName: t("status"),
      field: "status",
      title: "Status",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const status = params.value;
        if (!status) return null;
        const isSuccess = status === "COMPLETED" || status === "SUCCESS";
        const badgeBg = isSuccess ? "rgba(40, 167, 69, 0.08)" : "rgba(220, 53, 69, 0.08)";
        const badgeColor = isSuccess ? "#28a745" : "#dc3545";
        const border = isSuccess ? "1.5px solid rgba(40, 167, 69, 0.15)" : "1.5px solid rgba(220, 53, 69, 0.15)";
        return (
          <span
            className="badge px-3 py-2 font-bold text-uppercase"
            style={{
              backgroundColor: badgeBg,
              color: badgeColor,
              border: border,
              borderRadius: "12px",
              fontSize: "11px",
              letterSpacing: "0.5px"
            }}
          >
            {status}
          </span>
        );
      },
    },

    // ── Affected Campaigns ────────────────────────────────────────────────────
    {
      headerName: t("affectedCampaigns"),
      field: "affectedCampaigns",
      title: "Affected Campaigns",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const count = row.affectedCampaigns?.length || 0;

        if (!count) {
          return <span className="text-gray-500 small">{t("No Campaigns")}</span>;
        }

        return (
          <div className="flex items-center h-full">
            <span
              id={params.node.rowIndex === 0 ? "tour-first-row-affected" : undefined}
              role="button"
              className="badge inline-flex items-center px-2 py-1 font-bold rounded-md text-[11px] cursor-pointer bg-sky-50 text-sky-600 border border-sky-200 hover:bg-sky-600 hover:text-white dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/30 dark:hover:bg-sky-500 dark:hover:text-white transition-colors"
              onClick={() => setShowHistoryModal({ show: true, data: row?.affectedCampaigns, id: row?._id, ruleId: row?.ruleId })}
            >
              <FiTarget size={12} className="mr-1" />
              {count} {count === 1 ? t("Campaign", "Campaign") : t("Campaigns", "Campaigns")}
            </span>
          </div>
        );
      },
    },

    // ── Last Run ──────────────────────────────────────────────────────────────
    {
      headerName: t("lastRun"),
      field: "lastRun",
      title: "Last Run",
      width: 140,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const e = params.data;
        if (!e) return null;
        return (
          <div className="flex items-center text-secondary gap-2 h-full">
            <img src={success} alt="success" style={{ width: "16px", height: "16px" }} className="mr-1" />
            <span className="small font-semibold">{formatRunTime(e.lastRun || e.ruleTime)}</span>
          </div>
        );
      },
    },

    // ── Remark ────────────────────────────────────────────────────────────────
    {
      headerName: t("remark"),
      field: "remark",
      title: "Remark",
      width: 300,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const isBlocked = row.remark === "Rule Blocked - Low Product Eligibility" && row?.lowProductStats?.[0]?.count;
        return (
          <div
            className={`flex items-center ${isBlocked ? "text-danger font-bold text-decoration-underline" : "text-secondary"}`}
            style={{
              fontSize: "13px",
              cursor: isBlocked ? "pointer" : "default",
            }}
            onClick={() => {
              if (isBlocked) {
                setSelectedRule(row);
                setShowBlockedModal(true);
              }
            }}
          >
            {isBlocked ? (
              <span className="flex items-center gap-1">
                <FiAlertTriangle size={14} className="text-danger mr-1" />
                {row.remark}
              </span>
            ) : (
              row.remark
            )}
          </div>
        );
      },
    },
  ], [t]);

  const BudgetRuleHistoryList = async (queryArg = {}) => {
    const profId = activeProfileId;
    if (profId && selectedAdType) {
      setLoadingGrid(true);
      const targetPageNo = queryArg?.pageNo || arg.pageNo || 1;
      const targetPerPage = queryArg?.perPage || perPage || firstPageRows;
      const currentAffectedFilter = queryArg?.affectedFilter !== undefined ? queryArg.affectedFilter : affectedFilter;
      const data = {
        fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
        toDate: moment(date?.[1]).format("YYYY-MM-DD"),
        profileId: profId,
        search: queryArg?.hasOwnProperty("search") ? queryArg.search : debouncedSearchName,
        pageNo: targetPageNo,
        perPage: targetPerPage,
        affectedFilter: currentAffectedFilter,
        ...queryArg,
      };

      try {
        const e = await ApiRuleHistory(data);
        if (e?.isSuccess) {
          dispatch(handleLoader(false));
          setTableData(e.data || []);
          setHistoryData(e);
          // If model open and revert then auto model data update here
          if (showHistoryModal?.show && showHistoryModal?.id) {
            const findData = (e.data ?? [])?.find(it => it?._id === showHistoryModal?.id);
            setShowHistoryModal(prev => prev ? ({ ...prev, data: findData?.affectedCampaigns || prev.data }) : null);
          }
        } else {
          Toast.error(e?.message);
        }
      } catch (err) {
        Toast.error(t("Something went wrong"));
      } finally {
        setLoadingGrid(false);
      }
    } else {
      setLoadingGrid(false);
    }
  };

  useEffect(() => {
    if (activeProfileId && selectedAdType) {
      setArg(prev => ({ ...prev, pageNo: 1 }));
      BudgetRuleHistoryList({ pageNo: 1, perPage, affectedFilter });
    }
  }, [activeProfileId, selectedAdType, date, debouncedSearchName, affectedFilter]);

  const handlePageChange = (page) => {
    setArg(prev => ({ ...prev, pageNo: page }));
    BudgetRuleHistoryList({ pageNo: page, perPage });
  };

  const handlePerRowsChange = async (newPerPage) => {
    setPerPage(newPerPage);
    setArg({
      pageNo: 1,
      perPage: newPerPage
    });
    BudgetRuleHistoryList({ pageNo: 1, perPage: newPerPage });
  };

  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    BudgetRuleHistoryList({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), pageNo: arg.pageNo, perPage });
  };

  const handleSearch = (e) => {
    setSearchName(e.target.value);
  };

  const handleRevertBudgetHistory = async (list) => {
    const data = {
      profileId: profileId.value,
      data: list,
      ruleId: showHistoryModal?.ruleId,
    };

    await ApiRevertRuleHistory(data)
      .then((e) => {
        if (e?.isSuccess) {
          Toast.success(e?.message);
          BudgetRuleHistoryList();
        }
        else Toast.error(e?.message);
      })
      .catch((e) => Toast.error(t("Something went wrong")));
  }

  return (
    <>
      <Filter
        name={"Budget Rule History"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="budget-rule-tracking-container">
        <div className="middle_container budget_container">

          <div className="mb-4">
            <Breadcrumb
              paths={[
                { label: "Budget Rules", link: "/budget-rule" },
                { label: "History" }
              ]}
              onBack={() => navigate("/budget-rule")}
            />
          </div>

          <div className="data_content data_content_btn glass-grid-container h-maxContent">
            <div className="camapgin_btn flex flex-wrap justify-between items-center gap-3 pt-4 px-4">
              <div className={`flex flex-col ${isMobile ? "w-full" : ""}`}>
                <h5 className="m-0">{t("budgetRuleHistory")}</h5>
              </div>

              <div className={`flex flex-wrap items-center gap-2 ${isMobile ? "w-full" : ""}`}>
                <div className="search_option m-0 flex items-center" id="filter-search" style={{ position: "relative", width: isMobile ? "100%" : "auto", minWidth: "320px", height: "36px", flexGrow: isMobile ? 1 : 0 }}>
                  <input
                    type="text"
                    placeholder={t("searchHere")}
                    value={searchName}
                    onChange={(e) => handleSearch(e)}
                    style={{ flexGrow: 1, width: "100%", height: "36px", border: "none", outline: "none", background: "transparent", boxShadow: "none", paddingRight: searchName ? "30px" : "10px" }}
                  />
                  {searchName && (
                    <MdOutlineClose
                      onClick={() => setSearchName("")}
                      style={{
                        position: "absolute",
                        right: "10px",
                        cursor: "pointer",
                        color: "var(--text-secondary)",
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

                <div id="filter-affected-status" style={{ width: isMobile ? "100%" : "200px" }}>
                  <Select value={affectedFilter} onValueChange={(val) => setAffectedFilter(val)}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder={t("Filter Changes")} />
                    </SelectTrigger>
                    <SelectContent className="z-[99999]">
                      <SelectItem value="ALL">{t("All", "All")}</SelectItem>
                      <SelectItem value="AFFECTED">{t("affectedChanges", "Affected Changes")}</SelectItem>
                      <SelectItem value="UNAFFECTED">{t("unaffectedChanges", "Unaffected Changes")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div id="filter-date">
                  <DateRangePicker
                    className="w-full sm:w-[260px]"
                    ranges={predefinedRanges}
                    value={date}
                    placeholder={t("Select Date")}
                    onChange={(e) => onChangeDate(e)}
                    placement="bottomEnd"
                    format="yyyy-MM-dd"
                    cleanable={false}
                  />
                </div>
              </div>
            </div>
            {PermissionCheck(SYSTEM_PAGES.BUDGET_RULE_HISTORY, PAGE_ACTIONS.VIEW_ONLY) && (
              <div className="data_table">
                <AgTable ref={gridRef}
                  tableId="budget-rule-history-table"
                  height={"70vh"}
                  rowData={displayTableData}
                  columnDefs={columns}
                  totalRecords={historyData?.totalRecords || 0}
                  perPage={perPage}
                  currentPage={arg?.pageNo || 1}
                  onPageChange={handlePageChange}
                  onPerPageChange={handlePerRowsChange}
                  onSortChanged={handleSortChanged}
                  paginationOptions={paginationRowsPerPageOptions}
                  loading={loadingGrid}
                  onRefresh={() => BudgetRuleHistoryList({ pageNo: arg?.pageNo || 1, perPage })}
                  isCustomSaveColumns={true}
                  customSaveColumnName={"Budget Rule History"}
                  handleSaveColumns={undefined}
                />
              </div>
            )}
          </div>

          <BlockedCampaignModal
            show={showBlockedModal}
            onHide={() => setShowBlockedModal(false)}
            ruleId={selectedRule?.ruleId}
            ruleDate={selectedRule?.ruleDate}
          />

          <AffectedHistoryModel
            show={showHistoryModal?.show}
            onClose={() => setShowHistoryModal(null)}
            data={Array.isArray(showHistoryModal?.data) ? showHistoryModal?.data : []}
            onRevert={handleRevertBudgetHistory}
          />
        </div>
      </div>
    </>
  );
}

export default BudgetHistory;
