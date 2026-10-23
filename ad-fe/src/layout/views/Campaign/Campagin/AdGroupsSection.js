import React, { useState, useEffect, useCallback, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment-timezone";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import {
  ApiGetAdGroupsByCampaign,
  ApiGetProductAdsByAdGroup,
} from "../../../../api-wrapper/campaign/ApiCampaign";
import CurrencyCode from "../../../../helper/currencyCode/CurrencyCode";
import CurrencyFormat from "../../../../helper/currencyCode/CurrencyFormat";
import { Switch } from "../../../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { ChevronDown, ChevronRight, Search, RefreshCw, ExternalLink, Package, Layers, Info } from "lucide-react";
import { Toast } from "../../../../helper/links/Link";
import { AppTooltip } from "../../../../components/ui/AppTooltip";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// ─── Status Badge Component ──────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const normalized = (status || "").toUpperCase();
  let bgClass = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700";
  let dotClass = "bg-slate-400";
  let label = status || "-";

  if (normalized === "ENABLED" || normalized === "DELIVERING") {
    bgClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60";
    dotClass = "bg-emerald-500 animate-pulse";
    label = normalized === "ENABLED" ? "Delivering" : status;
  } else if (normalized === "PAUSED") {
    bgClass = "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60";
    dotClass = "bg-amber-500";
    label = "Paused";
  } else if (normalized === "ARCHIVED" || normalized === "ENDED") {
    bgClass = "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800/60";
    dotClass = "bg-rose-500";
    label = "Archived";
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${bgClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
};

// ─── Nested Product Ads Sub-Table ────────────────────────────────────────────
const NestedProductAdsTable = ({
  adGroup,
  campaignId,
  date,
  profileId,
  today,
}) => {
  const { t } = useTranslation();
  const [ads, setAds] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalRow, setTotalRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const fetchAds = useCallback(async () => {
    if (!profileId?.value || !adGroup?.adGroupId) return;
    setLoading(true);
    try {
      const fromDate = date?.[0] ? moment(date[0]).format("YYYY-MM-DD") : today;
      const toDate = date?.[1] ? moment(date[1]).format("YYYY-MM-DD") : today;

      const payload = {
        profileId: profileId.value,
        campaignId: Number(campaignId) || campaignId,
        fromDate,
        toDate,
        pageNo: page,
        perPage: perPage,
        ...(statusFilter !== "ALL" && { status: statusFilter }),
        ...(search.trim() && { searchName: search.trim() }),
      };

      const res = await ApiGetProductAdsByAdGroup(adGroup.adGroupId, payload);
      if (res?.isSuccess) {
        setAds(res.getProductAdsData || []);
        setTotalRecords(res.totalProductAdsData || 0);
        setTotalRow(res.totalRow || null);
      } else {
        setAds([]);
        setTotalRecords(0);
        setTotalRow(null);
      }
    } catch (err) {
      setAds([]);
    } finally {
      setLoading(false);
    }
  }, [profileId?.value, adGroup?.adGroupId, campaignId, date, today, page, perPage, statusFilter, search]);

  useEffect(() => {
    fetchAds();
  }, [fetchAds]);

  const totalPages = Math.ceil(totalRecords / perPage) || 1;

  return (
    <div className="p-4 bg-slate-50/80 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner my-2">
      {/* Sub-table Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <h6 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider m-0">
              {t("Ads / Products in Ad Group")}: <span className="text-sky-600 dark:text-sky-400 normal-case font-semibold">{adGroup.name}</span>
            </h6>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {totalRecords} {totalRecords === 1 ? t("product ad") : t("product ads")}
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sub Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t("Search ads...")}
              className="h-8 pl-8 pr-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 w-[180px]"
            />
          </div>

          {/* Sub Status */}
          <div className="w-[120px]">
            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                <SelectValue placeholder={t("Status")} />
              </SelectTrigger>
              <SelectContent className="z-[99999]">
                <SelectItem value="ALL">{t("All Statuses")}</SelectItem>
                <SelectItem value="ENABLED">{t("Delivering")}</SelectItem>
                <SelectItem value="PAUSED">{t("Paused")}</SelectItem>
                <SelectItem value="ARCHIVED">{t("Archived")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchAds}
            className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            title={t("Refresh Ads")}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-sky-500" : ""}`} />
          </button>
        </div>
      </div>

      {/* Sub-table Content */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 shadow-sm">
        <table className="w-full text-xs text-left border-collapse border border-slate-200 dark:border-slate-700">
          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-3 py-2.5 text-center w-12 border-r border-b border-slate-200 dark:border-slate-700">{t("Active")}</th>
              <th className="px-3 py-2.5 min-w-[280px] border-r border-b border-slate-200 dark:border-slate-700">{t("Ad Name / Product")}</th>
              <th className="px-3 py-2.5 text-center border-r border-b border-slate-200 dark:border-slate-700">{t("Status")}</th>
              <th className="px-3 py-2.5 min-w-[150px] border-r border-b border-slate-200 dark:border-slate-700">{t("SKU / ASIN")}</th>
              <th className="px-3 py-2.5 text-right border-r border-b border-slate-200 dark:border-slate-700">{t("Total cost")}</th>
              <th className="px-3 py-2.5 text-right border-r border-b border-slate-200 dark:border-slate-700">{t("Purchases")}</th>
              <th className="px-3 py-2.5 text-right border-r border-b border-slate-200 dark:border-slate-700">{t("Sales")}</th>
              <th className="px-3 py-2.5 text-right border-r border-b border-slate-200 dark:border-slate-700">{t("ROAS")}</th>
              <th className="px-3 py-2.5 text-right border-r border-b border-slate-200 dark:border-slate-700">{t("Clicks")}</th>
              <th className="px-3 py-2.5 text-right border-r border-b border-slate-200 dark:border-slate-700">{t("Impressions")}</th>
              <th className="px-3 py-2.5 text-right border-r border-b border-slate-200 dark:border-slate-700">{t("CPC")}</th>
              <th className="px-3 py-2.5 text-right border-r border-b border-slate-200 dark:border-slate-700">{t("CTR")}</th>
              <th className="px-3 py-2.5 text-right border-b border-slate-200 dark:border-slate-700">{t("ACOS")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {loading ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <i className="fa-solid fa-circle-notch fa-spin text-xl text-sky-500" />
                    <span className="text-xs font-semibold">{t("Loading products in ad group...")}</span>
                  </div>
                </td>
              </tr>
            ) : !ads.length ? (
              <tr>
                <td colSpan={13} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  {t("No products found for this ad group.")}
                </td>
              </tr>
            ) : (
              <>
                {ads.map((ad, idx) => (
                  <tr key={ad.adId || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                    <td className="px-3 py-2 text-center border-r border-b border-slate-200 dark:border-slate-700/70">
                      <Switch
                        checked={ad.status === "ENABLED"}
                        disabled
                        className="scale-75 data-[state=checked]:bg-sky-500"
                      />
                    </td>
                    <td className="px-3 py-2 border-r border-b border-slate-200 dark:border-slate-700/70">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {ad.imageUrl ? (
                            <img src={ad.imageUrl} alt={ad.productName || "Product"} className="w-full h-full object-contain" />
                          ) : (
                            <Package className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-800 dark:text-slate-200 text-xs truncate max-w-[280px]" title={ad.productName}>
                            {ad.productName || "-"}
                          </p>
                          {ad.price ? (
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              {CurrencyCode(ad.price)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center border-r border-b border-slate-200 dark:border-slate-700/70">
                      <StatusBadge status={ad.status} />
                    </td>
                    <td className="px-3 py-2 border-r border-b border-slate-200 dark:border-slate-700/70">
                      <div className="flex flex-col">
                        <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[140px]" title={ad.sku}>
                          {ad.sku || "-"}
                        </span>
                        {ad.asin ? (
                          <a
                            href={`https://www.amazon.in/dp/${ad.asin}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1 font-mono"
                          >
                            {ad.asin}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-medium border-r border-b border-slate-200 dark:border-slate-700/70">{ad.totalSpend ? CurrencyCode(ad.totalSpend) : "-"}</td>
                    <td className="px-3 py-2 text-right border-r border-b border-slate-200 dark:border-slate-700/70">{ad.totalOrders ? CurrencyFormat(ad.totalOrders) : "-"}</td>
                    <td className="px-3 py-2 text-right font-medium border-r border-b border-slate-200 dark:border-slate-700/70">{ad.totalSales ? CurrencyCode(ad.totalSales) : "-"}</td>
                    <td className="px-3 py-2 text-right border-r border-b border-slate-200 dark:border-slate-700/70">{ad.totalRoas || "-"}</td>
                    <td className="px-3 py-2 text-right border-r border-b border-slate-200 dark:border-slate-700/70">{ad.totalClicks ? CurrencyFormat(ad.totalClicks) : "-"}</td>
                    <td className="px-3 py-2 text-right border-r border-b border-slate-200 dark:border-slate-700/70">{ad.totalImpressions ? CurrencyFormat(ad.totalImpressions) : "-"}</td>
                    <td className="px-3 py-2 text-right border-r border-b border-slate-200 dark:border-slate-700/70">{ad.totalCpc ? CurrencyCode(ad.totalCpc) : "-"}</td>
                    <td className="px-3 py-2 text-right border-r border-b border-slate-200 dark:border-slate-700/70">{ad.totalCtr ? `${ad.totalCtr}%` : "-"}</td>
                    <td className="px-3 py-2 text-right border-b border-slate-200 dark:border-slate-700/70">{ad.totalAcos ? `${ad.totalAcos}%` : "-"}</td>
                  </tr>
                ))}

                {/* Sub-Table Total Row */}
                {totalRow ? (
                  <tr className="bg-slate-100/90 dark:bg-[#1e293b] font-bold border-t-2 border-b-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white">
                    <td colSpan={4} className="px-3 py-2.5 text-center border-r border-slate-200 dark:border-slate-700">
                      {t("Total (Products)")}
                    </td>
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 dark:border-slate-700">{CurrencyCode(totalRow.totalSpend)}</td>
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 dark:border-slate-700">{CurrencyFormat(totalRow.totalOrders || 0)}</td>
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 dark:border-slate-700">{CurrencyCode(totalRow.totalSales)}</td>
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 dark:border-slate-700">{totalRow.totalRoas || "-"}</td>
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 dark:border-slate-700">{CurrencyFormat(totalRow.totalClicks || 0)}</td>
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 dark:border-slate-700">{CurrencyFormat(totalRow.totalImpressions || 0)}</td>
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 dark:border-slate-700">{CurrencyCode(totalRow.totalCpc)}</td>
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 dark:border-slate-700">{totalRow.totalCtr != null ? `${totalRow.totalCtr}%` : "-"}</td>
                    <td className="px-3 py-2.5 text-right">{totalRow.totalAcos != null ? `${totalRow.totalAcos}%` : "-"}</td>
                  </tr>
                ) : null}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Sub-Table Pagination */}
      {totalRecords > perPage ? (
        <div className="flex items-center justify-between mt-2.5 text-xs text-slate-500">
          <span>
            {t("Showing")} {(page - 1) * perPage + 1} - {Math.min(page * perPage, totalRecords)} {t("of")} {totalRecords}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
            >
              {t("Prev")}
            </button>
            <span className="px-2 font-semibold text-slate-700 dark:text-slate-300">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
            >
              {t("Next")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

// ─── Main AdGroups Section Component ─────────────────────────────────────────
export default function AdGroupsSection({
  campaignDetails,
  date,
  viewPress,
}) {
  const { t } = useTranslation();
  const { profileId, today, selectedAdType } = useContext(ProfileContext);

  const [adGroups, setAdGroups] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalRow, setTotalRow] = useState(null);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sortField, setSortField] = useState("totalSpend");
  const [sortOrder, setSortOrder] = useState("DESC");

  // Set of expanded adGroupId keys
  const [expandedRowIds, setExpandedRowIds] = useState(new Set());

  const toggleRow = (adGroupId) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(adGroupId)) {
        next.delete(adGroupId);
      } else {
        next.add(adGroupId);
      }
      return next;
    });
  };

  const fetchAdGroups = useCallback(async () => {
    if (!profileId?.value || !campaignDetails?.campaignId || !selectedAdType) return;
    setLoading(true);
    try {
      const fromDate = date?.[0] ? moment(date[0]).format("YYYY-MM-DD") : today;
      const toDate = date?.[1] ? moment(date[1]).format("YYYY-MM-DD") : today;

      const payload = {
        profileId: profileId.value,
        fromDate,
        toDate,
        pageNo: currentPage,
        perPage: perPage,
        fieldName: sortField,
        sortType: sortOrder,
        ...(statusFilter !== "ALL" && { status: statusFilter }),
        ...(search.trim() && { searchName: search.trim() }),
      };

      const res = await ApiGetAdGroupsByCampaign(campaignDetails.campaignId, payload);
      if (res?.isSuccess) {
        setAdGroups(res.getAdGroupsData || []);
        setTotalRecords(res.totalAdGroupData || 0);
        setTotalRow(res.totalRow || null);
      } else {
        setAdGroups([]);
        setTotalRecords(0);
        setTotalRow(null);
      }
    } catch (err) {
      setAdGroups([]);
    } finally {
      setLoading(false);
    }
  }, [profileId?.value, campaignDetails?.campaignId, selectedAdType, date, today, currentPage, perPage, sortField, sortOrder, statusFilter, search]);

  useEffect(() => {
    fetchAdGroups();
  }, [fetchAdGroups, viewPress]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "ASC" ? "DESC" : "ASC"));
    } else {
      setSortField(field);
      setSortOrder("DESC");
    }
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalRecords / perPage) || 1;

  return (
    <div className="ad-groups-block w-full overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-sm">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h5 className="font-bold text-slate-900 dark:text-white text-sm m-0">
              {t("Ad Groups")}
            </h5>
            <p className="text-xs text-slate-500 dark:text-slate-400 m-0">
              {totalRecords} {totalRecords === 1 ? t("ad group available") : t("ad groups available")}
            </p>
          </div>
        </div>

        {/* Right Actions: Search, Filter, Refresh */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={t("Find an ad group...")}
              className="h-9 pl-9 pr-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 w-[220px] transition"
            />
          </div>

          {/* Status Filter */}
          <div className="w-[140px]">
            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-9 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl">
                <SelectValue placeholder={t("Status")} />
              </SelectTrigger>
              <SelectContent className="z-[99999]">
                <SelectItem value="ALL">{t("All Statuses")}</SelectItem>
                <SelectItem value="ENABLED">{t("Delivering")}</SelectItem>
                <SelectItem value="PAUSED">{t("Paused")}</SelectItem>
                <SelectItem value="ARCHIVED">{t("Archived")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchAdGroups}
            className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            title={t("Refresh Ad Groups")}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-sky-500" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Ad Groups Data Table ── */}
      <div className="overflow-x-auto bg-transparent">
        <table className="w-full text-sm text-left border-collapse border-b border-slate-200 dark:border-slate-700">
          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-200 dark:border-slate-700 select-none">
            <tr>
              <th className="px-3 py-3 w-10 text-center border-r border-b border-slate-200 dark:border-slate-700"></th>
              <th className="px-3 py-3 text-center w-14 border-r border-b border-slate-200 dark:border-slate-700">{t("Active")}</th>
              <th
                className="px-4 py-3 min-w-[200px] cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition border-r border-b border-slate-200 dark:border-slate-700"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center gap-1">
                  {t("Ad group name")}
                  <AppTooltip title={t("The name of the ad group in this campaign")} placement="top">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                  </AppTooltip>
                </div>
              </th>
              <th className="px-3 py-3 text-center border-r border-b border-slate-200 dark:border-slate-700">{t("Status")}</th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-sky-600 transition border-r border-b border-slate-200 dark:border-slate-700"
                onClick={() => handleSort("defaultBid")}
              >
                {t("Default bid")}
              </th>
              <th
                className="px-3 py-3 text-center cursor-pointer hover:text-sky-600 transition border-r border-b border-slate-200 dark:border-slate-700"
                onClick={() => handleSort("totalTargets")}
              >
                <div className="flex items-center justify-center gap-1">
                  {t("Total targets")}
                  <AppTooltip title={t("Number of targeting keywords/products in this ad group")} placement="top">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                  </AppTooltip>
                </div>
              </th>
              <th
                className="px-3 py-3 text-center cursor-pointer hover:text-sky-600 transition border-r border-b border-slate-200 dark:border-slate-700"
                onClick={() => handleSort("totalProducts")}
              >
                <div className="flex items-center justify-center gap-1">
                  {t("Products")}
                  <AppTooltip title={t("Number of product ads in this ad group")} placement="top">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                  </AppTooltip>
                </div>
              </th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-sky-600 transition border-r border-b border-slate-200 dark:border-slate-700"
                onClick={() => handleSort("totalSpend")}
              >
                {t("Total cost")}
              </th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-sky-600 transition border-r border-b border-slate-200 dark:border-slate-700"
                onClick={() => handleSort("totalOrders")}
              >
                {t("Purchases")}
              </th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-sky-600 transition border-r border-b border-slate-200 dark:border-slate-700"
                onClick={() => handleSort("totalSales")}
              >
                {t("Sales")}
              </th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-sky-600 transition border-r border-b border-slate-200 dark:border-slate-700"
                onClick={() => handleSort("totalRoas")}
              >
                {t("ROAS")}
              </th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-sky-600 transition border-r border-b border-slate-200 dark:border-slate-700"
                onClick={() => handleSort("totalClicks")}
              >
                {t("Clicks")}
              </th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-sky-600 transition border-r border-b border-slate-200 dark:border-slate-700"
                onClick={() => handleSort("totalImpressions")}
              >
                {t("Impressions")}
              </th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-sky-600 transition border-r border-b border-slate-200 dark:border-slate-700"
                onClick={() => handleSort("totalCpc")}
              >
                {t("CPC")}
              </th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-sky-600 transition border-r border-b border-slate-200 dark:border-slate-700"
                onClick={() => handleSort("totalCtr")}
              >
                {t("CTR")}
              </th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-sky-600 transition border-b border-slate-200 dark:border-slate-700"
                onClick={() => handleSort("totalAcos")}
              >
                {t("ACOS")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {loading ? (
              <tr>
                <td colSpan={16} className="px-4 py-16 text-center text-slate-500 dark:text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-sky-500" />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {t("Loading ad groups...")}
                    </span>
                  </div>
                </td>
              </tr>
            ) : !adGroups.length ? (
              <tr>
                <td colSpan={16} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Layers className="w-8 h-8 text-slate-300 dark:text-slate-700" />
                    <p className="font-semibold text-sm m-0">{t("No ad groups found")}</p>
                    <span className="text-xs text-slate-400">{t("There are no ad groups matching the selected criteria.")}</span>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {adGroups.map((ag) => {
                  const isExpanded = expandedRowIds.has(ag.adGroupId);
                  return (
                    <React.Fragment key={ag.adGroupId}>
                      <tr
                        className={`transition-colors ${
                          isExpanded
                            ? "bg-sky-50/40 dark:bg-sky-950/20 font-medium"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        }`}
                      >
                        {/* Expand chevron column */}
                        <td className="px-3 py-3 text-center border-r border-b border-slate-200 dark:border-slate-700/70">
                          <button
                            type="button"
                            onClick={() => toggleRow(ag.adGroupId)}
                            className="p-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition"
                            title={isExpanded ? t("Collapse") : t("Expand ads")}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </td>

                        {/* Active toggle */}
                        <td className="px-3 py-3 text-center border-r border-b border-slate-200 dark:border-slate-700/70">
                          <Switch
                            checked={ag.status === "ENABLED"}
                            disabled
                            className="scale-75 data-[state=checked]:bg-sky-500"
                          />
                        </td>

                        {/* Name */}
                        <td className="px-4 py-3 border-r border-b border-slate-200 dark:border-slate-700/70">
                          <div
                            onClick={() => toggleRow(ag.adGroupId)}
                            className="cursor-pointer text-slate-900 dark:text-slate-100 font-semibold hover:text-sky-600 dark:hover:text-sky-400 transition flex items-center gap-1.5"
                          >
                            <span>{ag.name || "-"}</span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3 text-center border-r border-b border-slate-200 dark:border-slate-700/70">
                          <StatusBadge status={ag.status} />
                        </td>

                        {/* Default bid */}
                        <td className="px-3 py-3 text-right font-medium border-r border-b border-slate-200 dark:border-slate-700/70">
                          {ag.defaultBid ? CurrencyCode(ag.defaultBid) : "-"}
                        </td>

                        {/* Total targets */}
                        <td className="px-3 py-3 text-center font-semibold text-sky-600 dark:text-sky-400 border-r border-b border-slate-200 dark:border-slate-700/70">
                          {ag.totalTargets || 0}
                        </td>

                        {/* Products count */}
                        <td className="px-3 py-3 text-center font-semibold text-indigo-600 dark:text-indigo-400 border-r border-b border-slate-200 dark:border-slate-700/70">
                          {ag.totalProducts || 0}
                        </td>

                        {/* Performance metrics */}
                        <td className="px-3 py-3 text-right font-semibold border-r border-b border-slate-200 dark:border-slate-700/70">{CurrencyCode(ag.totalSpend)}</td>
                        <td className="px-3 py-3 text-right border-r border-b border-slate-200 dark:border-slate-700/70">{CurrencyFormat(ag.totalOrders || 0)}</td>
                        <td className="px-3 py-3 text-right font-semibold border-r border-b border-slate-200 dark:border-slate-700/70">{CurrencyCode(ag.totalSales)}</td>
                        <td className="px-3 py-3 text-right border-r border-b border-slate-200 dark:border-slate-700/70">{ag.totalRoas || "-"}</td>
                        <td className="px-3 py-3 text-right border-r border-b border-slate-200 dark:border-slate-700/70">{CurrencyFormat(ag.totalClicks || 0)}</td>
                        <td className="px-3 py-3 text-right border-r border-b border-slate-200 dark:border-slate-700/70">{CurrencyFormat(ag.totalImpressions || 0)}</td>
                        <td className="px-3 py-3 text-right border-r border-b border-slate-200 dark:border-slate-700/70">{CurrencyCode(ag.totalCpc)}</td>
                        <td className="px-3 py-3 text-right border-r border-b border-slate-200 dark:border-slate-700/70">{ag.totalCtr != null ? `${ag.totalCtr}%` : "-"}</td>
                        <td className="px-3 py-3 text-right border-b border-slate-200 dark:border-slate-700/70">{ag.totalAcos != null ? `${ag.totalAcos}%` : "-"}</td>
                      </tr>

                      {/* Expanded Sub-Row */}
                      {isExpanded ? (
                        <tr>
                          <td colSpan={16} className="p-3 bg-slate-100/50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700">
                            <NestedProductAdsTable
                              adGroup={ag}
                              campaignId={campaignDetails?.campaignId}
                              date={date}
                              profileId={profileId}
                              today={today}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}

                {/* Total Summary Row */}
                {totalRow ? (
                  <tr className="bg-slate-100/90 dark:bg-[#1e293b] font-bold border-t-2 border-b-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white">
                    <td colSpan={4} className="px-4 py-3 text-center font-bold border-r border-slate-200 dark:border-slate-700">
                      {t("Total: ")} {totalRecords}
                    </td>
                    <td className="px-3 py-3 text-right border-r border-slate-200 dark:border-slate-700">-</td>
                    <td className="px-3 py-3 text-center border-r border-slate-200 dark:border-slate-700">
                      {adGroups.reduce((acc, curr) => acc + (curr.totalTargets || 0), 0)}
                    </td>
                    <td className="px-3 py-3 text-center border-r border-slate-200 dark:border-slate-700">
                      {adGroups.reduce((acc, curr) => acc + (curr.totalProducts || 0), 0)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold border-r border-slate-200 dark:border-slate-700">{CurrencyCode(totalRow.totalSpend)}</td>
                    <td className="px-3 py-3 text-right font-bold border-r border-slate-200 dark:border-slate-700">{CurrencyFormat(totalRow.totalOrders || 0)}</td>
                    <td className="px-3 py-3 text-right font-bold border-r border-slate-200 dark:border-slate-700">{CurrencyCode(totalRow.totalSales)}</td>
                    <td className="px-3 py-3 text-right font-bold border-r border-slate-200 dark:border-slate-700">{totalRow.totalRoas || "-"}</td>
                    <td className="px-3 py-3 text-right font-bold border-r border-slate-200 dark:border-slate-700">{CurrencyFormat(totalRow.totalClicks || 0)}</td>
                    <td className="px-3 py-3 text-right font-bold border-r border-slate-200 dark:border-slate-700">{CurrencyFormat(totalRow.totalImpressions || 0)}</td>
                    <td className="px-3 py-3 text-right font-bold border-r border-slate-200 dark:border-slate-700">{CurrencyCode(totalRow.totalCpc)}</td>
                    <td className="px-3 py-3 text-right font-bold border-r border-slate-200 dark:border-slate-700">{totalRow.totalCtr != null ? `${totalRow.totalCtr}%` : "-"}</td>
                    <td className="px-3 py-3 text-right font-bold">{totalRow.totalAcos != null ? `${totalRow.totalAcos}%` : "-"}</td>
                  </tr>
                ) : null}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Table Pagination ── */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span>{t("Rows per page:")}</span>
          <div className="w-[70px]">
            <Select
              value={String(perPage)}
              onValueChange={(val) => {
                setPerPage(Number(val));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[99999]">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span>
            {t("Showing")} {(currentPage - 1) * perPage + 1} - {Math.min(currentPage * perPage, totalRecords)} {t("of")} {totalRecords}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            {t("Previous")}
          </button>
          <span className="px-2 font-semibold text-slate-700 dark:text-slate-300">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            {t("Next")}
          </button>
        </div>
      </div>
    </div>
  );
}
