import React, { useState, useEffect, useContext, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import Filter from "../../../helper/filter/Filter";
import { ApiKeywordAnalysis } from "../../../api-wrapper/search-term/ApiSearchTerm";
import moment from "moment";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { MultiSelect } from "../../../components/ui/multi-select";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { KeywordAnalysisGrid } from "./KeywordAnalysisGrid";
import { MdOutlineClose } from "react-icons/md";
import { useDispatch } from "react-redux";
import { Toast, handleLoader } from "../../../helper/links/Link";
import { ApiStatusChange } from "../../../api-wrapper/targeting/ApiTargeting";
import StatusConfirmModal from "./StatusConfirmModal";
import { Button as ShadcnButton } from "../../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import CustomizeColumns from "../../../helper/modal/CustomizeColumns";
import { ApiListGetColumns, ApiListUpdateColumns } from "../../../api-wrapper/columns/ApiColumns";

// ─── Theme ────────────────────────────────────────────────────────────────────
const P = {
  primary: "#1A9FD4",
  primary50: "#E0F4FD",
  neutral100: "#F1F5F9",
  neutral200: "#E2E8F0",
  neutral400: "#94A3B8",
  neutral600: "#475569",
  neutral800: "#1E293B",
};

// ─── Campaign Status Options ──────────────────────────────────────────────────
const CAMPAIGN_STATUS_STYLES = {
  ENABLED: { label: "Enabled", color: "#16A34A" },
  PAUSED: { label: "Paused", color: "#F59E0B" },
  ARCHIVED: { label: "Archived", color: "#94A3B8" },
};

// ─── Main Component ───────────────────────────────────────────────────────────
const KeywordAnalysis = () => {
  const { t } = useTranslation();
  const { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);

  const campaignStatusOptions = React.useMemo(() => Object.keys(CAMPAIGN_STATUS_STYLES).map(key => ({
    value: key,
    label: (
      <div className="flex items-center" style={{ gap: 8, fontSize: 12 }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: CAMPAIGN_STATUS_STYLES[key].color,
          display: "inline-block"
        }} />
        <span>{t(CAMPAIGN_STATUS_STYLES[key].label)}</span>
      </div>
    ),
    searchLabel: t(CAMPAIGN_STATUS_STYLES[key].label)
  })), [t]);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    window.addEventListener("themeChanged", handle);
    return () => window.removeEventListener("themeChanged", handle);
  }, []);



  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  const [dateRange, setDateRange] = useState(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      return [moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()];
    }
    return [moment().subtract(60, "days").toDate(), new Date()];
  });

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      const newD1 = moment(selectedDate[0]).toDate();
      const newD2 = moment(selectedDate[1]).toDate();
      setDateRange((prevDate) => {
        if (
          prevDate &&
          prevDate.length >= 2 &&
          moment(prevDate[0]).format("YYYY-MM-DD") === moment(newD1).format("YYYY-MM-DD") &&
          moment(prevDate[1]).format("YYYY-MM-DD") === moment(newD2).format("YYYY-MM-DD")
        ) {
          return prevDate;
        }
        return [newD1, newD2];
      });
    }
  }, [selectedDate]);
  const [campaignStatus, setCampaignStatus] = useState(["ENABLED"]);

  // ── Grid state ────────────────────────────────────────────────────────────
  const [gridData, setGridData] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [gridPage, setGridPage] = useState(1);
  const [gridPerPage, setGridPerPage] = useState(25);
  const [sortCol, setSortCol] = useState("targeting");
  const [sortOrder, setSortOrder] = useState("asc");

  // ── Selection and Status action states ─────────────────────────────────────
  const dispatch = useDispatch();
  const [selectedRows, setSelectedRows] = useState([]);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    action: "",
    items: [],
  });

