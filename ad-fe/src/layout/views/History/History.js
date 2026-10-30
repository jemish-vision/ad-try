import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { useContext, useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import moment from "moment-timezone";
import { handleLoader, Toast, useDispatch } from "../../../helper/links/Link";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges, getCompletedDaysRange } from "../../../common/helper/calendarValues/calendarValues";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { ApiHistory } from "../../../api-wrapper/campaign/ApiCampaign";
import { AdTypeScopeNote, AdTypeBadge } from "../../../helper/filter/AdTypeScopeNote";
import { isShowingAllAdTypes } from "../../../helper/filter/adTypeAll";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { Buffer } from "buffer";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import Breadcrumb from "../../../common/components/Breadcrumb";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import AppliedFilter from "../../component/filter/AppliedFilter";
import { FiClock, FiUser, FiFilter } from "react-icons/fi";
import { MdOutlineClose } from "react-icons/md";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../../components/ui/card";
import { Input } from "src/components/ui/input";
import { MultiSelect } from "../../../components/ui/multi-select";
import openCampaignViewInNewTab, { CampaignNameCell } from "../../../utility/campaignNavigation";
import { formatAmazonChangeType, isAdGroupLevelChange, getStatusBadgeProps } from "../../../utility/targetingUtils";


const STORAGE_KEY_OLD_ACOS_PERIOD = "main_history_old_acos_period";
const STORAGE_KEY_OLD_ACOS_CUSTOM_DAYS = "main_history_old_acos_custom_days";
const STORAGE_KEY_CURRENT_ACOS_DATE = "main_history_current_acos_date";

const TYPE_OPTIONS = [
  { value: "Campaign", label: "Budget" },
  { value: "Targeting", label: "Bid" },
  { value: "Placement", label: "Bid Adjustment" },
  { value: "Status", label: "Status" },
];

const SOURCE_OPTIONS = [
  { value: "Manual", label: "Manual" },
  { value: "Rule", label: "Rule" },
  { value: "Amazon API", label: "Amazon API" },
];

const TypePopover = ({ anchorRef, show, currentTypes, onApply, onClose, isDark }) => {
  const { t } = useTranslation();
  const popoverRef = useRef(null);
  const [selected, setSelected] = useState(currentTypes || []);
  const [position, setPosition] = useState({ top: 0, left: 0, arrowLeft: 20 });

  useEffect(() => {
    if (show) setSelected(currentTypes || []);
  }, [show, currentTypes]);

  useEffect(() => {
    if (!show) return;

    const updatePosition = () => {
      if (!anchorRef?.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const popoverWidth = 240;
      let left = rect.left;

      if (left + popoverWidth > window.innerWidth - 16) {
        left = window.innerWidth - popoverWidth - 16;
      }
      if (left < 16) left = 16;

      const chipCenter = rect.left + rect.width / 2;
      const arrowLeft = Math.min(Math.max(chipCenter - left - 6, 14), popoverWidth - 26);

      setPosition({ top: rect.bottom + 8, left, arrowLeft });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [show, anchorRef]);

  useEffect(() => {
    if (!show) return;
    const handleOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [show, onClose, anchorRef]);

  const toggleOption = (value) => {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const isAllSelected = selected.length === TYPE_OPTIONS.length;

  const handleSelectAll = () => {
    setSelected(isAllSelected ? [] : TYPE_OPTIONS.map((o) => o.value));
  };

  if (!show) return null;

  const bgCard = isDark ? "#1e293b" : "#ffffff";
  const borderColor = isDark ? "#334155" : "#e2e8f0";
  const textColor = isDark ? "#f8fafc" : "#0f172a";
  const textMuted = isDark ? "#94a3b8" : "#64748b";
  const hoverBg = isDark ? "rgba(255, 255, 255, 0.06)" : "#f8fafc";
  const activeBg = isDark ? "rgba(59, 130, 246, 0.15)" : "#eff6ff";
  const activeText = isDark ? "#60a5fa" : "#2563eb";

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        zIndex: 9999,
        width: 240,
        backgroundColor: bgCard,
        border: `1px solid ${borderColor}`,
        borderRadius: "10px",
        boxShadow: isDark
          ? "0 12px 30px -4px rgba(0, 0, 0, 0.6), 0 4px 12px -2px rgba(0, 0, 0, 0.4)"
          : "0 12px 30px -4px rgba(0, 0, 0, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.06)",
        animation: "popoverFadeIn 0.15s ease",
        fontFamily: "inherit",
      }}
    >
      {/* Arrow pointing at chip */}
      <div
        style={{
          position: "absolute",
          top: -6,
          left: position.arrowLeft,
          width: 12,
          height: 12,
          backgroundColor: bgCard,
          borderTop: `1px solid ${borderColor}`,
          borderLeft: `1px solid ${borderColor}`,
          transform: "rotate(45deg)",
          zIndex: 1,
        }}
      />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 14px",
          borderBottom: `1px solid ${borderColor}`,
          position: "relative",
          zIndex: 2,
        }}
      >
        <FiFilter size={13} style={{ color: activeText }} />
        <span
          style={{
            fontSize: "12px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: activeText,
            flexGrow: 1,
          }}
        >
          {t("Filter by Type")}
        </span>
        {selected.length > 0 && (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              backgroundColor: isDark ? "rgba(59, 130, 246, 0.25)" : "#dbeafe",
              color: activeText,
              padding: "2px 7px",
              borderRadius: "12px",
            }}
          >
            {selected.length}
          </span>
        )}
      </div>

      {/* Select All */}
      <div
        onClick={handleSelectAll}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "9px 14px",
          borderBottom: `1px solid ${borderColor}`,
          cursor: "pointer",
          userSelect: "none",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hoverBg)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <input
          type="checkbox"
          checked={isAllSelected}
          readOnly
          style={{
            accentColor: "#2563eb",
            width: "15px",
            height: "15px",
            cursor: "pointer",
            flexShrink: 0,
            margin: 0,
          }}
        />
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: textColor,
          }}
        >
          {t("Select All")}
        </span>
      </div>

      {/* Options */}
      <div style={{ padding: "6px 0" }}>
        {TYPE_OPTIONS.map((opt) => {
          const isChecked = selected.includes(opt.value);
          return (
            <div
              key={opt.value}
              onClick={() => toggleOption(opt.value)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 14px",
                cursor: "pointer",
                userSelect: "none",
                backgroundColor: isChecked ? activeBg : "transparent",
                color: isChecked ? activeText : textColor,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isChecked) e.currentTarget.style.backgroundColor = hoverBg;
              }}
              onMouseLeave={(e) => {
                if (!isChecked) e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                readOnly
                style={{
                  accentColor: "#2563eb",
                  width: "15px",
                  height: "15px",
                  cursor: "pointer",
                  flexShrink: 0,
                  margin: 0,
                }}
              />
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: isChecked ? 600 : 500,
                  flexGrow: 1,
                  color: isChecked ? activeText : textColor,
                }}
              >
                {t(opt.label)}
              </span>
              {isChecked && (
                <span style={{ color: activeText, fontSize: "12px", fontWeight: "bold" }}>✓</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
          padding: "10px 14px",
          borderTop: `1px solid ${borderColor}`,
        }}
      >
        <button
          type="button"
          onClick={() => setSelected([])}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: "12px",
            color: textMuted,
            cursor: "pointer",
            fontWeight: 500,
            textDecoration: "underline",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = textColor)}
          onMouseLeave={(e) => (e.currentTarget.style.color = textMuted)}
        >
          {t("Clear")}
        </button>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: "12px",
              padding: "5px 10px",
              borderRadius: "6px",
              border: `1px solid ${borderColor}`,
              backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "#ffffff",
              color: textColor,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            onClick={() => onApply(selected)}
            style={{
              fontSize: "12px",
              padding: "5px 12px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(37, 99, 235, 0.3)",
            }}
          >
            {t("Apply")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};





