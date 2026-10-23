import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import moment from "moment";

import React, { useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import { useLocation } from "react-router-dom";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import useSpConnection from "../../../helper/hooks/useSpConnection";
import SpAccountNotConnected from "../../../common/components/SpAccountNotConnected";
import { ApiGetInventoryCards, ApiGetInventoryGraph, ApiGetInventoryGrid, ApiGetAgingConfig, ApiSaveAgingConfig } from "../../../api-wrapper/inventoryManagement/ApiInventoryManagement";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { ChevronDown as ExpandMoreIcon } from "lucide-react";

import { Toast } from "../../../helper/links/Link";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useTranslation } from "react-i18next";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import { firstPageRows } from "../../../helper/table/TableStyle";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { MdOutlineClose } from "react-icons/md";

// ⭐ Components
import InventorySummaryCards from "./Inventory/InventorySummaryCards";
import InventoryChart from "./Inventory/InventoryChart";
import InlineEditPopup from "../../../helper/modal/InlineEditPopup";
import { AppTooltip } from "../../../components/ui/AppTooltip";

// Portal-based tooltip immune to AG-Grid CSS transform offsets

// ── Tab config ────────────────────────────────────────────────────────────────
const TABS = [
  { key: "ALL", label: "All", fulfillmentType: "" },
  { key: "FBA", label: "FBA", fulfillmentType: "FBA" },
  { key: "FBM", label: "FBM", fulfillmentType: "FBM" },
];

