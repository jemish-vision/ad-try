import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  RotateCcw,
  Zap,
  Shield,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { ApiGetRecommendation, ApiGetRecommendationData } from "../../../../api-wrapper/recommendation/ApiRecommendation";

const RecommendationModal = React.lazy(() => import("../../recommandation/RecommendationModal"));

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
  AddAsNegativeTargeting: "Add as Negative",
};

function formatActionSubtitle(actions, gridName) {
  if (!actions || actions.length === 0) return gridName || "Campaign Optimization";
  const actionTexts = actions.map((a) => {
    const label = ACTION_LABEL_MAP[a.actionName] || a.actionName;
    let text = label;
    if (a.actionValue) {
      const sym = a.actionValueType === "Percentage" ? "%" : "";
      text = `${label} ${a.actionValue}${sym}`;
    }
    if (a.matchType) {
      text = `${text} (${a.matchType})`;
    }
    return text;
  });
  return `${actionTexts.join(", ")}${gridName ? ` · ${gridName}` : ""}`;
}

function getBadgeConfig(actions = []) {
  const acts = actions.map((a) => (a.actionName || "").toLowerCase());
  const hasNegative = acts.some((a) => a.includes("negative") || a.includes("decrease") || a.includes("pause"));
  const hasIncrease = acts.some((a) => a.includes("increase") || a.includes("enable") || a.includes("addastargeting"));
  const hasBudget = acts.some((a) => a.includes("budget"));

  if (hasNegative) {
    return {
      type: "recover",
      label: "Recover",
      icon: RotateCcw,
      badgeClass: "border-amber-200 dark:border-amber-800/60 bg-[#fffbeb] dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
      iconClass: "text-amber-600 dark:text-amber-400",
    };
  }
  if (hasIncrease) {
    return {
      type: "scale",
      label: "Scale",
      icon: Zap,
      badgeClass: "border-sky-200 dark:border-sky-800/60 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300",
      iconClass: "text-sky-600 dark:text-sky-400",
    };
  }
  if (hasBudget) {
    return {
      type: "budget",
      label: "Budget",
      icon: Shield,
      badgeClass: "border-purple-200 dark:border-purple-800/60 bg-[#faf5ff] dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
      iconClass: "text-purple-600 dark:text-purple-400",
    };
  }
  return {
    type: "recover",
    label: "Recover",
    icon: RotateCcw,
    badgeClass: "border-amber-200 dark:border-amber-800/60 bg-[#fffbeb] dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
    iconClass: "text-amber-600 dark:text-amber-400",
  };
}

