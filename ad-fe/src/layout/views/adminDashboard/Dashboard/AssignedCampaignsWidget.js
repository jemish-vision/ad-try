import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";
import {
  Boxes,
  User,
  RefreshCw,
} from "lucide-react";
import { ApiGetAssignedCampaignComparison } from "../../../../api-wrapper/dashboard/ApiDashboard";
import {
  formatRegionalCurrency,
  formatRegionalNumber,
} from "../../../../utility/regionalNumberFormat";

export default function AssignedCampaignsWidget({
  profileId,
  adType = "SP",
  date,
  currencyCode = "INR",
  marketplace = "IN",
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const effectiveProfileId = useMemo(() => {
    if (profileId) return profileId;
    try {
      const p = JSON.parse(localStorage.getItem("profile"));
      return p?.profile?.profileId || p?.profileId || p?.id;
    } catch (e) {
      return null;
    }
  }, [profileId]);

  const fetchData = useCallback(async () => {
    const pid = effectiveProfileId;
    if (!pid) return;

    let fromDate = moment().subtract(30, "days").format("YYYY-MM-DD");
    let toDate = moment().subtract(1, "days").format("YYYY-MM-DD");
    if (date && Array.isArray(date) && date.length >= 2) {
      fromDate = moment(date[0]).format("YYYY-MM-DD");
      toDate = moment(date[1]).format("YYYY-MM-DD");
    }

    setLoading(true);
    try {
      const res = await ApiGetAssignedCampaignComparison({
        profileId: pid,
        adType,
        fromDate,
        toDate,
      });

      if (res?.isSuccess && res?.data) {
        setData(res.data);
      } else {
        setData(null);
      }
    } catch (err) {
      console.error("AssignedCampaignsWidget error:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [effectiveProfileId, adType, date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const assigned = data?.assigned || {
    count: 0,
    spend: 0,
    sales: 0,
    orders: 0,
    clicks: 0,
    impressions: 0,
    acos: 0,
    roas: 0,
    cvr: 0,
    cpc: 0,
  };

  const unassigned = data?.unassigned || {
    count: 0,
    spend: 0,
    sales: 0,
    orders: 0,
    clicks: 0,
    impressions: 0,
    acos: 0,
    roas: 0,
    cvr: 0,
    cpc: 0,
  };

  const dateFromStr = data?.range?.fromDate || (Array.isArray(date) && date[0] ? moment(date[0]).format("YYYY-MM-DD") : "");
  const dateToStr = data?.range?.toDate || (Array.isArray(date) && date[1] ? moment(date[1]).format("YYYY-MM-DD") : "");

  return (
    <div className="dg-root rounded-2xl p-5 mb-5 transition-all">
      {/* ── Top Header Bar ──────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        {/* Left: Section Title & Subtitle */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Boxes className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-slate-900 dark:text-white tracking-tight">
              {t("Rule/Automation Assigned vs. Without Rule/Automation Assign Campaigns")}
            </h3>
            <p className="text-[11.5px] text-slate-400 dark:text-slate-400 font-normal mt-0.5">
              {t("Rule execution and performance attribution for selected date period")} ({dateFromStr} to {dateToStr})
            </p>
          </div>
        </div>
      </div>

      {/* ── Two Big Cards Grid ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Assigned (Automated) */}
        <div className="bg-slate-50/60 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.08] rounded-xl p-4 flex flex-col justify-between transition-all">
          {/* Card Header */}
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <Boxes className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-blue-600 dark:text-blue-400">
                  {t("Assigned (Automated)")}
                </span>
                <span className="text-[11.5px] text-slate-400 dark:text-slate-400 font-normal font-sans">
                  {assigned.count || 0} {t("Campaigns")}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              title={t("Refresh Comparison")}
              className="p-1 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
            </button>
          </div>

          {/* Top 4 Primary Metrics */}
          <div className="grid grid-cols-4 gap-3 py-3 border-b border-slate-200/60 dark:border-white/[0.08]">
            {/* AD SPEND */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                {t("AD SPEND")}
              </span>
              <div className="text-[16px] sm:text-[17px] font-bold text-slate-900 dark:text-white mt-1 tabular-nums tracking-tight">
                {formatRegionalCurrency(assigned.spend, currencyCode, marketplace)}
              </div>
            </div>

            {/* AD SALES */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                {t("AD SALES")}
              </span>
              <div className="text-[16px] sm:text-[17px] font-bold text-slate-900 dark:text-white mt-1 tabular-nums tracking-tight">
                {formatRegionalCurrency(assigned.sales, currencyCode, marketplace)}
              </div>
            </div>

            {/* ACOS */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                {t("ACOS")}
              </span>
              <div className="text-[16px] sm:text-[17px] font-bold text-blue-600 dark:text-blue-400 mt-1 tabular-nums tracking-tight">
                {assigned.acos > 0 ? `${assigned.acos}%` : "—"}
              </div>
            </div>

            {/* ROAS */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                {t("ROAS")}
              </span>
              <div className="text-[16px] sm:text-[17px] font-bold text-emerald-500 dark:text-emerald-400 mt-1 tabular-nums tracking-tight">
                {assigned.roas > 0 ? `${assigned.roas}x` : "—"}
              </div>
            </div>
          </div>

          {/* Bottom Secondary Metrics: Impr, Clicks, Orders, CVR, CPC */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-400 pt-2.5 flex-wrap gap-2">
            <span>
              <span>{t("Impr")}:</span>{" "}
              <strong className="text-slate-800 dark:text-slate-200 font-bold tabular-nums">
                {formatRegionalNumber(assigned.impressions, marketplace)}
              </strong>
            </span>
            <span>
              <span>{t("Clicks")}:</span>{" "}
              <strong className="text-slate-800 dark:text-slate-200 font-bold tabular-nums">
                {formatRegionalNumber(assigned.clicks, marketplace)}
              </strong>
            </span>
            <span>
              <span>{t("Orders")}:</span>{" "}
              <strong className="text-slate-800 dark:text-slate-200 font-bold tabular-nums">
                {formatRegionalNumber(assigned.orders, marketplace)}
              </strong>
            </span>
            <span>
              <span>{t("CVR")}:</span>{" "}
              <strong className="text-slate-800 dark:text-slate-200 font-bold tabular-nums">
                {assigned.cvr || 0}%
              </strong>
            </span>
            <span>
              <span>{t("CPC")}:</span>{" "}
              <strong className="text-slate-800 dark:text-slate-200 font-bold tabular-nums">
                {formatRegionalCurrency(assigned.cpc, currencyCode, marketplace)}
              </strong>
            </span>
          </div>
        </div>

        {/* Card 2: Without Assign (Manual) */}
        <div className="bg-slate-50/60 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.08] rounded-xl p-4 flex flex-col justify-between transition-all">
          {/* Card Header */}
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-white/[0.06] border border-slate-200/60 dark:border-white/[0.08] flex items-center justify-center text-slate-600 dark:text-slate-400 shrink-0">
                <User className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-slate-800 dark:text-slate-200">
                  {t("Without Assign (Manual)")}
                </span>
                <span className="text-[11.5px] text-slate-400 dark:text-slate-400 font-normal font-sans">
                  {unassigned.count || 0} {t("Campaigns")}
                </span>
              </div>
            </div>

            <div className="p-1 text-slate-400 dark:text-slate-500">
              <User className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Top 4 Primary Metrics */}
          <div className="grid grid-cols-4 gap-3 py-3 border-b border-slate-200/60 dark:border-white/[0.08]">
            {/* AD SPEND */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                {t("AD SPEND")}
              </span>
              <div className="text-[16px] sm:text-[17px] font-bold text-slate-900 dark:text-white mt-1 tabular-nums tracking-tight">
                {formatRegionalCurrency(unassigned.spend, currencyCode, marketplace)}
              </div>
            </div>

            {/* AD SALES */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                {t("AD SALES")}
              </span>
              <div className="text-[16px] sm:text-[17px] font-bold text-slate-900 dark:text-white mt-1 tabular-nums tracking-tight">
                {formatRegionalCurrency(unassigned.sales, currencyCode, marketplace)}
              </div>
            </div>

            {/* ACOS */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                {t("ACOS")}
              </span>
              <div className="text-[16px] sm:text-[17px] font-bold text-slate-700 dark:text-slate-300 mt-1 tabular-nums tracking-tight">
                {unassigned.acos > 0 ? `${unassigned.acos}%` : "—"}
              </div>
            </div>

            {/* ROAS */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                {t("ROAS")}
              </span>
              <div className="text-[16px] sm:text-[17px] font-bold text-slate-700 dark:text-slate-300 mt-1 tabular-nums tracking-tight">
                {unassigned.roas > 0 ? `${unassigned.roas}x` : "—"}
              </div>
            </div>
          </div>

          {/* Bottom Secondary Metrics: Impr, Clicks, Orders, CVR, CPC */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-400 pt-2.5 flex-wrap gap-2">
            <span>
              <span>{t("Impr")}:</span>{" "}
              <strong className="text-slate-800 dark:text-slate-200 font-bold tabular-nums">
                {formatRegionalNumber(unassigned.impressions, marketplace)}
              </strong>
            </span>
            <span>
              <span>{t("Clicks")}:</span>{" "}
              <strong className="text-slate-800 dark:text-slate-200 font-bold tabular-nums">
                {formatRegionalNumber(unassigned.clicks, marketplace)}
              </strong>
            </span>
            <span>
              <span>{t("Orders")}:</span>{" "}
              <strong className="text-slate-800 dark:text-slate-200 font-bold tabular-nums">
                {formatRegionalNumber(unassigned.orders, marketplace)}
              </strong>
            </span>
            <span>
              <span>{t("CVR")}:</span>{" "}
              <strong className="text-slate-800 dark:text-slate-200 font-bold tabular-nums">
                {unassigned.cvr || 0}%
              </strong>
            </span>
            <span>
              <span>{t("CPC")}:</span>{" "}
              <strong className="text-slate-800 dark:text-slate-200 font-bold tabular-nums">
                {formatRegionalCurrency(unassigned.cpc, currencyCode, marketplace)}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
