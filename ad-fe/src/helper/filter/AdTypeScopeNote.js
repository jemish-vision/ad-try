import React from "react";
import { AD_TYPE_ALL, isShowingAllAdTypes } from "./adTypeAll";

// SP / SB / SD pill. Colours match the chatbot report table
// (helper/chatbot/reporting/ReportTable.js) so the two surfaces read alike.
const BADGE_CLASSES = {
  SP: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  SB: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  SD: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
};

const TYPE_LABELS = { SP: "Sponsored Products", SB: "Sponsored Brands", SD: "Sponsored Display" };

export function AdTypeBadge({ type }) {
  const t = String(type || "").toUpperCase();
  const cls = BADGE_CLASSES[t] || "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold tracking-wider border ${cls}`}
      title={TYPE_LABELS[t] || t}
    >
      {t || "—"}
    </span>
  );
}

// A small banner shown only while the combined "All" view is active, telling the
// user the grid is merged across ad types — and, where Sponsored Display has no
// data for the view (keywords / search terms / placements), that SD is omitted.
//   selectedAdType  the dropdown selection (ProfileContext.selectedAdType)
//   excludedAdTypes response.excludedAdTypes (e.g. ["SD"]) when the backend
//                   dropped a type for this view
//   pathname        current route (defaults to window.location.pathname)
export function AdTypeScopeNote({ selectedAdType, excludedAdTypes, pathname }) {
  const path = pathname || (typeof window !== "undefined" ? window.location.pathname : "");
  if (!isShowingAllAdTypes(path, selectedAdType)) return null;

  const excluded = Array.isArray(excludedAdTypes) ? excludedAdTypes.map((x) => String(x).toUpperCase()) : [];
  const shown = ["SP", "SB", "SD"].filter((x) => !excluded.includes(x));

  return (
    <div
      className="flex items-center flex-wrap gap-2 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg"
      role="status"
    >
      <span className="font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {AD_TYPE_ALL}
      </span>
      <span className="flex items-center gap-1.5">
        Showing combined data across
        {shown.map((x) => (
          <AdTypeBadge key={x} type={x} />
        ))}
      </span>
      {excluded.length > 0 && (
        <span className="text-slate-500 dark:text-slate-400">
          — no {excluded.map((x) => TYPE_LABELS[x] || x).join(", ")} data for this view.
        </span>
      )}
    </div>
  );
}

export default AdTypeScopeNote;
