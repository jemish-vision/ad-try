import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import Toast from "../../../common/helper/toast/Toast";
import {
  ApiGetSystemDiagnostic,
  ApiDrainStagedBatches,
  ApiGet15DayReconciliation,
} from "../../../api-wrapper/superAdmin/ApiSystemDiagnostic";
import { ShadcnDatePicker } from "../../../components/ui/date-picker";
import {
  formatFullRegionalCurrency,
  formatFullRegionalNumber,
  getCurrencySymbol,
} from "../../../utility/regionalNumberFormat";
import {
  ShieldCheck,
  ArrowsClockwise,
  WarningCircle,
  CheckCircle,
  XCircle,
  Database,
  Lightning,
  Funnel,
  TrendUp,
  Cpu,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";

const MARKETPLACE_CURRENCY_MAP = {
  IN: "INR",
  US: "USD",
  CA: "CAD",
  UK: "GBP",
  GB: "GBP",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  JP: "JPY",
  AU: "AUD",
  AE: "AED",
  SA: "SAR",
  MX: "MXN",
  BR: "BRL",
  SG: "SGD",
};

const resolveProfileCurrency = (profile) => {
  if (profile?.currencyCode) return profile.currencyCode;
  const mp = (profile?.countryCode || profile?.marketplace || "IN").toUpperCase().trim();
  return MARKETPLACE_CURRENCY_MAP[mp] || (mp === "IN" ? "INR" : "USD");
};

const resolveProfileMarketplace = (profile) => {
  return (profile?.countryCode || profile?.marketplace || "IN").toUpperCase().trim();
};

const MASTER_CRON_LIST = [
  "Campaign Report",
  "Targeting Report",
  "AdGroups Report",
  "ProductAds Report",
  "Placement Report",
  "Search Term Report",
  "SearchTerm Report",
  "Weekly Report",
  "BiWeekly Report",
  "Sales Report",
  "Best Performer Report",
  "Brand Analytics Report",
  "Keyword Analysis Report",
  "Keyword Report",
  "Transactions Report",
  "Refund Report",
  "Reimbursement Report",
  "Sync Order Report",
  "Search Term Google Report",
  "Hourly Sync",
  "Report Batch Writer",
  "Sync Past Data",
  "Campaign Listing",
  "Targeting Listing",
  "AdGroups Listing",
  "ProductAds Listing",
  "Keywords Listing",
  "Negative Keyword Listing",
  "Negative Listing",
  "Negative Targets Listing",
  "Products Listing",
  "Products Meta Listing",
  "Order Listing",
  "Coupon Listing",
  "FC Inventory Ledger",
  "FC Storage Fee",
  "Sync Inventory",
  "Monitor Inventory",
  "Inventory Forecast Alerts",
  "DetectDeadInventory",
  "Hourly Data Consolidation",
  "Report File Cleanup",
  "Sync Order",
  "APlus Content Sync",
  "Sync Deals Dashboard",
  "Rules Update",
  "Budget Rule Schedules",
  "Budget Rule Schedulers",
  "Targeting Rule Schedules",
  "Dayparting Rule Schedules",
  "Placement Rule Schedules",
  "Search Term Rule Schedules",
  "Max Bid Setting",
  "Recommendation Snapshot",
  "Campaign Health Check",
  "Campaign Monitor",
  "Monitor Inventory",
  "Product Unavailability Check",
  "Best Seller Rank",
  "Competitor Analysis",
  "Weekly Performance Email",
  "Review Request",
  "Holiday Reminder",
  "Special Day Reminder",
  "Apply Holiday Protection",
  "Reminder For Reimbursement",
  "Shipment Queue",
  "Refresh Token",
];

const formatRunTime = (isoString) => {
  if (!isoString) return { date: "-", timeIST: "-", timeUTC: "-" };
  try {
    const d = new Date(isoString);
    const date = d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
    const timeIST = d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });
    const timeUTC = d.toISOString().slice(11, 19) + " UTC";
    return { date, timeIST, timeUTC };
  } catch (_) {
    return { date: isoString, timeIST: "-", timeUTC: "-" };
  }
};

const formatDuration = (ms) => {
  if (ms == null || isNaN(ms)) return "-";
  if (ms < 1000) return `${ms}ms`;
  const sec = (ms / 1000).toFixed(1);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  return `${min}m ${remSec}s`;
};