// ─── Customizable Columns Definitions ─────────────────────────────────────────
const KEYWORD_ANALYSIS_COLUMNS = [
  { title: "Search Term" },
  { title: "Campaign" },
  { title: "Impressions" },
  { title: "Clicks" },
  { title: "Spend" },
  { title: "Sales" },
  { title: "Orders" },
  { title: "CPC" },
  { title: "CTR" },
  { title: "CVR" },
  { title: "ACoS" },
  { title: "RoAS" },
];

  // ── Custom Columns states ──────────────────────────────────────────────────
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [defaultColumns] = useState(["Search Term"]);

  useEffect(() => {
    const fetchCustomColumns = async () => {
      const body = { pageName: "Keyword Analysis" };
      const response = await ApiListGetColumns(body);

      if (response?.isSuccess && response?.data && response?.data?.columns?.length) {
        const visible = KEYWORD_ANALYSIS_COLUMNS
          .map(c => ({ ...c, ...response?.data?.columns.find(col => col.title === c.title) }))
          .filter(c => c?.isDisplay || !c?.title)
          .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
          .filter(Boolean);

        setVisibleColumns(visible);
      } else {
        setVisibleColumns(KEYWORD_ANALYSIS_COLUMNS);
      }
    };

    if (profileId?.value && selectedAdType) fetchCustomColumns();
  }, [profileId?.value, selectedAdType]);

  const handleSaveColumns = async (selectedColumns) => {
    const visible = KEYWORD_ANALYSIS_COLUMNS
      .map(c => ({ ...c, ...selectedColumns.find(col => col.title === c.title) }))
      .filter(c => c?.isDisplay || !c?.title)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .filter(Boolean);

    setVisibleColumns(visible);
    setShowCustomizeModal(false);

    const body = {
      pageName: "Keyword Analysis",
      columns: selectedColumns,
    };
    const response = await ApiListUpdateColumns(body);
    if (response?.isSuccess && response?.data?.columns) {
      const updated = KEYWORD_ANALYSIS_COLUMNS
        .map(c => ({ ...c, ...response?.data?.columns.find(col => col.title === c.title) }))
        .filter(c => c?.isDisplay || !c?.title)
        .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
        .filter(Boolean);

      setVisibleColumns(updated);
    }
  };

  const handleSelectionChanged = (rows) => {
    setSelectedRows(rows || []);
  };

  const handleSingleStatusClick = (targetId, targeting, campaignName, currentStatus) => {
    setConfirmModal({
      show: true,
      action: currentStatus,
      items: [{ targetId, targeting, campaignName }],
    });
  };

  const handleBulkAction = (action) => {
    setIsPopoverOpen(false);
    const itemsToChange = [];
    selectedRows.forEach(row => {
      const selectedCampId = row.selectedCampaignId;
      (row.campaigns || []).forEach(c => {
        // If specific campaign is selected, skip others
        if (selectedCampId !== "ALL" && String(c.campaignId) !== String(selectedCampId)) {
          return;
        }

        if (c.targetId) {
          const currentStatus = (c.campaignStatus || "").toUpperCase();
          if (action === "ENABLED" && currentStatus === "PAUSED") {
            itemsToChange.push({
              targetId: c.targetId,
              targeting: row.targeting,
              campaignName: c.campaignName
            });
          } else if (action === "PAUSED" && currentStatus === "ENABLED") {
            itemsToChange.push({
              targetId: c.targetId,
              targeting: row.targeting,
              campaignName: c.campaignName
            });
          }
        }
      });
    });

    if (itemsToChange.length === 0) {
      Toast.error(`No keywords found to ${action === "ENABLED" ? "enable" : "pause"} (already done).`);
      return;
    }

    setConfirmModal({
      show: true,
      action,
      items: itemsToChange,
    });
  };

  const handleConfirmStatusChange = async () => {
    const actionType = confirmModal.action;
    const items = confirmModal.items;
    
    setConfirmModal(prev => ({ ...prev, show: false }));
    dispatch(handleLoader(true));
    try {
      const targetIds = items.map(item => item.targetId);

      const res = await ApiStatusChange({
        profileId: profileId?.value,
        targetIds,
        status: actionType,
      });

      if (res?.isSuccess) {
        Toast.success(res.message || "Keyword status updated successfully.");
        setSelectedRows([]);
        fetchGrid(gridPage, gridPerPage);
      } else {
        Toast.error(res?.message || "Failed to update keyword status.");
      }
    } catch (err) {
      Toast.error(t("Something went wrong. Please try again."));
    } finally {
      dispatch(handleLoader(false));
    }
  };

  const lastFetchParamsRef = useRef("");
  const fetchIdRef = useRef(0);

  const handleRefresh = () => {
    fetchGrid(gridPage, gridPerPage, sortCol, sortOrder, true);
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchGrid = async (
    page = gridPage,
    perPage = gridPerPage,
    col = sortCol,
    order = sortOrder,
    isReload = false
  ) => {
    if (!profileId?.value) return;

    const fromDateStr = dateRange?.[0] ? moment(dateRange[0]).format("YYYY-MM-DD") : undefined;
    const toDateStr = dateRange?.[1] ? moment(dateRange[1]).format("YYYY-MM-DD") : undefined;

    // adType travels as a header, not in the body — include it in the dedup
    // signature so switching SP/SB/SD/All isn't mistaken for a duplicate.
    const requestSignature = JSON.stringify({
      profileId: profileId.value,
      adType: selectedAdType,
      searchTermPageNo: page,
      searchTermPerPage: perPage,
      fromDate: fromDateStr,
      toDate: toDateStr,
      search: debouncedSearch?.trim() || "",
      campaignStatus: campaignStatus || [],
      fieldName: col || "",
      sortType: order || ""
    });

    if (!isReload && lastFetchParamsRef.current === requestSignature) {
      return;
    }

    lastFetchParamsRef.current = requestSignature;
    const currentFetchId = ++fetchIdRef.current;
    setLoading(true);
    try {
      const payload = {
        profileId: profileId.value,
        searchTermPageNo: page,
        searchTermPerPage: perPage,
        fromDate: fromDateStr,
        toDate: toDateStr,
        // targeting is optional search filter — only send if user typed something
        ...(debouncedSearch?.trim() && { targeting: debouncedSearch.trim() }),
        // campaignStatus is optional — only send if user selected at least one
        ...(campaignStatus?.length > 0 && { campaignStatus: campaignStatus }),
        fieldName: col || undefined,
        sortType: order === "desc" ? "DESC" : order === "asc" ? "ASC" : undefined,
      };

      const res = await ApiKeywordAnalysis(payload);

      // Discard a stale response if a newer request (ad-type / filter change) started.
      if (currentFetchId !== fetchIdRef.current) return;

      if (res?.isSuccess) {
        setGridData(res.getKeywordAnalysisData || []);
        setTotalRecords(res.totalKeywordAnalysisData || 0);
        setGridPage(page);
      }
    } catch (err) {
      console.error("Keyword Analysis Error:", err);
    } finally {
      if (currentFetchId === fetchIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    lastFetchParamsRef.current = "";
  }, [profileId?.value]);

  // Re-fetch on filter change
  useEffect(() => {
    if (!profileId?.value) return;
    setSelectedRows([]);
    fetchGrid(1);
  }, [profileId?.value, selectedAdType, debouncedSearch, dateRange, campaignStatus]);

  const handleGridSort = (e) => {
    const columnState = e.api.getColumnState();
    const sorted = columnState.find((s) => s.sort !== null);
    if (sorted) {
      const { colId, sort } = sorted;
      setSortCol(colId);
      setSortOrder(sort);
      fetchGrid(gridPage, gridPerPage, colId, sort);
    } else {
      setSortCol(null);
      setSortOrder(null);
      fetchGrid(gridPage, gridPerPage, null, null);
    }
  };

  const refreshGrid = () => fetchGrid(1);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="keyword-analysis-container" id="keyword-analysis-page">
      <Filter nameShow={false} dateShow={false} profileShow={true} />



      {/* ── Sticky Top Bar ── */}
      <div
        id="keyword-analysis-filters"
        className={`glass-sticky-header ${!isMobile ? "sticky-top" : ""}`}
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          columnGap: 12,
          rowGap: 10,
          padding: isMobile ? "10px 16px" : "10px 24px",
          zIndex: 90,
          top: 0,
          marginLeft: 0,
          marginRight: 0,
          marginTop: "-10px",
          marginBottom: "20px",
        }}
      >
        {/* Search — optional keyword filter */}
        <div
          id="keyword-analysis-search"
          className="search_option"
          style={{
            display: "flex",
            alignItems: "center",
            position: "relative",
            height: 40,
            flex: "1 1 auto",
            minWidth: 150,
            maxWidth: 320,
          }}
        >
          <input
            type="text"
            value={search}
            placeholder={t("Search by keyword / targeting...")}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setDebouncedSearch(search)}
            style={{ flexGrow: 1, width: "100%", height: "40px", border: "none", outline: "none", background: "transparent", boxShadow: "none", paddingRight: search ? "30px" : "10px" }}
          />
          {search && (
            <MdOutlineClose
              onClick={() => setSearch("")}
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

        {/* Right-aligned filters group */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginLeft: "auto", justifyContent: "flex-end" }}>
          {/* Campaign Status Filter */}
          <div id="keyword-analysis-status" style={{ flex: "0 0 200px" }}>
            <MultiSelect
              options={campaignStatusOptions}
              value={campaignStatus}
              onChange={(val) => setCampaignStatus(val || [])}
              placeholder={t("Campaign Status")}
              maxCount={1}
            />
          </div>

          {/* Bulk Actions Dropdown (Contextual) */}
          {selectedRows.length > 0 && (
            <div id="bulk-actions-dropdown" style={{ flex: "0 0 auto" }}>
              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                  <ShadcnButton
                    variant="outline"
                    className="customize-button m-0 gap-2 whitespace-nowrap"
                    style={{ height: 40 }}
                  >
                    <i className="fa-solid fa-layer-group opacity-70" />
                    {t("Bulk actions")}
                    <span
                      className="flex items-center justify-center text-[10px] font-bold"
                      style={{
                        minWidth: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "var(--accent-primary, #1A9FD4)",
                        color: "#fff",
                        padding: "0 4px"
                      }}
                    >
                      {selectedRows.length}
                    </span>
                    <i className="fa fa-chevron-down text-[10px] opacity-70" />
                  </ShadcnButton>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[200px] z-[9999] bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 p-1 rounded-lg shadow-md">
                  <div className="px-2 py-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {t("Quick Actions")}
                  </div>
                  <hr className="my-1 border-slate-100 dark:border-white/10" />
                  <div
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white font-medium"
                    onClick={() => handleBulkAction("ENABLED")}
                  >
                    <i className="fa-solid fa-play text-green-600 text-xs" style={{ width: 12, textAlign: "center" }} />
                    {t("Enable Selected")}
                  </div>
                  <div
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white font-medium"
                    onClick={() => handleBulkAction("PAUSED")}
                  >
                    <i className="fa-solid fa-pause text-amber-500 text-xs" style={{ width: 12, textAlign: "center" }} />
                    {t("Pause Selected")}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Date Range */}
          <div id="keyword-analysis-date-picker" style={{ flex: "1 1 auto", minWidth: 200, maxWidth: 260 }}>
            <DateRangePicker
              className="w-full"
              ranges={predefinedRanges}
              value={dateRange}
              placeholder={t("Select Date Range")}
              onChange={setDateRange}
              placement="bottomEnd"
              format="yyyy-MM-dd"
              cleanable={false}
              style={{ height: 40, width: "100%" }}
            />
          </div>

          {/* Columns Customization Button */}
          <div style={{ flex: "0 0 auto" }}>
            <AppTooltip text={t("Customize Columns")} id="keyword-analysis-customize-columns">
              <ShadcnButton
                variant="outline"
                onClick={() => setShowCustomizeModal(true)}
                className="customize-button m-0 gap-0 custom-secondary-btn"
                style={{ height: 40, whiteSpace: "nowrap", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                {t("Columns")}
                <span style={{ fontSize: 9, marginLeft: 6, display: "inline-block", verticalAlign: "middle" }}>▼</span>
              </ShadcnButton>
            </AppTooltip>
          </div>
        </div>
      </div>

      {/* ── Page Content ── */}
      <div className="middle_container">
        <div className="data_content data_content_btn m-0 h-maxContent">
          <KeywordAnalysisGrid
            onRefresh={handleRefresh}
            rowData={gridData}
            totalRecords={totalRecords}
            loading={loading}
            currentPage={gridPage}
            rowsPerPage={gridPerPage}
            onPageChange={(p) => fetchGrid(p)}
            onPerPageChange={(pp) => { setGridPerPage(pp); fetchGrid(1, pp); }}
            onSortChanged={handleGridSort}
            onSelectionChanged={handleSelectionChanged}
            onStatusClick={handleSingleStatusClick}
            visibleColumns={visibleColumns}
            defaultColumns={defaultColumns}
            handleSaveColumns={handleSaveColumns}
            onOpenCustomizeModal={() => setShowCustomizeModal(true)}
          />
        </div>
      </div>

      <StatusConfirmModal
        show={confirmModal.show}
        action={confirmModal.action}
        selectedItems={confirmModal.items}
        onHide={() => setConfirmModal({ show: false, action: "", items: [] })}
        onConfirm={handleConfirmStatusChange}
      />

      <CustomizeColumns
        showModal={showCustomizeModal}
        setShowModal={setShowCustomizeModal}
        allColumns={KEYWORD_ANALYSIS_COLUMNS}
        selectedColumn={visibleColumns}
        handler={handleSaveColumns}
        defaultColumns={defaultColumns}
      />
    </div>
  );
};

export default KeywordAnalysis;