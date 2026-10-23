import React from "react";

/**
 * Builds the URL for viewing a campaign in the Campaigns page.
 * @param {Object|string|number} campaignOrId - Row object containing campaign fields, or direct campaignId
 * @param {string} [name] - Fallback campaign name
 * @param {Object} [options] - Additional options (type, status, fromDate, toDate, etc.)
 * @returns {string} URL to View Campaign
 */
export const getCampaignViewUrl = (campaignOrId, name = "", options = {}) => {
  let campaignId = "";
  let campaignName = "";
  let type = "";
  let status = "";
  let budget = undefined;
  let budgetType = "";
  let startDate = "";
  let endDate = "";
  let targetingType = "";
  let fromDate = options.fromDate;
  let toDate = options.toDate;

  if (typeof campaignOrId === "object" && campaignOrId !== null) {
    campaignId =
      options.campaignId ||
      campaignOrId.campaignId ||
      campaignOrId.campaign_id ||
      (typeof campaignOrId.campaignDetails === "object" ? (campaignOrId.campaignDetails?.campaignId || campaignOrId.campaignDetails?.id) : "") ||
      "";

    // Only if it's a direct campaign row from Campaigns list (where budget/budgetType/startDate exist on campaign record)
    if (!campaignId && (campaignOrId.name || campaignOrId.campaignName) && (campaignOrId.budget !== undefined || campaignOrId.budgetType || campaignOrId.startDate) && (campaignOrId.id || campaignOrId._id)) {
      campaignId = campaignOrId.id || campaignOrId._id;
    }

    campaignName =
      campaignOrId.campaignName ||
      campaignOrId.name ||
      campaignOrId.campaign ||
      (typeof campaignOrId.campaignDetails === "object" ? (campaignOrId.campaignDetails?.name || campaignOrId.campaignDetails?.campaignName) : "") ||
      name ||
      options.campaignName ||
      "";
    type =
      campaignOrId.type ||
      campaignOrId.adType ||
      campaignOrId.campaignType ||
      (typeof campaignOrId.campaignDetails === "object" ? campaignOrId.campaignDetails?.type : "") ||
      options.type ||
      "";
    status =
      campaignOrId.status ||
      campaignOrId.campaignStatus ||
      (typeof campaignOrId.campaignDetails === "object" ? campaignOrId.campaignDetails?.status : "") ||
      options.status ||
      "";
    budget =
      campaignOrId.budget ??
      (typeof campaignOrId.campaignDetails === "object" ? campaignOrId.campaignDetails?.budget : undefined) ??
      options.budget;
    budgetType =
      campaignOrId.budgetType ||
      (typeof campaignOrId.campaignDetails === "object" ? campaignOrId.campaignDetails?.budgetType : "") ||
      options.budgetType ||
      "";
    startDate =
      campaignOrId.startDate ||
      (typeof campaignOrId.campaignDetails === "object" ? campaignOrId.campaignDetails?.startDate : "") ||
      options.startDate ||
      "";
    endDate =
      campaignOrId.endDate ||
      (typeof campaignOrId.campaignDetails === "object" ? campaignOrId.campaignDetails?.endDate : "") ||
      options.endDate ||
      "";
    targetingType =
      campaignOrId.targetingType ||
      campaignOrId.targeting ||
      (typeof campaignOrId.campaignDetails === "object" ? campaignOrId.campaignDetails?.targetingType : "") ||
      options.targetingType ||
      "";
  } else {
    campaignId = campaignOrId || options.campaignId || "";
    campaignName = name || options.campaignName || "";
    type = options.type || "";
    status = options.status || "";
    budget = options.budget;
    budgetType = options.budgetType || "";
    startDate = options.startDate || "";
    endDate = options.endDate || "";
    targetingType = options.targetingType || "";
  }

  const params = new URLSearchParams();
  if (campaignId) params.set("campaignId", String(campaignId));
  if (campaignName) params.set("campaignName", String(campaignName));
  if (type) params.set("type", String(type));
  if (status) params.set("status", String(status));
  if (budget !== undefined && budget !== null && budget !== "") params.set("budget", String(budget));
  if (budgetType) params.set("budgetType", String(budgetType));
  if (startDate) params.set("startDate", String(startDate));
  if (endDate) params.set("endDate", String(endDate));
  if (targetingType) params.set("targetingType", String(targetingType));
  if (fromDate) params.set("fromDate", String(fromDate));
  if (toDate) params.set("toDate", String(toDate));
  params.set("view", "true");

  return `/campaigns?${params.toString()}`;
};

/**
 * Opens Campaign View in a new browser tab/page.
 * @param {Object|string|number} campaignOrId
 * @param {string} [name]
 * @param {Object} [options]
 */
export const openCampaignViewInNewTab = (campaignOrId, name = "", options = {}) => {
  const url = getCampaignViewUrl(campaignOrId, name, options);
  window.open(url, "_blank", "noopener,noreferrer");
};

/**
 * Reusable cell component for rendering clickable campaign names in tables.
 */
export const CampaignNameCell = ({
  row,
  name,
  campaignId,
  showStatusDot = false,
  className = "",
  style = {},
  onClick,
}) => {
  const data = row || {};
  const cId =
    campaignId ||
    data.campaignId ||
    data.campaign_id ||
    (typeof data.campaignDetails === "object" ? (data.campaignDetails?.campaignId || data.campaignDetails?.id) : "");
  const displayName =
    name ||
    data.campaignName ||
    data.name ||
    data.campaign ||
    (typeof data.campaignDetails === "object" ? (data.campaignDetails?.name || data.campaignDetails?.campaignName) : "") ||
    "—";

  if (data.isTotalRow || displayName === "—" || displayName === "-" || !displayName) {
    return <span className={className} style={style}>{displayName}</span>;
  }

  const status = data.status || data.campaignStatus || (typeof data.campaignDetails === "object" ? data.campaignDetails?.status : "") || "";
  const statusClass =
    status === " " ? "cancelled"
      : status === "PAUSED" ? "pending"
        : status === "ENABLED" || status === "DELIVERING" ? "completed"
          : status === "ARCHIVED" ? "archived"
            : status === "OUT_OF_BUDGET" ? "outOfBudget"
              : "";

  const handleClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (onClick) {
      onClick(data, e);
      return;
    }
    openCampaignViewInNewTab(data, displayName, { campaignId: cId });
  };

  const url = getCampaignViewUrl(data, displayName, { campaignId: cId });

  return (
    <div
      className={`campaignStatus w-full flex items-center min-w-0 ${className}`}
      style={{ minWidth: 0, width: "100%", ...style }}
    >
      {showStatusDot && statusClass && (
        <div className={`customStatus me-2 shrink-0 ${statusClass}`} />
      )}
      <a
        href={url}
        target={onClick ? undefined : "_blank"}
        rel={onClick ? undefined : "noopener noreferrer"}
        onClick={handleClick}
        className="customTitle truncate cursor-pointer text-sky-600 dark:text-[#38bdf8] hover:underline font-medium"
        title={displayName}
        style={{
          color: "inherit",
          textDecoration: "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          flex: 1,
          display: "block",
        }}
      >
        <span className="hover:underline text-sky-600 dark:text-[#38bdf8]">
          {displayName}
        </span>
      </a>
    </div>
  );
};

export default openCampaignViewInNewTab;
