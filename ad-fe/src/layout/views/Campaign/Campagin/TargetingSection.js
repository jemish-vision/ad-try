import React, { useState, useEffect, useCallback, useContext, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment-timezone";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import {
  ApiTargetingListing,
  ApiAdjustBids,
  ApiStatusChange,
} from "../../../../api-wrapper/targeting/ApiTargeting";
import AgTable from "../../../../common/grid/AgTable";
import CurrencyCode, { getMarketplaceMinBid, getCurrencySymbol } from "../../../../helper/currencyCode/CurrencyCode";
import CurrencyFormat from "../../../../helper/currencyCode/CurrencyFormat";
import { Switch } from "../../../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { Search, RefreshCw, Layers, CheckCircle2, PauseCircle, Archive, SlidersHorizontal, X, Plus } from "lucide-react";
import { Toast, useDispatch } from "../../../../helper/links/Link";
import { PermissionCheck } from "../../../../helper/permission/PermissionCheck";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import InlineEditPopup from "../../../../helper/modal/InlineEditPopup";
import { StyledCheckbox } from "../../../../common/grid/StyledCheckbox";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../../helper/table/TableStyle";
import TargetingAdjustBidModal from "../../Targeting/Targeting/TargetingAdjustBidModal";
import AddKeywordsModal from "./AddKeywordsModal";
import { FiClock } from "react-icons/fi";
import TargetingHistoryModal from "./TargetingHistoryModal";
import { TargetingTypeBadge } from "../../../../utility/targetingUtils";

