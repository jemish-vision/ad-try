import React, { useState, useEffect, useCallback, useContext, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment-timezone";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import { ApiSearchTermCampaign } from "../../../../api-wrapper/search-term/ApiSearchTerm";
import AgTable from "../../../../common/grid/AgTable";
import CurrencyCode from "../../../../helper/currencyCode/CurrencyCode";
import CurrencyFormat from "../../../../helper/currencyCode/CurrencyFormat";
import { Search, RefreshCw } from "lucide-react";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../../helper/table/TableStyle";

const SearchTermSection = ({ campaignDetails, date, viewPress, isActive = true }) => {
  const { t } = useTranslation();
  const { profileId, today, selectedAdType } = useContext(ProfileContext);

  const [searchTermData, setSearchTermData] = useState([]);
  const [totalRow, setTotalRow] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(firstPageRows);
  const [sortModel, setSortModel] = useState({ fieldName: "totalSales", sortType: "DESC" });

  const gridRef = useRef(null);
  const hasFetchedRef = useRef(false);

  const fetchSearchTermData = useCallback(
    async (targetPage = page, targetPerPage = perPage, targetSort = sortModel) => {
      const campaignId = campaignDetails?.campaignId;
      if (!profileId?.value || !campaignId) return;

      setLoading(true);
      try {
        const fromDate = date?.[0] ? moment(date[0]).format("YYYY-MM-DD") : today;
        const toDate = date?.[1] ? moment(date[1]).format("YYYY-MM-DD") : today;

        const payload = {
          profileId: profileId.value,
          fromDate,
          toDate,
          searchTermPageNo: targetPage,
          searchTermPerPage: targetPerPage,
          status: "",
          fieldName: targetSort?.fieldName || "totalSales",
          sortType: targetSort?.sortType || "DESC",
        };

        const rowAdType = campaignDetails?.adType || campaignDetails?.type;
        const stOptions = ["SP", "SB", "SD"].includes(rowAdType)
          ? { headers: { adType: rowAdType } }
          : {};

        const res = await ApiSearchTermCampaign(campaignId, payload, stOptions);
        if (res?.isSuccess) {
          setSearchTermData(res.getSearchTermData || []);
          setTotalRow(res.totalRow || null);
          setTotalRecords(res?.totalSearchTermData ?? res?.totalSearchTerm ?? res?.totalRecords ?? 0);
        } else {
          setSearchTermData([]);
          setTotalRow(null);
          setTotalRecords(0);
        }
      } catch (err) {
        setSearchTermData([]);
        setTotalRow(null);
        setTotalRecords(0);
      } finally {
        setLoading(false);
      }
    },
    [profileId?.value, campaignDetails?.campaignId, campaignDetails?.adType, campaignDetails?.type, date, today, page, perPage, sortModel]
  );

  // Invalidate cached fetch on filter/date/campaign changes
  useEffect(() => {
    hasFetchedRef.current = false;
  }, [date?.[0], date?.[1], profileId?.value, selectedAdType, campaignDetails?.campaignId, viewPress]);

  // Fetch when active or invalid
  useEffect(() => {
    if (isActive && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchSearchTermData(1, perPage, sortModel);
      setPage(1);
    }
  }, [isActive, viewPress, date?.[0], date?.[1], profileId?.value, selectedAdType, campaignDetails?.campaignId]);

  const handleSortChanged = useCallback(
    (e) => {
      const sortState = e?.api?.getColumnState().find((col) => col.sort != null);
      const colId = sortState?.colId || "totalSales";
      const sort = sortState?.sort === "asc" ? "ASC" : "DESC";
      const newSort = { fieldName: colId, sortType: sort };
      setSortModel(newSort);
      setPage(1);
      fetchSearchTermData(1, perPage, newSort);
    },
    [fetchSearchTermData, perPage]
  );

  // Stable row references
  const rowData = useMemo(() => searchTermData || [], [searchTermData]);
  const pinnedBottomRowData = useMemo(() => (totalRow ? [{ ...totalRow, isTotalRow: true }] : []), [totalRow]);

  const getRowId = useCallback((params) => {
    if (params.data?.isTotalRow) return "search_term_total_row";
    return `${params.data?.searchTerm || params.data?.productName || ""}_${params.data?.adGroupId || ""}_${params.node?.rowIndex ?? ""}`;
  }, []);

  const columnDefs = useMemo(
    () => [
      {
        headerName: t("customerSearchTerm"),
        field: "productName",
        width: 350,
        pinned: "left",
        lockPinned: true,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => {
          const row = params.data;
          if (!row) return null;
          if (row.isTotalRow) {
            return (
              <span className="font-bold text-slate-900 dark:text-white flex items-center h-full">
                {row.productName || t("Total")}
              </span>
            );
          }
          const isDifferent = row.searchTerm && row.productName && row.searchTerm !== row.productName;
          return (
            <div className="flex flex-col justify-center h-full py-1 leading-tight">
              <span
                className="font-medium text-slate-800 dark:text-slate-200 text-xs truncate max-w-[320px]"
                title={row.productName || row.searchTerm}
              >
                {row.productName || row.searchTerm}
              </span>
              {isDifferent && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate max-w-[320px]">
                  {t("asins")}: {String(row.searchTerm).toUpperCase()}
                </span>
              )}
            </div>
          );
        },
      },
      {
        headerName: t("impressions"),
        field: "totalImpressions",
        width: 140,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
      },
      {
        headerName: t("clicks"),
        field: "totalClicks",
        width: 120,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
      },
      {
        headerName: t("sales"),
        field: "totalSales",
        width: 140,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => (params.value ? CurrencyCode(params.value) : "-"),
      },
      {
        headerName: t("Purchases"),
        field: "totalOrders",
        width: 110,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
      },
      {
        headerName: t("spend"),
        field: "totalSpend",
        width: 140,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => (params.value ? CurrencyCode(params.value) : "-"),
      },
      {
        headerName: t("acos"),
        field: "totalAcos",
        width: 120,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => (params.value != null ? `${params.value}%` : "-"),
      },
      {
        headerName: t("roas"),
        field: "totalRoas",
        width: 110,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => (params.value != null ? `${params.value}` : "-"),
      },
      {
        headerName: t("ctr"),
        field: "totalCtr",
        width: 110,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => (params.value != null ? `${params.value}%` : "-"),
      },
      {
        headerName: t("cpc"),
        field: "totalCpc",
        width: 120,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => (params.value ? CurrencyCode(params.value) : "-"),
      },
      {
        headerName: t("conversionRate"),
        field: "totalCvr",
        width: 180,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => (params.value != null ? `${params.value}%` : "-"),
      },
    ],
    [t]
  );

  return (
    <div className="w-full overflow-hidden">
      {/* ── Section Header ── */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Search className="w-4 h-4" />
          </div>
          <div>
            <h5 className="text-base font-bold text-slate-800 dark:text-slate-100 m-0">{t("searchTerm")}</h5>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {totalRecords || 0} {(totalRecords || 0) === 1 ? t("record") : t("records")}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchSearchTermData(page, perPage, sortModel)}
          className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          title={t("Refresh")}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-500" : ""}`} />
        </button>
      </div>

      {/* ── AG Grid Table ── */}
      <div className="data_table" id="searchterm-view-table">
        <AgTable
          ref={gridRef}
          tableId="searchterm-view-table"
          loading={loading}
          isLoading={loading}
          rowData={rowData}
          pinnedBottomRowData={pinnedBottomRowData}
          columnDefs={columnDefs}
          totalRecords={totalRecords || 0}
          perPage={perPage}
          currentPage={page}
          rowHeight={48}
          getRowId={getRowId}
          onPageChange={(newPage) => {
            setPage(newPage);
            fetchSearchTermData(newPage, perPage, sortModel);
          }}
          onPerPageChange={(newPerPage) => {
            setPerPage(newPerPage);
            setPage(1);
            fetchSearchTermData(1, newPerPage, sortModel);
          }}
          onSortChanged={handleSortChanged}
          paginationOptions={paginationRowsPerPageOptions}
        />
      </div>
    </div>
  );
};

export default React.memo(SearchTermSection);
