import { getRuleHistorySnapshot } from "../History/ruleHistorySnapshot";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useContext, useState, useEffect, useRef, useMemo } from "react";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import moment from "moment-timezone";
import { handleLoader, Toast, useDispatch } from "../../../helper/links/Link";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { ApiRevertRuleHistory, ApiRuleHistory } from "../../../api-wrapper/targeting/ApiTargeting";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import BlockedCampaignModal from "../../../helper/modal/BlockedCampaignModal";
import AffectedHistoryModel from "../../../helper/modal/AffectedHistoryModel";
import { FiTarget, FiClock, FiAlertCircle, FiList } from "react-icons/fi";
import Breadcrumb from "../../../common/components/Breadcrumb";
import { MdOutlineClose } from "react-icons/md";
import { Input } from "../../../components/ui/input";
import { formatRunTime, formatRuleDate } from "../../../utility/common";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import RuleConditionChips from "../../../common/components/RuleConditionChips";

function TargetingRuleHistory() {
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
      setDate((prev) => {
        const newStart = moment(selectedDate[0]).toDate();
        const newEnd = moment(selectedDate[1]).toDate();
        if (prev[0]?.getTime() === newStart.getTime() && prev[1]?.getTime() === newEnd.getTime()) {
          return prev;
        }
        return [newStart, newEnd];
      });
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
  const [tableData, setTableData] = useState([]);
  const [affectedFilter, setAffectedFilter] = useState("AFFECTED");
  const [loadingGrid, setLoadingGrid] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");

  const displayTableData = useMemo(() => {
    if (!affectedFilter || affectedFilter === "ALL") return tableData;
    if (affectedFilter === "AFFECTED") {
      return tableData.filter((row) => (row.affectedTargets?.length || 0) > 0);
    }
    if (affectedFilter === "UNAFFECTED") {
      return tableData.filter((row) => (row.affectedTargets?.length || 0) === 0);
    }
    return tableData;
  }, [tableData, affectedFilter]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  const [historyData, setHistoryData] = useState();

  const [showHistoryModal, setShowHistoryModal] = useState(null);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [selectedRule, setSelectedRule] = useState(null);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const dispatch = useDispatch();
  const gridRef = useRef(null);

  const columns = useMemo(() => [
    // ── Run Date ──────────────────────────────────────────────────────────────
    {
      headerName: t("runDate", "Run Date"),
      field: "ruleDate",
      title: "Run Date",
      width: 170,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        if (!params.data) return null;
        return (
          <div className="flex items-center gap-2 h-full">
            <FiClock className="text-secondary" style={{ opacity: 0.7 }} />
            <span style={{ fontWeight: 500 }}>{formatRuleDate(params.value)}</span>
          </div>
        );
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
        const e = params.data;
        if (!e) return null;
        const isSuccess = e.status === "COMPLETED" || e.status === "SUCCESS";
        return (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            backgroundColor: isSuccess ? "rgba(22, 163, 74, 0.08)" : "rgba(220, 53, 69, 0.08)",
            color: isSuccess ? "#16a34a" : "#dc3545",
            padding: "3px 10px",
            borderRadius: "12px",
            fontSize: "11px",
            fontWeight: "700",
            border: `1px solid ${isSuccess ? "rgba(22, 163, 74, 0.15)" : "rgba(220, 53, 69, 0.15)"}`,
            textTransform: "uppercase"
          }}>
            {e.status}
          </span>
        );
      },
    },

    // ── Affected Count (Targets) ──────────────────────────────────────────────
    {
      headerName: t("affectedCount"),
      field: "affectedTargets",
      title: "Affected Count",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const count = row.affectedTargets?.length || 0;

        if (!count) {
          return <span className="text-gray-500 small">{t("No Targets")}</span>;
        }

        return (
          <div className="flex items-center h-full">
            <span
              id={params.node.rowIndex === 0 ? "tour-first-row-affected" : undefined}
              role="button"
              className="badge inline-flex items-center px-2 py-1 font-bold rounded-md text-[11px] cursor-pointer bg-sky-50 text-sky-600 border border-sky-200 hover:bg-sky-600 hover:text-white dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/30 dark:hover:bg-sky-500 dark:hover:text-white transition-colors"
              onClick={() => setShowHistoryModal({ show: true, data: row?.affectedTargets, id: row?._id, ruleId: row?.ruleId })}
            >
              <FiTarget size={12} className="mr-1" />
              {count} {count === 1 ? t("Target") : t("Targets")}
            </span>
          </div>
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
              role="button"
              className="badge inline-flex items-center px-2 py-1 font-bold rounded-md text-[11px] cursor-pointer bg-sky-50 text-sky-600 border border-sky-200 hover:bg-sky-600 hover:text-white dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/30 dark:hover:bg-sky-500 dark:hover:text-white transition-colors"
              onClick={() => setShowHistoryModal({ show: true, data: row?.affectedCampaigns, id: row?._id, ruleId: row?.ruleId })}
            >
              <FiList size={12} className="mr-1" />
              {count} {count === 1 ? "Campaign" : "Campaigns"}
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
      width: 150,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const e = params.data;
        if (!e) return null;
        return (
          <div className="flex items-center gap-2 h-full">
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              backgroundColor: "#16A34A", display: "inline-block"
            }} />
            <p className="m-0">{formatRunTime(e.lastRun || e.ruleTime)}</p>
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
            style={{
              color: isBlocked ? "#dc3545" : "var(--text-secondary)",
              fontWeight: isBlocked ? "600" : "normal",
              cursor: isBlocked ? "pointer" : "default",
              textDecoration: isBlocked ? "underline" : "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6
            }}
            onClick={() => {
              if (isBlocked) {
                setSelectedRule(row);
                setShowBlockedModal(true);
              }
            }}
          >
            {isBlocked && <FiAlertCircle size={14} />}
            <span>{row.remark}</span>
          </div>
        );
      },
    },
  ], [t]);

  const TargetingRuleHistoryList = async (queryArg = {}) => {
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
        fieldName: "createdAt",
        sortType: "DESC",
        search: queryArg?.hasOwnProperty("search") ? queryArg.search : debouncedSearchName,
        pageNo: targetPageNo,
        perPage: targetPerPage,
        affectedFilter: currentAffectedFilter,
        ...queryArg,
      };
      await ApiRuleHistory(data)
        .then((e) => {
          if (e?.isSuccess) {
            dispatch(handleLoader(false));
            setTableData(e.data || []);
            setHistoryData(e);
            if (showHistoryModal?.show && showHistoryModal?.id) {
              const findData = (e.data ?? [])?.find(it => it?._id === showHistoryModal?.id);
              setShowHistoryModal(prev => prev ? ({ ...prev, data: findData?.affectedTargets || prev.data }) : null);
            }
          } else {
            Toast.error(e?.message);
          }
        })
        .catch((e) => {
          Toast.error(t("Something went wrong"));
        })
        .finally(() => {
          setLoadingGrid(false);
        });
    } else {
      setLoadingGrid(false);
    }
  };

  useEffect(() => {
    if (activeProfileId && selectedAdType) {
      setArg(prev => ({ ...prev, pageNo: 1 }));
      TargetingRuleHistoryList({ pageNo: 1, perPage, affectedFilter });
    }
  }, [date, activeProfileId, selectedAdType, debouncedSearchName, affectedFilter]);

  const handlePageChange = (page) => {
    setArg(prev => ({ ...prev, pageNo: page }));
    TargetingRuleHistoryList({ pageNo: page, perPage });
  };

  const handlePerRowsChange = async (newPerPage) => {
    setPerPage(newPerPage);
    setArg({
      pageNo: 1,
      perPage: newPerPage
    });
    TargetingRuleHistoryList({ pageNo: 1, perPage: newPerPage });
  };

  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    TargetingRuleHistoryList({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), pageNo: arg.pageNo, perPage });
  };

  const handleSearch = (e) => {
    setSearchName(e.target.value);
  };

  const handleRevertTargetingHistory = async (list) => {
    dispatch(handleLoader(true));
    const data = {
      profileId: profileId.value,
      data: list,
      ruleId: showHistoryModal?.ruleId,
    };

    await ApiRevertRuleHistory(data)
      .then((e) => {
        dispatch(handleLoader(false));
        if (e?.isSuccess) {
          Toast.success(e?.message);
          TargetingRuleHistoryList();
        }
        else Toast.error(e?.message);
      })
      .catch((e) => {
        dispatch(handleLoader(false));
        Toast.error(t("Something went wrong"));
      });
  }

  return (
    <>
      <Filter
        name={"Targeting Rule History"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="targeting-rule-tracking-container">
        <div className="middle_container budget_container">

          <div className="mb-4">
            <Breadcrumb
              paths={[
                { label: "Targeting Rules", link: "/targeting-rule" },
                { label: "History" }
              ]}
              onBack={() => navigate("/targeting-rule")}
            />
          </div>

          <div className="data_content data_content_btn glass-grid-container h-maxContent">
            <div className="camapgin_btn flex flex-wrap justify-between items-center gap-3 pt-4 px-4">
              <div className={`flex flex-col ${isMobile ? "w-full" : ""}`}>
                <h5 className="m-0">{t("Targeting Rule History")}</h5>
              </div>

              <div className={`flex flex-wrap items-center gap-3 ${isMobile ? "w-full" : ""}`}>
                <div className="relative flex items-center" id="filter-search" style={{ width: isMobile ? "100%" : "320px", height: "36px" }}>
                  <Input
                    type="text"
                    placeholder={t("searchHere")}
                    value={searchName}
                    onChange={(e) => handleSearch(e)}
                    className="h-9 w-full pr-8"
                  />
                  {searchName && (
                    <MdOutlineClose
                      onClick={() => setSearchName("")}
                      className="absolute right-2 cursor-pointer text-slate-500 opacity-70 hover:opacity-100 transition-opacity"
                      size={18}
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

                <div id="filter-date" className="mr-2">
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
            {PermissionCheck(SYSTEM_PAGES.TARGETING_RULE_HISTORY, PAGE_ACTIONS.VIEW_ONLY) && (
              <div className="data_table">
                <AgTable ref={gridRef}
                  tableId="targeting-rule-history-table"
                  height={"70vh"}
                  rowData={displayTableData}
                  columnDefs={columns}
                  totalRecords={historyData?.totalRecords || 0}
                  perPage={perPage}
                  currentPage={arg?.pageNo || 1}
                  loading={loadingGrid}
                  onRefresh={() => TargetingRuleHistoryList({ pageNo: arg?.pageNo || 1, perPage })}
                  onPageChange={handlePageChange}
                  onPerPageChange={handlePerRowsChange}
                  onSortChanged={handleSortChanged}
                  paginationOptions={paginationRowsPerPageOptions}
                  isCustomSaveColumns={true}
                  customSaveColumnName={"Targeting Rule History"}
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
            onRevert={handleRevertTargetingHistory}
          />
        </div>
      </div>
    </>
  );
}

export default TargetingRuleHistory;
