import React from "react";
import { AlertTriangle, Inbox, Info, RefreshCw } from "lucide-react";
import { friendlyText } from "./reportDisplay";

export function ReportEmptyState({ message = "No data found matching your query or filter criteria." }) {
  return (
    <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-slate-900/40 text-center">
      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 mb-2">
        <Inbox size={16} />
      </div>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
        No Matching Records
      </span>
      <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 max-w-xs">
        {friendlyText(message)}
      </span>
    </div>
  );
}

// Not an error — this is an informational note explaining why this exact view
// can't be shown, and (via the follow-up buttons below) what the user can do instead.
// Styled calm/neutral, never a red "failure" box.
export function ReportUnavailableState({
  reason = "I can't build this exact view right now.",
  hasSuggestions = false,
  onRetry,
}) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-800/40 text-left">
      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-300 shrink-0 mt-0.5">
        <Info size={16} />
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Here's what I can tell you
        </span>
        <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {friendlyText(reason)}
        </span>
        {hasSuggestions && (
          <span className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 font-medium">
            Pick a suggestion below to see what I can show instead.
          </span>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 self-start inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <RefreshCw size={11} /> Try again
          </button>
        )}
      </div>
    </div>
  );
}

const INTERNAL_FILTER = /VERIFIED_IMPORT_COVERAGE|SOURCE_COMPLETENESS|ROWS_NOT_FROM_COMPLETED|NEWER_INCOMPLETE|NO_COMPLETED_IMPORT|requested metric inputs|conflict-free source rows|verified data completeness/i;

export function ReportWarningsBanner() {
  return null;
}