function History(props) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    window.addEventListener("themeChanged", handle);
    return () => window.removeEventListener("themeChanged", handle);
  }, []);

  const { t } = useTranslation();
  const { type: targetingType } = props;
  const { campaignId } = useParams();
  const navigate = useNavigate();

  const { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);
  // Combined view active on the /history screen? (Change history spans all
  // three ad types; the targeting-history drilldown route is not All-ready.)
  const showAllTypes = isShowingAllAdTypes(
    typeof window !== "undefined" ? window.location.pathname : "",
    selectedAdType
  );

  const [perPage, setPerPage] = useState(firstPageRows);
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [types, setTypes] = useState(targetingType ? [targetingType] : []);
  const [sources, setSources] = useState([]);
  const [historyData, setHistoryData] = useState();

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
  const [tableData, setTableData] = useState([]);
  const [dailyStats, setDailyStats] = useState(null);
  const [profileTimezone, setProfileTimezone] = useState("UTC");
  const [loadingGrid, setLoadingGrid] = useState(false);

  // Old ACoS Lookback Period states
  const [acosPeriod, setAcosPeriod] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_OLD_ACOS_PERIOD);
      if (saved && ["7", "14", "30", "custom_days"].includes(saved)) {
        return saved;
      }
    } catch (e) {
      // ignore
    }
    return "7";
  });

  const [customDays, setCustomDays] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY_OLD_ACOS_CUSTOM_DAYS));
      if (!isNaN(saved) && saved >= 1 && saved <= 365) {
        return saved;
      }
    } catch (e) {
      // ignore
    }
    return 7;
  });

  // Current ACoS Date Range state
  const [currentAcosDate, setCurrentAcosDate] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_CURRENT_ACOS_DATE));
      if (Array.isArray(saved) && saved.length >= 2 && saved[0] && saved[1]) {
        const d0 = new Date(saved[0]);
        const d1 = new Date(saved[1]);
        if (!isNaN(d0.getTime()) && !isNaN(d1.getTime())) {
          return [d0, d1];
        }
      }
    } catch (e) {
      // ignore
    }
    return getCompletedDaysRange(7);
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_OLD_ACOS_PERIOD, acosPeriod);
    } catch (e) {
      // ignore
    }
  }, [acosPeriod]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_OLD_ACOS_CUSTOM_DAYS, String(customDays));
    } catch (e) {
      // ignore
    }
  }, [customDays]);

  useEffect(() => {
    try {
      if (Array.isArray(currentAcosDate) && currentAcosDate.length >= 2 && currentAcosDate[0] && currentAcosDate[1]) {
        localStorage.setItem(
          STORAGE_KEY_CURRENT_ACOS_DATE,
          JSON.stringify([
            moment(currentAcosDate[0]).format("YYYY-MM-DD"),
            moment(currentAcosDate[1]).format("YYYY-MM-DD"),
          ])
        );
      }
    } catch (e) {
      // ignore
    }
  }, [currentAcosDate]);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");
  const [targetingSearch, setTargetingSearch] = useState("");
  const [debouncedTargetingSearch, setDebouncedTargetingSearch] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTargetingSearch(targetingSearch);
    }, 350);
    return () => clearTimeout(handler);
  }, [targetingSearch]);

  // Filter state
  const [appliedFilters, setAppliedFilters] = useState([]);
  const [showTypePopover, setShowTypePopover] = useState(false);
  const typeChipRef = useRef(null);

  const gridRef = useRef(null);
  const dispatch = useDispatch();

  /* ── Sync filter chips ── */
  useEffect(() => {
    const newApplied = [];
    if (types.length > 0) {
      const labels = types.map((v) => t(TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v)).join(", ");
      newApplied.push({
        id: "type",
        type: "Type",
        displayText: `Change Type: ${labels}`,
      });
    }
    if (sources.length > 0) {
      const labels = sources.map((v) => t(SOURCE_OPTIONS.find((o) => o.value === v)?.label ?? v)).join(", ");
      newApplied.push({
        id: "source",
        type: "Source",
        displayText: `Triggered From: ${labels}`,
      });
    }
    if (debouncedTargetingSearch) {
      newApplied.push({
        id: "targeting",
        type: "Targeting",
        displayText: `Targeting: ${debouncedTargetingSearch}`,
      });
    }
    setAppliedFilters(newApplied);
  }, [types, sources, debouncedTargetingSearch]);

  const columns = useMemo(() => [
    ...(showAllTypes ? [{
      headerName: t("Type"),
      field: "adType",
      colId: "adType",
      title: "Type",
      maxWidth: 90,
      sortable: true,
      resizable: true,
      exportFormatter: (val) => String(val || "SP").toUpperCase(),
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        // Legacy untyped records are Sponsored Products by convention.
        return <AdTypeBadge type={params.value || row?.type || "SP"} />;
      },
    }] : []),
    {
      headerName: t("Change level", "Change level"),
      field: "campaignDetails.name",
      colId: "changeLevel",
      title: "Change level",
      minWidth: 320,
      width: 400,
      flex: 1.6,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const campaignName = row?.campaignDetails?.name || row?.campaignName || "";
        const campaignId = row?.campaignDetails?.campaignId || row?.campaignId || row?.changeLevel;
        const adGroupName = row?.adGroupDetails?.name || row?.adGroupName || "";
        const isAdGroup = isAdGroupLevelChange(row);
        const primaryAdGroup = adGroupName || campaignName || (row?.adGroupId ? `AdGroup #${row.adGroupId}` : "");

        if (!campaignName && !adGroupName && !row?.targeting) {
          return (
            <div className="flex items-center h-full">
              <span style={{ color: isDark ? "#64748b" : "#94a3b8" }}>—</span>
            </div>
          );
        }

        return (
          <div className="flex flex-col justify-center h-full w-full min-w-0 leading-tight">
            {isAdGroup && (primaryAdGroup || campaignName) ? (
              <div className="flex flex-col gap-0.5 min-w-0">
                {/* Line 1: Ad group: <name> */}
                <div className="flex items-center min-w-0 text-[12px] font-semibold">
                  <span style={{ color: isDark ? "#94a3b8" : "#64748b", marginRight: "4px", flexShrink: 0, fontWeight: "500" }}>
                    {t("Ad Group")}:
                  </span>
                  <span
                    className="truncate cursor-pointer text-sky-600 dark:text-[#38bdf8] hover:underline font-semibold"
                    title={primaryAdGroup}
                    onClick={(e) => {
                      e.stopPropagation();
                      openCampaignViewInNewTab(row, campaignName, { campaignId });
                    }}
                  >
                    {primaryAdGroup}
                  </span>
                </div>
                {/* Line 2: Campaign: <name> */}
                {campaignName && (
                  <div className="flex items-center min-w-0 text-[11px]">
                    <span style={{ color: isDark ? "#64748b" : "#94a3b8", marginRight: "4px", flexShrink: 0 }}>
                      {t("Campaign")}:
                    </span>
                    <span
                      className="truncate cursor-pointer text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:underline"
                      title={campaignName}
                      onClick={(e) => {
                        e.stopPropagation();
                        openCampaignViewInNewTab(row, campaignName, { campaignId });
                      }}
                    >
                      {campaignName}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* Campaign Level: Campaign: <name> */
              <div className="flex items-center min-w-0 text-[12px]">
                <span style={{ color: isDark ? "#94a3b8" : "#64748b", marginRight: "4px", flexShrink: 0, fontWeight: "500" }}>
                  {t("Campaign")}:
                </span>
                <span
                  className="truncate cursor-pointer text-sky-600 dark:text-[#38bdf8] hover:underline font-semibold"
                  title={campaignName}
                  onClick={(e) => {
                    e.stopPropagation();
                    openCampaignViewInNewTab(row, campaignName, { campaignId });
                  }}
                >
                  {campaignName}
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      headerName: t("Change type", "Change type"),
      field: "changeType",
      colId: "changeType",
      title: "Change Type",
      minWidth: 240,
      width: 300,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const text = formatAmazonChangeType(row);
        return (
          <div className="flex items-center h-full w-full min-w-0">
            <span
              className="truncate text-[12px] font-medium"
              style={{
                color: isDark ? "#e2e8f0" : "#1e293b",
              }}
              title={text}
            >
              {text}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("From"),
      field: "oldValue",
      title: "From",
      width: 140,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        const val = params.value;
        if (val === undefined || val === null || val === "" || val === "—") {
          return (
            <div className="flex items-center h-full">
              <span style={{ color: isDark ? "#94a3b8" : "#64748b" }}>—</span>
            </div>
          );
        }
        const statusBadge = getStatusBadgeProps(val);
        if (statusBadge) {
          return (
            <div className="flex items-center h-full">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusBadge.className}`} title={t(statusBadge.label)}>
                {t(statusBadge.label)}
              </span>
            </div>
          );
        }
        const formatted = !isNaN(Number(val)) ? CurrencyFormat(val) : val;
        return (
          <div className="flex items-center h-full">
            <span className="font-semibold text-danger truncate" style={{ fontSize: "12px" }} title={formatted}>
              {formatted}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("To"),
      field: "newValue",
      title: "To",
      width: 140,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        const val = params.value;
        if (val === undefined || val === null || val === "" || val === "—") {
          return (
            <div className="flex items-center h-full">
              <span style={{ color: isDark ? "#94a3b8" : "#64748b" }}>—</span>
            </div>
          );
        }
        const statusBadge = getStatusBadgeProps(val);
        if (statusBadge) {
          return (
            <div className="flex items-center h-full">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusBadge.className}`} title={t(statusBadge.label)}>
                {t(statusBadge.label)}
              </span>
            </div>
          );
        }
        const formatted = !isNaN(Number(val)) ? CurrencyFormat(val) : val;
        return (
          <div className="flex items-center h-full">
            <span className="font-semibold text-success truncate" style={{ fontSize: "12px" }} title={formatted}>
              {formatted}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("Old ACoS", "Old ACoS"),
      field: "oldAcos",
      colId: "oldAcos",
      title: "Old ACoS",
      order: 4.1,
      width: 145,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        const row = params.data;
        const val = row?.oldAcos !== undefined && row?.oldAcos !== null ? Number(row.oldAcos) : null;
        if (val === null || isNaN(val)) {
          return (
            <div className="flex items-center h-full">
              <span style={{ color: isDark ? "#94a3b8" : "#64748b" }}>—</span>
            </div>
          );
        }
        const badgeClass =
          val === 0
            ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700"
            : val <= 30
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60"
            : val <= 50
            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60"
            : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800/60";
        const tooltipText = row?.dateRange
          ? `Spend: ${CurrencyFormat(row.spend ?? 0)} | Sales: ${CurrencyFormat(row.sales ?? 0)} (${row.dateRange.startDate} to ${row.dateRange.endDate})`
          : t("ACoS prior to change");
        return (
          <div className="flex items-center h-full">
            <span
              className={`inline-block px-2.5 py-0.5 rounded-md font-semibold text-xs border ${badgeClass}`}
              title={tooltipText}
            >
              {val.toFixed(2)}%
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("Current ACoS", "Current ACoS"),
      field: "currentAcos",
      colId: "currentAcos",
      title: "Current ACoS",
      order: 4.2,
      width: 155,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        const row = params.data;
        const val = row?.currentAcos !== undefined && row?.currentAcos !== null ? Number(row.currentAcos) : null;
        if (val === null || isNaN(val)) {
          return (
            <div className="flex items-center h-full">
              <span style={{ color: isDark ? "#94a3b8" : "#64748b" }}>—</span>
            </div>
          );
        }
        const badgeClass =
          val === 0
            ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700"
            : val <= 30
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60"
            : val <= 50
            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60"
            : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800/60";
        const tooltipText = row?.currentDateRange
          ? `Spend: ${CurrencyFormat(row.currentSpend ?? 0)} | Sales: ${CurrencyFormat(row.currentSales ?? 0)} (${row.currentDateRange.startDate} to ${row.currentDateRange.endDate})`
          : t("Current ACoS for selected date range");
        return (
          <div className="flex items-center h-full">
            <span
              className={`inline-block px-2.5 py-0.5 rounded-md font-semibold text-xs border ${badgeClass}`}
              title={tooltipText}
            >
              {val.toFixed(2)}%
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("Triggered From"),
      field: "triggerSource",
      title: "Triggered From",
      width: 170,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        const row = params.data;
        const source = row?.triggerSource || (
          row?.updatedFrom === "Amazon Stream" || row?.source === "AMAZON_SQS" || row?.source === "AMAZON_API" || row?.source === "Amazon SQS" || row?.source === "Amazon API"
            ? "Amazon API"
            : (row?.changeType || "").toLowerCase().match(/dayparting/) || row?.source === "DAYPARTING"
              ? "Dayparting"
              : (row?.changeType || "").toLowerCase().match(/recommendation/) || row?.source === "RECOMMENDATION" || /^update (targeting bid|camapign budget|campaign budget|placement bid|product pages placement bid|rest of search placement bid|top of search placement bid|targeting status|camapign status|campaign status)$|^add (target|negative target)$|^revert/i.test(row?.changeType || "")
                ? "Recommendation"
                : (row?.changeType || "").toLowerCase().match(/rule|cron job/) || row?.source === "RULE"
                  ? "Rule"
                  : "Manual"
        );

        let bg = isDark ? "rgba(59, 130, 246, 0.15)" : "#eff6ff";
        let color = isDark ? "#60a5fa" : "#2563eb";
        let border = isDark ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid #bfdbfe";
        let label = "Manual";

        if (source === "Amazon API" || source === "Amazon SQS") {
          bg = isDark ? "rgba(245, 158, 11, 0.15)" : "#fffbeb";
          color = isDark ? "#fbbf24" : "#d97706";
          border = isDark ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid #fde68a";
          label = "Amazon API";
        } else if (source === "Rule") {
          bg = isDark ? "rgba(168, 85, 247, 0.15)" : "#faf5ff";
          color = isDark ? "#c084fc" : "#9333ea";
          border = isDark ? "1px solid rgba(168, 85, 247, 0.3)" : "1px solid #e9d5ff";
          label = "Rule";
        } else if (source === "Dayparting") {
          bg = isDark ? "rgba(99, 102, 241, 0.15)" : "#eef2ff";
          color = isDark ? "#818cf8" : "#4f46e5";
          border = isDark ? "1px solid rgba(99, 102, 241, 0.3)" : "1px solid #c7d2fe";
          label = "Dayparting";
        } else if (source === "Recommendation") {
          bg = isDark ? "rgba(16, 185, 129, 0.15)" : "#ecfdf5";
          color = isDark ? "#34d399" : "#059669";
          border = isDark ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid #a7f3d0";
          label = "Recommendation";
        }

        return (
          <div className="flex items-center h-full">
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: bg,
                color: color,
                border: border,
                padding: "3px 10px",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: "700",
                letterSpacing: "0.02em",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: color,
                  display: "inline-block",
                }}
              />
              {t(label)}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("updatedFrom"),
      field: "updatedFrom",
      title: "Updated From",
      width: 180,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        if (!params.value) return null;
        return (
          <div className="flex items-center h-full">
            <span style={{
              backgroundColor: isDark ? "rgba(100,116,139,0.15)" : "rgba(100,116,139,0.08)",
              color: isDark ? "#94a3b8" : "#475569",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: "600",
            }}>
              {params.value}
            </span>
          </div>
        );
      }
    },
    {
      headerName: t("updatedBy"),
      field: "updatedBy",
      title: "Updated By",
      width: 180,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        if (!params.value) return null;
        return (
          <div className="flex items-center h-full">
            <div className="flex items-center gap-1 truncate" style={{ fontSize: "12px", fontWeight: "500", color: isDark ? "#94a3b8" : "#475569" }} title={params.value}>
              <FiUser size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
              <span className="truncate">{params.value}</span>
            </div>
          </div>
        );
      }
    },
    {
      headerName: t("dateAndTime"),
      field: "createdAt",
      title: "Date And Time",
      width: 200,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        if (!params.value) return <div className="flex items-center h-full"><span style={{ color: isDark ? "#94a3b8" : "#64748b" }}>—</span></div>;
        const formatted = moment(params.value).format("DD/MM/YYYY hh:mm:ss A");
        const parts = formatted.split(" ");
        const datePart = parts[0] || "";
        const timePart = parts.slice(1).join(" ") || "";
        return (
          <div className="flex flex-col justify-center h-full leading-tight">
            <div className="flex items-center gap-1">
              <FiClock style={{ opacity: 0.6, color: isDark ? "#94a3b8" : "#64748b", flexShrink: 0 }} size={12} />
              <span style={{ fontSize: 12, fontWeight: 550, color: isDark ? "#f8fafc" : "#475569" }}>{datePart}</span>
            </div>
            {timePart && <span style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748b", paddingLeft: "15px" }}>{timePart}</span>}
          </div>
        );
      },
    },
  ], [isDark, t, showAllTypes]);

  useEffect(() => {
    HistoryList(arg);
  }, [date, profileId?.value, selectedAdType, types, sources, debouncedSearchName, debouncedTargetingSearch]);

  const handlePageChange = (page) => {
    setArg({
      pageNo: page,
      perPage: perPage
    })
    HistoryList({ pageNo: page, perPage: perPage });
  };

  const handlePerRowsChange = (newPerPage) => {
    setPerPage(newPerPage);
    setArg({ pageNo: 1, perPage: newPerPage });
    HistoryList({ pageNo: 1, perPage: newPerPage });
  };

  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    HistoryList({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), ...arg });
  };

  // Recalculate Old ACoS and Current ACoS in memory whenever lookback days or current ACoS dates change (0ms latency)
  const computedTableData = useMemo(() => {
    if (!Array.isArray(tableData) || !tableData.length) return [];
    if (!Array.isArray(dailyStats)) return tableData;

    const lookbackNum =
      acosPeriod === "custom_days"
        ? Math.max(1, Number(customDays) || 7)
        : Number(acosPeriod) || 7;

    const tz = profileTimezone || "UTC";
    const todayStr = moment().tz(tz).format("YYYY-MM-DD");

    let currStartDate = currentAcosDate?.[0]
      ? moment(currentAcosDate[0]).format("YYYY-MM-DD")
      : moment(todayStr).subtract(7, "days").format("YYYY-MM-DD");
    let currEndDate = currentAcosDate?.[1]
      ? moment(currentAcosDate[1]).format("YYYY-MM-DD")
      : todayStr;

    if (moment(currStartDate).isAfter(moment(currEndDate))) {
      const tmp = currStartDate;
      currStartDate = currEndDate;
      currEndDate = tmp;
    }

    return tableData.map((item) => {
      const changeDateStr = item.createdAt
        ? moment(item.createdAt).tz(tz).format("YYYY-MM-DD")
        : todayStr;
      let oldEndDate = changeDateStr;
      let oldStartDate = moment(changeDateStr).subtract(lookbackNum, "days").format("YYYY-MM-DD");

      if (moment(oldStartDate).isAfter(moment(oldEndDate))) {
        const temp = oldStartDate;
        oldStartDate = oldEndDate;
        oldEndDate = temp;
      }

      const itemTargetText = item.targeting ? String(item.targeting).trim().toLowerCase() : "";
      const itemTargetId = item.targetId ? String(item.targetId).replace(/^[TK]-/, "") : "";
      const itemCampaignId = String(item.changeLevel || item.campaignId || item.campaignDetails?.campaignId || "");
      const itemMatchNorm = item.matchType
        ? String(item.matchType).trim().toUpperCase().replace(/^TARGETING_EXPRESSION_/, "")
        : "";

      let oldSpend = 0;
      let oldSales = 0;
      let currSpend = 0;
      let currSales = 0;

      for (let i = 0; i < dailyStats.length; i++) {
        const stat = dailyStats[i];
        if (!stat?.reportDate) continue;

        let isMatch = false;
        if (itemTargetText || itemTargetId) {
          if (stat.statType === "target" || stat.targetId || stat.targeting) {
            const campMatches = !itemCampaignId || !stat.campaignId || String(stat.campaignId) === itemCampaignId;
            if (campMatches) {
              const statText = stat.targeting ? String(stat.targeting).trim().toLowerCase() : "";
              const statId = stat.targetId ? String(stat.targetId).replace(/^[TK]-/, "") : "";
              if (itemTargetId && statId && statId === itemTargetId) {
                isMatch = true;
              } else if (itemTargetText && statText === itemTargetText) {
                const statMatchNorm = stat.matchType
                  ? String(stat.matchType).trim().toUpperCase().replace(/^TARGETING_EXPRESSION_/, "")
                  : "";
                if (!itemMatchNorm || !statMatchNorm || itemMatchNorm === statMatchNorm) {
                  isMatch = true;
                }
              }
            }
          }
        } else if (stat.statType === "campaign" || (!stat.targetId && !stat.targeting)) {
          if (itemCampaignId && stat.campaignId && String(stat.campaignId) === itemCampaignId) {
            isMatch = true;
          }
        }

        if (!isMatch) continue;

        if (stat.reportDate >= oldStartDate && stat.reportDate <= oldEndDate) {
          oldSpend += Number(stat.spend) || 0;
          oldSales += Number(stat.sales) || 0;
        }
        if (stat.reportDate >= currStartDate && stat.reportDate <= currEndDate) {
          currSpend += Number(stat.spend) || 0;
          currSales += Number(stat.sales) || 0;
        }
      }

      const calculatedOldAcos = oldSales > 0 ? Number(((oldSpend / oldSales) * 100).toFixed(2)) : 0;
      const calculatedCurrAcos = currSales > 0 ? Number(((currSpend / currSales) * 100).toFixed(2)) : 0;

      return {
        ...item,
        oldAcos: calculatedOldAcos,
        spend: Number(oldSpend.toFixed(2)),
        sales: Number(oldSales.toFixed(2)),
        dateRange: { startDate: oldStartDate, endDate: oldEndDate },
        currentAcos: calculatedCurrAcos,
        currentSpend: Number(currSpend.toFixed(2)),
        currentSales: Number(currSales.toFixed(2)),
        currentDateRange: { startDate: currStartDate, endDate: currEndDate },
      };
    });
  }, [tableData, dailyStats, acosPeriod, customDays, currentAcosDate, profileTimezone]);

  const HistoryList = async (argOverride) => {
    if (!profileId?.value || !selectedAdType) return;
    const lookbackDays =
      acosPeriod === "custom_days"
        ? Math.max(1, Number(customDays) || 7)
        : Number(acosPeriod) || 7;
    const data = {
      fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
      toDate: moment(date?.[1]).format("YYYY-MM-DD"),
      profileId: profileId.value,
      type: types,
      source: sources,
      searchName: argOverride?.hasOwnProperty("searchName") ? argOverride.searchName : debouncedSearchName,
      targeting: argOverride?.hasOwnProperty("targeting") ? argOverride.targeting : debouncedTargetingSearch,
      fieldName: "createdAt",
      sortType: "DESC",
      acosLookbackMode: acosPeriod,
      acosLookbackDays: lookbackDays,
      currentAcosFromDate: currentAcosDate?.[0] ? moment(currentAcosDate[0]).format("YYYY-MM-DD") : undefined,
      currentAcosToDate: currentAcosDate?.[1] ? moment(currentAcosDate[1]).format("YYYY-MM-DD") : undefined,
      ...(Boolean(campaignId) && {
        campaignId: parseFloat(
          Buffer.from(campaignId, "base64").toString("utf8")
        ),
      }),
      ...argOverride,
    };
    setLoadingGrid(true);
    try {
      const e = await ApiHistory(data);
      if (e?.isSuccess) {
        dispatch(handleLoader(false));
        setTableData(e.data || []);
        setDailyStats(Array.isArray(e?.dailyStats) ? e.dailyStats : null);
        if (e?.timezone) {
          setProfileTimezone(e.timezone);
        }
        setHistoryData(e);
      } else {
        Toast.error(e?.message);
      }
    } catch (err) {
      Toast.error(t("Something went wrong"));
    } finally {
      setLoadingGrid(false);
    }
  };

  const handleGridFilter = ({ target: { value } }) => {
    if (value === "Type") setShowTypePopover(true);
  };

  const handleRemoveSingleFilter = (id) => {
    if (id === "type") setTypes([]);
    if (id === "source") setSources([]);
    if (id === "targeting") {
      setTargetingSearch("");
      setDebouncedTargetingSearch("");
    }
  };

  const handleTypePopoverApply = (selectedTypes) => {
    setTypes(selectedTypes);
    setShowTypePopover(false);
  };

  return (
    <>
      <style>{`
        @keyframes popoverFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        [data-theme="dark"] #history-search input,
        [data-theme="dark"] #history-targeting input {
          color: #f8fafc !important;
          background-color: #1e293b !important;
          border: 1px solid #334155 !important;
        }
        [data-theme="dark"] #history-search input::placeholder,
        [data-theme="dark"] #history-targeting input::placeholder {
          color: #94a3b8 !important;
        }
        .cron-title-bar {
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
          font-weight: 700 !important;
          font-family: "Inter", sans-serif !important;
        }
        .cron-title-bar::before {
          content: "" !important;
          display: inline-block !important;
          width: 3px !important;
          height: 18px !important;
          border-radius: 1.5px !important;
          background: #1A5CC7 !important;
          margin-right: 8px !important;
          vertical-align: middle !important;
        }
        [data-theme="dark"] .cron-title-bar::before {
          background: #5B9CF6 !important;
        }
      `}</style>
      <Filter
        name={"History"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="targeting-tracking-container">
        <div className="middle_container budget_container">

          {targetingType === "Targeting" && (
            <div className="mb-4">
              <Breadcrumb
                paths={[
                  { label: "Targeting", link: "/targeting" },
                  { label: "History" }
                ]}
                onBack={() => navigate("/targeting")}
              />
            </div>
          )}

          {showAllTypes && (
            <div style={{ padding: "0 0 10px 0" }}>
              <AdTypeScopeNote selectedAdType={selectedAdType} excludedAdTypes={historyData?.excludedAdTypes} />
            </div>
          )}

          {/* Main History Card */}
          <div className="data_content data_content_btn glass-grid-container h-maxContent">
            {/* Card header / filter bar */}
            <div className="camapgin_btn flex flex-wrap justify-between items-center gap-3 pt-4 pb-2 px-6 w-full max-w-full box-border relative z-30">
              <div className="flex flex-wrap items-center justify-between gap-3 w-full">
                <CardTitle className="m-0 flex items-center cron-title-bar" style={{ fontSize: 14, color: isDark ? "#cbd5e1e0" : "#0F172A" }}>
                  {t("History")}
                </CardTitle>

                {/* ACoS Calculation Controls (Old ACoS Lookback Days & Current ACoS Date Selection) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Old ACoS Lookback Selector */}
                  <div
                    className="flex items-center gap-2 px-2.5 py-1 rounded-xl border shadow-sm"
                    style={{
                      backgroundColor: isDark ? "rgba(30, 41, 59, 0.7)" : "#f8fafc",
                      borderColor: isDark ? "#334155" : "#e2e8f0",
                    }}
                  >
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: isDark ? "#94a3b8" : "#475569" }}
                    >
                      {t("Old ACoS")}:
                    </span>
                    <div style={{ width: "135px" }}>
                      <Select value={acosPeriod} onValueChange={(val) => setAcosPeriod(val)}>
                        <SelectTrigger className="h-8 w-full text-xs font-medium bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-lg shadow-none">
                          <SelectValue placeholder={t("Last 7 Days")} />
                        </SelectTrigger>
                        <SelectContent className="z-[99999] min-w-[135px] bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 shadow-lg">
                          <SelectItem value="7" className="text-xs py-1.5 cursor-pointer">
                            {t("Last 7 Days")}
                          </SelectItem>
                          <SelectItem value="14" className="text-xs py-1.5 cursor-pointer">
                            {t("Last 14 Days")}
                          </SelectItem>
                          <SelectItem value="30" className="text-xs py-1.5 cursor-pointer">
                            {t("Last 30 Days")}
                          </SelectItem>
                          <SelectItem value="custom_days" className="text-xs py-1.5 cursor-pointer">
                            {t("Custom Days")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {acosPeriod === "custom_days" && (
                      <div className="flex items-center gap-1 bg-white dark:bg-[#1e293b] px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 h-8">
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={customDays}
                          onChange={(e) => {
                            const val = Math.min(365, Math.max(1, Number(e.target.value) || 1));
                            setCustomDays(val);
                          }}
                          className="w-11 h-6 text-center text-xs font-bold bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none"
                          title={t("Enter number of lookback days for Old ACoS")}
                        />
                        <span className="text-[11px] font-semibold text-slate-400">
                          {t("days")}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Current ACoS Date Range Selector */}
                  <div
                    className="flex items-center gap-2 px-2.5 py-1 rounded-xl border shadow-sm"
                    style={{
                      backgroundColor: isDark ? "rgba(30, 41, 59, 0.7)" : "#f8fafc",
                      borderColor: isDark ? "#334155" : "#e2e8f0",
                    }}
                  >
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: isDark ? "#94a3b8" : "#475569" }}
                    >
                      {t("Current ACoS")}:
                    </span>
                    <div className="w-[220px] min-w-0">
                      <DateRangePicker
                        syncGlobalDate={false}
                        className="w-full !max-w-full [&_button]:!h-8 [&_button]:!text-xs [&_button]:!px-2.5 [&_button]:!rounded-lg"
                        ranges={predefinedRanges}
                        value={currentAcosDate}
                        placeholder={t("Select Current ACoS Date")}
                        onChange={(val) => {
                          if (val && Array.isArray(val) && val.length >= 2) {
                            setCurrentAcosDate(val);
                          }
                        }}
                        placement="bottomEnd"
                        format="yyyy-MM-dd"
                        cleanable={false}
                        style={{ height: "32px", borderRadius: "8px", width: "100%" }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 w-full max-w-full min-w-0 mt-2 box-border">
                {/* 1. Filter by Type */}
                <div id="history-type" className="w-full min-w-0 relative z-30">
                  <MultiSelect
                    options={TYPE_OPTIONS}
                    value={types}
                    onChange={(val) => setTypes(val || [])}
                    placeholder={t("Filter by Type")}
                    className="bg-transparent h-10 w-full"
                    maxCount={2}
                  />
                </div>

                {/* 2. Filter by Triggered From */}
                <div id="history-source" className="w-full min-w-0 relative z-30">
                  <MultiSelect
                    options={SOURCE_OPTIONS}
                    value={sources}
                    onChange={(val) => setSources(val || [])}
                    placeholder={t("Triggered From")}
                    className="bg-transparent h-10 w-full"
                    maxCount={2}
                  />
                </div>

                {/* 3. Search by Campaign Name */}
                <div id="history-search" className="relative w-full min-w-0">
                  <Input
                    type="text"
                    placeholder={t("Search by Campaign Name...")}
                    value={searchName}
                    onChange={(e) => setSearchName(e?.target?.value)}
                    className="w-full h-10"
                    style={{
                      fontSize: "13px",
                      fontFamily: "inherit",
                      backgroundColor: isDark ? "#1e293b" : "#fff",
                      borderColor: isDark ? "#334155" : "#ced4da",
                      color: isDark ? "#f8fafc" : "#1e293b",
                      paddingRight: searchName ? "35px" : "12px",
                    }}
                  />
                  {searchName && (
                    <MdOutlineClose
                      onClick={() => setSearchName("")}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        cursor: "pointer",
                        color: "var(--text-secondary)",
                        fontSize: "18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.7,
                        transition: "opacity 0.2s",
                        zIndex: 10,
                      }}
                      onMouseEnter={(e) => e.target.style.opacity = 1}
                      onMouseLeave={(e) => e.target.style.opacity = 0.7}
                    />
                  )}
                </div>

                {/* 4. Search by Targeting */}
                <div id="history-targeting" className="relative w-full min-w-0">
                  <Input
                    type="text"
                    placeholder={t("Search by Targeting...")}
                    value={targetingSearch}
                    onChange={(e) => setTargetingSearch(e?.target?.value)}
                    className="w-full h-10"
                    style={{
                      fontSize: "13px",
                      fontFamily: "inherit",
                      backgroundColor: isDark ? "#1e293b" : "#fff",
                      borderColor: isDark ? "#334155" : "#ced4da",
                      color: isDark ? "#f8fafc" : "#1e293b",
                      paddingRight: targetingSearch ? "35px" : "12px",
                    }}
                  />
                  {targetingSearch && (
                    <MdOutlineClose
                      onClick={() => setTargetingSearch("")}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        cursor: "pointer",
                        color: "var(--text-secondary)",
                        fontSize: "18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.7,
                        transition: "opacity 0.2s",
                        zIndex: 10,
                      }}
                      onMouseEnter={(e) => e.target.style.opacity = 1}
                      onMouseLeave={(e) => e.target.style.opacity = 0.7}
                    />
                  )}
                </div>

                {/* 5. Date Range Picker */}
                <div id="history-date-picker" className="w-full min-w-0 max-w-full box-border">
                  <DateRangePicker
                    className="w-full !max-w-full"
                    ranges={predefinedRanges}
                    value={date}
                    placeholder={t("Select Date")}
                    onChange={(val) => setDate(val)}
                    placement="bottomEnd"
                    format="yyyy-MM-dd"
                    cleanable={false}
                    style={{ height: "40px", borderRadius: "8px", width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
                  />
                </div>
              </div>
            </div>

            {/* ── Applied Filters bar ── */}
            <AppliedFilter
              appliedFilters={appliedFilters}
              handleGridFilter={handleGridFilter}
              handleRemoveSingleFilter={handleRemoveSingleFilter}
              setAppliedFilters={(filters) => {
                setAppliedFilters(filters);
                if (!filters.length) {
                  setTypes([]);
                  setSources([]);
                  setTargetingSearch("");
                  setDebouncedTargetingSearch("");
                }
              }}
              chipRefs={{ type: typeChipRef }}
              selectedCampaigns={[1]}
            />

            {/* ── TypePopover — outside container ── */}
            <TypePopover
              anchorRef={typeChipRef}
              show={showTypePopover}
              currentTypes={types}
              onApply={handleTypePopoverApply}
              onClose={() => setShowTypePopover(false)}
              isDark={isDark}
            />

            {PermissionCheck(SYSTEM_PAGES.HISTORY, PAGE_ACTIONS.VIEW_ONLY) && (
              <div className="p-0">
                <div id="history" className="data_table" style={{ padding: "0 24px 24px 24px" }}>
                  <AgTable ref={gridRef}
                    tableId="history-main-table"
                    height={"70vh"}
                    rowHeight={52}
                    rowData={computedTableData}
                    columnDefs={columns}
                    totalRecords={historyData?.totalRecords ?? 0}
                    perPage={perPage}
                    currentPage={arg.pageNo}
                    onPageChange={handlePageChange}
                    onPerPageChange={handlePerRowsChange}
                    onSortChanged={handleSortChanged}
                    paginationOptions={paginationRowsPerPageOptions}
                    isCustomSaveColumns={true}
                    customSaveColumnName={"History"}
                    handleSaveColumns={undefined}
                    loading={loadingGrid}
                    onRefresh={() => HistoryList(arg)}
                    defaultColDef={{ resizable: true, suppressSizeToFit: false }}
                    onGridReady={(params) => {
                      setTimeout(() => {
                        if (params?.api && typeof params.api.sizeColumnsToFit === "function") {
                          params.api.sizeColumnsToFit();
                        }
                      }, 100);
                    }}
                  />
                </div>

              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default History;
