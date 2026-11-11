import React from "react";
import moment from "moment-timezone";

export const BID_TO_BID = "bid-to-bid";

export function getBidAcosRangeLabel(row) {
  if (!row?.bidAcosFrom || !row?.bidAcosTo) return "";
  const firstDay = moment.utc(row.bidAcosFrom, "YYYY-MM-DD", true);
  const lastDay = moment.utc(row.bidAcosTo, "YYYY-MM-DD", true).subtract(1, "day");
  if (!firstDay.isValid() || !lastDay.isValid() || lastDay.isBefore(firstDay)) return "";
  const start = firstDay.format("DD/MM/YYYY");
  return lastDay.isSame(firstDay) ? start : `${start} – ${lastDay.format("DD/MM/YYYY")}`;
}

export function BidAcosRange({ row }) {
  const label = getBidAcosRangeLabel(row);
  return label ? (
    <span className="block whitespace-nowrap text-[10px] leading-tight text-slate-500 dark:text-slate-400">
      {label}
    </span>
  ) : null;
}
