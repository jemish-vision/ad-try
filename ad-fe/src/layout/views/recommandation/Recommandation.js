import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { useEffect, useState, useContext, useCallback, useMemo, useRef } from "react";
import Filter from "../../../helper/filter/Filter";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { AdTypeScopeNote } from "../../../helper/filter/AdTypeScopeNote";
import { isShowingAllAdTypes } from "../../../helper/filter/adTypeAll";
import { useTranslation } from "react-i18next";
import {
  ApiGetRecommendation,
  ApiGetRecommendationData,
  ApiDeleteRecommendation,
} from "../../../api-wrapper/recommendation/ApiRecommendation";
import { Toast, useDispatch, handleLoader } from "../../../helper/links/Link";
import RecommendationModal from "./RecommendationModal";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { normalizeRecommendationDateRange, recommendationDateRangePayload } from "./recommendationDateRange.mjs";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import AddRule from "../recommendationRule/AddRule";
import { TagList, getTagStyles } from "../../../components/recommendation-tags/RecommendationTags";
import { ApiGetRecommendationTags } from "../../../api-wrapper/recommendation/ApiRecommendation";
import RecommendationRules from "../recommendationRule/RecommendationRules";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles, Sliders, RefreshCw, Tag as TagIcon, ChevronDown } from "lucide-react";
import TagManagement from "./TagManagement";
import { FiInfo } from "react-icons/fi";
import {
  RECOMMENDATION_FILTER_OPTIONS,
  RecommendationFilterDropdown,
  RecommendationAppliedFilters,
  RecommendationFilterModal,
  buildRecommendationAppliedFilters,
} from "./RecommendationFilterBar";

// ─── Action label mapping for display ─────────────────────────────────────────
const ACTION_LABEL_MAP = {
  SetBudget: "Set Budget",
  IncreaseBudget: "Increase Budget",
  DecreaseBudget: "Decrease Budget",
  CampaignEnable: "Enable Campaign",
  CampaignPause: "Pause Campaign",
  IncreaseBid: "Increase Bid",
  DecreaseBid: "Decrease Bid",
  SetBid: "Set Bid",
  EnableTargeting: "Enable Targeting",
  PauseTargeting: "Pause Targeting",
  AddAsTargeting: "Add as Targeting",
  AddAsNegativeTargeting: "Add as Negative Targeting",
  EnableProduct: "Enabled Product",
  DisableProduct: "Disabled Product",
};

const PLACEMENT_LABEL_MAP = {
  "Top of Search": "Top Search",
  "Rest of Search": "Rest Search",
  "Product Page": "Product Page",
  "Product Pages": "Product Page",
};

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = d.getDate();
  const getOrdinal = (n) => {
    if (n > 3 && n < 21) return 'th';
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };
  return `${day}${getOrdinal(day)} ${d.toLocaleString('en', { month: 'short' })}`;
}

function getActionDetails(actions, gridName) {
  const validActions = Array.isArray(actions)
    ? actions.filter((a) => a && a.actionName && String(a.actionName).toLowerCase() !== "none")
    : [];
  if (validActions.length === 0) return [];

  return validActions.map((action, idx) => {
    const label = ACTION_LABEL_MAP[action.actionName] || action.actionName;
    let actionText = label;

    // Add placement type for Placement grid
    if (gridName === "Placement" && action.placementType) {
      const placementLabel = PLACEMENT_LABEL_MAP[action.placementType] || action.placementType;
      actionText = `${label} (${placementLabel})`;
    }

    // Add value with symbol
    if (action.actionValue && action.actionValueType) {
      const symbol = action.actionValueType === "Percentage" ? "%" : "";
      actionText = `${actionText} ${action.actionValue}${symbol}`;
    }

    // Add match type for Search Term grid
    if (gridName === "Search Term" && action.matchType) {
      actionText = `${actionText} - ${action.matchType}`;
    }

    return {
      id: idx,
      name: action.actionName,
      text: actionText,
    };
  });
}

const getActionIcon = (actionName, size = 12) => {
  if (!actionName) return null;
  if (actionName.includes("Increase")) return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
  if (actionName.includes("Decrease")) return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>;
  if (actionName.includes("Pause")) return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>;
  if (actionName.includes("Enable")) return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
  if (actionName === "AddAsNegativeTargeting") return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" /></svg>;
  if (actionName === "AddAsTargeting") return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>;

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;
};

const getActionColors = (actionName, isDark = false) => {
  return {
    bg: isDark ? "rgba(26, 159, 212, 0.15)" : "rgba(2, 70, 139, 0.06)",
    text: isDark ? "#38bdf8" : "#1A9FD4",
    border: isDark ? "rgba(56, 189, 248, 0.25)" : "rgba(2, 70, 139, 0.15)"
  };
};

