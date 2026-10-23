import { getRuleHistorySnapshot } from "../History/ruleHistorySnapshot";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useContext, useState, useEffect, useRef, useMemo } from "react";
import { useSelector } from "react-redux";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import moment from "moment-timezone";
import { Toast } from "../../../helper/links/Link";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { ApiRuleHistory } from "../../../api-wrapper/search-term/ApiSearchTerm";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import AffectedHistoryModel from "../../../helper/modal/AffectedHistoryModel";
import { FiClock, FiList, FiSearch } from "react-icons/fi";
import { MdOutlineClose } from "react-icons/md";
import Breadcrumb from "../../../common/components/Breadcrumb";
import { Badge } from "../../../components/ui/badge";
import { formatRunTime, formatRuleDate } from "../../../utility/common";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import RuleConditionChips from "../../../common/components/RuleConditionChips";

function SearchTermHistory() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  let { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);
  const profileSendID = useSelector(
    (state) => state?.profileReducer?.profileId?.value
  );
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
  const [gridConfig, setGridConfig] = useState({});
  const [tableData, setTableData] = useState([]);
  const [affectedFilter, setAffectedFilter] = useState("AFFECTED");
  const [loadingGrid, setLoadingGrid] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");

  const displayTableData = useMemo(() => {
    if (!affectedFilter || affectedFilter === "ALL") return tableData;
    if (affectedFilter === "AFFECTED") {
      return tableData.filter((row) => (row.affectedSearchTerms?.length || 0) > 0);
    }
    if (affectedFilter === "UNAFFECTED") {
      return tableData.filter((row) => (row.affectedSearchTerms?.length || 0) === 0);
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

  const [perPage, setPerPage] = useState(firstPageRows);
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
          <div className="flex items-center gap-2">
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

    // ── Affected Search Terms ─────────────────────────────────────────────────
    {
      headerName: t("affected Search Terms"),
      field: "affectedSearchTerms",
      title: "Affected Search Terms",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const count = row.affectedSearchTerms?.length || 0;

        if (!count) {
          return <span className="text-gray-500 small">{t("No Search Terms")}</span>;
        }

        return (
          <div className="flex items-center h-full">
            <Badge
              id={params.node.rowIndex === 0 ? "tour-first-row-affected" : undefined}
              role="button"
              variant="outline"
              className="badge preserve-color cursor-pointer transition-colors text-sky-600 bg-sky-50 border-sky-200 hover:bg-sky-600 hover:text-white dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20 dark:hover:bg-sky-500 dark:hover:text-white font-bold px-2 py-1 text-[11px]"
              onClick={() => setShowHistoryModal({ show: true, data: row?.affectedSearchTerms })}
            >
              <FiSearch size={12} className="mr-1 text-sky-600 group-hover:text-white transition-colors" />
              {count} {count === 1 ? t("Search Term", "Search Term") : t("Search Terms", "Search Terms")}
            </Badge>
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
            <Badge
              variant="outline"
              className="badge preserve-color cursor-pointer transition-colors text-sky-600 bg-sky-50 border-sky-200 hover:bg-sky-600 hover:text-white dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20 dark:hover:bg-sky-500 dark:hover:text-white font-bold px-2 py-1 text-[11px]"
              onClick={() => setShowHistoryModal({ show: true, data: row?.affectedCampaigns })}
            >
              <FiList size={12} className="mr-1 text-sky-600 group-hover:text-white transition-colors" />
              {count} {count === 1 ? t("Campaign", "Campaign") : t("Campaigns", "Campaigns")}
            </Badge>
          </div>
        );
      },
    },

    // ── Daily Run Count ───────────────────────────────────────────────────────
    {
      headerName: t("dailyRunCount"),
      field: "dailyCount",
      title: "Daily Run Count",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        if (!params.data) return null;
        return <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{params.value}</span>;
      },
    },

    // ── Executed Count ────────────────────────────────────────────────────────
    {
      headerName: t("executedCount"),
      field: "excutedCount",
      title: "Executed Count",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        if (!params.data) return null;
        return <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{params.value}</span>;
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
          <div className="flex items-center gap-2">
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              backgroundColor: "#16A34A", display: "inline-block"
            }} />
            <p className="m-0">{formatRunTime(e.lastRun || e.ruleTime)}</p>
          </div>
        );
      },
    },

    // ── Next Run ──────────────────────────────────────────────────────────────
    {
      headerName: t("nextRun"),
      field: "nextRun",
      title: "Next Run",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        if (!params.data) return null;
        return <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{params.value}</span>;
      },
    },
  ], [t]);

  const SearchTermHistoryList = async (queryArg = {}) => {
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
          setTableData(e.data || []);
          setGridConfig(e);
        } else {
          Toast.error(e?.message);
        }
      } catch (error) {
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
      SearchTermHistoryList({ pageNo: 1, perPage, affectedFilter });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId, selectedAdType, date, debouncedSearchName, affectedFilter]);

  const handleSearch = (e) => {
    setSearchName(e.target.value);
  };

  const handlePageChange = (page) => {
    setArg(prev => ({ ...prev, pageNo: page }));
    SearchTermHistoryList({ pageNo: page, perPage });
  };

  const handlePerRowsChange = (newPerPage) => {
    setPerPage(newPerPage);
    setArg({ pageNo: 1, perPage: newPerPage });
    SearchTermHistoryList({ pageNo: 1, perPage: newPerPage });
  };

  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    SearchTermHistoryList({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), pageNo: arg.pageNo, perPage });
  };

  return (
    <>
      <Filter
        name={"Search Term Rule History"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="search-term-rule-tracking-container">
        <div className="middle_container budget_container">

          <div className="mb-4">
            <Breadcrumb
              paths={[
                { label: "Search Term Rules", link: "/search-term-rule" },
                { label: "History" }
              ]}
              onBack={() => navigate("/search-term-rule")}
            />
          </div>

          <div className="data_content data_content_btn glass-grid-container h-maxContent">
            <div className="camapgin_btn flex flex-wrap justify-between items-center gap-3 pt-4 px-4">
              <div className={`flex flex-col ${isMobile ? "w-full" : ""}`}>
                <h5 className="m-0">{t("Search Term Rule History")}</h5>
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
            {PermissionCheck(SYSTEM_PAGES.SEARCH_TERM_RULE_HISTORY, PAGE_ACTIONS.VIEW_ONLY) && (
              <div className="data_table">
                <AgTable ref={gridRef}
                  tableId="search-term-history-table"
                  height={"70vh"}
                  rowData={displayTableData}
                  columnDefs={columns}
                  totalRecords={gridConfig?.totalRecords || 0}
                  perPage={perPage}
                  currentPage={arg?.pageNo || 1}
                  loading={loadingGrid}
                  onRefresh={() => SearchTermHistoryList({ pageNo: arg?.pageNo || 1, perPage })}
                  onPageChange={handlePageChange}
                  onPerPageChange={handlePerRowsChange}
                  onSortChanged={handleSortChanged}
                  paginationOptions={paginationRowsPerPageOptions}
                  isCustomSaveColumns={true}
                  customSaveColumnName={"Search Term Rule History"}
                  handleSaveColumns={undefined}
                />
              </div>
            )}
          </div>

          <AffectedHistoryModel
            show={showHistoryModal?.show}
            onClose={() => setShowHistoryModal(null)}
            data={Array.isArray(showHistoryModal?.data) ? showHistoryModal?.data : []}
          />
        </div>
      </div>
    </>
  );
}

export default SearchTermHistory;
