import React, { useState, useMemo, useEffect } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Search, X, Table2 } from "lucide-react";
import { formatMetricValue } from "./ReportKPICards";
import { displayColumns, friendlyLabel, friendlyTableTitle } from "./reportDisplay";

const EMPTY_ROWS = [];
const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function renderCellContent(col, val, row, { weekdayLabels, hourlyLabels, profileNames, reportCurrency }) {
  const isAdType = col.key === "adType" || (["SP", "SB", "SD"].includes(String(val)) && col.key !== "name");
  if (isAdType) {
    const type = String(val).toUpperCase();
    const colorClasses =
      type === "SP"
        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
        : type === "SB"
        ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold tracking-wider border ${colorClasses}`}>
        {type}
      </span>
    );
  }

  if (col.key === "changeType" && val) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 capitalize">
        {String(val)}
      </span>
    );
  }

  if (col.key === "status" && String(val) === "history_snapshot") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100/60 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/40">
        Snapshot
      </span>
    );
  }

  const weekday = weekdayLabels && ["weekday", "name"].includes(col.key)
    && /^[0-6]$/.test(String(val))
    ? WEEKDAY_LABELS[Number(val)]
    : null;
  const hour = hourlyLabels && col.key === "hour" && /^\d{1,2}$/.test(String(val)) && Number(val) < 24
    ? `${String(val).padStart(2, "0")}:00`
    : null;
  const timeParts = hourlyLabels && col.key === "name"
    ? String(val).match(/^(\d{1,2})\s*\/\s*([0-6])$/)
    : null;
  const timeLabel = timeParts && Number(timeParts[1]) < 24
    ? `${WEEKDAY_LABELS[Number(timeParts[2])]} ${timeParts[1].padStart(2, "0")}:00`
    : null;

  if (timeLabel) return timeLabel;
  if (hour) return hour;
  if (weekday) return weekday;

  if (col.type === "number") {
    const formatted = formatMetricValue(val, col.unit, col.currencyCode || reportCurrency);
    if (col.key === "sales") {
      if (val === 0) {
        return <span className="text-slate-400 dark:text-slate-500 font-normal">{formatted}</span>;
      }
      if (val > 0) {
        return <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{formatted}</span>;
      }
    }
    if (col.key === "orders" && val === 0) {
      return <span className="text-slate-400 dark:text-slate-500 font-normal">{formatted}</span>;
    }
    if (col.key === "acos") {
      if (val === "no_sales" || val == null) {
        return <span className="text-slate-400 dark:text-slate-600 font-normal">—</span>;
      }
      if (val === 0) {
        return <span className="text-slate-400 dark:text-slate-500 font-normal">{formatted}</span>;
      }
    }
    if (col.key === "cvr" && val === 0) {
      return <span className="text-slate-400 dark:text-slate-500 font-normal">{formatted}</span>;
    }
    return <span>{formatted}</span>;
  }

  if (col.key === "name" && row.profileId && (val === "Selected profile" || String(val) === String(row.profileId))) {
    return profileNames[row.profileId] || "Selected profile";
  }

  return String(val ?? "—");
}

export default function ReportTable({
  dataset,
  title,
  currencyCode = "USD",
  isExpanded = false,
  profileNames = {},
  weekdayLabels = false,
  hourlyLabels = false,
  periods = null,
}) {
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState("desc"); // 'asc' | 'desc'
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  const pageSize = isExpanded ? 10 : 5;

  const columns = displayColumns(dataset);
  const rawRows = dataset?.rows || EMPTY_ROWS;
  const reportCurrency = dataset?.currencyCode || currencyCode;

  useEffect(() => { setPage(0); }, [dataset, isExpanded]);

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rawRows;
    const lower = searchTerm.toLowerCase();
    return rawRows.filter((r) =>
      Object.values(r).some((v) => String(v).toLowerCase().includes(lower))
    );
  }, [rawRows, searchTerm]);

  const sortedRows = useMemo(() => {
    if (!sortField) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];
      if (va == null && vb == null) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      return sortDir === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [filteredRows, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pagedRows = sortedRows.slice(page * pageSize, (page + 1) * pageSize);

  const handleSort = (key) => {
    if (sortField === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(key);
      setSortDir("desc");
    }
    setPage(0);
  };

  if (!columns.length || !rawRows.length) return null;

  return (
    <div className="flex flex-col gap-2.5 p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900/80 shadow-xs relative z-10 overflow-visible transition-all">
      {/* Table Header Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
            <Table2 size={13} />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
            {friendlyTableTitle(title, periods)}
            {rawRows.length > 1 ? ` (${rawRows.length} results)` : ""}
          </span>
        </div>

        {rawRows.length > 5 && (
          <div className="relative flex items-center shrink-0">
            <Search size={11} className="absolute left-2.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(0);
              }}
              className="text-[11px] pl-7 pr-6 py-1 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/70 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500 transition-all w-28 sm:w-36"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-1.5 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={10} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table Container */}
      <div className="report-datatable-wrapper overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/30 dark:bg-slate-900/40">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-100/70 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 select-none">
              {columns.map((col) => {
                const isNumber = col.type === "number";
                const isSorted = sortField === col.key;
                return (
                  <th
                    key={col.key}
                    title={col.label || friendlyLabel(col.key, undefined, periods)}
                    onClick={() => handleSort(col.key)}
                    className={`px-3 py-2 cursor-pointer transition-colors group ${
                      isSorted
                        ? "bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold"
                        : "hover:bg-slate-200/50 dark:hover:bg-slate-800/80"
                    } ${isNumber ? "text-right" : "text-left"}`}
                  >
                    <div className={`flex items-center gap-1.5 ${isNumber ? "justify-end" : "justify-start"}`}>
                      <span className="tracking-wide">{friendlyLabel(col.key, col.label, periods)}</span>
                      {isSorted ? (
                        sortDir === "asc" ? (
                          <ArrowUp size={11} className="text-blue-600 dark:text-blue-400 shrink-0" />
                        ) : (
                          <ArrowDown size={11} className="text-blue-600 dark:text-blue-400 shrink-0" />
                        )
                      ) : (
                        <ArrowUpDown size={10} className="opacity-30 group-hover:opacity-80 transition-opacity shrink-0" />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {pagedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center">
                  <div className="flex flex-col items-center justify-center gap-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      No matching records found for <span className="font-semibold text-slate-700 dark:text-slate-200">"{searchTerm}"</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Clear search filter
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              pagedRows.map((row, idx) => (
                <tr
                  key={row._id || row.id || idx}
                  className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 even:bg-slate-50/20 dark:even:bg-slate-800/20 transition-colors"
                >
                  {columns.map((col) => {
                    const val = row[col.key];
                    const content = renderCellContent(col, val, row, {
                      weekdayLabels,
                      hourlyLabels,
                      profileNames,
                      reportCurrency,
                    });
                    const isNumber = col.type === "number";

                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap align-middle ${
                          isNumber ? "font-mono tabular-nums text-right" : "max-w-[260px] truncate"
                        }`}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {dataset?.page?.hasMore && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Showing {rawRows.length} of {dataset.page.total ?? "more"} results. Ask for the next results to continue.
        </p>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <span>
              Showing <strong className="font-semibold text-slate-700 dark:text-slate-300">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, sortedRows.length)}</strong> of <strong className="font-semibold text-slate-700 dark:text-slate-300">{sortedRows.length}</strong>
            </span>
            {searchTerm && <span className="text-[10px] text-blue-500 dark:text-blue-400 font-medium">(filtered)</span>}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 mr-1">
              Page {page + 1} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              title="Previous page"
              aria-label="Previous page"
              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-100 dark:hover:bg-slate-700/80 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              title="Next page"
              aria-label="Next page"
              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-100 dark:hover:bg-slate-700/80 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
