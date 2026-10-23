import React from "react";
import { Sparkles } from "lucide-react";

export default function ReportFollowUps({
  followUps = [],
  onFollowUp,
}) {
  if (!Array.isArray(followUps) || followUps.length === 0 || !onFollowUp) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5 pt-2 border-t border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
        <Sparkles size={11} className="text-blue-500" />
        <span>Suggested follow-ups:</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {followUps.map((item, idx) => {
          const label = item?.label || (typeof item === "string" ? item : "Details");
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onFollowUp(item)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/80 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:border-blue-300 transition-all cursor-pointer shadow-2xs"
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
