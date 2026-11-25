import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock, Hourglass } from "lucide-react";
import { FEATURE_LABELS, formatCredits, formatTokens, creditLevel } from "../../../helper/aiCredits/aiCredits";

export const ACCENT = "#2374F2";

/** Tracks the app's light/dark theme (data-theme on <html>). */
export function useIsDark() {
  const read = () => typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark";
  const [isDark, setIsDark] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export const Card = ({ id, className = "", children }) => (
  <div id={id} className={`dg-root rounded-2xl border border-slate-100 dark:border-white/5 p-5 ${className}`}>
    {children}
  </div>
);

export const CardHeader = ({ icon, title, subtitle, right }) => (
  <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
    <div className="flex items-start gap-2.5 min-w-0">
      {icon && (
        <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <h3 className="text-[14px] font-bold text-slate-900 dark:text-white tracking-tight m-0">{title}</h3>
        {subtitle && <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 mb-0">{subtitle}</p>}
      </div>
    </div>
    {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
  </div>
);

export const StatTile = ({ id, label, value, sub, tone = "default" }) => {
  const valueTone = { default: "text-slate-900 dark:text-white", warning: "text-amber-600 dark:text-amber-400", danger: "text-rose-600 dark:text-rose-400" }[tone];
  return (
    <div id={id} className="bg-slate-50/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.08] rounded-xl px-4 py-3 min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 leading-snug">{label}</div>
      <div className={`text-[20px] font-extrabold mt-0.5 tabular-nums truncate ${valueTone}`}>{value}</div>
      {sub && <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
};

/** Available credits as a hero number with a used / allowance bar. */
export function CreditMeter({ wallet, enforcementEnabled = true }) {
  const { t, i18n } = useTranslation();
  const level = enforcementEnabled ? creditLevel(wallet) : "ok";
  const pct = wallet.allocated > 0 ? Math.min(100, (wallet.used / wallet.allocated) * 100) : 0;
  const bar = { ok: "bg-[#2374F2]", low: "bg-amber-500", empty: "bg-rose-500" }[level];
  const daysLeft = Math.max(0, Math.ceil(moment(wallet.nextResetAt).diff(moment(), "days", true)));
  return (
    <div id="ai-credits-meter" className="min-w-0">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("Available credits")}</div>
      <div className="flex items-baseline gap-2 flex-wrap mt-1">
        <span className={`text-[40px] leading-none font-extrabold tabular-nums ${level === "empty" ? "text-rose-600 dark:text-rose-400" : level === "low" ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}>
          {formatCredits(wallet.available, i18n.language)}
        </span>
        <span className="text-[14px] text-slate-500 dark:text-slate-400">/ {formatCredits(wallet.allocated, i18n.language)}</span>
      </div>
      <div
        className="mt-3 h-2.5 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={t("Credits used this month")}
      >
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between gap-2 flex-wrap text-[12px] text-slate-500 dark:text-slate-400 mt-1.5">
        <span>{t("{{used}} used ({{pct}}%)", { used: formatCredits(wallet.used, i18n.language), pct: Math.round(pct) })}</span>
        <span>{t("Refills on {{date}} · in {{days}} days", { date: moment(wallet.nextResetAt).format("DD MMM YYYY"), days: daysLeft })}</span>
      </div>
      {level === "empty" && <p className="mt-2 mb-0 text-[12px] font-medium text-rose-600 dark:text-rose-400">{t("AI features are paused until the credits refill or an administrator adds more.")}</p>}
      {level === "low" && <p className="mt-2 mb-0 text-[12px] font-medium text-amber-600 dark:text-amber-400">{t("Fewer than 20% of this month's credits are left.")}</p>}
    </div>
  );
}

/** Credits used per day (single series). */
export function DailyUsageChart({ byDay = [], periodStart, periodEnd, height = 220 }) {
  const { t, i18n } = useTranslation();
  const isDark = useIsDark();
  // Fill every day of the period up to today so gaps show as zero
  const days = [];
  if (periodStart) {
    const end = moment.min(moment(periodEnd).subtract(1, "day"), moment());
    const map = new Map(byDay.map((d) => [d.date, d]));
    for (let d = moment.utc(periodStart); d.isSameOrBefore(end, "day"); d.add(1, "day")) {
      const key = d.format("YYYY-MM-DD");
      days.push({ date: key, label: d.format("DD MMM"), credits: map.get(key)?.credits || 0, requests: map.get(key)?.requests || 0 });
    }
  }
  if (!days.some((d) => d.credits > 0)) {
    return <div className="flex items-center justify-center text-[13px] text-slate-400" style={{ height }}>{t("No AI usage yet this month.")}</div>;
  }
  const axis = isDark ? "#94a3b8" : "#64748b";
  return (
    <div style={{ height }} role="img" aria-label={t("Credits used per day")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={days} margin={{ top: 6, right: 4, left: -12, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={isDark ? "rgba(255,255,255,0.06)" : "#eef2f7"} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
          <YAxis tick={{ fontSize: 11, fill: axis }} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(35,116,242,0.06)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-[12px] shadow-md">
                  <div className="font-semibold text-slate-900 dark:text-white">{payload[0].payload.label}</div>
                  <div className="text-slate-600 dark:text-slate-300">{t("{{amount}} credits", { amount: formatCredits(payload[0].payload.credits, i18n.language) })}</div>
                  <div className="text-slate-500 dark:text-slate-400">{t("{{n}} AI requests", { n: payload[0].payload.requests })}</div>
                </div>
              ) : null
            }
          />
          <Bar dataKey="credits" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Credits per feature as proportional bars. */
export function FeatureBreakdown({ byFeature = [] }) {
  const { t, i18n } = useTranslation();
  const total = byFeature.reduce((s, f) => s + f.credits, 0);
  if (!byFeature.length) return <p className="text-[13px] text-slate-400 m-0">{t("No AI usage yet this month.")}</p>;
  return (
    <ul className="space-y-3.5 m-0 p-0 list-none">
      {byFeature.map((f) => {
        const pct = total > 0 ? (f.credits / total) * 100 : 0;
        return (
          <li key={f.feature}>
            <div className="flex justify-between gap-2 text-[12.5px]">
              <span className="font-semibold text-slate-800 dark:text-slate-100">{t(FEATURE_LABELS[f.feature] || f.feature)}</span>
              <span className="tabular-nums text-slate-600 dark:text-slate-300">{formatCredits(f.credits, i18n.language)} · {Math.round(pct)}%</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full bg-[#2374F2]" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1">
              {t("{{n}} requests · {{input}} input / {{output}} output tokens", { n: f.requests, input: formatTokens(f.inputTokens, i18n.language), output: formatTokens(f.outputTokens, i18n.language) })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Pager({ pageNo, perPage, total, onPage }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (total <= perPage) return null;
  const btn = "h-7 w-7 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-slate-300 disabled:opacity-40 bg-white dark:bg-slate-900";
  return (
    <div className="flex items-center justify-end gap-2 pt-3 text-[12px] text-slate-500 dark:text-slate-400">
      <span>{t("Page {{page}} of {{pages}}", { page: pageNo, pages })}</span>
      <button type="button" className={btn} disabled={pageNo <= 1} onClick={() => onPage(pageNo - 1)} aria-label={t("Previous page")}>
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={btn} disabled={pageNo >= pages} onClick={() => onPage(pageNo + 1)} aria-label={t("Next page")}>
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export const Select = ({ id, value, onChange, options, label }) => (
  <select
    id={id}
    aria-label={label}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="h-8 px-2.5 rounded-lg text-[12px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 outline-none focus:border-blue-400"
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

const STATUS = {
  SETTLED: { label: "Charged", icon: CheckCircle2, cls: "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40" },
  RELEASED: { label: "Not charged", icon: XCircle, cls: "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-white/[0.06]" },
  EXPIRED: { label: "Expired", icon: Hourglass, cls: "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-white/[0.06]" },
  RESERVED: { label: "Running", icon: Clock, cls: "text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/40" },
};

const TX = {
  ALLOCATION: { label: "Monthly allowance" },
  RESET: { label: "Month closed" },
  DEDUCTION: { label: "AI usage" },
  ADJUSTMENT: { label: "Admin adjustment" },
};

const th = "text-left font-semibold px-3 py-2.5 whitespace-nowrap";
const td = "px-3 py-2.5 align-top";

const TableShell = ({ loading, empty, cols, children, emptyText, minWidth = 720 }) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.08] overflow-x-auto">
      <table className="w-full text-[12.5px]" style={{ minWidth }}>
        <thead className="bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400">
          <tr>{cols.map((c) => <th key={c.key} className={`${th} ${c.right ? "text-right" : ""}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-200">
          {loading && empty ? (
            <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-slate-400" role="status">{t("Loading...")}</td></tr>
          ) : empty ? (
            <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-slate-400">{emptyText}</td></tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
};

/** AI requests: when, feature, who, models, tokens, credits, outcome. */
export function UsageTable({ rows = [], loading, showOrganization = false }) {
  const { t, i18n } = useTranslation();
  const cols = [
    { key: "when", label: t("Date") },
    ...(showOrganization ? [{ key: "org", label: t("Organization") }] : []),
    { key: "feature", label: t("Feature") },
    { key: "user", label: t("User") },
    { key: "model", label: t("Model") },
    { key: "in", label: t("Input tokens"), right: true },
    { key: "out", label: t("Output tokens"), right: true },
    { key: "credits", label: t("Credits"), right: true },
    { key: "status", label: t("Status") },
  ];
  return (
    <TableShell loading={loading} empty={!rows.length} cols={cols} emptyText={t("No AI requests yet.")} minWidth={showOrganization ? 1040 : 920}>
      {rows.map((r) => {
        const s = STATUS[r.status] || STATUS.RELEASED;
        const Icon = s.icon;
        return (
          <tr key={r._id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
            <td className={`${td} whitespace-nowrap`}>{moment(r.createdAt).format("DD MMM YYYY, hh:mm A")}</td>
            {showOrganization && <td className={td}>{r.organization?.name || "—"}</td>}
            <td className={`${td} whitespace-nowrap`}>{t(FEATURE_LABELS[r.feature] || r.feature)}</td>
            <td className={`${td} whitespace-nowrap`}>{r.user?.name || "—"}</td>
            <td className={`${td} font-mono text-[11.5px] whitespace-nowrap`}>{r.models?.length ? r.models.join(", ") : "—"}</td>
            <td className={`${td} text-right tabular-nums`}>{(r.inputTokens || 0).toLocaleString(i18n.language)}</td>
            <td className={`${td} text-right tabular-nums`}>{(r.outputTokens || 0).toLocaleString(i18n.language)}</td>
            <td className={`${td} text-right tabular-nums font-semibold`}>{r.status === "SETTLED" ? formatCredits(r.credits, i18n.language) : "—"}</td>
            <td className={td}>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${s.cls}`} title={r.failureReason || undefined}>
                <Icon className="w-3 h-3" aria-hidden="true" />
                {t(s.label)}
              </span>
              {r.enforced === false && <div className="text-[10.5px] text-slate-400 mt-0.5">{t("Limits paused")}</div>}
            </td>
          </tr>
        );
      })}
    </TableShell>
  );
}

/** Credit ledger: allocations, month closes, usage and admin adjustments. */
export function TransactionsTable({ rows = [], loading }) {
  const { t, i18n } = useTranslation();
  const cols = [
    { key: "when", label: t("Date") },
    { key: "type", label: t("Type") },
    { key: "details", label: t("Details") },
    { key: "change", label: t("Change"), right: true },
    { key: "balance", label: t("Balance after"), right: true },
  ];
  return (
    <TableShell loading={loading} empty={!rows.length} cols={cols} emptyText={t("No credit history yet.")}>
      {rows.map((r) => (
        <tr key={r._id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
          <td className={`${td} whitespace-nowrap`}>{moment(r.createdAt).format("DD MMM YYYY, hh:mm A")}</td>
          <td className={`${td} whitespace-nowrap font-medium`}>{t(TX[r.type]?.label || r.type)}</td>
          <td className={td}>
            {[r.feature ? t(FEATURE_LABELS[r.feature] || r.feature) : null, r.note, r.user?.name ? t("by {{name}}", { name: r.user.name }) : null].filter(Boolean).join(" · ") || "—"}
          </td>
          <td className={`${td} text-right tabular-nums font-semibold ${r.credits > 0 ? "text-emerald-600 dark:text-emerald-400" : r.credits < 0 ? "text-slate-700 dark:text-slate-200" : ""}`}>
            {r.credits > 0 ? "+" : ""}
            {formatCredits(r.credits, i18n.language)}
          </td>
          <td className={`${td} text-right tabular-nums`}>{r.balanceAfter === null || r.balanceAfter === undefined ? "—" : formatCredits(r.balanceAfter, i18n.language)}</td>
        </tr>
      ))}
    </TableShell>
  );
}

export const USAGE_STATUS_OPTIONS = (t) => [
  { value: "", label: t("All statuses") },
  { value: "SETTLED", label: t("Charged") },
  { value: "RELEASED", label: t("Not charged") },
  { value: "EXPIRED", label: t("Expired") },
];
export const FEATURE_OPTIONS = (t) => [{ value: "", label: t("All features") }, ...Object.entries(FEATURE_LABELS).map(([value, label]) => ({ value, label: t(label) }))];
export const TX_TYPE_OPTIONS = (t) => [{ value: "", label: t("All types") }, ...Object.entries(TX).map(([value, v]) => ({ value, label: t(v.label) }))];