function RecommendationItem({ id, recommendation, onClick, onEdit, onDelete, isDark, isMobile, isLoading, isAnyLoading, isInsideGroup = false }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const actions = getActionDetails(recommendation.actions, recommendation.gridName);

  const hasOob = Array.isArray(recommendation?.conditions) && recommendation.conditions.some(c =>
    String(c?.conditionType || "").toLowerCase().replace(/[\s_]+/g, "") === "outofbudget"
  );

  return (
    <div
      id={id}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: isMobile ? "12px 16px" : "16px 20px",
        marginBottom: isInsideGroup ? "0" : "12px",
        borderRadius: "12px",
        border: isLoading
          ? (isDark ? "1px solid #38bdf8" : "1px solid #0284c7")
          : (isDark
              ? (isInsideGroup ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid rgba(255, 255, 255, 0.08)")
              : (isInsideGroup ? "1px solid rgba(0, 0, 0, 0.06)" : "1px solid #e2e8f0")),
        cursor: isLoading ? "wait" : (isAnyLoading ? "not-allowed" : "pointer"),
        transition: "all 0.2s ease-in-out",
        backgroundColor: isDark
          ? (isLoading ? "rgba(14, 165, 233, 0.08)" : (hovered ? "#1e293b" : (isInsideGroup ? "#0f172a" : "#0f172a")))
          : (isLoading ? "rgba(14, 165, 233, 0.04)" : (hovered ? "#ffffff" : (isInsideGroup ? "#ffffff" : "#ffffff"))),
        boxShadow: isLoading
          ? (isDark ? "0 0 16px rgba(56, 189, 248, 0.25)" : "0 0 16px rgba(14, 165, 233, 0.18)")
          : (hovered ? (isDark ? "0 4px 12px rgba(0, 0, 0, 0.3)" : "0 4px 12px rgba(0, 0, 0, 0.05)") : "0 2px 4px rgba(0, 0, 0, 0.02)"),
        opacity: isAnyLoading && !isLoading ? 0.6 : 1,
        position: "relative",
      }}
      onMouseEnter={() => !isAnyLoading && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !isAnyLoading && onClick(recommendation)}
    >
      {isLoading && (
        <div
          className="absolute top-0 left-0 right-0 h-[2.5px] rounded-t-xl overflow-hidden pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent 0%, #1A9FD4 30%, #3ECFA8 70%, transparent 100%)",
            opacity: 0.9,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: actions.length > 0 || hasOob ? 8 : 0,
        }}>
          <span style={{
            fontSize: 16,
            fontWeight: 600,
            color: hovered || isLoading ? "#38bdf8" : (isDark ? "#f8fafc" : "#1e293b"),
            transition: "color 0.2s",
          }}>
            {recommendation.ruleName}
          </span>
          <TagList tags={recommendation.tags} max={4} size="xs" isDark={isDark} />
        </div>
        {actions.length === 0 && (hasOob || !recommendation.actions?.length) && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}>
            {hasOob && (
              <span style={{
                background: isDark ? "rgba(245, 158, 11, 0.15)" : "#fef3c7",
                color: isDark ? "#fbbf24" : "#d97706",
                padding: "2px 8px",
                borderRadius: "12px",
                fontSize: 11,
                fontWeight: 600,
                border: isDark ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid #fde68a",
              }}>
                {t("Out of Budget")}
              </span>
            )}
            <span style={{
              fontSize: 11.5,
              color: isDark ? "#94a3b8" : "#64748b",
              fontStyle: "italic",
            }}>
              {t("Note: It was show only for out of budget")}
            </span>
          </div>
        )}
        {actions.length > 0 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}>
            <span style={{
              background: isDark ? "#1e293b" : "#f1f5f9",
              padding: "2px 8px",
              borderRadius: "12px",
              fontSize: 11,
              fontWeight: 600,
              color: isDark ? "#94a3b8" : "#64748b",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "none",
            }}>
              {t("Action")}
            </span>
            {actions.map(action => {
              const colors = getActionColors(action.name, isDark);
              return (
                <div key={action.id} style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: colors.bg,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  border: `1px solid ${colors.border}`,
                }}>
                  <span style={{ color: colors.text, display: "flex", alignItems: "center" }}>
                    {getActionIcon(action.name, 12)}
                  </span>
                  <span style={{ fontWeight: 600, color: colors.text, fontSize: 11.5 }}>
                    {action.text}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex items-center" style={{ gap: 16, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <span style={{ fontSize: 12, color: isDark ? "#64748b" : "#94a3b8", whiteSpace: "nowrap", display: isMobile ? "none" : "block" }}>
          {formatDate(recommendation?.createdAt)}
        </span>
        {recommendation?.newCount > 0 && (
          <span
            style={{
              background: isDark ? "rgba(22, 163, 74, 0.15)" : "#dcfce7",
              color: isDark ? "#4ade80" : "#16a34a",
              padding: "4px 10px",
              borderRadius: "20px",
              fontSize: 12,
              fontWeight: 600,
              border: isDark ? "1px solid rgba(74, 222, 128, 0.3)" : "1px solid #bbf7d0",
              whiteSpace: "nowrap",
            }}
          >
            +{recommendation?.newCount} {t("new")}
          </span>
        )}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isDark ? "#1e293b" : "#f1f5f9",
          color: isDark ? "#cbd5e1" : "#334155",
          height: 30,
          minWidth: 30,
          padding: "0 10px",
          borderRadius: 15,
          fontSize: 13,
          fontWeight: 600,
          border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0"
        }}>
          {recommendation.count || 0}
        </div>
        <div className="flex items-center" style={{ gap: 8 }}>
          {PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE) && (
            <button
              title={isLoading ? t("Loading data...") : t("View Details")}
              disabled={isAnyLoading}
              onClick={(e) => { e.stopPropagation(); if (!isAnyLoading) onEdit(recommendation); }}
              style={{
                background: isLoading
                  ? (isDark ? "rgba(56, 189, 248, 0.2)" : "#e0f2fe")
                  : (isDark ? "rgba(16, 185, 129, 0.15)" : "#ecfdf5"),
                border: isLoading
                  ? (isDark ? "1px solid rgba(56, 189, 248, 0.4)" : "1px solid #7dd3fc")
                  : (isDark ? "1px solid rgba(16, 185, 129, 0.30)" : "1px solid #d1fae5"),
                borderRadius: "6px",
                color: isLoading
                  ? (isDark ? "#38bdf8" : "#0284c7")
                  : (isDark ? "#34d399" : "#10b981"),
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: isLoading ? "wait" : (isAnyLoading ? "not-allowed" : "pointer"),
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!isAnyLoading) e.currentTarget.style.background = isDark ? "rgba(16, 185, 129, 0.25)" : "#d1fae5";
              }}
              onMouseLeave={(e) => {
                if (!isAnyLoading) e.currentTarget.style.background = isDark ? "rgba(16, 185, 129, 0.15)" : "#ecfdf5";
              }}
            >
              {isLoading ? (
                <i className="fa fa-spinner fa-spin" style={{ fontSize: "12px" }} />
              ) : (
                <i className="fa fa-pen" style={{ fontSize: "12px" }} />
              )}
            </button>
          )}
          {PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.REMOVE) && (
            <button
              title={t("Delete Recommendation")}
              disabled={isAnyLoading}
              onClick={(e) => { e.stopPropagation(); if (!isAnyLoading) onDelete(recommendation); }}
              style={{
                background: isDark ? "rgba(239, 68, 68, 0.15)" : "#fef2f2",
                border: isDark ? "1px solid rgba(239, 68, 68, 0.30)" : "1px solid #fee2e2",
                borderRadius: "6px",
                color: isDark ? "#f87171" : "#ef4444",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: isAnyLoading ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
                opacity: isAnyLoading ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isAnyLoading) e.currentTarget.style.background = isDark ? "rgba(239, 68, 68, 0.25)" : "#fee2e2";
              }}
              onMouseLeave={(e) => {
                if (!isAnyLoading) e.currentTarget.style.background = isDark ? "rgba(239, 68, 68, 0.15)" : "#fef2f2";
              }}
            >
              <i className="fa fa-trash" style={{ fontSize: "12px" }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonItem({ isDark }) {
  return (
    <div style={{ padding: "14px 0", borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #f1f5f9" }}>
      <div className="flex justify-between items-center" >
        <div>
          <div style={{ background: isDark ? "#1e293b" : "#e2e8f0", height: 18, width: 250, borderRadius: 4, marginBottom: 6 }} />
          <div className="flex items-center" style={{ gap: 8 }}>
            <div style={{ background: isDark ? "#1e293b" : "#e2e8f0", width: 50, height: 16, borderRadius: 12 }} />
            <div style={{ background: isDark ? "#1e293b" : "#e2e8f0", width: 150, height: 14, borderRadius: 4 }} />
          </div>
        </div>
        <div className="flex items-center" style={{ gap: 20 }}>
          <div style={{ background: isDark ? "#1e293b" : "#e2e8f0", height: 14, width: 60, borderRadius: 4 }} />
          <div style={{ background: isDark ? "#1e293b" : "#e2e8f0", height: 28, width: 45, borderRadius: 30 }} />
        </div>
      </div>
    </div>
  );
}

function TagGroupHeader({ group, isDark, isMobile, isCollapsed, onToggle }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const tagColor = group.tag?.color || "#2563EB";
  const styles = getTagStyles(tagColor, isDark);
  const totalCount = group.items.length;
  const totalOpportunities = useMemo(
    () => group.items.reduce((sum, item) => sum + (Number(item.count) || 0), 0),
    [group.items]
  );
  const totalNew = useMemo(
    () => group.items.reduce((sum, item) => sum + (Number(item.newCount) || 0), 0),
    [group.items]
  );

  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`tag-group-header flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none transition-colors duration-150 ${
        isCollapsed ? "" : (isDark ? "border-b border-white/5" : "border-b border-slate-200/80")
      }`}
      style={{
        background: isDark
          ? (hovered ? "rgba(30, 41, 59, 0.55)" : "rgba(30, 41, 59, 0.25)")
          : (hovered ? "#f1f5f9" : "#f8fafc"),
      }}
      title={isCollapsed ? t("Click to expand") : t("Click to collapse")}
    >
      {/* Left: Color Accent + Tag Badge + Name + Count Pill */}
      <div className="flex items-center gap-2.5 flex-wrap min-w-0">
        <span
          className="w-1.5 h-5 rounded-full shrink-0"
          style={{ backgroundColor: styles.dot }}
        />
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[13px] font-semibold border shadow-sm shrink-0"
          style={{
            color: styles.text,
            backgroundColor: styles.bg,
            borderColor: styles.border,
          }}
        >
          <TagIcon className="w-3.5 h-3.5 shrink-0" style={{ color: styles.dot }} />
          <span className="truncate max-w-[160px] sm:max-w-[240px]">{group.tag.name}</span>
        </div>

        <span
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-medium"
          style={{
            color: isDark ? "#cbd5e1" : "#475569",
            backgroundColor: isDark ? "rgba(255, 255, 255, 0.06)" : "#f1f5f9",
            border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
          }}
        >
          <span className="font-semibold">{totalCount}</span>
          <span className="text-[11.5px] opacity-80">
            {totalCount === 1 ? t("recommendation") : t("recommendations")}
          </span>
        </span>
      </div>

      {/* Right: Stats Summary + Collapse Toggle */}
      <div className="flex items-center gap-2.5 shrink-0">
        {totalNew > 0 && (
          <span
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold"
            style={{
              color: "#34d399",
              backgroundColor: "rgba(16, 185, 129, 0.14)",
              border: "1px solid rgba(16, 185, 129, 0.28)",
            }}
            title={t("{{count}} new opportunities across this group", { count: totalNew })}
          >
            <span>+{totalNew}</span>
            <span className="text-[10.5px] opacity-90">{t("new")}</span>
          </span>
        )}

        {totalOpportunities > 0 && (
          <span
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold"
            style={{
              color: isDark ? "#94a3b8" : "#64748b",
              backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "#f8fafc",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
            }}
            title={t("{{count}} total opportunities", { count: totalOpportunities })}
          >
            <span>{totalOpportunities}</span>
            <span className="text-[10.5px] opacity-80">{t("total")}</span>
          </span>
        )}

        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 ${
            isDark
              ? (hovered ? "bg-white/10 text-white" : "bg-white/5 text-slate-400")
              : (hovered ? "bg-slate-200 text-slate-800" : "bg-slate-100 text-slate-500")
          }`}
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isCollapsed ? "-rotate-90" : "rotate-0"
            }`}
          />
        </div>
      </div>
    </div>
  );
}

