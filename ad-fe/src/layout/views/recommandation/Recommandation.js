import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { useEffect, useState, useContext, useCallback, useMemo } from "react";
import Filter from "../../../helper/filter/Filter";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { useTranslation } from "react-i18next";
import {
  ApiGetRecommendation,
  ApiGetRecommendationData,
  ApiDeleteRecommendation,
} from "../../../api-wrapper/recommendation/ApiRecommendation";
import { Toast, useDispatch, handleLoader } from "../../../helper/links/Link";
import RecommendationModal from "./RecommendationModal";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import AddRule from "../recommendationRule/AddRule";
import RecommendationRules from "../recommendationRule/RecommendationRules";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles, Sliders } from "lucide-react";

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
};

const PLACEMENT_LABEL_MAP = {
  "Top of Search": "Top Search",
  "Rest of Search": "Rest Search",
  "Product Page": "Product Page",
  "Product pages": "Product Page",
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
  if (!actions || actions.length === 0) return [];

  return actions.map((action, idx) => {
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

function RecommendationItem({ id, recommendation, onClick, onEdit, onDelete, isDark, isMobile, isLoading, isAnyLoading }) {
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
        marginBottom: "12px",
        borderRadius: "12px",
        border: isLoading
          ? (isDark ? "1px solid #38bdf8" : "1px solid #0284c7")
          : (isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0"),
        cursor: isLoading ? "wait" : (isAnyLoading ? "not-allowed" : "pointer"),
        transition: "all 0.2s ease-in-out",
        backgroundColor: isDark
          ? (isLoading ? "rgba(14, 165, 233, 0.08)" : (hovered ? "#1e293b" : "#0f172a"))
          : (isLoading ? "rgba(14, 165, 233, 0.04)" : (hovered ? "#f8fafc" : "#ffffff")),
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
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [itemLoadingId, setItemLoadingId] = useState(null);

  const [addModalFlag, setaddModalFlag] = useState(false);
  const [editId, setEditId] = useState();
  const [editData, setEditData] = useState();

  // Fetch all recommendations
  const fetchRecommendations = useCallback(async () => {
    if (!selectedCampaign?.profileSendID) return;
    setLoading(true);
    dispatch(handleLoader(true));
    try {
      const res = await ApiGetRecommendation({
        profileId: selectedCampaign.profileSendID,
      });
      if (res?.isSuccess) {
        setRecommendations(res.data || []);
      } else {
        Toast.error(res?.message || "Failed to load recommendations");
      }
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      Toast.error(t("Failed to load recommendations"));
    } finally {
      setLoading(false);
      dispatch(handleLoader(false));
    }
  }, [selectedCampaign?.profileSendID, selectedCampaign?.selectedAdType, dispatch, t]);

  useEffect(() => {
    setRecommendations([]);
    setShowModal(false);
    setModalData(null);
    setDeleteTarget(null);
    setaddModalFlag(false);
  }, [selectedCampaign?.profileSendID, selectedCampaign?.selectedAdType]);

  useEffect(() => {
    if (activeTab === 0) {
      fetchRecommendations();
    }
  }, [fetchRecommendations, activeTab]);

  // Track whether a recommendation was actually viewed (modal was opened for a real item)
  const [viewedRuleId, setViewedRuleId] = useState(null);

  useEffect(() => {
    // When modal CLOSES after a genuine view → refresh list + sidebar so cleared newCount is reflected
    if (!showModal && viewedRuleId) {
      fetchRecommendations();
      selectedCampaign?.setRefreshSideBar((selectedCampaign?.refreshSideBar ?? 0) + 1);
      setViewedRuleId(null);
    }
  }, [showModal]);

  // Fetch detailed data for a recommendation
  const fetchRecommendationData = async (recommendation) => {
    if (!recommendation?._id || itemLoadingId) return;
    setItemLoadingId(recommendation._id);
    setModalLoading(true);
    try {
      const res = await ApiGetRecommendationData(recommendation._id, {
        profileId: selectedCampaign?.profileSendID,
        page: 1,
        perPage: 25,
      });
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
        });
        setViewedRuleId(recommendation._id); // ← mark that a real view happened
        setShowModal(true);
      } else {
        Toast.error(res?.message || "Failed to load recommendation data");
      }
    } catch (error) {
      console.error("Error fetching recommendation data:", error);
      Toast.error(t("Failed to load recommendation data"));
    } finally {
      setModalLoading(false);
      setItemLoadingId(null);
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

  // Sort recommendations by createdAt (newest first)
  const sortedRecommendations = [...recommendations].sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );

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
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs md:text-sm transition-all duration-200 cursor-pointer ${
                  isActive
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
              {/* Header */}
              <div className="flex justify-between items-center flex-wrap" style={{ marginBottom: 24, gap: 12 }}>
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
                    {t("No recommendations yet")}
                  </h3>
                  <p style={{
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    maxWidth: "380px",
                    margin: 0,
                    lineHeight: "1.5",
                    opacity: 0.85
                  }}>
                    {t("We are continuously analyzing your campaigns. Performance optimization suggestions will appear here as soon as they are identified.")}
                  </p>
                </div>
              ) : (
                <div>
                  {sortedRecommendations.map((recommendation, index) => (
                    <RecommendationItem
                      id={`recommendation-item-${index}`}
                      key={recommendation._id}
                      recommendation={recommendation}
                      onClick={handleItemClick}
                      onEdit={handleItemClick}
                      onDelete={handleDeleteClick}
                      isDark={isDark}
                      isMobile={isMobile}
                      isLoading={itemLoadingId === recommendation._id}
                      isAnyLoading={!!itemLoadingId}
                    />
                  ))}
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
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Recommendation;