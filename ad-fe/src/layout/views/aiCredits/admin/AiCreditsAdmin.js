import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";
import { Sparkles, RefreshCw, Search, Building2, BarChart3, PieChart, Cpu, Trophy, Eye, SlidersHorizontal, PlusCircle } from "lucide-react";
import Toast from "../../../../common/helper/toast/Toast";
import {
  ApiAdminAiCreditOverview,
  ApiAdminAiCreditOrganizations,
  ApiAdminAiCreditUsage,
  ApiAdminAiCreditSettings,
  ApiAdminUpdateAiCreditSettings,
  ApiAdminAdjustAiCredits,
  ApiAdminSetAiMonthlyLimit,
} from "../../../../api-wrapper/ApiAiCredits";
import { formatCredits, formatTokens, creditLevel } from "../../../../helper/aiCredits/aiCredits";
import { Card, CardHeader, StatTile, DailyUsageChart, FeatureBreakdown, UsageTable, Pager, Select, FEATURE_OPTIONS, USAGE_STATUS_OPTIONS } from "../aiCreditComponents";
import { AdjustCreditsModal, MonthlyLimitModal, OrganizationCreditsModal } from "./AiCreditAdminModals";
import AiCreditSettingsForm from "./AiCreditSettingsForm";

const PER_PAGE = 10;
const TABS = [
  ["overview", "Overview"],
  ["organizations", "Organizations"],
  ["usage", "Usage log"],
  ["settings", "Settings"],
];
const SOURCE = { PLAN: "Plan", OVERRIDE: "Custom", DEFAULT: "Standard" };

function Overview({ reloadKey }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  useEffect(() => {
    ApiAdminAiCreditOverview({}).then((r) => setData(r?.isSuccess ? r.data : null));
  }, [reloadKey]);
  if (!data) return <div role="status" className="space-y-5">{[120, 280].map((h) => <div key={h} className="animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[0.04]" style={{ height: h }} />)}</div>;
  const L = i18n.language;
  const { start, end } = { start: moment.utc().startOf("month"), end: moment.utc().startOf("month").add(1, "month") };
  return (
    <div className="space-y-5" id="ai-credit-admin-overview">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatTile label={t("Credits used")} value={formatCredits(data.totals.credits, L)} sub={t("This month, all organizations")} />
        <StatTile label={t("AI requests")} value={data.totals.requests.toLocaleString(L)} sub={t("{{charged}} charged · {{failed}} not charged", { charged: data.totals.charged, failed: data.totals.failed })} />
        <StatTile label={t("Input tokens")} value={formatTokens(data.totals.inputTokens, L)} />
        <StatTile label={t("Output tokens")} value={formatTokens(data.totals.outputTokens, L)} />
        <StatTile label={t("Active wallets")} value={data.wallets.active.toLocaleString(L)} sub={t("{{used}} of {{allocated}} credits used", { used: formatCredits(data.wallets.used, L), allocated: formatCredits(data.wallets.allocated, L) })} />
        <StatTile label={t("Low or empty")} value={`${data.wallets.low} / ${data.wallets.exhausted}`} sub={t("Under 20% left / none left")} tone={data.wallets.exhausted ? "danger" : data.wallets.low ? "warning" : "default"} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader icon={<BarChart3 className="w-3.5 h-3.5" />} title={t("Credits used per day")} subtitle={t("All organizations, this month")} />
          <DailyUsageChart byDay={data.byDay} periodStart={start.toISOString()} periodEnd={end.toISOString()} />
        </Card>
        <Card>
          <CardHeader icon={<PieChart className="w-3.5 h-3.5" />} title={t("By feature")} subtitle={t("Credits used this month")} />
          <FeatureBreakdown byFeature={data.byFeature} />
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader icon={<Cpu className="w-3.5 h-3.5" />} title={t("By AI model")} subtitle={t("Top 10 by credits")} />
          <SimpleTable
            cols={[t("Model"), t("Calls"), t("Input tokens"), t("Output tokens"), t("Credits")]}
            rows={data.byModel.map((m) => [<span className="font-mono text-[11.5px]">{m.model}</span>, m.calls.toLocaleString(L), formatTokens(m.inputTokens, L), formatTokens(m.outputTokens, L), formatCredits(m.credits, L)])}
            empty={t("No AI usage yet this month.")}
          />
        </Card>
        <Card>
          <CardHeader icon={<Trophy className="w-3.5 h-3.5" />} title={t("Top organizations")} subtitle={t("Most credits used this month")} />
          <SimpleTable
            cols={[t("Organization"), t("Requests"), t("Credits")]}
            rows={data.topOrganizations.map((o) => [o.name || "—", o.requests.toLocaleString(L), formatCredits(o.credits, L)])}
            empty={t("No AI usage yet this month.")}
          />
        </Card>
      </div>
    </div>
  );
}