const TargetingSection = ({ campaignDetails, date, viewPress }) => {
  const { t } = useTranslation();
  const { profileId, today, currencyCode, countryCode } = useContext(ProfileContext);
  const dispatch = useDispatch();

  const [targetingData, setTargetingData] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalRow, setTotalRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ENABLED");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(firstPageRows);
  const [sortModel, setSortModel] = useState({ fieldName: "totalSales", sortType: "DESC" });

  // Row selection & bulk actions
  const [selectedRows, setSelectedRows] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);
  const [showAddKeywordsModal, setShowAddKeywordsModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);

  const handleOpenHistory = (row) => {
    setSelectedTarget(row);
    setShowHistoryModal(true);
  };

  const gridRef = useRef(null);

  // Check if current campaign is AUTO targeting
  const isAutoCampaign = useMemo(() => {
    const rawType = String(campaignDetails?.targetingType || campaignDetails?.targeting || "").toUpperCase();
    if (rawType === "AUTO") return true;
    if (rawType === "MANUAL") return false;

    // Fallback detection from targeting records
    if (targetingData && targetingData.length > 0) {
      const hasAutoTarget = targetingData.some((r) => {
        const kwType = String(r?.keywordType || "").toUpperCase();
        const matchType = String(r?.matchType || "").toUpperCase();
        const targetingText = String(r?.targeting || "").toLowerCase();
        return (
          kwType.includes("AUTO") ||
          matchType.includes("AUTO") ||
          targetingText === "(_targeting_auto_)" ||
          ["close-match", "loose-match", "complements", "substitutes"].includes(targetingText)
        );
      });
      if (hasAutoTarget) return true;
    }

    return false;
  }, [campaignDetails?.targetingType, campaignDetails?.targeting, targetingData]);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchName);
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  // Fetch Targeting Data
  const fetchTargetingData = useCallback(async (customPage, customPerPage, customSort) => {
    if (!profileId?.value || !campaignDetails?.campaignId) return;

    setLoading(true);
    try {
      const fromDate = date?.[0] ? moment(date[0]).format("YYYY-MM-DD") : today;
      const toDate = date?.[1] ? moment(date[1]).format("YYYY-MM-DD") : today;
      const targetCampaignId = Number(campaignDetails.campaignId) || campaignDetails.campaignId;

      const activePage = customPage || page;
      const activePerPage = customPerPage || perPage;
      const activeSort = customSort || sortModel;

      const queryObj = {
        campaignId: targetCampaignId,
        ...(statusFilter !== "ALL" && { status: statusFilter }),
      };

      const payload = {
        profileId: profileId.value,
        campaignId: targetCampaignId,
        query: JSON.stringify(queryObj),
        fromDate,
        toDate,
        pageNo: activePage,
        perPage: activePerPage,
        ...(debouncedSearch.trim() && { searchName: debouncedSearch.trim() }),
        ...(activeSort?.fieldName && {
          fieldName: activeSort.fieldName,
          sortType: activeSort.sortType,
        }),
      };

      const res = await ApiTargetingListing(payload);

      if (res?.isSuccess) {
        const rows = res?.getTargeting || res?.dataTable || [];
        setTargetingData(rows);
        setTotalRecords(res?.totalRecords || res?.totalTargetingData || rows.length);
        setTotalRow(res?.totalRow || null);
      } else {
        setTargetingData([]);
        setTotalRecords(0);
        setTotalRow(null);
      }
    } catch (err) {
      console.error("Error fetching campaign targeting data:", err);
      setTargetingData([]);
      setTotalRecords(0);
      setTotalRow(null);
    } finally {
      setLoading(false);
    }
  }, [profileId?.value, campaignDetails?.campaignId, date, today, page, perPage, debouncedSearch, statusFilter, sortModel]);

  useEffect(() => {
    fetchTargetingData();
  }, [fetchTargetingData, viewPress]);

  // Status toggle handler
  const handleStatusToggle = async (row, currentStatus) => {
    if (!row?.targetId) return;
    const newStatus = currentStatus === "ENABLED" ? "PAUSED" : "ENABLED";
    try {
      setActionLoading(true);
      const res = await ApiStatusChange({
        profileId: profileId?.value,
        targetIds: [row.targetId],
        status: newStatus,
      });

      if (res?.isSuccess) {
        Toast.success(res?.message || t("Status updated successfully"));
        // Optimistically update local state
        setTargetingData((prev) =>
          prev.map((item) =>
            item.targetId === row.targetId ? { ...item, status: newStatus } : item
          )
        );
      } else {
        Toast.error(res?.message || t("Failed to update status"));
      }
    } catch (err) {
      Toast.error(t("Something went wrong"));
    } finally {
      setActionLoading(false);
    }
  };

  // Inline bid update handler
  const handleUpdateBid = async (targetId, newBid) => {
    if (!targetId) return;
    const minMarketplaceBid = getMarketplaceMinBid(currencyCode, countryCode);
    const numericBid = parseFloat(newBid);
    if (isNaN(numericBid) || numericBid < minMarketplaceBid) {
      Toast.error(`${t("Bid must be at least")} ${getCurrencySymbol(currencyCode)}${minMarketplaceBid.toFixed(2)}`);
      return;
    }
    try {
      const res = await ApiAdjustBids({
        profileId: profileId?.value,
        targetIds: [targetId],
        bid: numericBid,
        actionType: "SET_BID",
      });

      if (res?.isSuccess) {
        Toast.success(res?.message || t("Bid updated successfully"));
        setTargetingData((prev) =>
          prev.map((item) =>
            item.targetId === targetId ? { ...item, keywordBid: numericBid } : item
          )
        );
      } else {
        Toast.error(res?.message || t("Failed to update bid"));
      }
    } catch (err) {
      Toast.error(t("Something went wrong"));
    }
  };

  // Bulk status update handler
  const handleBulkStatusChange = async (newStatus) => {
    if (!selectedRows.length) return;
    try {
      setActionLoading(true);
      const res = await ApiStatusChange({
        profileId: profileId?.value,
        targetIds: selectedRows,
        status: newStatus,
      });

      if (res?.isSuccess) {
        Toast.success(res?.message || t(`Targeting records set to ${newStatus.toLowerCase()}`));
        setSelectedRows([]);
        setSelectAll(false);
        fetchTargetingData();
      } else {
        Toast.error(res?.message || t("Failed to update status in bulk"));
      }
    } catch (err) {
      Toast.error(t("Something went wrong"));
    } finally {
      setActionLoading(false);
    }
  };

  // Sort change handler
  const handleSortChanged = (e) => {
    const sortDef = e?.columns?.reverse()?.[0];
    if (sortDef) {
      const newSort = {
        fieldName: sortDef.colId,
        sortType: sortDef.sortDef?.direction === "asc" ? "ASC" : "DESC",
      };
      setSortModel(newSort);
      fetchTargetingData(page, perPage, newSort);
    }
  };

  // Helper for match type badges
  const renderMatchTypeBadge = (type, matchType) => {
    const val = (matchType || type || "").toUpperCase();
    let bg = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700";

    if (val === "EXACT") {
      bg = "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border-purple-200 dark:border-purple-800/60";
    } else if (val === "PHRASE") {
      bg = "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-800/60";
    } else if (val === "BROAD") {
      bg = "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border-sky-200 dark:border-sky-800/60";
    } else if (val.includes("TARGETING") || val.includes("PRODUCT") || val.includes("ASIN")) {
      bg = "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60";
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${bg}`}>
        {val}
      </span>
    );
  };

  // AG Grid Column Definitions
  const columnDefs = useMemo(() => [
    // 1. Checkbox Selection
    {
      headerName: "",
      field: "targetId",
      maxWidth: 50,
      width: 50,
      pinned: "left",
      lockPinned: true,
      suppressMovable: true,
      headerComponent: () => (
        <div className="flex items-center justify-center w-full">
          <StyledCheckbox
            checked={selectAll}
            onChange={(e) => {
              if (e.target.checked) {
                const allIds = (targetingData ?? [])
                  .filter((r) => !r.isTotalRow && r.targetId)
                  .map((r) => r.targetId);
                setSelectedRows(allIds);
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
        if (!row || row?.isTotalRow || !row?.targetId) return null;
        return (
          <StyledCheckbox
            checked={selectedRows.includes(row.targetId)}
            onChange={(e) => {
              const id = row.targetId;
              if (e.target.checked) {
                setSelectedRows((prev) => [...prev, id]);
              } else {
                setSelectedRows((prev) => prev.filter((item) => item !== id));
                setSelectAll(false);
              }
            }}
          />
        );
      },
    },

    // 2. Active Status Toggle
    {
      headerName: t("active"),
      field: "status",
      width: 90,
      pinned: "left",
      lockPinned: true,
      suppressMovable: true,
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row || row?.isTotalRow) return null;
        const isEnabled = row.status === "ENABLED";
        return (
          <div className="flex items-center justify-center">
            <Switch
              checked={isEnabled}
              onCheckedChange={() => handleStatusToggle(row, row.status)}
              disabled={!PermissionCheck(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.UPDATE) || actionLoading}
              className="scale-90"
            />
          </div>
        );
      },
    },

    // 3. Targeting Expression / Keyword
    {
      headerName: t("targeting"),
      field: "targeting",
      width: 320,
      pinned: "left",
      lockPinned: true,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        if (row.isTotalRow) {
          return <span className="font-bold text-slate-800 dark:text-slate-100">{t("Total")}</span>;
        }

        const statusClass =
          row.status === "PAUSED" ? "pending"
            : row.status === "ENABLED" ? "completed"
              : row.status === "ARCHIVED" ? "archived" : "";

        const text = row.targeting || row.resolvedText || row.keywordText || "-";

        return (
          <div className="flex items-center gap-2 py-1">
            <div className={`customStatus ${statusClass} flex-shrink-0`}></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate m-0" title={text}>
                  {text}
                </p>
                <TargetingTypeBadge
                  matchType={row.matchType}
                  targeting={text}
                  keywordType={row.keywordType}
                />
              </div>
              {row.adGroupName && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate block">
                  {row.adGroupName}
                </span>
              )}
            </div>
          </div>
        );
      },
    },

    // 4. Match / Targeting Type
    {
      headerName: t("Targeting Type"),
      field: "matchType",
      width: 140,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row || row?.isTotalRow) return null;
        return (
          <div className="flex items-center h-full">
            <TargetingTypeBadge
              matchType={row.matchType}
              targeting={row.targeting}
              keywordType={row.keywordType}
              full
            />
          </div>
        );
      },
    },

    // 5. Bid with Inline Edit
    {
      headerName: t("bid"),
      field: "keywordBid",
      width: 130,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        if (row.isTotalRow) return "-";
        const numericBid = Number(typeof row.keywordBid === "object" ? row.keywordBid?.$numberDecimal : row.keywordBid);
        return (
          <InlineEditPopup
            value={isNaN(numericBid) ? "" : numericBid}
            formatter={(v) => CurrencyCode(v)}
            title={t("Bid")}
            min={getMarketplaceMinBid(currencyCode, countryCode)}
            currency={currencyCode}
            onSave={async (newBid) => await handleUpdateBid(row.targetId, newBid)}
            disabled={!PermissionCheck(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.UPDATE)}
          />
        );
      },
    },

    // 6. Impressions
    {
      headerName: t("impressions"),
      field: "impressions",
      width: 130,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
    },

    // 7. Clicks
    {
      headerName: t("clicks"),
      field: "clicks",
      width: 120,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
    },

    // 8. Sales
    {
      headerName: t("sales"),
      field: "sales",
      width: 130,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => (params.value != null ? CurrencyCode(params.value) : "-"),
    },

    // 9. Orders
    {
      headerName: t("Orders"),
      field: "orders",
      width: 110,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
    },

    // 10. Spend
    {
      headerName: t("spend"),
      field: "spend",
      width: 130,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => (params.value != null ? CurrencyCode(params.value) : "-"),
    },

    // 11. ACOS
    {
      headerName: t("acos"),
      field: "acos",
      width: 110,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => (params.value != null ? `${params.value}%` : "-"),
    },

    // 12. ROAS
    {
      headerName: t("roas"),
      field: "roas",
      width: 110,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => (params.value != null ? `${params.value}` : "-"),
    },

    // 13. CTR
    {
      headerName: t("ctr"),
      field: "ctr",
      width: 110,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return "-";
        if (row.ctr != null && row.ctr !== "") {
          return `${Number(row.ctr).toFixed(2)}%`;
        }
        if (row.impressions > 0 && row.clicks >= 0) {
          return `${((row.clicks / row.impressions) * 100).toFixed(2)}%`;
        }
        return "0.00%";
      },
    },

    // 14. CPC
    {
      headerName: t("cpc"),
      field: "cpc",
      width: 120,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return "-";
        if (row.cpc != null && row.cpc !== "") {
          return CurrencyCode(row.cpc);
        }
        if (row.clicks > 0 && row.spend != null) {
          return CurrencyCode(row.spend / row.clicks);
        }
        return CurrencyCode(0);
      },
    },

    // 15. Conversion Rate
    {
      headerName: t("conversionRate"),
      field: "cvr",
      width: 140,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return "-";
        const val = row.cvr ?? row.conversionRate ?? row.totalCvr;
        if (val != null && val !== "") {
          return `${Number(val).toFixed(2)}%`;
        }
        if (row.clicks > 0 && row.orders >= 0) {
          return `${((row.orders / row.clicks) * 100).toFixed(2)}%`;
        }
        return "0.00%";
      },
    },

    // 16. History
    {
      headerName: t("History"),
      field: "history",
      width: 100,
      pinned: "right",
      sortable: false,
      resizable: false,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row || row?.isTotalRow || !row?.targetId) return null;
        return (
          <div className="flex items-center justify-center h-full">
            <button
              type="button"
              onClick={() => handleOpenHistory(row)}
              className="px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-800/40 border border-blue-200/50 dark:border-blue-700/50 transition-colors"
              title={t("View Bid History")}
            >
              <FiClock size={12} />
              <span>{t("History")}</span>
            </button>
          </div>
        );
      },
    },
  ], [t, selectAll, selectedRows, targetingData, actionLoading, currencyCode]);

  // Combined data with summary total row if available
  const tableRows = useMemo(() => {
    if (!targetingData || targetingData.length === 0) return [];
    if (totalRow) {
      return [...targetingData, { ...totalRow, isTotalRow: true }];
    }
    return targetingData;
  }, [targetingData, totalRow]);

  return (
    <div className="w-full overflow-hidden" id="campaign-targeting-section">
      {/* ── Top Bar Controls: Title, Search, Filter, Refresh ── */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h5 className="text-base font-bold text-slate-800 dark:text-slate-100 m-0">
              {t("targeting")}
            </h5>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {totalRecords} {totalRecords === 1 ? t("record") : t("records")}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Add Keywords Button (Manual Campaigns Only) */}
          {!isAutoCampaign && (
            <button
              type="button"
              onClick={() => setShowAddKeywordsModal(true)}
              className="h-[34px] px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("Add keywords")}
            </button>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder={t("Search targeting...")}
              className="h-[34px] pl-8 pr-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 w-[200px]"
            />
          </div>

          {/* Status Filter */}
          <div className="w-[140px]">
            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-[34px] text-xs bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                <SelectValue placeholder={t("Status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("allStatus")}</SelectItem>
                <SelectItem value="ENABLED">{t("enabled")}</SelectItem>
                <SelectItem value="PAUSED">{t("paused")}</SelectItem>
                <SelectItem value="ARCHIVED">{t("archived")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => fetchTargetingData()}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            title={t("Refresh")}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-sky-500" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Bulk Actions Bar ── */}
      {selectedRows.length > 0 && (
        <div className="m-3 flex flex-wrap items-center justify-between gap-3 p-3 bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-xl shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
              {t("Selected")}: {selectedRows.length} {selectedRows.length === 1 ? t("row") : t("rows")}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Bulk Enable */}
            <button
              type="button"
              onClick={() => handleBulkStatusChange("ENABLED")}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t("Enable")}
            </button>

            {/* Bulk Pause */}
            <button
              type="button"
              onClick={() => handleBulkStatusChange("PAUSED")}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition disabled:opacity-50"
            >
              <PauseCircle className="w-3.5 h-3.5" />
              {t("Pause")}
            </button>

            {/* Bulk Archive */}
            <button
              type="button"
              onClick={() => handleBulkStatusChange("ARCHIVED")}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition disabled:opacity-50"
            >
              <Archive className="w-3.5 h-3.5" />
              {t("Archive")}
            </button>

            {/* Bulk Adjust Bid */}
            <button
              type="button"
              onClick={() => setShowBidModal(true)}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition disabled:opacity-50"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {t("Adjust Bid")}
            </button>

            {/* Clear Selection */}
            <button
              type="button"
              onClick={() => {
                setSelectedRows([]);
                setSelectAll(false);
              }}
              className="p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition"
              title={t("Clear selection")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── AG Grid Table ── */}
      <div className="data_table" id="campaign-targeting-table">
        <AgTable
          ref={gridRef}
          tableId="campaign-targeting-table"
          loading={loading}
          isLoading={loading}
          rowData={tableRows}
          columnDefs={columnDefs}
          totalRecords={totalRecords || 0}
          perPage={perPage}
          currentPage={page}
          onPageChange={(newPage) => {
            setPage(newPage);
            fetchTargetingData(newPage, perPage);
          }}
          onPerPageChange={(newPerPage) => {
            setPerPage(newPerPage);
            setPage(1);
            fetchTargetingData(1, newPerPage);
          }}
          onSortChanged={handleSortChanged}
          paginationOptions={paginationRowsPerPageOptions}
        />
      </div>

      {/* ── Adjust Bid Modal ── */}
      {showBidModal && (
        <TargetingAdjustBidModal
          profileId={profileId}
          showBidModal={showBidModal}
          setShowBidModal={setShowBidModal}
          selectedRows={selectedRows}
          setSelectedRows={setSelectedRows}
          handleSubmit={fetchTargetingData}
        />
      )}

      {/* ── Add Keywords Modal ── */}
      {showAddKeywordsModal && (
        <AddKeywordsModal
          open={showAddKeywordsModal}
          onClose={() => setShowAddKeywordsModal(false)}
          campaignDetails={campaignDetails}
          date={date}
          onSuccess={() => fetchTargetingData()}
        />
      )}

      {/* ── Targeting Bid History Modal ── */}
      <TargetingHistoryModal
        show={showHistoryModal}
        setShow={setShowHistoryModal}
        targetId={selectedTarget?.targetId}
        targetText={selectedTarget?.targeting || selectedTarget?.resolvedText || selectedTarget?.keywordText}
        campaignId={campaignDetails?.campaignId || selectedTarget?.campaignId}
        campaignName={campaignDetails?.name || campaignDetails?.campaignName || selectedTarget?.campaignName}
        profileId={profileId?.value}
        adType={campaignDetails?.adType || "SP"}
        fromDate={date?.[0] ? moment(date[0]).format("YYYY-MM-DD") : today}
        toDate={date?.[1] ? moment(date[1]).format("YYYY-MM-DD") : today}
      />
    </div>
  );
};

export default TargetingSection;