export default function DashboardRecommendations({ profileId, adType = "SP" }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [recPage, setRecPage] = useState(1);
  const [hasMoreRecs, setHasMoreRecs] = useState(true);
  const [loadingMoreRecs, setLoadingMoreRecs] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [activeItemLoadingId, setActiveItemLoadingId] = useState(null);

  const getProfileIdString = (p) => {
    if (!p) return null;
    if (typeof p === "string") return p;
    if (typeof p === "object") {
      return p.value || p.profileId || p._id || p.id || null;
    }
    return String(p);
  };

  const getStoredProfileId = () => {
    try {
      const p = JSON.parse(localStorage.getItem("profile"));
      return p?.profile?.profileId || p?.profileId || p?.id || null;
    } catch (e) {
      return null;
    }
  };

  const [currentPid, setCurrentPid] = useState(() => getProfileIdString(profileId) || getStoredProfileId());

  useEffect(() => {
    const normalized = getProfileIdString(profileId);
    if (normalized && normalized !== currentPid) {
      setCurrentPid(normalized);
    }
  }, [profileId]);

  useEffect(() => {
    const handleProfileChange = (e) => {
      const newPid = e?.detail?.profile?.profileId;
      if (newPid && newPid !== currentPid) {
        setCurrentPid(newPid);
      }
    };
    window.addEventListener("profileChanged", handleProfileChange);
    return () => window.removeEventListener("profileChanged", handleProfileChange);
  }, [currentPid]);

  const effectiveProfileId = currentPid || getProfileIdString(profileId) || getStoredProfileId();

  const fetchRecommendations = useCallback(async () => {
    const pid = effectiveProfileId;
    if (!pid) return;
    setLoading(true);
    setRecPage(1);
    try {
      const res = await ApiGetRecommendation({ profileId: pid, adType: adType || "SP", page: 1, limit: 10 });
      if (res?.isSuccess && Array.isArray(res?.data)) {
        setRecommendations(res.data);
        setHasMoreRecs(res?.pagination?.hasMore ?? (res.data.length >= 10));
      } else {
        setRecommendations([]);
        setHasMoreRecs(false);
      }
    } catch (err) {
      console.error("DashboardRecommendations fetch error:", err);
      setRecommendations([]);
      setHasMoreRecs(false);
    } finally {
      setLoading(false);
    }
  }, [effectiveProfileId, adType]);

  const loadMoreRecommendations = async () => {
    if (loadingMoreRecs || !hasMoreRecs) return;
    const nextPage = recPage + 1;
    setLoadingMoreRecs(true);
    try {
      const pid = effectiveProfileId;
      const res = await ApiGetRecommendation({ profileId: pid, adType: adType || "SP", page: nextPage, limit: 10 });
      const newItems = res?.data || [];
      if (newItems.length > 0) {
        setRecommendations((prev) => [...prev, ...newItems]);
        setRecPage(nextPage);
      }
      setHasMoreRecs(res?.pagination?.hasMore ?? (newItems.length >= 10));
    } catch (err) {
      console.error("loadMoreRecommendations error:", err);
    } finally {
      setLoadingMoreRecs(false);
    }
  };

  const handleRecScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 40 && hasMoreRecs && !loadingMoreRecs) {
      loadMoreRecommendations();
    }
  };

  useEffect(() => {
    setRecommendations([]);
    setLoading(true);
    fetchRecommendations();
  }, [effectiveProfileId, adType]);

  const totalCount = useMemo(() => {
    return recommendations.reduce((acc, r) => acc + (r.count || 0), 0);
  }, [recommendations]);

  const totalNewCount = useMemo(() => {
    return recommendations.reduce((acc, r) => acc + (r.newCount || 0), 0);
  }, [recommendations]);

  const handleRowClick = async (item) => {
    const pid = effectiveProfileId;
    if (!pid || !item._id) return;
    setActiveItemLoadingId(item._id);
    setModalLoading(true);
    try {
      const res = await ApiGetRecommendationData(item._id, {
        profileId: pid,
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
        setShowModal(true);
      }
    } catch (err) {
      console.error("Error fetching recommendation detail:", err);
    } finally {
      setModalLoading(false);
      setActiveItemLoadingId(null);
    }
  };

  return (
    <div className="w-full h-[380px]">
      <div className="dg-root rounded-2xl overflow-hidden flex flex-col h-[380px] min-h-[380px] max-h-[380px] transition-all">
        {/* ── Top Header Row ────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-white/5 flex-wrap gap-2 shrink-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">
              {t("Recommendations")}
            </h3>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate("/recommandation")}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-500 hover:text-[#2374F2] dark:text-slate-400 dark:hover:text-sky-400 transition-colors"
            >
              <span>{t("View all")}</span>
              <ExternalLink className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={fetchRecommendations}
              disabled={loading}
              title={t("Refresh Recommendations")}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#2374F2]" : ""}`} />
            </button>
          </div>
        </div>

        {/* ── Rows List ─────────────────────────────────────────────── */}
        <div onScroll={handleRecScroll} className="flex-1 min-h-0 overflow-y-auto dash-custom-scrollbar divide-y divide-slate-100 dark:divide-white/5 border-b border-slate-100 dark:border-white/5 pb-1">
          {loading ? (
            <div className="py-5 px-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between animate-pulse">
                  <div className="w-16 h-5 bg-slate-200 dark:bg-white/10 rounded-full" />
                  <div className="flex-1 px-3 space-y-1">
                    <div className="w-2/3 h-3 bg-slate-200 dark:bg-white/10 rounded" />
                    <div className="w-1/3 h-2 bg-slate-100 dark:bg-white/5 rounded" />
                  </div>
                  <div className="w-16 h-3.5 bg-slate-200 dark:bg-white/10 rounded" />
                </div>
              ))}
            </div>
          ) : recommendations.length === 0 ? (
            <div className="py-10 text-center flex flex-col items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-500 mb-2" />
              <p className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">
                {t("No pending recommendations")}
              </p>
              <p className="text-[13px] text-slate-400 dark:text-slate-500 mt-0.5">
                {t("All your campaign rules are optimized and running smoothly.")}
              </p>
            </div>
          ) : (
            recommendations.map((item) => {
              const badge = getBadgeConfig(item.actions);
              const BadgeIcon = badge.icon;
              const subtitle = formatActionSubtitle(item.actions, item.gridName);

              return (
                <div
                  key={item._id}
                  onClick={() => handleRowClick(item)}
                  className="group flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/80 dark:hover:bg-white/[0.02] cursor-pointer transition-colors duration-150"
                >
                  {/* Left: Action Badge Pill matching reference */}
                  <div className="w-22 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[13px] font-medium border shadow-2xs ${badge.badgeClass}`}
                    >
                      <BadgeIcon className={`w-3.5 h-3.5 ${badge.iconClass}`} />
                      <span>{t(badge.label)}</span>
                    </span>
                  </div>

                  {/* Middle: Title & Subtitle */}
                  <div className="flex-1 min-w-0 px-3">
                    <div className="text-[14.5px] font-semibold text-slate-800 dark:text-slate-100 group-hover:text-[#2374F2] transition-colors truncate">
                      {item.ruleName}
                    </div>
                    <div className="text-[13px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                      {subtitle}
                    </div>
                  </div>

                  {/* Right: Items Count & New Badge & Chevron */}
                  <div className="shrink-0 flex items-center gap-2.5">
                    <div className="text-right">
                      <div className="text-[14.5px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
                        {(item.count || 0).toLocaleString()} {t("items")}
                      </div>
                      {item.newCount > 0 ? (
                        <div className="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
                          +{item.newCount} {t("new")}
                        </div>
                      ) : null}
                    </div>
                    {activeItemLoadingId === item._id ? (
                      <RefreshCw className="w-3.5 h-3.5 text-[#2374F2] animate-spin shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all shrink-0" />
                    )}
                  </div>
                </div>
              );
            })
          )}
          {loadingMoreRecs && (
            <div className="flex items-center justify-center py-2 text-xs text-slate-400 gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#2374F2]" />
              <span>{t("Loading more rules...")}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Rule Recommendation Modal ── */}
      {showModal && (
        <React.Suspense fallback={null}>
          <RecommendationModal
            show={showModal}
            onHide={() => {
              setShowModal(false);
              setModalData(null);
            }}
            snapshot={modalData}
            profileId={effectiveProfileId}
            adType={adType}
            loading={modalLoading}
            refreshGrid={fetchRecommendations}
          />
        </React.Suspense>
      )}
    </div>
  );
}