const SimpleTable = ({ cols, rows, empty }) => (
  <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.08] overflow-x-auto">
    <table className="w-full text-[12.5px] min-w-[480px]">
      <thead className="bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400">
        <tr>{cols.map((c, i) => <th key={c} className={`px-3 py-2.5 font-semibold ${i ? "text-right" : "text-left"}`}>{c}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-200">
        {rows.length ? rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`px-3 py-2.5 ${j ? "text-right tabular-nums" : ""}`}>{c}</td>)}</tr>) : <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-slate-400">{empty}</td></tr>}
      </tbody>
    </table>
  </div>
);

function Organizations({ reloadKey, settings, onChanged }) {
  const { t, i18n } = useTranslation();
  const L = i18n.language;
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sortBy, setSortBy] = useState("used");
  const [pageNo, setPageNo] = useState(1);
  const [res, setRes] = useState({ data: [], totalRecords: 0 });
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ type: null, org: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const h = setTimeout(() => {
      setDebounced(search.trim());
      setPageNo(1);
    }, 350);
    return () => clearTimeout(h);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await ApiAdminAiCreditOrganizations({ search: debounced, sortBy, sortOrder: sortBy === "name" ? "asc" : "desc", pageNo, perPage: PER_PAGE });
    setRes(r?.isSuccess ? r : { data: [], totalRecords: 0 });
    setLoading(false);
  }, [debounced, sortBy, pageNo]);
  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const save = async (fn, body, message) => {
    setSaving(true);
    const r = await fn(body);
    setSaving(false);
    if (r?.isSuccess) {
      Toast.success(t(message));
      setModal({ type: null, org: null });
      load();
      onChanged();
    } else Toast.error(r?.message || t("Something went wrong"));
  };

  const bar = { ok: "bg-[#2374F2]", low: "bg-amber-500", empty: "bg-rose-500" };
  const iconBtn = "h-7 w-7 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 hover:text-blue-600 bg-white dark:bg-slate-900";

  return (
    <Card id="ai-credit-admin-organizations">
      <CardHeader
        icon={<Building2 className="w-3.5 h-3.5" />}
        title={t("Organizations")}
        subtitle={t("Each organization shares one wallet across its team. Allowances come from the plan unless set here.")}
        right={
          <>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="ai-credit-org-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search organization")} className="h-8 w-[240px] pl-8 pr-3 rounded-lg text-[12px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-400" />
            </div>
            <Select id="ai-credit-org-sort" label={t("Sort by")} value={sortBy} onChange={(v) => { setSortBy(v); setPageNo(1); }} options={[{ value: "used", label: t("Most used") }, { value: "available", label: t("Most available") }, { value: "name", label: t("Name") }]} />
          </>
        }
      />
      <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.08] overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[980px]">
          <thead className="bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400">
            <tr>
              {[t("Organization"), t("Plan"), t("Monthly allowance"), t("Used this month"), t("Available"), t("Next reset"), t("Last used"), ""].map((c, i) => (
                <th key={i} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${i >= 2 && i <= 4 ? "text-right" : "text-left"}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-200">
            {loading && !res.data.length ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400" role="status">{t("Loading...")}</td></tr>
            ) : !res.data.length ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">{t("No organizations found.")}</td></tr>
            ) : (
              res.data.map((o) => {
                const level = creditLevel(o);
                const pct = o.allocated > 0 ? Math.min(100, (o.used / o.allocated) * 100) : 0;
                return (
                  <tr key={o.organizationId} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-white">{o.organizationName}</td>
                    <td className="px-3 py-2.5">{o.plan?.name || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {formatCredits(o.monthlyLimit, L)}{" "}
                      <span className={`ml-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold ${o.limitSource === "OVERRIDE" ? "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" : "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300"}`}>{t(SOURCE[o.limitSource])}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="tabular-nums">{formatCredits(o.used, L)}</div>
                      <div className="mt-1 h-1.5 w-24 ml-auto rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden"><div className={`h-full rounded-full ${bar[level]}`} style={{ width: `${pct}%` }} /></div>
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${level === "empty" ? "text-rose-600 dark:text-rose-400" : level === "low" ? "text-amber-600 dark:text-amber-400" : ""}`}>{formatCredits(o.available, L)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{moment(o.nextResetAt).format("DD MMM YYYY")}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{o.lastUsedAt ? moment(o.lastUsedAt).fromNow() : t("Never")}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" className={iconBtn} title={t("View usage")} aria-label={t("View usage")} onClick={() => setModal({ type: "view", org: o })}><Eye className="w-3.5 h-3.5" /></button>
                        <button type="button" className={iconBtn} title={t("Adjust credits")} aria-label={t("Adjust credits")} onClick={() => setModal({ type: "adjust", org: o })}><PlusCircle className="w-3.5 h-3.5" /></button>
                        <button type="button" className={iconBtn} title={t("Monthly AI credits")} aria-label={t("Monthly AI credits")} onClick={() => setModal({ type: "limit", org: o })}><SlidersHorizontal className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pager pageNo={pageNo} perPage={PER_PAGE} total={res.totalRecords} onPage={setPageNo} />

      <AdjustCreditsModal open={modal.type === "adjust"} org={modal.org} saving={saving} onClose={() => setModal({ type: null, org: null })} onSave={(b) => save(ApiAdminAdjustAiCredits, b, "Credits updated")} />
      <MonthlyLimitModal open={modal.type === "limit"} org={modal.org} defaultMonthlyCredits={settings?.defaultMonthlyCredits ?? 0} saving={saving} onClose={() => setModal({ type: null, org: null })} onSave={(b) => save(ApiAdminSetAiMonthlyLimit, b, "Monthly credits updated")} />
      <OrganizationCreditsModal open={modal.type === "view"} org={modal.org} reloadKey={reloadKey} onClose={() => setModal({ type: null, org: null })} />
    </Card>
  );
}

function UsageLog({ reloadKey }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({});
  const [pageNo, setPageNo] = useState(1);
  const [res, setRes] = useState({ data: [], totalRecords: 0 });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    ApiAdminAiCreditUsage({ ...filters, pageNo, perPage: PER_PAGE }).then((r) => {
      setRes(r?.isSuccess ? r : { data: [], totalRecords: 0 });
      setLoading(false);
    });
  }, [filters, pageNo, reloadKey]);
  const setFilter = (k, v) => {
    setFilters((f) => ({ ...f, [k]: v || undefined }));
    setPageNo(1);
  };
  return (
    <Card id="ai-credit-admin-usage">
      <CardHeader
        title={t("Usage log")}
        subtitle={t("Every AI request across all organizations, with its tokens, model and cost.")}
        right={
          <>
            <Select id="ai-credit-admin-feature" label={t("Feature")} value={filters.feature || ""} onChange={(v) => setFilter("feature", v)} options={FEATURE_OPTIONS(t)} />
            <Select id="ai-credit-admin-status" label={t("Status")} value={filters.status || ""} onChange={(v) => setFilter("status", v)} options={USAGE_STATUS_OPTIONS(t)} />
          </>
        }
      />
      <UsageTable rows={res.data} loading={loading} showOrganization />
      <Pager pageNo={pageNo} perPage={PER_PAGE} total={res.totalRecords} onPage={setPageNo} />
    </Card>
  );
}

/** Super Admin: AI credit settings, organization wallets and usage across the platform. */
export default function AiCreditsAdmin() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("overview");
  const [reloadKey, setReloadKey] = useState(0);
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(() => ApiAdminAiCreditSettings().then((r) => r?.isSuccess && setSettings(r.data)), []);
  useEffect(() => {
    loadSettings();
  }, [loadSettings, reloadKey]);

  const saveSettings = async (body) => {
    setSaving(true);
    const r = await ApiAdminUpdateAiCreditSettings(body);
    setSaving(false);
    if (r?.isSuccess) {
      Toast.success(t("AI credit settings saved"));
      setSettings(r.data);
    } else Toast.error(r?.message || t("Something went wrong"));
  };

  return (
    <div className="p-4 sm:p-6 pb-16 sm:pb-16 space-y-5" id="ai-credits-admin-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-slate-900 dark:text-white tracking-tight m-0">{t("AI Credit Management")}</h1>
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5 mb-0">{t("Token-to-credit rates, monthly allowances and AI usage for every organization. Wallets refill on the 1st of each month (UTC).")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {settings && settings.enforcementEnabled === false && <span className="px-2 py-1 rounded-full text-[11.5px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40">{t("Limits paused")}</span>}
          <button type="button" id="ai-credits-admin-refresh" title={t("Refresh")} onClick={() => setReloadKey((k) => k + 1)} className="h-8 w-8 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 hover:text-blue-600 bg-white dark:bg-slate-900">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="inline-flex flex-wrap rounded-xl border border-slate-200 dark:border-white/10 p-1 bg-white dark:bg-slate-900" role="tablist" id="ai-credits-admin-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`ai-credits-admin-tab-${k}`} aria-selected={tab === k} onClick={() => setTab(k)} className={`h-8 px-4 rounded-lg text-[12.5px] font-semibold transition-colors ${tab === k ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-sky-300" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>
            {t(label)}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview reloadKey={reloadKey} />}
      {tab === "organizations" && <Organizations reloadKey={reloadKey} settings={settings} onChanged={() => {}} />}
      {tab === "usage" && <UsageLog reloadKey={reloadKey} />}
      {tab === "settings" && <AiCreditSettingsForm settings={settings} saving={saving} onSave={saveSettings} />}
    </div>
  );
}
