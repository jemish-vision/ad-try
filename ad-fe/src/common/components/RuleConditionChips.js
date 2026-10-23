import React from "react";
import { useTranslation } from "react-i18next";
import { conditionOperators } from "../../layout/views/budgetRule/column";

const DATE_FILTER_LABELS = {
  TODAY: "Today",
  YESTERDAY: "Yesterday",
  LAST_7_DAYS: "Last 7 days",
  THIS_WEEK: "This week",
  LAST_WEEK: "Last week",
  LAST_30_DAYS: "Last 30 days",
  THIS_MONTH: "This month",
  LAST_MONTH: "Last month",
  YEAR_TO_DATE: "Year to date",
  LIFETIME: "Lifetime",
};

export default function RuleConditionChips({ conditions = [], reportDate, toDate, maxVisible = 6 }) {
  const { t } = useTranslation();

  const condList = Array.isArray(conditions) ? conditions : [];
  const isReportDate = Boolean(reportDate && DATE_FILTER_LABELS[reportDate]);

  if (!condList.length && !isReportDate) {
    return null;
  }

  const renderConditionChip = (cond, index) => {
    const conditionType = cond?.conditionType || cond?.type || "";
    if (!conditionType) return null;

    const isStatus = String(conditionType).toLowerCase().includes("status");
    const isDate = String(conditionType).toLowerCase().includes("date") || String(conditionType).toLowerCase().includes("creation");

    // Campaigns & AdGroups
    if (conditionType === "CampaignsAndAdGroups") {
      const camps = cond?.campaigns || [];
      const groups = cond?.adGroups || [];
      return (
        <React.Fragment key={index}>
          {camps.map((c, i) => (
            <span key={`c-${i}`} className="rule-chip rule-chip-day" style={{ fontSize: "10.5px", padding: "1px 7px" }}>
              {c.label || c.name || c}
            </span>
          ))}
          {groups.map((g, i) => (
            <span key={`g-${i}`} className="rule-chip rule-chip-day" style={{ fontSize: "10.5px", padding: "1px 7px" }}>
              {g.label || g.name || g}
            </span>
          ))}
        </React.Fragment>
      );
    }

    // Targeting Type
    if (conditionType === "TargetingType") {
      const types = cond?.targetingTypes || [];
      return (
        <React.Fragment key={index}>
          {types.map((tgt, i) => (
            <span key={i} className="rule-chip rule-chip-day" style={{ fontSize: "10.5px", padding: "1px 7px" }}>
              {tgt}
            </span>
          ))}
        </React.Fragment>
      );
    }

    // Status type
    if (cond?.conditionStatus) {
      return (
        <span
          key={index}
          className={`rule-chip rule-chip-condition ${isStatus ? "status" : isDate ? "date" : "other"}`}
          style={{ fontSize: "10.5px", padding: "1px 7px", lineHeight: "1.3" }}
        >
          <i className="fa fa-info-circle mr-1" style={{ fontSize: "9px", opacity: 0.7 }}></i>
          <strong>{t(conditionType)}:</strong>&nbsp;{t(cond.conditionStatus)}
        </span>
      );
    }

    const operatorObj = conditionOperators?.find((x) => x.key === cond?.conditionOperator);
    const operatorSymbol = operatorObj ? operatorObj.value : cond?.conditionOperator || "";
    const valueTypeSuffix =
      conditionType === "Top of Search IS"
        ? "%"
        : cond?.conditionValueType === "Percentage"
        ? "%"
        : "";

    // BETWEEN condition
    if (cond?.conditionOperator === "BETWEEN") {
      return (
        <span
          key={index}
          className={`rule-chip rule-chip-condition ${isStatus ? "status" : isDate ? "date" : "other"}`}
          style={{ fontSize: "10.5px", padding: "1px 7px", lineHeight: "1.3" }}
        >
          <i className="fa fa-exchange me-1" style={{ fontSize: "9px", opacity: 0.7 }}></i>
          <strong>{t(conditionType)}</strong>&nbsp;{cond.conditionValue} - {cond.conditionMaxValue}{valueTypeSuffix}
        </span>
      );
    }

    const displayVal = cond?.useTargetAcos
      ? `${t("Target ACOS")} (${cond.conditionValue})`
      : cond?.conditionValue ?? "";

    return (
      <span
        key={index}
        className={`rule-chip rule-chip-condition ${isStatus ? "status" : isDate ? "date" : "other"}`}
        style={{ fontSize: "10.5px", padding: "1px 7px", lineHeight: "1.3" }}
      >
        <i className={`fa ${isDate ? "fa-calendar" : "fa-bar-chart"} me-1`} style={{ fontSize: "9px", opacity: 0.7 }}></i>
        <strong>{t(conditionType)}</strong>&nbsp;{operatorSymbol}&nbsp;{displayVal}{valueTypeSuffix}
      </span>
    );
  };

  const visibleConds = condList.slice(0, maxVisible);
  const remainingCount = condList.length - maxVisible;

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {isReportDate && (
        <span className="rule-chip rule-chip-date" style={{ fontSize: "10.5px", padding: "1px 7px", lineHeight: "1.3" }}>
          <i className="fa fa-calendar-check-o me-1" style={{ fontSize: "9px" }}></i>
          <b>{t("Date:")} </b>&nbsp;{t(DATE_FILTER_LABELS[reportDate] || reportDate)} {toDate ? `(${toDate})` : ""}
        </span>
      )}
      {visibleConds.map((c, i) => renderConditionChip(c, i))}
      {remainingCount > 0 && (
        <span className="rule-chip text-muted text-xs px-1" style={{ fontSize: "10px" }}>
          +{remainingCount} {t("more")}
        </span>
      )}
    </div>
  );
}