const CustomHeader = (props) => {
  const { displayName, tooltipText, enableSorting, progressSort } = props;
  const [currentSort, setCurrentSort] = useState(props.column.getSort());

  React.useEffect(() => {
    const onSortChanged = () => {
      setCurrentSort(props.column.getSort());
    };
    props.column.addEventListener('sortChanged', onSortChanged);
    return () => props.column.removeEventListener('sortChanged', onSortChanged);
  }, [props.column]);

  const handleClick = (e) => {
    if (enableSorting) {
      progressSort(e.shiftKey);
    }
  };

  return (
    <div className="flex items-center justify-between w-full" style={{ fontFamily: "Inter", overflow: "hidden" }}>
      <div className="flex items-center"
        onClick={handleClick}
        style={{ gap: 6, cursor: enableSorting ? "pointer" : "default", overflow: "hidden", flex: 1, minWidth: 0 }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#ffffff",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontFamily: "Inter"
          }}
        >
          {displayName}
        </span>
        {enableSorting && currentSort === 'asc' && (
          <span style={{ color: "#ffffff", fontSize: 10, flexShrink: 0 }}>▲</span>
        )}
        {enableSorting && currentSort === 'desc' && (
          <span style={{ color: "#ffffff", fontSize: 10, flexShrink: 0 }}>▼</span>
        )}
      </div>
      {tooltipText && (
        <AppTooltip text={tooltipText}>
          <i
            className="fa-solid fa-circle-info ml-1"
            style={{ fontSize: 13, color: '#fff', cursor: 'help', flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          />
        </AppTooltip>
      )}
    </div>
  );
};

function Inventory() {
  const { t } = useTranslation();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const searchParam = queryParams.get("search") || "";
  const { isConnected: isSpConnected, isLoaded: isSpLoaded } = useSpConnection();

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isNarrow, setIsNarrow] = useState(window.innerWidth < 500);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
      setIsNarrow(window.innerWidth < 500);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const [date, setDate] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [groupsData, setGroupsData] = useState({});
  const [perPage, setPerPage] = useState(firstPageRows);
  let { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      setDate([moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()]);
    }
  }, [selectedDate]);
  const [status, setStatus] = useState("");
  const [searchName, setSearchName] = useState(searchParam);
  const [debouncedSearchName, setDebouncedSearchName] = useState(searchParam);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  const [summaryData, setSummaryData] = useState({});
  const [chartData, setChartData] = useState([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [loadingGraph, setLoadingGraph] = useState(true);

  const [activeTab, setActiveTab] = useState("ALL");

  const gridRef = useRef(null);

  // custom filter
  const defaultValue = { sortType: "DESC" };
  const [conditionObj] = useState(defaultValue);
  const [customFilterFlag, setCustomFilterFlag] = useState(false);
  const [fieldName] = useState("currentStock");

  // ⭐ Save a single row's aging threshold on blur — updates row in tableData in-place
  const handleSaveAgingThreshold = useCallback(async (sku, asin, minOrders, lookbackDays, isEnabled) => {
    try {
      const res = await ApiSaveAgingConfig({
        profileId: profileId.value,
        asin,
        sku,
        minOrders,
        lookbackDays,
        isEnabled,
      });
      if (res?.isSuccess) {
        setTableData(prev => prev.map(r =>
          r.sku === sku
            ? { ...r, agingMinOrders: minOrders, agingLookbackDays: lookbackDays, agingEnabled: isEnabled }
            : r
        ));
      } else {
        Toast.error(res?.message || t("Failed to save threshold"));
      }
    } catch { Toast.error(t("Failed to save threshold")); }
  }, [profileId.value]);

  const columns = useMemo(() => [
    // ── Product Details ──────────────────────────────────────────────────
    {
      headerName: t("Product Details"),
      field: "productDetails",
      title: "Product Details",
      headerComponent: CustomHeader,
      minWidth: 400,
      pinned: isMobile ? null : "left",
      lockPinned: !isMobile,
      suppressMovable: true,
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;

        return (
          <div id={"inventory-first-target-" + params.node.rowIndex} className="flex items-center my-2 cursor-pointer">
            {row?.image && (
              <img
                src={row?.image}
                alt="product"
                style={{ width: "60px", height: "60px", objectFit: "cover" }}
                className="rounded mr-3"
              />
            )}
            <div className="campaignStatus flex items-center">
              <div className="flex flex-col">
                <span className="font-semibold" style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                  {row?.title}
                </span>
                <div className="flex flex-col small text-gray-500 mt-1">
                  <span>
                    <strong className={isDark ? "text-light" : "text-dark"}>{t("asins")}:</strong> {row?.asin || "-"}
                  </span>
                  <span>
                    <strong className={isDark ? "text-light" : "text-dark"}>{t("SKU")}:</strong> {row?.sku || "-"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      },
    },

    // ── Fulfillment Type ─────────────────────────────────────────────────
    {
      headerName: t("Fulfillment Type"),
      field: "fulfillmentType",
      title: "Fulfillment Type",
      headerComponent: CustomHeader,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const type = params.value;
        const config = isDark ? {
          FBA: { color: "#2374F2", bg: "rgba(60, 187, 242, 0.15)", border: "rgba(60, 187, 242, 0.3)" },
          FBM: { color: "#a78bfa", bg: "rgba(124, 58, 237, 0.15)", border: "rgba(124, 58, 237, 0.3)" },
        } : {
          FBA: { color: "#1A9FD4", bg: "#E0F4FD", border: "#c5d8f5" },
          FBM: { color: "#7c3aed", bg: "#f5f3ff", border: "#e9e3ff" },
        };
        const cfg = config[type] || { color: isDark ? "rgba(255, 255, 255, 0.6)" : "#475569", bg: isDark ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9", border: isDark ? "rgba(255, 255, 255, 0.1)" : "#e2e8f0" };
        return (
          <span style={{
            display: "inline-flex", alignItems: "center",
            padding: "4px 10px", borderRadius: 6,
            fontSize: 11, fontWeight: 700,
            color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
            letterSpacing: 0.5, fontFamily: "Inter"
          }}>
            {type ?? "—"}
          </span>
        );
      },
    },

    // ── Current Stock ────────────────────────────────────────────────────
    {
      headerName: t("Current Stock"),
      field: "currentStock",
      title: "Current Stock",
      headerComponent: CustomHeader,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{CurrencyFormat(params.value ?? 0)}</>,
    },

    // ── Inbound Stock ────────────────────────────────────────────────────
    {
      headerName: t("Inbound Stock"),
      field: "inboundStock",
      title: "Inbound Stock",
      headerComponent: CustomHeader,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{CurrencyFormat(params.value ?? 0)}</>,
    },

    // ── Sales / Day ──────────────────────────────────────────────────────
    {
      headerName: t("Sales Per Day"),
      field: "salesPerDay",
      title: "Sales Per Day",
      headerComponent: CustomHeader,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const val = params.value ?? 0;
        const dayCount = date?.length === 2 ? moment(date[1]).diff(moment(date[0]), "days") : 7;
        return (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? "var(--text-primary)" : "#1e293b" }}>
              {val}
            </div>
            <div style={{ fontSize: 10, color: isDark ? "var(--text-secondary)" : "#94a3b8" }}>{t("units/day")}</div>
            <div style={{ fontSize: 9, color: isDark ? "var(--text-secondary)" : "#94a3b8" }}>{t("avg. last {{count}} days", { count: dayCount })}</div>
          </div>
        );
      },
    },

    // ── Days Left ────────────────────────────────────────────────────────
    {
      headerName: t("Days Left"),
      field: "daysLeft",
      title: "Days Left",
      headerComponent: CustomHeader,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        const val = params.value ?? 0;
        const display = val >= 365 ? "365+" : Math.round(val);
        const color =
          row?.status === "OUT_OF_STOCK" ? (isDark ? "#f87171" : "#ef4444")
            : val < 30 ? "#f59e0b"
              : "#10b981";
        return (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color }}>{display}</div>
            <div style={{ fontSize: 10, color: isDark ? "var(--text-secondary)" : "#94a3b8" }}>{t("days")}</div>
          </div>
        );
      },
    },

    // ── Status ───────────────────────────────────────────────────────────
    {
      headerName: t("Status"),
      field: "status",
      title: "Status",
      headerComponent: CustomHeader,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const STATUS_CONFIG = isDark ? {
          HEALTHY: { label: t("Healthy"), color: "#34d399", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.3)", icon: "●" },
          LOW_STOCK: { label: t("Low Stock"), color: "#fbbf24", bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.3)", icon: "▲" },
          OUT_OF_STOCK: { label: t("Out of Stock"), color: "#f87171", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.3)", icon: "✕" },
          ARCHIVED: { label: t("Archived"), color: "rgba(255, 255, 255, 0.6)", bg: "rgba(255, 255, 255, 0.05)", border: "rgba(255, 255, 255, 0.1)", icon: "■" },
        } : {
          HEALTHY: { label: t("Healthy"), color: "#0e7d5b", bg: "#e6f5f0", border: "#bfe7dc", icon: "●" },
          LOW_STOCK: { label: t("Low Stock"), color: "#b45309", bg: "#fef3c7", border: "#fde68a", icon: "▲" },
          OUT_OF_STOCK: { label: t("Out of Stock"), color: "#dc2626", bg: "#fff1f2", border: "#fecdd3", icon: "✕" },
          ARCHIVED: { label: t("Archived"), color: "#64748b", bg: "#f1f5f9", border: "#e2e8f0", icon: "■" },
        };
        const cfg = STATUS_CONFIG[params.value] || { label: params.value, color: isDark ? "rgba(255, 255, 255, 0.6)" : "#64748b", bg: isDark ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9", border: isDark ? "rgba(255, 255, 255, 0.1)" : "#e2e8f0", icon: "●" };
        return (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 20,
            fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
            color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
            fontFamily: "Inter"
          }}>
            <span style={{ fontSize: 8 }}>{cfg.icon}</span>
            {cfg.label}
          </span>
        );
      },
    },

    // ── Aging Bucket ─────────────────────────────────────────────────────
    {
      headerName: t("Aging Bucket"),
      field: "agingBucket",
      title: "Aging Bucket",
      isDisplay: true,
      sortable: true,
      resizable: true,
      headerComponent: CustomHeader,
      headerComponentParams: {
        tooltipText: t("Inventory aging category based on stock movement and sell-through speed. Helps identify slow-moving or excess inventory.")
      },
      cellRenderer: (params) => {
        const bucket = params.value;
        const row = params.data;
        if (row?.fulfillmentType !== "FBA" || !bucket) {
          return <span style={{ color: "#94a3b8", fontSize: 11 }}>—</span>;
        }

        const bucketStr = String(bucket).trim();
        const cfg = (isDark ? {
          "30": { label: "≤ 30 Days", color: "#f87171", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.3)" },
          "0-30": { label: "≤ 30 Days", color: "#f87171", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.3)" },
          "0_30": { label: "≤ 30 Days", color: "#f87171", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.3)" },
          "60": { label: "≤ 60 Days", color: "#fb923c", bg: "rgba(249, 115, 22, 0.15)", border: "rgba(249, 115, 22, 0.3)" },
          "31-60": { label: "≤ 60 Days", color: "#fb923c", bg: "rgba(249, 115, 22, 0.15)", border: "rgba(249, 115, 22, 0.3)" },
          "31_60": { label: "≤ 60 Days", color: "#fb923c", bg: "rgba(249, 115, 22, 0.15)", border: "rgba(249, 115, 22, 0.3)" },
          "90": { label: "≤ 90 Days", color: "#fbbf24", bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.3)" },
          "61-90": { label: "≤ 90 Days", color: "#fbbf24", bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.3)" },
          "61_90": { label: "≤ 90 Days", color: "#fbbf24", bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.3)" },
          "180": { label: "180+ Days", color: "#a78bfa", bg: "rgba(124, 58, 237, 0.15)", border: "rgba(124, 58, 237, 0.3)" },
          "180+": { label: "180+ Days", color: "#a78bfa", bg: "rgba(124, 58, 237, 0.15)", border: "rgba(124, 58, 237, 0.3)" },
          "91-180": { label: "91-180 Days", color: "#a78bfa", bg: "rgba(124, 58, 237, 0.15)", border: "rgba(124, 58, 237, 0.3)" },
          "91_180": { label: "91-180 Days", color: "#a78bfa", bg: "rgba(124, 58, 237, 0.15)", border: "rgba(124, 58, 237, 0.3)" },
        } : {
          "30": { label: "≤ 30 Days", color: "#dc2626", bg: "#fff1f2", border: "#fecdd3" },
          "0-30": { label: "≤ 30 Days", color: "#dc2626", bg: "#fff1f2", border: "#fecdd3" },
          "0_30": { label: "≤ 30 Days", color: "#dc2626", bg: "#fff1f2", border: "#fecdd3" },
          "60": { label: "≤ 60 Days", color: "#f97316", bg: "#fff7ed", border: "#ffedd5" },
          "31-60": { label: "≤ 60 Days", color: "#f97316", bg: "#fff7ed", border: "#ffedd5" },
          "31_60": { label: "≤ 60 Days", color: "#f97316", bg: "#fff7ed", border: "#ffedd5" },
          "90": { label: "≤ 90 Days", color: "#f59e0b", bg: "#fefbeb", border: "#fef3c7" },
          "61-90": { label: "≤ 90 Days", color: "#f59e0b", bg: "#fefbeb", border: "#fef3c7" },
          "61_90": { label: "≤ 90 Days", color: "#f59e0b", bg: "#fefbeb", border: "#fef3c7" },
          "180": { label: "180+ Days", color: "#7c3aed", bg: "#f5f3ff", border: "#e9e3ff" },
          "180+": { label: "180+ Days", color: "#7c3aed", bg: "#f5f3ff", border: "#e9e3ff" },
          "91-180": { label: "91-180 Days", color: "#7c3aed", bg: "#f5f3ff", border: "#e9e3ff" },
          "91_180": { label: "91-180 Days", color: "#7c3aed", bg: "#f5f3ff", border: "#e9e3ff" },
        })[bucketStr] || { label: bucketStr, color: isDark ? "rgba(255, 255, 255, 0.6)" : "#64748b", bg: isDark ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9", border: isDark ? "rgba(255, 255, 255, 0.1)" : "#e2e8f0" };

        let displayLabel = cfg.label;
        if (displayLabel === "30") displayLabel = "≤ 30 Days";
        else if (displayLabel === "60") displayLabel = "≤ 60 Days";
        else if (displayLabel === "90") displayLabel = "≤ 90 Days";
        else if (displayLabel === "180") displayLabel = "180+ Days";

        return (
          <span style={{
            padding: "4px 10px", borderRadius: 20, fontSize: 11,
            fontWeight: 700, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
            whiteSpace: "nowrap", fontFamily: "Inter"
          }}>
            {displayLabel}
          </span>
        );
      },
    },

    // ── Dead Inventory Health ─────────────────────────────────────────────
    {
      headerName: t("Inventory Health"),
      field: "deadInventoryStatus",
      title: "Inventory Health",
      headerComponent: CustomHeader,
      isDisplay: true,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const status = params.value;
        const row = params.data;
        if (row?.fulfillmentType !== "FBA") {
          return <span style={{ color: "#94a3b8", fontSize: 11 }}>FBM</span>;
        }
        if (status === "DEAD") {
          return (
            <span style={{
              padding: "4px 10px", borderRadius: 20, fontSize: 11,
              fontWeight: 700,
              color: isDark ? "#f87171" : "#dc2626",
              background: isDark ? "rgba(239, 68, 68, 0.15)" : "#fff1f2",
              border: isDark ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid #fecdd3",
              display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "Inter"
            }}>
              ☠ Dead
            </span>
          );
        }
        if (status === "ACTIVE") {
          return (
            <span style={{
              padding: "4px 10px", borderRadius: 20, fontSize: 11,
              fontWeight: 700,
              color: isDark ? "#34d399" : "#0e7d5b",
              background: isDark ? "rgba(16, 185, 129, 0.15)" : "#e6f5f0",
              border: isDark ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid #bfe7dc",
              display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "Inter"
            }}>
              ✓ Healthy
            </span>
          );
        }
        return <span style={{ color: "#94a3b8", fontSize: 11 }}>Not scanned</span>;
      },
    },

    // ── Min Orders (inline editable, FBA only) ────────────────────────
    {
      headerName: "Min Orders",
      field: "agingMinOrders",
      title: "Min Orders",
      isDisplay: true,
      sortable: false,
      resizable: true,
      width: 140,
      headerComponent: CustomHeader,
      headerComponentParams: {
        tooltipText: t("Minimum number of orders required within the selected lookback period to consider inventory healthy.")
      },
      cellRenderer: (params) => {
        const row = params.data;
        if (row?.fulfillmentType !== "FBA") return <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>;
        return (
          <InlineEditPopup
            value={row?.agingMinOrders ?? 10}
            title={t("Min Orders")}
            append="orders"
            onSave={async (v) => await handleSaveAgingThreshold(row.sku, row.asin, v, row.agingLookbackDays, row.agingEnabled)}
            disabled={!PermissionCheck(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.UPDATE)}
          />
        );
      },
    },

    // ── Lookback Days (inline editable, FBA only) ───────────────────────────
    {
      headerName: "Lookback Days",
      field: "agingLookbackDays",
      title: "Lookback Days",
      isDisplay: true,
      sortable: false,
      resizable: true,
      width: 140,
      headerComponent: CustomHeader,
      headerComponentParams: {
        tooltipText: t("Number of past days used to evaluate sales performance and determine inventory health status.")
      },
      cellRenderer: (params) => {
        const row = params.data;
        if (row?.fulfillmentType !== "FBA") return <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>;
        return (
          <InlineEditPopup
            value={row?.agingLookbackDays ?? 30}
            title={t("Lookback Days")}
            append="days"
            min={7}
            onSave={async (v) => await handleSaveAgingThreshold(row.sku, row.asin, row.agingMinOrders, v, row.agingEnabled)}
            disabled={!PermissionCheck(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.UPDATE)}
          />
        );
      },
    },

    // ── Monitoring toggle (FBA only) ──────────────────────────────────────────
    {
      headerName: "Monitoring",
      field: "agingEnabled",
      title: "Monitoring",
      isDisplay: true,
      sortable: false,
      resizable: true,
      width: 110,
      headerComponent: CustomHeader,
      headerComponentParams: {
        tooltipText: t("Enable or disable automatic inventory aging and dead stock monitoring for this product.")
      },
      cellRenderer: (params) => {
        const row = params.data;
        if (row?.fulfillmentType !== "FBA") return <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>;

        const hasUpdatePermission = PermissionCheck(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.UPDATE);
        const on = row?.agingEnabled === true;
        const toggle = () => {
          if (!hasUpdatePermission) return;
          const next = !on;
          handleSaveAgingThreshold(row.sku, row.asin, row.agingMinOrders, row.agingLookbackDays, next);
        };

        return (
          <div className="flex items-center justify-center" style={{ height: "100%", width: "100%" }}>
            <AppTooltip text={on ? "Click to turn off monitoring" : "Click to turn on monitoring"}>
              <div onClick={toggle} style={{
                width: 40, height: 22, borderRadius: 11, cursor: "pointer",
                background: on ? "#10b981" : (isDark ? "rgba(255, 255, 255, 0.18)" : "#d1d5db"),
                position: "relative", transition: "background 0.2s",
                border: isDark && !on ? "1px solid rgba(255,255,255,0.1)" : "none",
              }}>
                <div style={{
                  position: "absolute", top: 3,
                  left: on ? 21 : 3,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#fff", transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </div>
            </AppTooltip>
          </div>
        );
      },
    },
  ], [isDark, isMobile, date, t, handleSaveAgingThreshold]);

  const lastCardsParamsRef = useRef("");
  const lastGraphParamsRef = useRef("");

  const loadCards = async () => {
    if (!profileId?.value || !selectedAdType || date.length === 0) return;
    if (isSpLoaded && !isSpConnected) {
      setSummaryData({});
      setLoadingCards(false);
      return;
    }
    try {
      const payload = {
        profileId: profileId.value,
        searchName: debouncedSearchName,
        status: status,
        fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
        toDate: moment(date?.[1]).format("YYYY-MM-DD"),
        fulfillmentType: TABS.find(t => t.key === activeTab)?.fulfillmentType ?? "",
      };
      const sig = JSON.stringify(payload);
      if (lastCardsParamsRef.current === sig) return;
      lastCardsParamsRef.current = sig;

      setLoadingCards(true);
      const res = await ApiGetInventoryCards(payload);
      if (res?.isSuccess) setSummaryData(res?.summaryData ?? {});
    } catch { Toast.error(t("Something went wrong loading summary cards")); }
    finally { setLoadingCards(false); }
  };

  const loadGraph = async () => {
    if (!profileId?.value || !selectedAdType || date.length === 0) return;
    if (isSpLoaded && !isSpConnected) {
      setChartData([]);
      setLoadingGraph(false);
      return;
    }
    try {
      const payload = {
        profileId: profileId.value,
        searchName: debouncedSearchName,
        status: status,
        fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
        toDate: moment(date?.[1]).format("YYYY-MM-DD"),
        fulfillmentType: TABS.find(t => t.key === activeTab)?.fulfillmentType ?? "",
      };
      const sig = JSON.stringify(payload);
      if (lastGraphParamsRef.current === sig) return;
      lastGraphParamsRef.current = sig;

      setLoadingGraph(true);
      const res = await ApiGetInventoryGraph(payload);
      if (res?.isSuccess) setChartData(res?.chartData ?? []);
    } catch { Toast.error(t("Something went wrong loading chart data")); }
    finally { setLoadingGraph(false); }
  };

  const [loading, setLoading] = useState(true);
  const lastFetchParamsRef = useRef("");

  const loadGrid = async (argOverride = {}) => {
    if (!profileId?.value || !selectedAdType || date.length === 0) return;
    if (isSpLoaded && !isSpConnected) {
      setTableData([]);
      setGroupsData({ totalRecords: 0 });
      setLoading(false);
      return;
    }

    const isReload = !!argOverride?.isReload;
    const activeFulfillmentType = TABS.find(t => t.key === activeTab)?.fulfillmentType ?? "";
    const data = {
      profileId: profileId.value,
      searchName: argOverride?.hasOwnProperty("searchName") ? argOverride.searchName : debouncedSearchName,
      status: status,
      fulfillmentType: activeFulfillmentType,
      fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
      toDate: moment(date?.[1]).format("YYYY-MM-DD"),
      fieldName: fieldName,
      sortType: conditionObj?.sortType,
      ...arg,
      ...argOverride,
    };

    const requestSignature = JSON.stringify(data);
    if (!isReload && lastFetchParamsRef.current === requestSignature) {
      return;
    }

    lastFetchParamsRef.current = requestSignature;
    setLoading(true);

    try {
      const res = await ApiGetInventoryGrid(data);
      if (res?.isSuccess) {
        // Fetch aging configs in parallel and merge into rows (FBA only)
        const cfgRes = await ApiGetAgingConfig({ profileId: profileId.value }).catch(() => null);
        const cfgMap = {};
        (cfgRes?.data || []).forEach(c => { cfgMap[c.sku] = c; });
        const merged = (res.data || []).map(row => ({
          ...row,
          agingMinOrders: cfgMap[row.sku]?.minOrders ?? 10,
          agingLookbackDays: cfgMap[row.sku]?.lookbackDays ?? 30,
          agingEnabled: cfgMap[row.sku]?.isEnabled === true,
        }));
        setTableData(merged);
        setGroupsData(res);
        if (res?.message) Toast.success(res?.message);
      } else if (res?.message) {
        Toast.error(res?.message);
      }
      setCustomFilterFlag(false);
    } catch { Toast.error(t("Something went wrong loading grid data")); }
    finally { setLoading(false); }
  };

  const refreshAllAction = (isReload = false) => {
    loadCards();
    loadGraph();
    loadGrid({ pageNo: 1, ...(isReload ? { isReload: true } : {}) });
    setArg(prev => ({ ...prev, pageNo: 1 }));
  };

  useEffect(() => {
    lastFetchParamsRef.current = "";
    lastCardsParamsRef.current = "";
    lastGraphParamsRef.current = "";
  }, [profileId?.value]);

  useEffect(() => {
    refreshAllAction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId?.value, selectedAdType, date, status, activeTab, debouncedSearchName]);

  useEffect(() => {
    if (customFilterFlag) loadGrid(arg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFilterFlag]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    loadGrid({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), ...arg });
  };

  const handlePageChange = (page) => {
    setTableData([]);
    setLoading(true);
    setArg({ pageNo: page, perPage });
    loadGrid({ pageNo: page, perPage });
  };

  const handlePerRowsChange = (newPerPage) => {
    setTableData([]);
    setLoading(true);
    setPerPage(newPerPage);
    setArg({ pageNo: 1, perPage: newPerPage });
    loadGrid({ pageNo: 1, perPage: newPerPage });
  };

  const handleSearch = (e) => {
    setSearchName(e.target.value);
  };

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setTableData([]);
    setLoading(true);
    setArg({ pageNo: 1, perPage });
  };

  useEffect(() => {
    const firstDate = new Date(moment().subtract(7, "days").format("YYYY-MM-DD"));
    const lastDate = new Date();
    setDate([firstDate, lastDate]);
  }, []);

  return (
    <div className="product-list-tracking-container">
      <Filter nameShow={false} dateShow={false} profileShow={true} />
      <div className="middle_container">
        {!isSpConnected && isSpLoaded ? (
          <SpAccountNotConnected feature={t("Inventory Management")} isDark={isDark} />
        ) : (
          <>
            {PermissionCheck(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY) && (
              <InventorySummaryCards
                summaryData={summaryData}
                loading={loadingCards || !profileId?.value || date.length === 0}
              />
            )}

            {PermissionCheck(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY) && (
              <InventoryChart
                chartData={chartData}
                loading={loadingGraph || !profileId?.value || date.length === 0}
              />
            )}

            <div className="glass-grid-container overflow-hidden">
              <div
                className="data_model_btn camapgin_btn"
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  flexWrap: "wrap",
                  overflowX: "auto",
                  gap: 10,
                  padding: isMobile ? "10px 14px" : "12px 24px",
                }}
              >
                <div style={{ flex: "0 0 auto", marginBottom: isMobile ? "4px" : "0" }}>
                  <h5 className="m-0 font-bold">{t("Inventory List")}</h5>
                </div>

                {/* Right-aligned filters group */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginLeft: "auto", justifyContent: "flex-end", flex: "1 1 auto", width: isNarrow ? "100%" : undefined }}>
                  <div id="inventory-search" className="search_option m-0 flex items-center" style={{ position: "relative", flex: "1 1 auto", minWidth: 200, maxWidth: isNarrow ? "100%" : 350, width: isNarrow ? "100%" : undefined, height: "40px" }}>
                    <Input
                      type="text"
                      placeholder={t("searchHere")}
                      value={searchName}
                      onChange={handleSearch}
                      className="flex-grow w-full h-[40px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent shadow-none px-0"
                      style={{ paddingRight: searchName ? "30px" : "10px" }}
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

                  <div id="inventory-status" style={{ flex: "1 1 auto", minWidth: 240, maxWidth: isNarrow ? "100%" : 180, width: isNarrow ? "100%" : undefined }}>
                    <Select
                      value={status === "" || status === undefined ? "__all_status" : status}
                      onValueChange={(val) => setStatus(val === "__all_status" ? "" : val)}
                    >
                      <SelectTrigger className="h-10 text-[13px] font-medium bg-white dark:bg-transparent border-slate-300 dark:border-slate-700 rounded-md shadow-sm w-full min-w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all_status">{t("All Statuses")}</SelectItem>
                        <SelectItem value="HEALTHY">{t("Healthy")}</SelectItem>
                        <SelectItem value="LOW_STOCK">{t("Low Stock")}</SelectItem>
                        <SelectItem value="OUT_OF_STOCK">{t("Out of Stock")}</SelectItem>
                        <SelectItem value="ARCHIVED">{t("Archived")}</SelectItem>
                        <SelectItem value="DEAD_INVENTORY">☠ {t("Dead Inventory (FBA)")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div id="inventory-date-picker" style={{ flex: "1 1 auto", minWidth: 240, maxWidth: isNarrow ? "100%" : 260, width: isNarrow ? "100%" : undefined }}>
                    <DateRangePicker
                      className="w-full"
                      style={{ width: "100%", height: "40px" }}
                      ranges={predefinedRanges}
                      value={date}
                      placeholder={t("Select Date")}
                      onChange={(e) => setDate(e)}
                      placement="bottomEnd"
                      format="yyyy-MM-dd"
                      cleanable={false}
                      align="end"
                    />
                  </div>
                </div>
              </div>

              {/* 2026 Fluid Elastic Sliding Capsule Tabs */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  position: "relative",
                  background: isDark ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9",
                  padding: "4px",
                  borderRadius: "30px",
                  margin: "8px 24px 20px 24px",
                  border: isDark ? "1px solid var(--glass-border-color)" : "1px solid rgba(226, 232, 240, 0.8)",
                  userSelect: "none",
                }}
              >
                {/* Sliding Highlight Pill */}
                <div
                  style={{
                    position: "absolute",
                    top: "4px",
                    bottom: "4px",
                    left: "4px",
                    width: "120px",
                    background: "linear-gradient(135deg, #1A9FD4 0%, #2374F2 100%)",
                    borderRadius: "26px",
                    transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                    transform: `translateX(${activeTab === "ALL" ? 0 : activeTab === "FBA" ? 120 : 240}px)`,
                    boxShadow: "0 4px 12px rgba(2, 70, 139, 0.25)",
                    zIndex: 1,
                  }}
                />

                {TABS.map(tab => {
                  const isActive = activeTab === tab.key;
                  const count = tab.key === "ALL" ? (summaryData?.totalSKUs ?? "") : tab.key === "FBA" ? (summaryData?.totalFBASkus ?? "") : tab.key === "FBM" ? (summaryData?.totalFBMSkus ?? "") : "";
                  let iconClass = tab.key === "FBA" ? "fa fa-cube" : tab.key === "FBM" ? "fa fa-truck" : "fa fa-list-ul";

                  return (
                    <Button
                      variant="ghost"
                      key={tab.key}
                      style={{
                        width: "120px",
                        height: "38px",
                        fontSize: "13.5px",
                        fontWeight: isActive ? "600" : "500",
                        border: "none",
                        background: "transparent",
                        color: isActive ? "#ffffff" : (isDark ? "rgba(255, 255, 255, 0.6)" : "#64748b"),
                        transition: "color 0.25s ease",
                        cursor: "pointer",
                        outline: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        position: "relative",
                        zIndex: 2,
                        whiteSpace: "nowrap",
                      }}
                      onClick={() => handleTabChange(tab.key)}
                      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = isDark ? "#ffffff" : "#0f172a"; }}
                      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = isDark ? "rgba(255, 255, 255, 0.6)" : "#64748b"; }}
                    >
                      <i className={iconClass} style={{ fontSize: "12px", color: isActive ? "#ffffff" : (isDark ? "rgba(255, 255, 255, 0.4)" : "#94a3b8"), transition: "color 0.25s ease" }} />
                      <span>{t(tab.label)}</span>
                      {count !== "" && (
                        <span style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          padding: "1px 5px",
                          borderRadius: "6px",
                          background: isActive ? "rgba(255, 255, 255, 0.2)" : (isDark ? "rgba(255, 255, 255, 0.1)" : "#e2e8f0"),
                          color: isActive ? "#ffffff" : (isDark ? "rgba(255, 255, 255, 0.8)" : "#475569"),
                          transition: "all 0.25s ease",
                        }}>
                          {count}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>

              {PermissionCheck(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY) && (
                <div className="data_table position-relative w-full max-w-full" id="inventory-management-main-table" style={{ padding: "0 24px 24px 24px" }}>
                  <AgTable ref={gridRef}
                    tableId="inventory-management-main-table"
                    loading={loading}
                    onRefresh={() => refreshAllAction(true)}
                    rowData={tableData}
                    columnDefs={columns?.sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))}
                    totalRecords={groupsData?.totalRecords ?? 0}
                    rowHeight={100}
                    perPage={perPage}
                    currentPage={customFilterFlag ? 1 : arg.pageNo}
                    onPageChange={handlePageChange}
                    onPerPageChange={handlePerRowsChange}
                    onSortChanged={handleSortChanged}
                    isCustomSaveColumns={false}
                    customSaveColumnName={"Inventory Management v2"}
                    handleSaveColumns={undefined}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Inventory;