function Recommendation() {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const TABS = useMemo(() => [
    {
      key: "recommendations",
      label: t("Recommendations"),
      icon: <Sparkles className="w-4 h-4" />,
    },
    {
      key: "configuration",
      label: t("Recommendation Configuration") || "Recommendation Configuration",
      icon: <Sliders className="w-4 h-4" />,
    },
    {
      key: "tag-management",
      label: t("Tag Management"),
      icon: <TagIcon className="w-4 h-4" />,
    },
  ], [t]);

  const [activeTab, setActiveTab] = useState(0);

  // Sync tab with URL query parameter
  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get("tab");
    if (tabParam) {
      const normalize = (s) => String(s).toLowerCase().replace(/[\s-_]+/g, "");
      const normalizedParam = normalize(tabParam);
      const matchedIdx = TABS.findIndex(
        (tab) =>
          normalize(tab.key) === normalizedParam ||
          normalize(tab.label) === normalizedParam
      );
      if (matchedIdx !== -1) {
        setActiveTab(matchedIdx);
      }
    }
  }, [location.search, TABS]);

  const handleTabChange = (index, tabKey) => {
    setActiveTab(index);
    navigate(`/recommandation?tab=${tabKey}`, { replace: true });
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const selectedCampaign = useContext(ProfileContext);
  // Under "All" the rule counts are summed across SP+SB+SD.
  const showAllTypes = isShowingAllAdTypes(
    typeof window !== "undefined" ? window.location.pathname : "",
    selectedCampaign?.selectedAdType
  );
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [itemLoadingId, setItemLoadingId] = useState(null);
  // Local performance override. An unset range preserves each rule's configured dates.
  const [recommendationDateRange, setRecommendationDateRange] = useState(null);
  const datePayload = useMemo(() => recommendationDateRangePayload(recommendationDateRange), [recommendationDateRange]);
  const listRequestRef = useRef(0);
  const initialDetailRequestRef = useRef(0);
  const requestScope = JSON.stringify([selectedCampaign?.profileSendID, selectedCampaign?.selectedAdType, datePayload]);
  const requestScopeRef = useRef(requestScope);
  requestScopeRef.current = requestScope;
  const handleRecommendationDateChange = useCallback((range) => {
    const nextRange = normalizeRecommendationDateRange(range);
    if (range !== null && !nextRange) return;
    if (JSON.stringify(recommendationDateRangePayload(nextRange)) === JSON.stringify(datePayload)) return;
    listRequestRef.current += 1;
    initialDetailRequestRef.current += 1;
    setItemLoadingId(null);
    setModalLoading(false);
    setRecommendations([]);
    setRecommendationDateRange(nextRange);
  }, [datePayload]);

  useEffect(() => () => {
    listRequestRef.current += 1;
    initialDetailRequestRef.current += 1;
    dispatch(handleLoader(false));
  }, [dispatch]);

  const [addModalFlag, setaddModalFlag] = useState(false);
  const [editId, setEditId] = useState();
  const [editData, setEditData] = useState();

  // Filter states for Recommendations tab
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedFilterOption, setSelectedFilterOption] = useState(null);
  const [appliedGridNames, setAppliedGridNames] = useState([]);
  const [appliedActions, setAppliedActions] = useState([]);
  const [tempGridNames, setTempGridNames] = useState([]);
  const [tempActions, setTempActions] = useState([]);
  // Tag filter (tags are assigned in the Recommendation Configuration tab; read-only here)
  const [tagOptions, setTagOptions] = useState([]);
  const [appliedTagIds, setAppliedTagIds] = useState([]);
  const [tempTagIds, setTempTagIds] = useState([]);

  const appliedFilters = useMemo(
    () => buildRecommendationAppliedFilters(appliedGridNames, appliedActions, t, appliedTagIds, tagOptions),
    [appliedGridNames, appliedActions, appliedTagIds, tagOptions, t]
  );

  const handleFilterOptionClick = (option) => {
    setTempGridNames([...appliedGridNames]);
    setTempActions([...appliedActions]);
    setTempTagIds([...appliedTagIds]);
    setSelectedFilterOption(option);
    setShowFilterModal(true);
  };

  const handleApplyFilter = () => {
    if (selectedFilterOption?.value === "AffectedParameter") {
      setAppliedGridNames([...tempGridNames]);
    } else if (selectedFilterOption?.value === "Action") {
      setAppliedActions([...tempActions]);
    } else if (selectedFilterOption?.value === "Tags") {
      setAppliedTagIds([...tempTagIds]);
    }
    setShowFilterModal(false);
  };

  const handleRemoveFilter = (filterId) => {
    if (filterId === "AffectedParameter") {
      setAppliedGridNames([]);
    } else if (filterId === "Action") {
      setAppliedActions([]);
    } else if (filterId === "Tags") {
      setAppliedTagIds([]);
    }
  };

  const handleClearAllFilters = () => {
    setAppliedGridNames([]);
    setAppliedActions([]);
    setAppliedTagIds([]);
    handleRecommendationDateChange(null);
  };

  const handleEditFilter = (filter) => {
    const opt = RECOMMENDATION_FILTER_OPTIONS.find((o) => o.value === filter.type);
    if (opt) handleFilterOptionClick(opt);
  };

  // Fetch all recommendations
  const fetchRecommendations = useCallback(async () => {
    if (!selectedCampaign?.profileSendID) {
      setLoading(false);
      dispatch(handleLoader(false));
      return;
    }
    const request = ++listRequestRef.current;
    const isCurrentRequest = () => request === listRequestRef.current && requestScopeRef.current === requestScope;
    setLoading(true);
    dispatch(handleLoader(true));
    try {
      const res = await ApiGetRecommendation({
        profileId: selectedCampaign.profileSendID,
        ...datePayload,
      });
      if (!isCurrentRequest()) return;
      if (res?.isSuccess) {
        setRecommendations(res.data || []);
        ApiGetRecommendationTags({ profileId: selectedCampaign.profileSendID }).then((tagRes) => {
          if (isCurrentRequest() && tagRes?.isSuccess) {
            const tags = tagRes.data || [];
            setTagOptions(tags);
            // Drop selected tags that no longer exist
            setAppliedTagIds((prev) => prev.filter((id) => tags.some((tg) => String(tg._id) === id)));
          }
        });
      } else {
        Toast.error(res?.message || "Failed to load recommendations");
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error("Error fetching recommendations:", error);
      Toast.error(t("Failed to load recommendations"));
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
        dispatch(handleLoader(false));
      }
    }
  }, [selectedCampaign?.profileSendID, selectedCampaign?.selectedAdType, datePayload, requestScope, dispatch, t]);

  useEffect(() => {
    setRecommendations([]);
    setShowModal(false);
    setModalData(null);
    setDeleteTarget(null);
    setaddModalFlag(false);
    setItemLoadingId(null);
    setModalLoading(false);
  }, [selectedCampaign?.profileSendID, selectedCampaign?.selectedAdType]);

  useEffect(() => {
    if (activeTab === 0) {
      fetchRecommendations();
    }
  }, [fetchRecommendations, activeTab]);



  // Fetch detailed data for a recommendation
  const fetchRecommendationData = async (recommendation) => {
    if (!recommendation?._id || itemLoadingId) return;
    const request = ++initialDetailRequestRef.current;
    const isCurrentRequest = () => request === initialDetailRequestRef.current && requestScopeRef.current === requestScope;
    setItemLoadingId(recommendation._id);
    setModalLoading(true);
    try {
      const res = await ApiGetRecommendationData(recommendation._id, {
        profileId: selectedCampaign?.profileSendID,
        page: 1,
        perPage: 25,
        ...datePayload,
      });
      if (!isCurrentRequest()) return;
      if (res?.isSuccess) {
        setModalData({
          ...res,
          rule: res.rule,
          data: res.data,
          count: res.totalRecords ?? res.count,
          totalRecords: res.totalRecords ?? res.count,
          currentPage: res.currentPage || 1,
          perPage: res.perPage || 25,
          totalPages: res.totalPages || 1,
          newCount: res?.newCount ?? recommendation?.newCount ?? 0,
          dateRangeOverride: recommendationDateRange,
        });
        setShowModal(true);
      } else {
        Toast.error(res?.message || "Failed to load recommendation data");
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error("Error fetching recommendation data:", error);
      Toast.error(t("Failed to load recommendation data"));
    } finally {
      if (isCurrentRequest()) {
        setModalLoading(false);
        setItemLoadingId(null);
      }
    }
  };

  const handleItemClick = (recommendation) => {
    fetchRecommendationData(recommendation);
  };

  const handleDeleteClick = (recommendation) => {
    setDeleteTarget(recommendation);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget?._id || deleteLoading) return;
    setDeleteLoading(true);
    try {
      const res = await ApiDeleteRecommendation(deleteTarget?._id, { profileId: selectedCampaign?.profileSendID });

      if (res?.isSuccess) {
        Toast.success(res?.message || "Recommendation deleted successfully");
        setRecommendations(prev => prev.filter(r => r._id !== deleteTarget._id));
        setDeleteTarget(null);
        selectedCampaign?.setRefreshSideBar?.((selectedCampaign?.refreshSideBar ?? 0) + 1);
      } else {
        Toast.error(res?.message || "Failed to delete recommendation");
      }
    } catch (error) {
      console.error("Error deleting recommendation:", error);
      Toast.error(t("Failed to delete recommendation"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const isFirstLoad = loading && recommendations.length === 0;

  // Sort and filter recommendations by createdAt (newest first), Affected Parameter, and Action
  const sortedRecommendations = useMemo(() => {
    const filtered = recommendations.filter((rec) => {
      if (appliedGridNames.length > 0 && !appliedGridNames.includes(rec.gridName)) {
        return false;
      }
      if (appliedActions.length > 0) {
        const validActs = Array.isArray(rec.actions)
          ? rec.actions.filter((a) => a && a.actionName && String(a.actionName).toLowerCase() !== "none")
          : [];
        const matchesNone = appliedActions.includes("None") && validActs.length === 0;
        const matchesAction = validActs.some((a) => appliedActions.includes(a.actionName));
        if (!matchesNone && !matchesAction) return false;
      }
      if (appliedTagIds.length > 0) {
        const recTagIds = (rec.tags || []).map((tg) => String(tg._id));
        if (!recTagIds.some((id) => appliedTagIds.includes(id))) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [recommendations, appliedGridNames, appliedActions, appliedTagIds]);

  // With a tag filter, show the list grouped by tag (a recommendation with two selected tags is
  // listed under both).
  const tagGroups = useMemo(() => {
    if (!appliedTagIds.length) return null;
    return appliedTagIds
      .map((id) => ({
        tag: tagOptions.find((tg) => String(tg._id) === id) || { _id: id, name: id },
        items: sortedRecommendations.filter((rec) => (rec.tags || []).some((tg) => String(tg._id) === id)),
      }))
      .filter((g) => g.items.length > 0);
  }, [appliedTagIds, tagOptions, sortedRecommendations]);

  const [collapsedGroups, setCollapsedGroups] = useState({});

  useEffect(() => {
    setCollapsedGroups({});
  }, [appliedTagIds]);

  const toggleGroupCollapse = useCallback((tagId) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [tagId]: !prev[tagId],
    }));
  }, []);

  const allGroupsCollapsed = useMemo(() => {
    if (!tagGroups || tagGroups.length === 0) return false;
    return tagGroups.every((g) => !!collapsedGroups[g.tag?._id]);
  }, [tagGroups, collapsedGroups]);

  const toggleAllGroups = useCallback(() => {
    if (!tagGroups || tagGroups.length === 0) return;
    const shouldCollapse = !allGroupsCollapsed;
    const next = {};
    tagGroups.forEach((g) => {
      if (g.tag?._id) next[g.tag._id] = shouldCollapse;
    });
    setCollapsedGroups(next);
  }, [tagGroups, allGroupsCollapsed]);

  return (
    <div className="placement-tracking-container" id="recommandation-page">
      <Filter name="Recommendations" profileShow={true} dateShow={false} nameShow={false} />

      <div className="middle_container">
        {/* ── Top Tabs Navigation Bar ── */}
        <div
          className="flex items-center gap-2 mb-4 p-1.5 rounded-2xl border"
          style={{
            background: isDark ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.8)",
            borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(2, 70, 139, 0.08)",
            backdropFilter: "blur(12px)",
          }}
        >
          {TABS.map((tab, idx) => {
            const isActive = activeTab === idx;
            return (
              <button
                key={tab.key}
                id={`tab-${tab.key}`}
                type="button"
                onClick={() => handleTabChange(idx, tab.key)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs md:text-sm transition-all duration-200 cursor-pointer ${isActive
                    ? "bg-gradient-to-r from-[#1A9FD4] to-[#2374F2] text-white shadow-md shadow-blue-500/20"
                    : isDark
                      ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                  }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Tab 0: Recommendations Content ── */}
        {activeTab === 0 && (
          <div className="data_content data_content_btn m-0" style={{ padding: 0, border: "none", boxShadow: "none" }}>
            <div className="glass-grid-container overflow-hidden" style={{ padding: isMobile ? "16px 20px" : "24px 32px" }}>
              {showAllTypes && (
                <div style={{ marginBottom: 16 }}>
                  <AdTypeScopeNote selectedAdType={selectedCampaign?.selectedAdType} />
                </div>
              )}
              {/* Header */}
              <div className="flex justify-between items-center flex-wrap" style={{ marginBottom: 16, gap: 12 }}>
                <div>
                  <h2 id="recommandation-header" style={{
                    margin: 0,
                    fontSize: isMobile ? 20 : 22,
                    fontWeight: 800,
                    color: "var(--text-heading, var(--text-primary))",
                    letterSpacing: "-0.5px"
                  }}>
                    {t("Recommendations")}
                  </h2>
                  <p style={{
                    margin: "4px 0 0",
                    fontSize: 13,
                    color: "var(--text-secondary)"
                  }}>
                    {t("Actionable insights based on your campaign performance")}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <RecommendationFilterDropdown
                    appliedFilters={appliedFilters}
                    onSelectOption={handleFilterOptionClick}
                    id="recommendation-filter-by-btn"
                  />
                  <DateRangePicker
                    id="recommendation-date-range"
                    ariaLabel={t("Recommendation date range")}
                    className="w-full sm:w-[260px]"
                    style={{ minWidth: 210, height: 36 }}
                    ranges={predefinedRanges}
                    value={recommendationDateRange}
                    placeholder={t("Rule date ranges")}
                    onChange={handleRecommendationDateChange}
                    persistGlobalDate={false}
                  />
                  {recommendationDateRange && (
                    <button type="button" className="customize-button m-0" style={{ height: 36 }}
                      onClick={() => handleRecommendationDateChange(null)}
                      title={t("Use rule date ranges")} aria-label={t("Use rule date ranges")}>
                      {t("Reset dates")}
                    </button>
                  )}
                  <button
                    id="recommendation-page-refresh-btn"
                    className="customize-button m-0 gap-1.5 flex items-center"
                    style={{ height: "36px", whiteSpace: "nowrap" }}
                    onClick={() => fetchRecommendations()}
                    disabled={loading}
                    title={t("Refresh recommendations")}
                  >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    <span>{t("Refresh")}</span>
                  </button>
                  {PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.CREATE) && (
                    <button
                      className="customize-button m-0 gap-0"
                      style={{ height: "36px", whiteSpace: "nowrap" }}
                      onClick={() => {
                        setaddModalFlag(true);
                      }}
                    >
                      {isMobile ? t("Add") : t("Add Recommendation")}
                    </button>
                  )}
                </div>
              </div>

              {/* Applied Filter Chips */}
              <RecommendationAppliedFilters
                appliedFilters={appliedFilters}
                onRemove={handleRemoveFilter}
                onClearAll={handleClearAllFilters}
                onEdit={handleEditFilter}
                id="recommendations-applied-filters"
              />

              {/* Informational Note */}
              <div
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-sky-500/20 bg-sky-500/5 text-slate-700 dark:text-slate-200 text-xs shadow-sm"
                style={{ marginBottom: 20 }}
              >
                <FiInfo className="text-sky-500 flex-shrink-0" size={16} />
                <span>
                  <strong className="font-semibold text-slate-800 dark:text-slate-100">{t("Note")}:</strong>{" "}
                  {t("Recommendations are not refreshed automatically when closing the review modal. Please use the Refresh button above to update recommendations manually.")}
                </span>
              </div>

              {/* Loading State */}
              {loading ? (
                <div>
                  {[0, 1, 2, 3, 4].map(i => <SkeletonItem key={i} isDark={isDark} />)}
                </div>
              ) : sortedRecommendations.length === 0 ? (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: "80px 24px",
                  borderRadius: "16px",
                  background: "rgba(26, 130, 244, 0.02)",
                  border: "1px dashed rgba(26, 130, 244, 0.12)",
                  margin: "24px 0",
                }}>
                  <div style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "50%",
                    background: "var(--accent-primary-bg)",
                    border: "1px solid var(--accent-primary-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--accent-primary)",
                    fontSize: "28px",
                    marginBottom: "20px",
                    boxShadow: "0 8px 24px var(--accent-glow)",
                  }}>
                    <i className="fa-solid fa-wand-magic-sparkles"></i>
                  </div>
                  <h3 style={{
                    fontSize: "17px",
                    fontWeight: "700",
                    color: "var(--text-heading, var(--text-primary))",
                    margin: "0 0 8px 0",
                  }}>
                    {appliedFilters.length > 0 ? t("No matching recommendations") : t("No recommendations yet")}
                  </h3>
                  <p style={{
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    maxWidth: "380px",
                    margin: appliedFilters.length > 0 ? "0 0 16px 0" : 0,
                    lineHeight: "1.5",
                    opacity: 0.85
                  }}>
                    {appliedFilters.length > 0
                      ? t("Try adjusting or clearing your filters to see more recommendations.")
                      : t("We are continuously analyzing your campaigns. Performance optimization suggestions will appear here as soon as they are identified.")}
                  </p>
                  {appliedFilters.length > 0 && (
                    <button
                      type="button"
                      className="customize-button m-0"
                      style={{ height: "34px", fontSize: "13px" }}
                      onClick={handleClearAllFilters}
                    >
                      {t("Clear Filters")}
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  {tagGroups && tagGroups.length > 1 && (
                    <div className="flex items-center justify-between mb-3.5 px-1 text-[12.5px]">
                      <span className="font-medium text-slate-500 dark:text-slate-400">
                        {t("Grouped by tag ({{count}})", { count: tagGroups.length })}
                      </span>
                      <button
                        type="button"
                        onClick={toggleAllGroups}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        {allGroupsCollapsed ? t("Expand All") : t("Collapse All")}
                      </button>
                    </div>
                  )}
                  {(tagGroups || [{ tag: null, items: sortedRecommendations }]).map((group) => {
                    if (!group.tag) {
                      return (
                        <div key="all">
                          {group.items.map((recommendation, index) => (
                            <RecommendationItem
                              id={`recommendation-item-${index}`}
                              key={`all-${recommendation._id}`}
                              recommendation={recommendation}
                              onClick={handleItemClick}
                              onEdit={handleItemClick}
                              onDelete={handleDeleteClick}
                              isDark={isDark}
                              isMobile={isMobile}
                              isLoading={itemLoadingId === recommendation._id}
                              isAnyLoading={!!itemLoadingId}
                              isInsideGroup={false}
                            />
                          ))}
                        </div>
                      );
                    }

                    const isCollapsed = !!collapsedGroups[group.tag._id];

                    return (
                      <div
                        key={group.tag._id}
                        className="tag-group-box rounded-2xl border mb-5 overflow-hidden transition-all duration-200"
                        id={`recommendation-tag-group-${group.tag._id}`}
                        style={{
                          background: isDark ? "rgba(11, 18, 33, 0.75)" : "rgba(248, 250, 252, 0.95)",
                          borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(226, 232, 240, 0.9)",
                          boxShadow: isDark
                            ? "0 4px 20px -2px rgba(0, 0, 0, 0.35)"
                            : "0 2px 8px -2px rgba(0, 0, 0, 0.05)",
                          backdropFilter: "blur(12px)",
                        }}
                      >
                        <TagGroupHeader
                          group={group}
                          isDark={isDark}
                          isMobile={isMobile}
                          isCollapsed={isCollapsed}
                          onToggle={() => toggleGroupCollapse(group.tag._id)}
                        />
                        {!isCollapsed && (
                          <div className="p-3 sm:p-3.5 space-y-2.5">
                            {group.items.map((recommendation, index) => (
                              <RecommendationItem
                                id={`recommendation-item-${group.tag._id}-${index}`}
                                key={`${group.tag._id}-${recommendation._id}`}
                                recommendation={recommendation}
                                onClick={handleItemClick}
                                onEdit={handleItemClick}
                                onDelete={handleDeleteClick}
                                isDark={isDark}
                                isMobile={isMobile}
                                isLoading={itemLoadingId === recommendation._id}
                                isAnyLoading={!!itemLoadingId}
                                isInsideGroup={true}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 1: Recommendation Configuration Content ── */}
        {activeTab === 1 && (
          <div className="recommendation-configuration-tab-content">
            <RecommendationRules hideFilter={true} />
          </div>
        )}

        {/* ── Tab 2: Tag Management (organization-wide tags) ── */}
        {activeTab === 2 && <TagManagement />}
      </div>

      {/* Recommendation Modal */}
      {showModal && (
        <RecommendationModal
          show={showModal}
          onHide={() => {
            setShowModal(false);
            setModalData(null);
          }}
          snapshot={modalData}
          profileId={selectedCampaign?.profileSendID}
          adType={selectedCampaign?.selectedAdType}
          loading={modalLoading}
          refreshGrid={fetchRecommendations}
          onDateRangeChange={handleRecommendationDateChange}
        />
      )}

      {/* Delete Confirmation Modal */}
      <CustomModal
        show={!!deleteTarget}
        onHide={() => !deleteLoading && setDeleteTarget(null)}
        title={t("Delete Recommendation")}
        subtitle={t("This recommendation will be permanently removed")}
        icon="delete"
        iconVariant="danger"
        message={`You are about to permanently delete the recommendation <span class="cm-highlight">${deleteTarget?.ruleName || "Untitled"}</span>.`}
        alertText="This action cannot be undone. The recommendation and all its data will be permanently deleted."
        alertVariant="danger"
        closeOnBackdrop={false}
        actions={[
          { label: "Cancel", cancel: true, icon: "close", onClick: () => setDeleteTarget(null), disabled: deleteLoading },
          { label: "Delete", variant: "danger", icon: "delete", onClick: handleDeleteConfirm, loading: deleteLoading, disabled: deleteLoading },
        ]}
      />

      {/* Add Recommendation Modal */}
      <Dialog open={addModalFlag} onOpenChange={(open) => !open && setaddModalFlag(false)}>
        <DialogContent
          className="max-w-[1100px] w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col font-sans max-h-[90vh] gap-0"
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Glow Line Indicator */}
          <div
            className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
            style={{
              background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
              opacity: 0.8
            }}
          />

          {/* Header */}
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-white/10 shrink-0">
            <DialogTitle className="text-xl font-bold text-slate-800 dark:text-white flex justify-between items-center w-full">
              {t('Recommendation')}
            </DialogTitle>
          </div>

          {/* Body */}
          <div className="max-h-[80vh] overflow-y-auto flex-1 !p-0 modal-body">
            <AddRule
              setaddModalFlag={setaddModalFlag}
              getRule={() => {
                fetchRecommendations();
                handleTabChange(1, "configuration");
              }}
              setEditId={setEditId}
              editId={editId}
              editData={editData}
              setEditData={setEditData}
              allRulesSchedule={[]}
              showTags={true}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Filter Modal */}
      <RecommendationFilterModal
        showFilterModal={showFilterModal}
        handleModalClose={() => setShowFilterModal(false)}
        selectedFilterOption={selectedFilterOption}
        selectedGridNames={tempGridNames}
        setSelectedGridNames={setTempGridNames}
        selectedActions={tempActions}
        setSelectedActions={setTempActions}
        tagOptions={tagOptions}
        selectedTagIds={tempTagIds}
        setSelectedTagIds={setTempTagIds}
        onApply={handleApplyFilter}
        isDark={isDark}
      />
    </div>
  );
}

export default Recommendation;