const SyncDiagnostic = () => {
  const { t } = useTranslation();

  const [isDark, setIsDark] = useState(
    typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark"
  );

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const [loading, setLoading] = useState(false);
  const [draining, setDraining] = useState(false);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("profiles"); // profiles | redis | crons | queues
  const [searchProfile, setSearchProfile] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [syncTypeFilter, setSyncTypeFilter] = useState("ALL_ACTIVE"); // ALL_ACTIVE | ADS_ONLY | SELLER_ONLY | ALL

  // State for Cron Jobs History Tab: default to today's date formatted as YYYY-MM-DD
  const getTodayFormatted = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const [selectedCustomDate, setSelectedCustomDate] = useState(getTodayFormatted());
  const [cronProfileFilter, setCronProfileFilter] = useState("ALL"); // ALL | GLOBAL | <profileId>
  const [cronNameFilter, setCronNameFilter] = useState("ALL");
  const [cronStatusFilter, setCronStatusFilter] = useState("ALL"); // ALL | COMPLETED | PENDING | FAILED
  const [cronSearch, setCronSearch] = useState("");
  const [cronViewMode, setCronViewMode] = useState("detailed"); // detailed | breakdown
  const [cronPage, setCronPage] = useState(1);
  const [cronPageSize, setCronPageSize] = useState(25);
  const [selectedReconcileProfile, setSelectedReconcileProfile] = useState(null);
  const [recon15DaysData, setRecon15DaysData] = useState(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconReportPage, setReconReportPage] = useState(1);
  const [reconReportLimit, setReconReportLimit] = useState(10);
  const [reconModalTab, setReconModalTab] = useState("daily"); // daily | reports
  const [reconDayFilter, setReconDayFilter] = useState("ALL"); // ALL | MISMATCH | MATCH | PENDING
  const [expandedFailedDate, setExpandedFailedDate] = useState(null);

  const reconMarketplace = resolveProfileMarketplace(selectedReconcileProfile || recon15DaysData);
  const reconCurrencyCode = resolveProfileCurrency(selectedReconcileProfile || recon15DaysData);

  const formatReconCurrency = (val) => {
    return formatFullRegionalCurrency(val, reconCurrencyCode, reconMarketplace, 2);
  };

  const formatReconNumber = (val) => {
    return formatFullRegionalNumber(val, reconMarketplace, 0);
  };

  const fetch15DayRecon = async (profileId, page = 1, limit = 10) => {
    if (!profileId) return;
    setReconLoading(true);
    try {
      const res = await ApiGet15DayReconciliation({ profileId, page, limit });
      if (res && res.isSuccess && res.data) {
        setRecon15DaysData(res.data);
      } else {
        Toast.error(res?.message || t("Failed to load 15-day reconciliation"));
      }
    } catch (err) {
      Toast.error(err.message || t("Error loading 15-day reconciliation"));
    } finally {
      setReconLoading(false);
    }
  };

  const handleOpenReconcileModal = (profile) => {
    setSelectedReconcileProfile(profile);
    setRecon15DaysData(null);
    setReconReportPage(1);
    setReconModalTab("daily");
    setReconDayFilter("ALL");
    setExpandedFailedDate(null);
    fetch15DayRecon(profile.profileId, 1, reconReportLimit);
  };

  const handleReconPageChange = (newPage) => {
    setReconReportPage(newPage);
    if (selectedReconcileProfile) {
      fetch15DayRecon(selectedReconcileProfile.profileId, newPage, reconReportLimit);
    }
  };

  const handleReconLimitChange = (newLimit) => {
    setReconReportLimit(newLimit);
    setReconReportPage(1);
    if (selectedReconcileProfile) {
      fetch15DayRecon(selectedReconcileProfile.profileId, 1, newLimit);
    }
  };

  // Lock background scrolling and allow closing with Escape key while modal is active
  useEffect(() => {
    if (!selectedReconcileProfile) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setSelectedReconcileProfile(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedReconcileProfile]);

  const fetchDiagnostic = async (customDate = null) => {
    setLoading(true);
    try {
      const params = {};
      const targetDate = typeof customDate === "string" ? customDate : (selectedCustomDate || null);
      if (targetDate) {
        params.targetDate = targetDate;
      }
      const res = await ApiGetSystemDiagnostic(params);
      if (res && res.isSuccess && res.data) {
        setData(res.data);
      } else {
        Toast.error(res?.message || t("Failed to load system diagnostic"));
      }
    } catch (err) {
      Toast.error(err.message || t("Network error loading system diagnostic"));
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = (dateStr) => {
    setSelectedCustomDate(dateStr || "");
    setCronPage(1);
    fetchDiagnostic(dateStr || "");
  };

  useEffect(() => {
    fetchDiagnostic(getTodayFormatted());
  }, []);

  const handleDrainBatches = async () => {
    setDraining(true);
    try {
      const res = await ApiDrainStagedBatches();
      if (res && res.isSuccess) {
        Toast.success(res.message || t("Batches drained successfully"));
        fetchDiagnostic();
      } else {
        Toast.error(res?.message || t("Failed to drain batches"));
      }
    } catch (err) {
      Toast.error(err.message || t("Error draining batches"));
    } finally {
      setDraining(false);
    }
  };

  const summary = data?.summary || {};
  const profiles = data?.profiles || [];
  const availableProfiles = data?.availableProfiles || [];
  const redisBuffer = data?.redisBuffer || {};
  const cronStatus = data?.cronStatus || [];
  const cronHistories = data?.cronHistories || [];
  const cronSummary = data?.cronSummary || { today: {}, yesterday: {}, byCron: {}, byProfile: {} };
  const auditDates = data?.auditDates || { today: "2026-11-03", yesterday: "2026-11-02" };
  const pipeline = data?.pipeline || {};
  const criticalAlerts = data?.criticalAlerts || [];
  const warnings = data?.warnings || [];

  // Filter profiles
  const filteredProfiles = profiles.filter((p) => {
    // Only active profiles
    if (p.isActive === false) return false;

    const matchesSearch =
      !searchProfile ||
      String(p.profileId).includes(searchProfile) ||
      (p.name && p.name.toLowerCase().includes(searchProfile.toLowerCase()));
    const matchesStatus =
      statusFilter === "ALL" ||
      (p.syncStatus && p.syncStatus.trim().toUpperCase() === statusFilter.trim().toUpperCase());
    const matchesSyncType =
      syncTypeFilter === "ALL_ACTIVE"
        ? (p.isAdsSyncEnabled || p.isSpSyncEnabled)
        : syncTypeFilter === "ADS_ONLY"
          ? p.isAdsSyncEnabled
          : syncTypeFilter === "SELLER_ONLY"
            ? p.isSpSyncEnabled
            : true;
    return matchesSearch && matchesStatus && matchesSyncType;
  });

  // Filter granular cron runs based on selected date
  const filteredCronRuns = cronHistories.filter((run) => {
    // 1. Date filter (strictly match selectedCustomDate)
    if (selectedCustomDate) {
      if (run.historyDate !== selectedCustomDate && !run.startedAt?.startsWith(selectedCustomDate)) {
        return false;
      }
    }

    // 2. Profile filter
    if (cronProfileFilter !== "ALL") {
      if (cronProfileFilter === "GLOBAL") {
        if (run.profileId != null) return false;
      } else if (String(run.profileId) !== String(cronProfileFilter)) {
        return false;
      }
    }

    // 3. Cron Name filter
    if (cronNameFilter !== "ALL" && run.cronName !== cronNameFilter) return false;

    // 4. Status filter
    if (cronStatusFilter !== "ALL") {
      const s = (run.status || "").toUpperCase();
      if (cronStatusFilter === "COMPLETED" && s !== "COMPLETED" && s !== "SUCCESS") return false;
      if (cronStatusFilter === "PENDING" && s !== "PENDING" && s !== "RUNNING") return false;
      if (cronStatusFilter === "FAILED" && s !== "FAILED" && s !== "ERROR") return false;
    }

    // 5. Search text
    if (cronSearch) {
      const q = cronSearch.toLowerCase();
      const matchName = run.cronName && run.cronName.toLowerCase().includes(q);
      const matchProf = run.profileName && run.profileName.toLowerCase().includes(q);
      const matchId = run.profileId && String(run.profileId).includes(q);
      if (!matchName && !matchProf && !matchId) return false;
    }

    return true;
  });

  const totalCronPages = Math.max(1, Math.ceil(filteredCronRuns.length / cronPageSize));
  const paginatedCronRuns = filteredCronRuns.slice((cronPage - 1) * cronPageSize, cronPage * cronPageSize);

  // Combine MASTER_CRON_LIST with any dynamic names so Campaign Report is ALWAYS present
  const uniqueCronNames = Array.from(
    new Set([...MASTER_CRON_LIST, ...cronHistories.map((c) => c.cronName).filter(Boolean)])
  ).sort((a, b) => a.localeCompare(b));

  const distinctProfiles = availableProfiles.length > 0
    ? availableProfiles
    : Array.from(
      new Map(
        cronHistories
          .filter((c) => c.profileId)
          .map((c) => [c.profileId, { profileId: c.profileId, name: c.profileName }])
      ).values()
    );

  return (
    <div className="min-h-screen p-4 sm:p-6 bg-slate-50 dark:bg-[#070d19] text-slate-800 dark:text-slate-100 transition-colors">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-center flex-wrap gap-3.5 mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 dark:text-white m-0 mb-1 flex items-center gap-2">
            <ShieldCheck size={26} className="text-blue-600 dark:text-blue-400" weight="bold" />
            {t("Super Admin: Live Data Sync & Pipeline Monitor")}
          </h1>
          <p className="m-0 text-[13px] text-slate-500 dark:text-slate-400">
            {t("Real-time verification of Amazon SP-API report generation, Redis staging buffer, and MongoDB schema insertion.")}
            {data?.executedAt && ` (${t("Last checked")}: ${new Date(data.executedAt).toLocaleTimeString()})`}
          </p>
        </div>

        <div className="flex gap-2.5">
          <button
            onClick={handleDrainBatches}
            disabled={draining}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-700 hover:bg-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-md text-[13px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed border border-slate-600 dark:border-slate-700 shadow-sm cursor-pointer"
          >
            <Database size={16} />
            {draining ? t("Draining Redis...") : t("Drain Redis Staged Batches")}
          </button>

          <button
            onClick={() => fetchDiagnostic()}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-[13px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm cursor-pointer"
          >
            <ArrowsClockwise size={16} className={loading ? "animate-spin" : ""} />
            {loading ? t("Refreshing...") : t("Refresh Live Audit")}
          </button>
        </div>
      </div>

      {/* CRITICAL ALERTS BANNER */}
      {criticalAlerts.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg p-3.5 sm:p-4 mb-5 shadow-sm">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-bold mb-1.5 text-sm">
            <WarningCircle size={20} weight="bold" />
            {t("CRITICAL DATA INGESTION ISSUES DETECTED")} ({criticalAlerts.length})
          </div>
          <ul className="m-0 ml-5 p-0 text-[13px] text-red-600 dark:text-red-300 space-y-1">
            {criticalAlerts.map((alert, i) => (
              <li key={i}>{alert}</li>
            ))}
          </ul>
        </div>
      )}

      {/* TABS NAVIGATION */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 mb-4 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("profiles")}
          className={`px-4 py-2.5 bg-transparent border-b-2 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "profiles"
              ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 font-bold"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          {t("Profiles Ingestion Matrix")} ({profiles.length})
        </button>

        {/* Redis Staging Buffer tab: only display when there is actively staged/buffered data */}
        {(redisBuffer.manifests?.length || 0) > 0 && (
          <button
            onClick={() => setActiveTab("redis")}
            className={`px-4 py-2.5 bg-transparent border-b-2 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "redis"
                ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 font-bold"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {t("Redis Staging Buffer")} ({redisBuffer.manifests?.length || 0})
          </button>
        )}

        <button
          onClick={() => setActiveTab("crons")}
          className={`px-4 py-2.5 bg-transparent border-b-2 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "crons"
              ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 font-bold"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
        >
          {t("Cron Jobs History")} ({cronHistories.length || cronStatus.length})
        </button>

        <button
          onClick={() => setActiveTab("queues")}
          className={`px-4 py-2.5 bg-transparent border-b-2 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "queues"
              ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 font-bold"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          {t("BullMQ & SQS Pipeline")}
        </button>
      </div>

      {/* TAB CONTENT: PROFILES */}
      {activeTab === "profiles" && (
        <div className="bg-white dark:bg-[#0b1329] rounded-xl border border-slate-200 dark:border-slate-800/90 p-4 shadow-sm transition-colors">
          {/* Controls: Search & Filter */}
          <div className="flex gap-3 mb-3.5 flex-wrap">
            <input
              type="text"
              placeholder={t("Search Profile ID or Name...")}
              value={searchProfile}
              onChange={(e) => setSearchProfile(e.target.value)}
              className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-[13px] w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <select
              value={syncTypeFilter}
              onChange={(e) => setSyncTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 text-[13px] font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL_ACTIVE">{t("Sync Enabled Profiles")}</option>
              <option value="ADS_ONLY">{t("Ads Sync ON")}</option>
              <option value="SELLER_ONLY">{t("Seller Sync ON")}</option>
              <option value="ALL">{t("All Profiles (Including Sync OFF)")}</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">{t("All Statuses")} ({profiles.length})</option>
              <option value="HEALTHY">{t("HEALTHY")}</option>
              <option value="SYNCING">{t("SYNCING")}</option>
              <option value="MISSING_DATA">{t("MISSING DATA")}</option>
              <option value="STALE">{t("STALE")}</option>
              <option value="ERROR">{t("ERROR")}</option>
              <option value="DISABLED">{t("DISABLED (Sync OFF)")}</option>
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-left border-b-2 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300">
                  <th className="px-3 py-2.5 font-semibold">{t("Profile")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("Marketplace")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("Amazon SP-API")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("DB Campaigns")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("Ingested Spend")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("Sync Status")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("Diagnostic Details")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-5 text-center text-slate-500 dark:text-slate-400">
                      {t("No profiles match the filter criteria.")}
                    </td>
                  </tr>
                ) : (
                  filteredProfiles.map((p, i) => {
                    let badgeCls = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/60";
                    if (p.syncStatus === "MISSING_DATA") {
                      badgeCls = "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800/60";
                    } else if (p.syncStatus === "STALE") {
                      badgeCls = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800/60";
                    } else if (p.syncStatus === "SYNCING") {
                      badgeCls = "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-800/60";
                    } else if (p.syncStatus === "ERROR") {
                      badgeCls = "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800/60";
                    } else if (p.syncStatus === "DISABLED") {
                      badgeCls = "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
                    }

                    return (
                      <tr key={`${p.profileId}_${p._id || i}`} className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                          {p.name}
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                            ID: {p.profileId}
                          </div>
                          <div className="flex gap-1.5 mt-1 flex-wrap">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                                p.isActive !== false
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60"
                                  : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/60"
                              }`}
                            >
                              {p.isActive !== false ? t("Active") : t("Inactive")}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                                p.isAdsSyncEnabled
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60"
                                  : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                              }`}
                            >
                              {t("Ads")}: {p.isAdsSyncEnabled ? t("ON") : t("OFF")}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                                p.isSpSyncEnabled
                                  ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/60"
                                  : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                              }`}
                            >
                              {t("Seller")}: {p.isSpSyncEnabled ? t("ON") : t("OFF")}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          {p.countryCode} ({p.timezone})
                        </td>
                        <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200">
                          <div>{formatFullRegionalNumber(p.reports?.yesterdayCompleted || 0, p.countryCode)} {t("reports")}</div>
                          {p.isSpSyncEnabled && (
                            <div className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5 font-medium">
                              {t("Seller Orders")}: {formatFullRegionalNumber(p.sellerRecords?.ordersYesterday ?? 0, p.countryCode)}
                            </div>
                          )}
                          {p.reports?.pendingOrProcessing > 0 && (
                            <span className="text-sky-600 dark:text-sky-400 block text-[11px]">
                              {formatFullRegionalNumber(p.reports.pendingOrProcessing, p.countryCode)} {t("generating")}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <strong className="text-slate-900 dark:text-slate-100 font-bold">
                            {formatFullRegionalNumber(p.schemaRecords.campaignsYesterday, p.countryCode)} {t("docs")}
                          </strong>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {t("Today")}: {formatFullRegionalNumber(p.schemaRecords.campaignsToday, p.countryCode)}
                          </div>
                        </td>

                        <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                          {formatFullRegionalCurrency(
                            p.schemaRecords.totalSpendYesterday,
                            resolveProfileCurrency(p),
                            resolveProfileMarketplace(p),
                            2
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-1 rounded text-[11px] font-bold border ${badgeCls}`}>
                            {t(p.syncStatus)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                          {p.issues.length > 0 ? (
                            <span className={p.syncStatus === "MISSING_DATA" ? "text-red-600 dark:text-red-400 font-medium" : "text-amber-600 dark:text-amber-400 font-medium"}>
                              {p.issues.map((iss) => t(iss)).join(", ")}
                            </span>
                          ) : (
                            <span className="text-slate-600 dark:text-slate-400">{t("Data synced & schema verified")}</span>
                          )}
                          <div className="mt-1.5">
                            <button
                              onClick={() => handleOpenReconcileModal(p)}
                              className="px-2 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 rounded text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1 transition-colors"
                            >
                              <ShieldCheck size={14} weight="bold" />
                              {t("Reconcile with Amazon SP-API")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: REDIS BUFFER */}
      {activeTab === "redis" && (redisBuffer.manifests?.length || 0) > 0 && (
        <div className="bg-white dark:bg-[#0b1329] rounded-xl border border-slate-200 dark:border-slate-800/90 p-4 shadow-sm transition-colors">
          <h3 className="m-0 mb-3 text-[15px] font-bold text-slate-900 dark:text-white">
            {t("Redis Ingestion Manifests & Stream Buffer")}
          </h3>
          {redisBuffer.manifests?.length === 0 ? (
            <div className="p-5 text-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle size={32} weight="bold" className="mx-auto block mb-2" />
              {t("All Redis staging batches are drained into MongoDB schema. Buffer is 100% clean!")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-left border-b-2 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300">
                    <th className="px-3 py-2.5 font-semibold">{t("Run ID")}</th>
                    <th className="px-3 py-2.5 font-semibold">{t("Entity")}</th>
                    <th className="px-3 py-2.5 font-semibold">{t("Profile ID")}</th>
                    <th className="px-3 py-2.5 font-semibold">{t("Status")}</th>
                    <th className="px-3 py-2.5 font-semibold">{t("Age")}</th>
                    <th className="px-3 py-2.5 font-semibold">{t("Expected Records")}</th>
                  </tr>
                </thead>
                <tbody>
                  {redisBuffer.manifests.map((m) => (
                    <tr key={m.runId} className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 text-slate-800 dark:text-slate-200 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-slate-900 dark:text-slate-100">{m.runId}</td>
                      <td className="px-3 py-2.5">{m.entity}</td>
                      <td className="px-3 py-2.5">{m.profileId}</td>
                      <td className="px-3 py-2.5 font-bold">
                        <span
                          className={
                            m.status === "COMPLETED"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : m.ageMinutes > 15
                                ? "text-red-600 dark:text-red-400"
                                : "text-amber-600 dark:text-amber-400"
                          }
                        >
                          {t(m.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{m.ageMinutes} {t("min")}</td>
                      <td className="px-3 py-2.5">{m.expectedKeys}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: CRON JOBS */}
      {activeTab === "crons" && (
        <div className="flex flex-col gap-4">
          {/* FILTER TOOLBAR */}
          <div className="bg-white dark:bg-[#0b1329] rounded-xl border border-slate-200 dark:border-slate-800/90 p-3.5 sm:p-4 shadow-sm flex flex-col gap-3 transition-colors">
            {/* Row 1: Date Picker & View Mode */}
            <div className="flex justify-between items-center flex-wrap gap-2.5">
              {/* Date Selection: Pure Selected Date */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
                  {t("Selected Date")}:
                </span>

                <div className="w-[170px]">
                  <ShadcnDatePicker
                    placeholder={t("Select Date")}
                    value={selectedCustomDate}
                    onChange={(dateStr) => {
                      handleDateSelect(dateStr || "");
                    }}
                    className="h-9 text-xs border-slate-300 dark:border-slate-700 shadow-sm"
                  />
                </div>

                <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {filteredCronRuns.length} {t("run(s) on")} {selectedCustomDate || t("all dates")}
                </span>
              </div>

              {/* View Mode Toggle */}
              <div className="flex gap-1.5">
                <button
                  onClick={() => setCronViewMode("detailed")}
                  className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
                    cronViewMode === "detailed"
                      ? "bg-slate-900 dark:bg-blue-600 border-slate-900 dark:border-blue-600 text-white shadow-sm"
                      : "bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  {t("Detailed Execution Log")}
                </button>
                <button
                  onClick={() => setCronViewMode("breakdown")}
                  className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
                    cronViewMode === "breakdown"
                      ? "bg-slate-900 dark:bg-blue-600 border-slate-900 dark:border-blue-600 text-white shadow-sm"
                      : "bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  {t("Per-Cron Breakdown Grid")} ({Object.keys(cronSummary.byCron || {}).length})
                </button>
              </div>
            </div>

            {/* Row 2: Profile Filter, Cron Filter, Status Filter & Search */}
            <div className="flex gap-2.5 flex-wrap items-center pt-2 border-t border-slate-100 dark:border-slate-800/80">
              {/* Profile-wise Filter Dropdown */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t("Profile Filter")}:
                </label>
                <select
                  value={cronProfileFilter}
                  onChange={(e) => {
                    setCronProfileFilter(e.target.value);
                    setCronPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs max-w-[240px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="ALL">{t("All Profiles")} ({distinctProfiles.length})</option>
                  <option value="GLOBAL">{t("Global / System Crons")}</option>
                  {distinctProfiles.map((p) => {
                    const flags = [];
                    if (p.isAdsSyncEnabled) flags.push("Ads");
                    if (p.isSpSyncEnabled) flags.push("Seller");
                    const flagLabel = flags.length > 0 ? ` [${flags.join("+")}]` : " [Sync OFF]";
                    return (
                      <option key={p.profileId} value={String(p.profileId)}>
                        {p.name} ({p.profileId}){flagLabel}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Cron Name Filter Dropdown */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t("Cron Name")}:
                </label>
                <select
                  value={cronNameFilter}
                  onChange={(e) => {
                    setCronNameFilter(e.target.value);
                    setCronPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs max-w-[200px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="ALL">{t("All Crons")} ({uniqueCronNames.length})</option>
                  {uniqueCronNames.map((name) => (
                    <option key={name} value={name}>
                      {t(name)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter Dropdown */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t("Status")}:
                </label>
                <select
                  value={cronStatusFilter}
                  onChange={(e) => {
                    setCronStatusFilter(e.target.value);
                    setCronPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="ALL">{t("All Statuses")}</option>
                  <option value="COMPLETED">{t("COMPLETED")}</option>
                  <option value="PENDING">{t("PENDING")}</option>
                  <option value="FAILED">{t("FAILED")}</option>
                </select>
              </div>

              {/* Search text */}
              <input
                type="text"
                placeholder={t("Search cron, profile name, or ID...")}
                value={cronSearch}
                onChange={(e) => {
                  setCronSearch(e.target.value);
                  setCronPage(1);
                }}
                className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-xs min-w-[220px] flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              {/* Reset Filters button */}
              {(cronProfileFilter !== "ALL" || cronNameFilter !== "ALL" || cronStatusFilter !== "ALL" || cronSearch) && (
                <button
                  onClick={() => {
                    setCronProfileFilter("ALL");
                    setCronNameFilter("ALL");
                    setCronStatusFilter("ALL");
                    setCronSearch("");
                    setCronPage(1);
                  }}
                  className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  {t("Clear Filters")}
                </button>
              )}
            </div>
          </div>

          {/* VIEW MODE 1: DETAILED RUN LOG TABLE */}
          {cronViewMode === "detailed" && (
            <div className="bg-white dark:bg-[#0b1329] rounded-xl border border-slate-200 dark:border-slate-800/90 p-4 shadow-sm transition-colors">
              <div className="flex justify-between items-center mb-3">
                <h3 className="m-0 text-[15px] font-bold text-slate-900 dark:text-white">
                  {t("Detailed Execution History")} ({filteredCronRuns.length} {t("runs matched")})
                </h3>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {t("Showing page")} {cronPage} {t("of")} {totalCronPages}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 text-left border-b-2 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300">
                      <th className="px-3 py-2.5 font-semibold">{t("Cron Job Name")}</th>
                      <th className="px-3 py-2.5 font-semibold">{t("Target Profile")}</th>
                      <th className="px-3 py-2.5 font-semibold">{t("Run Time")}</th>
                      <th className="px-3 py-2.5 font-semibold">{t("Status")}</th>
                      <th className="px-3 py-2.5 font-semibold">{t("Redis Staging & Drain Status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCronRuns.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500 dark:text-slate-400">
                          {cronNameFilter !== "ALL" ? (
                            <div>
                              <div className="font-bold text-slate-900 dark:text-slate-100 text-sm mb-1.5">
                                {t('No executions recorded for "{{cronName}}" on {{date}}', {
                                  cronName: cronNameFilter,
                                  date: selectedCustomDate || t("the selected date"),
                                })}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 max-w-[560px] mx-auto leading-relaxed">
                                {t("This cron is registered in the system catalog. Once its scheduled BullMQ trigger or manual report generation runs, its execution timing and Redis stream drain verification will appear here automatically.")}
                              </div>
                            </div>
                          ) : (
                            t("No cron executions match the selected date or profile filter.")
                          )}
                        </td>
                      </tr>
                    ) : (
                      paginatedCronRuns.map((r, i) => {
                        const timing = formatRunTime(r.startedAt);
                        const isSuccess = r.status === "COMPLETED" || r.status === "SUCCESS";
                        const isPending = r.status === "PENDING" || r.status === "RUNNING";

                        let statusCls = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/60";
                        if (isPending) {
                          statusCls = "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-800/60";
                        } else if (!isSuccess) {
                          statusCls = "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800/60";
                        }

                        let redisBadgeCls = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/60";
                        let redisText = t("✓ Ingested from Redis to DB");
                        if (r.redisStatus === "NOT_APPLICABLE" || (!r.reportType && !/report|listing/i.test(r.cronName))) {
                          redisBadgeCls = "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
                          redisText = t("— Direct Execution");
                        } else if (r.redisStatus === "STALLED") {
                          redisBadgeCls = "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800/60";
                          redisText = t("✖ Stalled in Redis Buffer");
                        } else if (r.redisStatus === "DRAINING") {
                          redisBadgeCls = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800/60";
                          redisText = t("⏳ Stream Actively Draining");
                        } else if (isPending) {
                          redisBadgeCls = "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
                          redisText = t("⏳ Job In Progress");
                        } else if (!isSuccess) {
                          redisBadgeCls = "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800/60";
                          redisText = t("✖ Execution Error");
                        }

                        return (
                          <tr key={r.id || `${r.cronName}_${i}`} className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            {/* Cron Name */}
                            <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                              {t(r.cronName)}
                              {r.reportType && (
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                                  {t("Type")}: {r.reportType}
                                </div>
                              )}
                            </td>

                            {/* Profile */}
                            <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200">
                              {r.profileId ? (
                                <div>
                                  <div className="font-semibold text-slate-900 dark:text-slate-100">{r.profileName}</div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400">ID: {r.profileId}</div>
                                </div>
                              ) : (
                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded text-[11px] font-semibold">
                                  {t("Global / System")}
                                </span>
                              )}
                            </td>

                            {/* Run Time (Clean IST + Date) */}
                            <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">{timing.timeIST}</div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {timing.date}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-1 rounded text-[11px] font-bold border ${statusCls}`}>
                                {t(r.status)}
                              </span>
                            </td>

                            {/* Redis Drain Status */}
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-1 rounded text-[11px] font-semibold inline-block border ${redisBadgeCls}`}>
                                {redisText}
                              </span>
                              {r.error && (
                                <div className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                                  {r.error}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalCronPages > 1 && (
                <div className="flex justify-between items-center mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t("Showing")} {(cronPage - 1) * cronPageSize + 1} {t("to")}{" "}
                    {Math.min(cronPage * cronPageSize, filteredCronRuns.length)} {t("of")} {filteredCronRuns.length} {t("runs")}
                  </div>

                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => setCronPage((p) => Math.max(1, p - 1))}
                      disabled={cronPage === 1}
                      className={`px-3 py-1 rounded-md border text-xs font-semibold transition-colors ${
                        cronPage === 1
                          ? "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                          : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                      }`}
                    >
                      {t("Previous")}
                    </button>

                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      {t("Page")} {cronPage} {t("of")} {totalCronPages}
                    </span>

                    <button
                      onClick={() => setCronPage((p) => Math.min(totalCronPages, p + 1))}
                      disabled={cronPage === totalCronPages}
                      className={`px-3 py-1 rounded-md border text-xs font-semibold transition-colors ${
                        cronPage === totalCronPages
                          ? "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                          : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                      }`}
                    >
                      {t("Next")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW MODE 2: PER-CRON BREAKDOWN GRID */}
          {cronViewMode === "breakdown" && (
            <div className="bg-white dark:bg-[#0b1329] rounded-xl border border-slate-200 dark:border-slate-800/90 p-4 shadow-sm transition-colors">
              <h3 className="m-0 mb-3 text-[15px] font-bold text-slate-900 dark:text-white">
                {t("Cron Job Comparison (Today vs. Yesterday Runs)")}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 text-left border-b-2 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300">
                      <th className="px-3 py-2.5 font-semibold">{t("Cron Job Name")}</th>
                      <th className="px-3 py-2.5 font-semibold">{t("Today Runs")} ({auditDates.today})</th>
                      <th className="px-3 py-2.5 font-semibold">{t("Yesterday Runs")} ({auditDates.yesterday})</th>
                      <th className="px-3 py-2.5 font-semibold">{t("Last Status")}</th>
                      <th className="px-3 py-2.5 font-semibold">{t("Last Run Time")}</th>
                      <th className="px-3 py-2.5 font-semibold">{t("Action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uniqueCronNames.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-5 text-center text-slate-500 dark:text-slate-400">
                          {t("No cron summary data available.")}
                        </td>
                      </tr>
                    ) : (
                      uniqueCronNames.map((cronName) => {
                        const item = cronSummary.byCron?.[cronName] || {
                          cronName,
                          today: { total: 0, completed: 0, failed: 0 },
                          yesterday: { total: 0, completed: 0, failed: 0 },
                          lastStatus: "NOT YET EXECUTED",
                          lastRunAt: null,
                        };
                        const timing = formatRunTime(item.lastRunAt);
                        const isSuccess = item.lastStatus === "COMPLETED" || item.lastStatus === "SUCCESS";
                        const isNever = item.lastStatus === "NOT YET EXECUTED";

                        let badgeCls = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/60";
                        if (isNever) {
                          badgeCls = "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
                        } else if (!isSuccess) {
                          badgeCls = "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800/60";
                        }

                        return (
                          <tr key={cronName} className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                              {t(cronName)}
                            </td>
                            <td className="px-3 py-2.5">
                              <strong className={(item.today?.total || 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}>
                                {item.today?.total || 0} {t("runs")}
                              </strong>
                              {(item.today?.failed || 0) > 0 && (
                                <span className="text-red-600 dark:text-red-400 ml-1.5 text-[11px]">
                                  ({item.today.failed} {t("failed")})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <strong className={(item.yesterday?.total || 0) > 0 ? "text-sky-600 dark:text-sky-400" : "text-slate-500 dark:text-slate-400"}>
                                {item.yesterday?.total || 0} {t("runs")}
                              </strong>
                              {(item.yesterday?.failed || 0) > 0 && (
                                <span className="text-red-600 dark:text-red-400 ml-1.5 text-[11px]">
                                  ({item.yesterday.failed} {t("failed")})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-1 rounded text-[11px] font-bold border ${badgeCls}`}>
                                {t(item.lastStatus || "UNKNOWN")}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 text-xs">
                              {item.lastRunAt ? `${timing.timeIST} (${timing.date})` : "-"}
                            </td>
                            <td className="px-3 py-2.5">
                              <button
                                onClick={() => {
                                  setCronNameFilter(cronName);
                                  setCronViewMode("detailed");
                                  setCronPage(1);
                                }}
                                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-blue-600 dark:text-blue-400 text-xs font-semibold cursor-pointer transition-colors"
                              >
                                {t("View Detailed Runs")}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: QUEUES */}
      {activeTab === "queues" && (
        <div className="bg-white dark:bg-[#0b1329] rounded-xl border border-slate-200 dark:border-slate-800/90 p-4 shadow-sm transition-colors">
          <h3 className="m-0 mb-3 text-[15px] font-bold text-slate-900 dark:text-white">
            {t("BullMQ Queue Backlog & Worker Pipeline")}
          </h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 mb-4.5">
            {Object.entries(pipeline.bullmq || {}).map(([qName, counts]) => (
              <div key={qName} className="border border-slate-200 dark:border-slate-700/80 rounded-lg p-3.5 bg-slate-50/50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-200 shadow-sm">
                <div className="font-bold text-slate-900 dark:text-white mb-2 text-sm">{qName}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400 py-0.5 flex justify-between items-center">
                  <span>{t("Waiting")}:</span>
                  <strong className="text-slate-900 dark:text-slate-100 font-semibold">{counts.waiting}</strong>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 py-0.5 flex justify-between items-center">
                  <span>{t("Active")}:</span>
                  <strong className="text-slate-900 dark:text-slate-100 font-semibold">{counts.active}</strong>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 py-0.5 flex justify-between items-center">
                  <span>{t("Delayed")}:</span>
                  <strong className="text-slate-900 dark:text-slate-100 font-semibold">{counts.delayed}</strong>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 py-0.5 flex justify-between items-center">
                  <span>{t("Failed")}:</span>
                  <strong className={counts.failed > 0 ? "text-red-600 dark:text-red-400 font-bold" : "text-emerald-600 dark:text-emerald-400 font-semibold"}>
                    {counts.failed}
                  </strong>
                </div>
              </div>
            ))}
          </div>

          {pipeline.failedJobs?.length > 0 && (
            <div>
              <h4 className="text-red-600 dark:text-red-400 m-0 mb-2 mt-3.5 font-bold">{t("Recent Failed Jobs")}</h4>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-red-50/70 dark:bg-red-950/40 text-left border-b border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300">
                      <th className="px-2.5 py-2 font-semibold">{t("Job ID")}</th>
                      <th className="px-2.5 py-2 font-semibold">{t("Queue")}</th>
                      <th className="px-2.5 py-2 font-semibold">{t("Task")}</th>
                      <th className="px-2.5 py-2 font-semibold">{t("Error Reason")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipeline.failedJobs.map((fj) => (
                      <tr key={fj.jobId} className="border-b border-red-100 dark:border-red-900/30">
                        <td className="px-2.5 py-2 font-mono text-slate-900 dark:text-slate-100">{fj.jobId}</td>
                        <td className="px-2.5 py-2 text-slate-800 dark:text-slate-200">{fj.queue}</td>
                        <td className="px-2.5 py-2 text-slate-800 dark:text-slate-200">{fj.task}</td>
                        <td className="px-2.5 py-2 text-red-600 dark:text-red-400 font-medium">{fj.failedReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AMAZON SP-API RECONCILIATION MODAL (Portaled to document.body so navbar, toolbar, and sidebar are cleanly covered) */}
      {selectedReconcileProfile && typeof document !== "undefined" && createPortal(
        <div
          className="sync-recon-modal-backdrop fixed inset-0 w-screen h-screen bg-slate-950/75 backdrop-blur-sm flex items-center justify-center z-[999999] p-4 sm:p-6 box-border"
          onClick={() => setSelectedReconcileProfile(null)}
        >
          <div
            className="sync-recon-modal-dialog bg-white dark:bg-[#0b1329] rounded-2xl max-w-[1280px] w-full max-h-[90vh] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden relative text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/80 rounded-xl p-2 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <ShieldCheck size={26} weight="bold" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="m-0 text-[17px] font-bold text-slate-900 dark:text-white">
                      {t("Data Reconciliation & Health Audit")}
                    </h2>
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      {t("15-Day Retention Window")}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t("Store")}: <strong className="text-slate-900 dark:text-slate-100">{selectedReconcileProfile.name}</strong> &bull; {t("Profile ID")}:{" "}
                    <code className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-1 py-0.5 rounded text-xs">
                      {selectedReconcileProfile.profileId}
                    </code>{" "}
                    &bull; {t("Marketplace")}: <strong>{reconMarketplace}</strong> &bull; {t("Currency")}:{" "}
                    <strong>{reconCurrencyCode} ({getCurrencySymbol(reconCurrencyCode)})</strong>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedReconcileProfile(null)}
                className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 py-1.5 cursor-pointer text-[13px] font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition-colors"
              >
                ✕ {t("Close")}
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 md:p-6 flex flex-col gap-4.5 overflow-y-auto flex-1 bg-white dark:bg-[#0b1329]">
              {/* 4 Summary Cards */}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
                {/* Card 1: 15-Day Integrity Verdict */}
                <div
                  className={`border rounded-xl p-3.5 sm:p-4 ${
                    (recon15DaysData?.summary?.mismatchedDays || 0) > 0
                      ? "bg-red-50/70 border-red-200 dark:bg-red-950/30 dark:border-red-900/60"
                      : "bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/60"
                  }`}
                >
                  <div
                    className={`text-[11px] font-bold uppercase ${
                      (recon15DaysData?.summary?.mismatchedDays || 0) > 0
                        ? "text-red-700 dark:text-red-400"
                        : "text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {t("15-Day Data Integrity")}
                  </div>
                  <div
                    className={`text-[20px] font-bold mt-1 ${
                      (recon15DaysData?.summary?.mismatchedDays || 0) > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {reconLoading
                      ? t("Verifying Data...")
                      : (recon15DaysData?.summary?.mismatchedDays || 0) > 0
                        ? `${recon15DaysData.summary.mismatchedDays} ${t("Discrepancy Found")}`
                        : t("100% Ingested & Matched")}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {(recon15DaysData?.summary?.mismatchedDays || 0) > 0
                      ? t("Amazon SP-API report failures detected")
                      : t("Zero document drops across all 15 days")}
                  </div>
                </div>

                {/* Card 2: Fully Matched Days */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 sm:p-4 bg-slate-50/70 dark:bg-slate-850/60 dark:bg-slate-900/60">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    {t("Fully Verified Days")}
                  </div>
                  <div className="text-[20px] font-bold mt-1 text-slate-900 dark:text-white">
                    {reconLoading ? "-" : `${recon15DaysData?.summary?.matchedDays ?? 0} ${t("of")} 15 ${t("Days")}`}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-semibold">
                    ✓ {t("Campaigns, AdGroups & Targeting all match")}
                  </div>
                </div>

                {/* Card 3: Discrepancy / Dropped Days */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 sm:p-4 bg-slate-50/70 dark:bg-slate-850/60 dark:bg-slate-900/60">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    {t("Days with Missing / Failed Data")}
                  </div>
                  <div
                    className={`text-[20px] font-bold mt-1 ${
                      (recon15DaysData?.summary?.mismatchedDays || 0) > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {reconLoading ? "-" : `${recon15DaysData?.summary?.mismatchedDays ?? 0} ${t("Day(s)")}`}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {(recon15DaysData?.summary?.mismatchedDays || 0) > 0
                      ? t("Review the red flagged date below")
                      : t("No missing data days")}
                  </div>
                </div>

                {/* Card 4: Total Amazon Reports */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 sm:p-4 bg-slate-50/70 dark:bg-slate-850/60 dark:bg-slate-900/60">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    {t("Total Amazon Reports Stored")}
                  </div>
                  <div className="text-[20px] font-bold mt-1 text-blue-600 dark:text-blue-400">
                    {formatReconNumber(recon15DaysData?.reportsHistory?.pagination?.totalCount || 0)} {t("reports")}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {t("Available in `reports` collection")}
                  </div>
                </div>
              </div>

              {/* View Switcher Tabs inside Modal */}
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2.5 flex-wrap gap-2.5">
                <div className="flex gap-2">
                  <button
                    onClick={() => setReconModalTab("daily")}
                    className={`px-4 py-2 rounded-lg border text-[13px] font-semibold cursor-pointer flex items-center gap-1.5 transition-colors ${
                      reconModalTab === "daily"
                        ? "bg-slate-900 dark:bg-blue-600 border-slate-900 dark:border-blue-600 text-white shadow-sm"
                        : "bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                    }`}
                  >
                    <Database size={16} />
                    {t("15-Day Day-Wise Data Totals (Campaigns, Ad Groups, Targeting)")}
                  </button>

                  <button
                    onClick={() => setReconModalTab("reports")}
                    className={`px-4 py-2 rounded-lg border text-[13px] font-semibold cursor-pointer flex items-center gap-1.5 transition-colors ${
                      reconModalTab === "reports"
                        ? "bg-slate-900 dark:bg-blue-600 border-slate-900 dark:border-blue-600 text-white shadow-sm"
                        : "bg-white dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                    }`}
                  >
                    <ArrowsClockwise size={16} />
                    {t("Amazon SP-API Generated Reports Log")} ({formatReconNumber(recon15DaysData?.reportsHistory?.pagination?.totalCount || 0)})
                  </button>
                </div>

                {reconModalTab === "daily" && (
                  /* Filter Pills for Day-Wise Table */
                  <div className="flex gap-1.5 items-center flex-wrap">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">{t("Filter")}:</span>
                    {[
                      { key: "ALL", label: `${t("All Days")} (15)` },
                      {
                        key: "MISMATCH",
                        label: `${t("Discrepancies")} (${recon15DaysData?.summary?.mismatchedDays || 0})`,
                        isDanger: (recon15DaysData?.summary?.mismatchedDays || 0) > 0,
                      },
                      { key: "MATCH", label: `${t("Matched")} (${recon15DaysData?.summary?.matchedDays || 0})` },
                      { key: "PENDING", label: `${t("In Progress")} (${recon15DaysData?.summary?.pendingDays || 0})` },
                    ].map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setReconDayFilter(f.key)}
                        className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer transition-colors ${
                          reconDayFilter === f.key
                            ? f.isDanger
                              ? "bg-red-600 border-red-600 text-white"
                              : "bg-blue-600 border-blue-600 text-white"
                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* TAB 1: 15-DAY DAY-WISE DATA RECONCILIATION */}
              {reconModalTab === "daily" && (
                <div>
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/70 text-left border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold">
                          <th className="px-3.5 py-2.5 w-[105px]">{t("Date")}</th>
                          <th className="px-3.5 py-2.5 w-[115px]">{t("Sync Status")}</th>
                          <th className="px-3.5 py-2.5 w-[140px]">{t("Campaigns")}</th>
                          <th className="px-3.5 py-2.5 w-[95px]">{t("Ad Groups")}</th>
                          <th className="px-3.5 py-2.5 w-[145px]">{t("Targeting")}</th>
                          <th className="px-3.5 py-2.5 w-[140px]">{t("Spend Match")}</th>
                          <th className="px-3.5 py-2.5 w-[155px]">{t("Amazon Reports")}</th>
                          <th className="px-3.5 py-2.5 min-w-[220px]">{t("Diagnosis & Action")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(recon15DaysData?.dayWiseReconciliation || []).length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-7 text-center text-slate-500 dark:text-slate-400">
                              {reconLoading ? (
                                <div className="flex items-center justify-center gap-2">
                                  <ArrowsClockwise size={18} className="animate-spin text-blue-600" />
                                  {t("Verifying 15-day records across MongoDB schemas...")}
                                </div>
                              ) : (
                                t("No reconciliation data found for this profile.")
                              )}
                            </td>
                          </tr>
                        ) : (
                          recon15DaysData.dayWiseReconciliation
                            .filter((d) => {
                              if (reconDayFilter === "ALL") return true;
                              return d.status === reconDayFilter;
                            })
                            .map((d) => {
                              const isMatch = d.status === "MATCH";
                              const isMismatch = d.status === "MISMATCH";
                              const isPending = d.status === "PENDING";
                              const hasFailedReports = (d.failedReports || []).length > 0;
                              const isExpanded = expandedFailedDate === d.date;

                              return (
                                <React.Fragment key={d.date}>
                                  <tr
                                    className={`border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-850/40 text-slate-800 dark:text-slate-200 transition-colors ${
                                      isMismatch ? "bg-red-50/20 dark:bg-red-950/10" : ""
                                    }`}
                                  >
                                    {/* Date */}
                                    <td className="px-3.5 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                                      {d.date}
                                    </td>

                                    {/* Status Badge */}
                                    <td className="px-3.5 py-2.5">
                                      <span
                                        className={`px-2 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 border ${
                                          isMatch
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/60"
                                            : isMismatch
                                              ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800/60"
                                              : isPending
                                                ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-800/60"
                                                : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                                        }`}
                                      >
                                        {isMatch ? t("✓ Synced") : isMismatch ? t("⚠ Discrepancy") : isPending ? t("⏳ Syncing") : t("○ No Activity")}
                                      </span>
                                    </td>

                                    {/* Campaigns */}
                                    <td className="px-3.5 py-2.5">
                                      <div className="font-bold text-slate-900 dark:text-slate-100">
                                        {formatReconNumber(d.campaigns?.totalDocs || 0)} {t("docs")}
                                      </div>
                                      <div className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
                                        {t("Spend")}: {formatReconCurrency(d.campaigns?.totalSpend)}
                                      </div>
                                    </td>

                                    {/* Ad Groups */}
                                    <td className="px-3.5 py-2.5 font-semibold text-slate-800 dark:text-slate-200">
                                      {formatReconNumber(d.adGroups?.totalDocs || 0)} {t("docs")}
                                    </td>

                                    {/* Targeting */}
                                    <td className="px-3.5 py-2.5">
                                      <div className="font-bold text-slate-900 dark:text-slate-100">
                                        {formatReconNumber(d.targeting?.totalDocs || 0)} {t("docs")}
                                      </div>
                                      <div className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
                                        {t("Spend:")} {formatReconCurrency(d.targeting?.totalSpend)}
                                      </div>
                                    </td>

                                    {/* Spend Match Comparison */}
                                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                                      {d.campaigns?.totalSpend > 0 && d.targeting?.totalSpend === 0 ? (
                                        <span className="text-red-600 dark:text-red-400 font-bold text-[11px]">
                                          ❌ {t("Targeting Spend")} {formatReconCurrency(0)}
                                        </span>
                                      ) : d.spendMatches ? (
                                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                                          ✓ {t("Matches")} {d.spendDelta ? `(${formatReconCurrency(d.spendDelta)} ${t("diff")})` : `(${t("Exact")})`}
                                        </span>
                                      ) : (
                                        <span className="text-amber-600 dark:text-amber-400 font-semibold text-[11px]">
                                          ▲ {formatReconCurrency(d.spendDelta)} {t("variance")}
                                        </span>
                                      )}
                                    </td>

                                    {/* Amazon SP-API Reports */}
                                    <td className="px-3.5 py-2.5">
                                      <div className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                        {formatReconNumber(d.reports?.completed || 0)} / {formatReconNumber(d.reports?.total || 0)} {t("Done")}
                                      </div>
                                      {d.reports?.failed > 0 && (
                                        <span className="bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800/80 px-2 py-0.5 rounded text-[11px] font-bold mt-1 inline-block whitespace-nowrap">
                                          ⚠ {d.reports.failed} {t("Failed on Amazon")}
                                        </span>
                                      )}
                                      {d.reports?.pending > 0 && (
                                        <span className="text-sky-600 dark:text-sky-400 block text-[11px] mt-0.5 whitespace-nowrap">
                                          {d.reports.pending} {t("generating")}
                                        </span>
                                      )}
                                    </td>

                                    {/* Diagnosis & Action */}
                                    <td className="px-3.5 py-2.5">
                                      {hasFailedReports ? (
                                        <div>
                                          <div className="text-red-600 dark:text-red-400 font-semibold text-[11px]">
                                            {t("Amazon SP-API failed {{count}} report requests.", { count: d.failedReports.length })}
                                          </div>
                                          <button
                                            onClick={() => setExpandedFailedDate(isExpanded ? null : d.date)}
                                            className={`mt-1 px-2 py-1 border rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                                              isExpanded
                                                ? "bg-red-50 border-red-300 text-red-700 dark:bg-red-950/50 dark:border-red-800 dark:text-red-300"
                                                : "bg-slate-100 border-slate-300 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                                            }`}
                                          >
                                            {isExpanded ? t("▲ Hide Failed Reports") : t("▼ View {{count}} Failed Reports", { count: d.failedReports.length })}
                                          </button>
                                        </div>
                                      ) : isMatch ? (
                                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                                          ✓ {t("100% Ingested & Matched")}
                                        </span>
                                      ) : (
                                        <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                                          {d.status === "NO_DATA" ? t("No activity") : t("Sync in progress")}
                                        </span>
                                      )}
                                    </td>
                                  </tr>

                                  {/* Expandable Failed Reports Drawer */}
                                  {isExpanded && hasFailedReports && (
                                    <tr className="bg-red-50/50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/50">
                                      <td colSpan={8} className="p-3.5 sm:p-4">
                                        <div className="text-xs font-bold text-red-800 dark:text-red-300 mb-2">
                                          {t("Failed Amazon SP-API Reports for {{date}} (Data dropped on Amazon's end):", { date: d.date })}
                                        </div>
                                        <table className="w-full border-collapse text-[11px] bg-white dark:bg-slate-900 rounded-md overflow-hidden border border-red-200 dark:border-red-900/50">
                                          <thead>
                                            <tr className="bg-red-100/70 dark:bg-red-950/60 text-left text-red-800 dark:text-red-300">
                                              <th className="px-2.5 py-1.5 font-semibold">{t("Amazon Report ID")}</th>
                                              <th className="px-2.5 py-1.5 font-semibold">{t("Report Type")}</th>
                                              <th className="px-2.5 py-1.5 font-semibold">{t("Ad Product")}</th>
                                              <th className="px-2.5 py-1.5 font-semibold">{t("Amazon Status")}</th>
                                              <th className="px-2.5 py-1.5 font-semibold">{t("Failure Time")}</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {d.failedReports.map((fr, idx) => (
                                              <tr key={fr.reportId || idx} className="border-b border-red-100 dark:border-red-900/30">
                                                <td className="px-2.5 py-1.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                                                  {fr.reportId}
                                                </td>
                                                <td className="px-2.5 py-1.5 font-semibold text-slate-800 dark:text-slate-200">{fr.reportName}</td>
                                                <td className="px-2.5 py-1.5 text-slate-500 dark:text-slate-400">{fr.adProduct}</td>
                                                <td className="px-2.5 py-1.5">
                                                  <span className="bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                    {fr.status}
                                                  </span>
                                                </td>
                                                <td className="px-2.5 py-1.5 text-slate-500 dark:text-slate-400">
                                                  {fr.updatedAt ? new Date(fr.updatedAt).toLocaleTimeString() : "-"}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 2: RAW AMAZON SP-API GENERATED REPORTS LOG */}
              {reconModalTab === "reports" && (
                <div>
                  <div className="flex justify-between items-center mb-3 flex-wrap gap-2.5">
                    <div className="text-[13px] text-slate-500 dark:text-slate-400">
                      {t("Showing historical Amazon SP-API report files requested and delivered for this store.")}
                    </div>

                    {/* Pagination Controls */}
                    <div className="flex items-center gap-2.5 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500 dark:text-slate-400">{t("Rows per page")}:</span>
                        <select
                          value={reconReportLimit}
                          onChange={(e) => handleReconLimitChange(Number(e.target.value))}
                          className="px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                        </select>
                      </div>

                      {recon15DaysData?.reportsHistory?.pagination && (
                        <span className="text-slate-700 dark:text-slate-300 font-semibold">
                          {t("Showing")} {((recon15DaysData.reportsHistory.pagination.page - 1) * recon15DaysData.reportsHistory.pagination.limit) + 1} -{" "}
                          {Math.min(
                            recon15DaysData.reportsHistory.pagination.page * recon15DaysData.reportsHistory.pagination.limit,
                            recon15DaysData.reportsHistory.pagination.totalCount
                          )}{" "}
                          {t("of")} {formatReconNumber(recon15DaysData.reportsHistory.pagination.totalCount)} {t("reports")}
                        </span>
                      )}

                      <div className="flex gap-1 items-center">
                        <button
                          onClick={() => handleReconPageChange(reconReportPage - 1)}
                          disabled={reconReportPage <= 1 || reconLoading}
                          className={`px-2.5 py-1 rounded-md border text-xs font-semibold flex items-center gap-0.5 transition-colors ${
                            reconReportPage <= 1 || reconLoading
                              ? "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                              : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                          }`}
                        >
                          <CaretLeft size={14} weight="bold" /> {t("Prev")}
                        </button>
                        <span className="px-2.5 py-1 rounded-md bg-slate-900 dark:bg-blue-600 text-white text-xs font-bold">
                          {t("Page")} {reconReportPage} {t("of")} {recon15DaysData?.reportsHistory?.pagination?.totalPages || 1}
                        </span>
                        <button
                          onClick={() => handleReconPageChange(reconReportPage + 1)}
                          disabled={
                            reconReportPage >= (recon15DaysData?.reportsHistory?.pagination?.totalPages || 1) || reconLoading
                          }
                          className={`px-2.5 py-1 rounded-md border text-xs font-semibold flex items-center gap-0.5 transition-colors ${
                            reconReportPage >= (recon15DaysData?.reportsHistory?.pagination?.totalPages || 1) || reconLoading
                              ? "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                              : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                          }`}
                        >
                          {t("Next")} <CaretRight size={14} weight="bold" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/70 text-left border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold">
                          <th className="px-3 py-2.5">{t("Amazon Report ID")}</th>
                          <th className="px-3 py-2.5">{t("Report Type")}</th>
                          <th className="px-3 py-2.5">{t("Ad Product")}</th>
                          <th className="px-3 py-2.5">{t("Date Window")}</th>
                          <th className="px-3 py-2.5">{t("Amazon Status")}</th>
                          <th className="px-3 py-2.5">{t("Verified Rows Ingested")}</th>
                          <th className="px-3 py-2.5">{t("Delivered At")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {((recon15DaysData?.reportsHistory?.docs || selectedReconcileProfile.latestReports || [])).length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-slate-500 dark:text-slate-400">
                              {t("No report documents recorded in reports collection for this profile.")}
                            </td>
                          </tr>
                        ) : (
                          (recon15DaysData?.reportsHistory?.docs || selectedReconcileProfile.latestReports || []).map((r, i) => (
                            <tr key={r.reportId || i} className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-850/40 text-slate-800 dark:text-slate-200 transition-colors">
                              <td className="px-3 py-2.5 font-mono text-slate-900 dark:text-slate-100 font-semibold">
                                {r.reportId}
                              </td>
                              <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{r.reportName}</td>
                              <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{r.adProduct}</td>
                              <td className="px-3 py-2.5">{r.startDate} {t("to")} {r.endDate}</td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                                    r.status === "COMPLETED"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/60"
                                      : r.status === "FAILED"
                                        ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800/60"
                                        : "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-800/60"
                                  }`}
                                >
                                  {t(r.status)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200">
                                {r.verifiedRows != null ? formatReconNumber(r.verifiedRows) : "-"}
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                                {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : (r.createdAt ? new Date(r.createdAt).toLocaleString() : "-")}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Verdict */}
            <div
              className={`px-6 py-3 border-t flex items-center gap-2.5 shrink-0 transition-colors ${
                (recon15DaysData?.summary?.overallStatus || selectedReconcileProfile.syncStatus) === "HEALTHY"
                  ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300"
                  : "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300"
              }`}
            >
              {(recon15DaysData?.summary?.overallStatus || selectedReconcileProfile.syncStatus) === "HEALTHY" ? (
                <CheckCircle size={22} className="text-emerald-600 dark:text-emerald-400 shrink-0" weight="fill" />
              ) : (
                <WarningCircle size={22} className="text-red-600 dark:text-red-400 shrink-0" weight="fill" />
              )}
              <div className="text-[13px]">
                <strong>{t("Reconciliation Summary")}: </strong>
                {(recon15DaysData?.summary?.overallStatus || selectedReconcileProfile.syncStatus) === "HEALTHY"
                  ? t("Amazon SP-API report data is 100% verified across all 15 retention days. Document counts and spend match with zero drops.")
                  : (recon15DaysData?.summary?.mismatchedDays || 0) > 0
                    ? t("{{count}} of 15 retention day(s) detected with Amazon report generation failure or missing ingestion. Review the breakdown table above.", {
                        count: recon15DaysData.summary.mismatchedDays,
                      })
                    : selectedReconcileProfile.issues?.map((iss) => t(iss)).join(", ") || t("Data sync in progress. Check Redis staging buffer.")}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SyncDiagnostic;
