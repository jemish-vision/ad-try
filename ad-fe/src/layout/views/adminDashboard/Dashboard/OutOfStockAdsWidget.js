import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";
import { PackageX, ExternalLink, Search, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { ApiGetOutOfStockAds } from "../../../../api-wrapper/dashboard/ApiDashboard";
import { formatRegionalCurrency } from "../../../../utility/regionalNumberFormat";

const PER_PAGE = 10;
const VISIBLE_CAMPAIGNS = 2; // campaigns shown per product before "+N more"

/** URL of the campaign view (Campaigns page opens the campaign when campaignId is in the query). */
export const campaignViewUrl = (c) => {
  const params = new URLSearchParams();
  params.set("campaignId", String(c.campaignId));
  if (c.campaignName) params.set("campaignName", c.campaignName);
  params.set("type", c.adType || "SP");
  params.set("status", c.campaignStatus || "ENABLED");
  if (c.budget != null) params.set("budget", String(c.budget));
  if (c.budgetType) params.set("budgetType", c.budgetType);
  if (c.targetingType) params.set("targetingType", c.targetingType);
  if (c.startDate) params.set("startDate", c.startDate);
  if (c.endDate) params.set("endDate", c.endDate);
  return `/campaigns?${params.toString()}`;
};

/**
 * Dashboard: out-of-stock products that still have ads in running campaigns.
 * Data comes from the daily "Out Of Stock Ads" job; seller and vendor profiles only.
 */
export default function OutOfStockAdsWidget({ profileId, currencyCode, marketplace = "IN" }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState(null);
  const [pageNo, setPageNo] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [expanded, setExpanded] = useState(() => new Set()); // ASINs with all campaigns shown
  const toggleExpanded = (asin) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(asin)) next.delete(asin);
      else next.add(asin);
      return next;
    });

  useEffect(() => {
    const h = setTimeout(() => {
      setDebounced(search.trim());
      setPageNo(1);
    }, 350);
    return () => clearTimeout(h);
  }, [search]);

  useEffect(() => setPageNo(1), [profileId]);

  const fetchData = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    const r = await ApiGetOutOfStockAds({ profileId, pageNo, perPage: PER_PAGE, search: debounced });
    setRes(r?.isSuccess ? r : null);
    setLoading(false);
  }, [profileId, pageNo, debounced]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const rows = res?.data || [];
  const total = res?.totalRecords || 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const summary = res?.summary || { products: 0, campaigns: 0, spend7d: 0 };
  const lastChecked = useMemo(() => (res?.lastCheckedAt ? moment(res.lastCheckedAt).format("DD MMM YYYY, hh:mm A") : null), [res]);
  const money = (v) => formatRegionalCurrency(v || 0, currencyCode, marketplace);

  // Agency profiles (or a profile the API says isn't eligible): no section at all.
  if (res && res.available === false) return null;

  return (
    <div className="dg-root rounded-2xl p-5 mb-5 transition-all" id="dashboard-out-of-stock-ads">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200/60 dark:border-rose-800/40 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
            <PackageX className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-slate-900 dark:text-white tracking-tight">
              {t("Out-of-Stock Products in Running Ads")}
            </h3>
            <p className="text-[11.5px] text-slate-400 font-normal mt-0.5">
              {t("Products Amazon reports as out of stock that are still advertised in enabled campaigns.")}{" "}
              {lastChecked ? t("Checked daily · last check {{date}}", { date: lastChecked }) : t("Checked once a day")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="oos-ads-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search ASIN, SKU, product or campaign")}
              className="h-8 w-[300px] pl-8 pr-3 rounded-lg text-[12px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-400"
            />
          </div>
          <button
            type="button"
            onClick={fetchData}
            title={t("Refresh")}
            className="h-8 w-8 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 hover:text-blue-600 bg-white dark:bg-slate-900"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {[
          { label: t("Out-of-stock products"), value: summary.products },
          { label: t("Running campaigns affected"), value: summary.campaigns },
          { label: t("Ad spend on these products (last 7 days)"), value: money(summary.spend7d) },
        ].map((s) => (
          <div key={s.label} className="bg-slate-50/60 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.08] rounded-xl px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{s.label}</div>
            <div className="text-[18px] font-extrabold text-slate-900 dark:text-white mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.08] overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-semibold px-3 py-2.5 w-[42%] min-w-[280px]">{t("Product")}</th>
              <th className="text-left font-semibold px-3 py-2.5 min-w-[340px]">{t("Running in campaigns")}</th>
              <th className="text-right font-semibold px-3 py-2.5 whitespace-nowrap w-[110px]">{t("Spend (7d)")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length ? (
              <tr><td colSpan={3} className="px-3 py-8 text-center text-slate-400">{t("Loading...")}</td></tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-slate-400">
                  {debounced
                    ? t("No matching products.")
                    : lastChecked
                      ? t("No out-of-stock products in running ads.")
                      : t("No data yet. The list is built once a day.")}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const campaigns = row.campaigns || [];
                const isOpen = expanded.has(row.asin);
                const shown = isOpen ? campaigns : campaigns.slice(0, VISIBLE_CAMPAIGNS);
                const hidden = campaigns.length - shown.length;
                const spCount = campaigns.filter((c) => c.adType === "SP").length;
                const sdCount = campaigns.length - spCount;
                return (
                  <tr key={row.asin} className="border-t border-slate-200/80 dark:border-white/[0.06] align-top hover:bg-slate-50/60 dark:hover:bg-white/[0.02]">
                    {/* Product */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {row.imageUrl ? (
                          <img src={row.imageUrl} alt="" className="w-9 h-9 rounded-md object-contain bg-white border border-slate-200 dark:border-white/10 shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-md bg-slate-100 dark:bg-white/5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[520px]" title={row.title || ""}>{row.title || row.asin}</div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400">
                            <span className="px-1.5 py-px rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200/70 dark:border-rose-800/40">
                              {t("Out of stock")}
                            </span>
                            <span className="truncate">ASIN {row.asin}{row.sku ? ` · SKU ${row.sku}` : ""}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Campaigns: count + top campaigns as chips, the rest behind "+N more" */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 mb-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {campaigns.length === 1 ? t("1 campaign") : t("{{count}} campaigns", { count: campaigns.length })}
                        </span>
                        {spCount > 0 && <span className="px-1.5 rounded bg-slate-100 dark:bg-white/[0.06]">SP {spCount}</span>}
                        {sdCount > 0 && <span className="px-1.5 rounded bg-slate-100 dark:bg-white/[0.06]">SD {sdCount}</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {shown.map((c) => (
                          <a
                            key={`${c.adType}-${c.campaignId}`}
                            href={campaignViewUrl(c)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`${c.campaignName || c.campaignId} — ${t("Open campaign in a new tab")}`}
                            className="group inline-flex items-center gap-1.5 max-w-[260px] h-6 pl-1 pr-2 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:border-blue-400 dark:hover:border-blue-500/60 transition-colors"
                          >
                            <span className={`px-1 rounded text-[9.5px] font-bold ${c.adType === "SD" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"}`}>
                              {c.adType}
                            </span>
                            <span className="truncate text-[12px] font-medium text-blue-600 dark:text-blue-400 group-hover:underline">{c.campaignName || c.campaignId}</span>
                            {c.spend7d > 0 && <span className="text-[10.5px] text-slate-400 shrink-0">{money(c.spend7d)}</span>}
                            <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-blue-500 shrink-0" />
                          </a>
                        ))}
                        {campaigns.length > VISIBLE_CAMPAIGNS && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(row.asin)}
                            className="h-6 px-2 rounded-md text-[11.5px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/10"
                          >
                            {isOpen ? t("Show less") : t("+{{count}} more", { count: hidden })}
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">{money(row.spend7d)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > PER_PAGE && (
        <div className="flex items-center justify-between mt-3 text-[12px] text-slate-500">
          <span>
            {t("Showing {{from}}–{{to}} of {{total}}", { from: (pageNo - 1) * PER_PAGE + 1, to: Math.min(pageNo * PER_PAGE, total), total })}
          </span>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={pageNo <= 1} onClick={() => setPageNo((p) => p - 1)}
              className="h-7 w-7 rounded-md border border-slate-200 dark:border-white/10 flex items-center justify-center disabled:opacity-40">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span>{pageNo} / {totalPages}</span>
            <button type="button" disabled={pageNo >= totalPages} onClick={() => setPageNo((p) => p + 1)}
              className="h-7 w-7 rounded-md border border-slate-200 dark:border-white/10 flex items-center justify-center disabled:opacity-40">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
