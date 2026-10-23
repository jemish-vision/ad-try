import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { ApiSubscriptionHistory } from "../../../api-wrapper/ApiPackages";
import Toast from "../../../common/helper/toast/Toast";
import { t } from "i18next";
import { FiCheckCircle, FiXCircle, FiUsers, FiSearch, FiTrendingUp } from "react-icons/fi";
import { TbCurrencyRupee } from "react-icons/tb";
import "./OwnerDashboard.css";
import { MdOutlineClose } from "react-icons/md";
import { Input } from "../../../components/ui/input";

const formatDate = (date) =>
  new Date(date).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

const STATUS_TABS = [
  { label: "Active", value: "active", countKey: "activeCount" },
  { label: "Canceled", value: "canceled", countKey: "canceledCount" },
  { label: "Expired", value: "expired", countKey: "expiredCount" },
  { label: "All", value: "all", countKey: null },
];

const OwnerDashboard = () => {
  const { t } = useTranslation();
  const [isDark, setIsDark] = useState(
    document.documentElement.getAttribute("data-theme") === "dark"
  );

  useEffect(() => {
    const handle = () =>
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [perPage, setPerPage] = useState(firstPageRows);
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState({});
  const [searchName, setSearchName] = useState("");
  const [summaryStats, setSummaryStats] = useState({
    totalRevenue: 0, totalCount: 0, activeCount: 0, canceledCount: 0, expiredCount: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [debouncedSearchName, setDebouncedSearchName] = useState("");
  const [status, setStatus] = useState("active");
  const [loadingGrid, setLoadingGrid] = useState(false);

  const gridRef = useRef(null);

  // Fetch summary stats (counts + revenue) on mount
  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const base = { pageNo: 1, perPage: 1, fieldName: "startDate", sortType: "DESC" };
        const [allRes, activeRes, canceledRes, expiredRes] = await Promise.all([
          ApiSubscriptionHistory({ ...base, status: "all" }),
          ApiSubscriptionHistory({ ...base, status: "active" }),
          ApiSubscriptionHistory({ ...base, status: "canceled" }),
          ApiSubscriptionHistory({ ...base, status: "expired" }),
        ]);
        setSummaryStats({
          totalRevenue: allRes?.revenue ?? 0,
          totalCount: allRes?.totalRecords ?? 0,
          activeCount: activeRes?.totalRecords ?? 0,
          canceledCount: canceledRes?.totalRecords ?? 0,
          expiredCount: expiredRes?.totalRecords ?? 0,
        });
      } catch { }
      setStatsLoading(false);
    };
    fetchStats();
  }, []);

  const ApiListing = async (extra = {}) => {
    setLoadingGrid(true);
    const payload = {
      pageNo: arg.pageNo,
      perPage: arg.perPage,
      searchName,
      status,
      fieldName: "startDate",
      sortType: "DESC",
      ...extra,
    };
    await ApiSubscriptionHistory(payload, true)
      .then((res) => {
        if (res?.isSuccess) {
          setData(res.data);
          setMeta(res);
        } else Toast.error(res.message);
      })
      .catch(() => Toast.error(t("Something went wrong")))
      .finally(() => setLoadingGrid(false));
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  useEffect(() => {
    ApiListing({ searchName: debouncedSearchName });
  }, [status, debouncedSearchName]);

  const getStatusBadgeStyle = (val) => {
    if (val === "active") {
      return isDark
        ? { backgroundColor: "rgba(6,125,98,0.25)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }
        : { backgroundColor: "#e6f4ea", color: "#137333", border: "1px solid rgba(19,115,51,0.15)" };
    }
    if (val === "cancelled" || val === "canceled") {
      return isDark
        ? { backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }
        : { backgroundColor: "#fce8e6", color: "#c5221f", border: "1px solid rgba(197,34,31,0.15)" };
    }
    return isDark
      ? { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.1)" }
      : { backgroundColor: "#f1f3f4", color: "#5f6368", border: "1px solid rgba(95,99,104,0.15)" };
  };

  const columns = [
    {
      headerName: t("Customer Name"), field: "fullName", title: t("Customer Name"),
      minWidth: 185, sortable: true, resizable: true, wrapText: true, autoHeight: true,
    },
    {
      headerName: t("Customer Email"), field: "email", title: t("Customer Email"),
      minWidth: 250, sortable: true, resizable: true, wrapText: true, autoHeight: true,
    },
    {
      headerName: t("Plan"), field: "packageName", title: t("Plan"),
      minWidth: 145, sortable: true, resizable: true, wrapText: true, autoHeight: true,
    },
    {
      headerName: t("Amount"), field: "price", title: t("Amount"),
      minWidth: 115, sortable: true, resizable: true, wrapText: true, autoHeight: true,
      cellRenderer: (params) => params.value != null ? `₹${params.value}` : "-",
    },
    {
      headerName: t("Status"), field: "status", title: t("Status"),
      minWidth: 135, sortable: true, resizable: true, wrapText: true, autoHeight: true,
      cellRenderer: (params) => {
        const val = params.value;
        return (
          <span
            className="text-capitalize"
            style={{
              fontSize: "12px", fontWeight: "700", padding: "4px 10px",
              minWidth: "85px", textAlign: "center", borderRadius: "4px",
              display: "inline-block", ...getStatusBadgeStyle(val),
            }}
          >
            {t(val)}
          </span>
        );
      },
    },
    {
      headerName: t("Start Date"), field: "startDate", title: t("Start Date"),
      minWidth: 135, sortable: true, resizable: true, wrapText: true, autoHeight: true,
      cellRenderer: (params) => params.value ? formatDate(params.value) : "-",
    },
    {
      headerName: t("End Date"), field: "endDate", title: t("End Date"),
      minWidth: 135, sortable: true, resizable: true, wrapText: true, autoHeight: true,
      cellRenderer: (params) => params.value ? formatDate(params.value) : "-",
    },
  ];

  const handlePageChange = (page) => { setArg((p) => ({ ...p, pageNo: page })); ApiListing({ pageNo: page }); };
  const handlePerRowsChange = (newPerPage) => { setPerPage(newPerPage); setArg({ pageNo: 1, perPage: newPerPage }); ApiListing({ pageNo: 1, perPage: newPerPage }); };
  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    ApiListing({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), ...arg });
  };

  const STAT_CARDS = [
    {
      icon: <TbCurrencyRupee size={23} />,
      label: "Total Revenue",
      value: statsLoading ? "—" : `₹${Number(summaryStats.totalRevenue || 0).toLocaleString("en-IN")}`,
      sub: "All-time earnings",
      accent: "blue",
    },
    {
      icon: <FiCheckCircle size={21} />,
      label: "Active Subscriptions",
      value: statsLoading ? "—" : summaryStats.activeCount,
      sub: "Currently active plans",
      accent: "green",
    },
    {
      icon: <FiXCircle size={21} />,
      label: "Cancelled",
      value: statsLoading ? "—" : summaryStats.canceledCount,
      sub: "Cancelled subscriptions",
      accent: "red",
    },
    {
      icon: <FiUsers size={21} />,
      label: "Total Subscriptions",
      value: statsLoading ? "—" : summaryStats.totalCount,
      sub: "All-time total",
      accent: "purple",
    },
  ];

  return (
    <>
      <Filter nameShow={false} dateShow={false} profileShow={true} />
      <div className="middle_container">

        {/* ── Hero Banner ───────────────────────────────────── */}
        <div id="od-hero" className="od-hero">
          <div className="od-hero-content">
            <div className="od-hero-tag">{t("Super Admin")}</div>
            <h1 className="od-hero-title">{t("Dashboard Overview")}</h1>
            <p className="od-hero-sub">
              {t("Manage subscriptions, monitor revenue, and track platform growth")}
            </p>
          </div>
          <div className="od-hero-icon-wrap">
            <FiTrendingUp size={52} />
          </div>
        </div>

        {/* ── Stat Cards ────────────────────────────────────── */}
        <div id="od-stats-grid" className="od-stats-grid">
          {STAT_CARDS.map((card) => (
            <div key={card.label} className={`od-stat-card od-stat-${card.accent}`}>
              <div className={`od-stat-icon-wrap od-icon-${card.accent}`}>
                {card.icon}
              </div>
              <div className="od-stat-body">
                <div className="od-stat-label">{t(card.label)}</div>
                <div className={`od-stat-value${statsLoading ? " od-stat-loading" : ""}`}>
                  {card.value}
                </div>
                <div className="od-stat-sub">{t(card.sub)}</div>
              </div>
              <div className={`od-stat-bg-orb od-orb-${card.accent}`} />
            </div>
          ))}
        </div>

        {/* ── Subscription Table Card ───────────────────────── */}
        <div className="od-table-card">
          <div className="od-table-top">
            <h5 className="od-table-title">{t("Subscription History")}</h5>

            <div className="od-table-controls">
              {/* Status filter tabs */}
              <div id="od-status-tabs" className="od-status-tabs">
                {STATUS_TABS.map((s) => (
                  <button
                    key={s.value}
                    className={`od-status-tab od-tab-${s.value}${status === s.value ? " active" : ""}`}
                    onClick={() => {
                      setStatus(s.value);
                      setArg((prev) => ({ ...prev, pageNo: 1 }));
                    }}
                  >
                    {t(s.label)}
                    {s.countKey && !statsLoading && (
                      <span className="od-tab-badge">{summaryStats[s.countKey] ?? 0}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div id="od-search" className="search_option m-0 flex items-center" style={{ position: "relative", height: "36px" }}>
                <Input
                  type="text"
                  className="border-0 focus-visible:ring-0 shadow-none bg-transparent"
                  placeholder={t("Search customers, plans...")}
                  value={searchName}
                  style={{ paddingRight: searchName ? "30px" : "10px", paddingLeft: "10px" }}
                  onChange={(e) => setSearchName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ApiListing({ searchName })}
                />
                {searchName && (
                  <div
                    onClick={() => { setSearchName(""); ApiListing({ searchName: "" }); }}
                    style={{
                      position: "absolute",
                      right: "10px",
                      cursor: "pointer",
                      color: "var(--text-secondary)",
                      fontSize: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 8px",
                      opacity: 0.7,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = 0.7}
                  >
                    <MdOutlineClose />
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* AgTable */}
          <div className="data_table" style={{ paddingBottom: '20px' }}>
            <AgTable
              onRefresh={ApiListing} ref={gridRef}
              tableId="ownerDashboard-main-table"
              loading={loadingGrid}
              rowData={data}
              columnDefs={columns}
              totalRecords={meta?.totalRecords ?? 0}
              perPage={perPage}
              currentPage={arg.pageNo}
              onPageChange={handlePageChange}
              onPerPageChange={handlePerRowsChange}
              onSortChanged={handleSortChanged}
              paginationOptions={paginationRowsPerPageOptions}
              isCustomSaveColumns={true}
              customSaveColumnName="Owner Dashboard"
              handleSaveColumns={undefined}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default OwnerDashboard;
