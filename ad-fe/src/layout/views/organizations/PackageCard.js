import React from "react";
import { useTranslation } from "react-i18next";
import { ROLES } from "../../../common/constants";

export const currencySymbol = {
  INR: "₹",
  USD: "$",
  EUR: "€",
};

export const getFeatures = (t) => [
  { icon: "fa-link", label: (pkg) => t("{{count}} Amazon Accounts Connection", { count: pkg.amazonConnectLimit !== undefined ? pkg.amazonConnectLimit : (pkg.allowAmazonConnection ?? 0) }) },
  { icon: "fa-users", label: (pkg) => t("{{profiles}} Profile Limit & {{invites}} Team Invites", { profiles: pkg.profileLimit || 0, invites: pkg.numberOfInvites || 0 }) },
  { icon: "fa-rocket", label: () => t("Advanced Campaign Automation") },
  { icon: "fa-brain", label: () => t("AI-Powered Bid Optimization") },
  { icon: "fa-search", label: () => t("Deep Keyword Mining & Research") },
  { icon: "fa-chart-bar", label: () => t("Smart Placement Optimizer") },
  { icon: "fa-cogs", label: () => t("Custom Rule-Based Engine") },
  { icon: "fa-tachometer-alt", label: () => t("Real-time ROI & Performance Dashboard") },
  { icon: "fa-file-alt", label: () => t("Automated Scheduled Reports") },
  { icon: "fa-headset", label: () => t("24/7 Priority Email & Chat Support") },
  { icon: "fa-shield-alt", label: () => t("Enterprise-grade Secure Cloud") },
];

const PackageCard = ({
  pkg,
  isActive,
  isPreviousPlan,
  onBuy,
  onSwitchPlan,
  onTrial,
  onCancel,
  billingCycle,
  hasTrialBeenUsed,
  isPurchased,
  hasActivePlan,
  isUpcomingPlanPaid,
  isUpcomingPlan,
}) => {
  const { t } = useTranslation();
  const FEATURES = getFeatures(t);
  const role = localStorage.getItem("role");
  const isAdmin = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
  
  const isYearly = billingCycle === "yearly";
  const displayPrice = isYearly
    ? (pkg.yearlyPrice !== undefined && pkg.yearlyPrice !== null && Number(pkg.yearlyPrice) >= 0
      ? Number(pkg.yearlyPrice)
      : Math.round(Number(pkg.monthlyPrice || pkg.price || 0) * 12 * 0.8))
    : (pkg.monthlyPrice !== undefined && pkg.monthlyPrice !== null && Number(pkg.monthlyPrice) >= 0
      ? Number(pkg.monthlyPrice)
      : Number(pkg.price || 0));

  return (
    <div className={`package-card${isActive ? " active-plan" : ""}${isPreviousPlan ? " expired-plan" : ""}`}>
      {/* ── Accent header band ── */}
      <div className="plan-header-band">
        <div className="plan-header-band-inner">
          {/* Name + badge */}
          <div className="plan-name-row">
            <span className="plan-tier-name">{pkg.name}</span>
            {isUpcomingPlan && isUpcomingPlanPaid && (
              <span className="badge-upcoming">✦ {t("Next Plan (Paid)")}</span>
            )}
            {(pkg.isPopular || pkg.name?.toUpperCase() === "PREMIUM") && (
              <span className="badge-popular">{t("Most Popular")}</span>
            )}
            {isActive && <span className="badge-active">✦ {t("Current Plan")}</span>}
            {isPreviousPlan && !isActive && <span className="badge-expired">⚠️ {t("Expired Plan")}</span>}
            {pkg.trialDays > 0 && !isActive && !isPreviousPlan && !hasTrialBeenUsed && (
              <span className="badge-trial">{t("{{days}}d Free Trial Available", { days: pkg.trialDays })}</span>
            )}
          </div>

          {/* Price */}
          <div className="plan-price-block">
            <span className="price-sym">{currencySymbol[pkg.currency] || "$"}</span>
            <span className="price-num">{displayPrice}</span>
            <span className="price-cycle">/{isYearly ? t("year") : (t("month") === "month" ? "mo" : t("month"))}</span>
          </div>

          {/* Subtext description */}
          {pkg.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-0 leading-relaxed font-normal">
              {t(pkg.description)}
            </p>
          )}
        </div>

        {/* Decorative diagonal shape */}
        <div className="plan-band-deco" />
      </div>

      {/* ── Body ── */}
      <div className="plan-body">
        {/* CTA */}
        {isActive ? (
          <button 
            className="plan-cta plan-cta--cancel disabled:opacity-50 disabled:cursor-not-allowed" 
            onClick={onCancel}
            disabled={!isAdmin}
          >
            <i className="fa fa-ban" /> {t("Cancel Subscription")}
          </button>
        ) : isPreviousPlan ? (
          <div className="flex flex-col gap-2.5 my-2 w-full">
            <button
              className="plan-cta plan-cta--renew w-full disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => onBuy(pkg.name, displayPrice, pkg._id, billingCycle)}
              disabled={!isAdmin}
            >
              <i className="fa fa-sync-alt mr-1" /> {t("Renew Subscription")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 my-2 w-full">
            <button
              className="plan-cta plan-cta--upgrade w-full disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                if (hasActivePlan && onSwitchPlan) {
                  onSwitchPlan(pkg, displayPrice);
                } else {
                  onBuy(pkg.name, displayPrice, pkg._id, billingCycle);
                }
              }}
              disabled={!isAdmin || (hasActivePlan && isUpcomingPlanPaid)}
              title={hasActivePlan && isUpcomingPlanPaid ? t("You have already paid for next month's plan") : undefined}
            >
              {hasActivePlan ? (
                isUpcomingPlanPaid ? (
                  <>
                    <i className="fa fa-lock mr-1" /> {t("Switch Plan (Paid)")}
                  </>
                ) : (
                  <>
                    {t("Switch Plan")} <i className="fa fa-arrow-right ml-1" />
                  </>
                )
              ) : (
                <>
                  {t("Purchase Plan")} <i className="fa fa-arrow-right ml-1" />
                </>
              )}
            </button>
            {pkg.trialDays > 0 && !hasTrialBeenUsed && !hasActivePlan && (
              <button
                className="w-full py-2.5 px-4 rounded-xl font-bold text-sm border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => onTrial(pkg._id, pkg.name)}
                disabled={!isAdmin}
              >
                {t("Take a Trial")} <i className="fa fa-gift" />
              </button>
            )}
          </div>
        )}

        {/* Package Allocations Block */}
        <div className="bg-blue-50/70 dark:bg-slate-800/60 border border-blue-100 dark:border-slate-700/80 rounded-2xl p-4 my-3 space-y-2.5">
          <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
            <i className="fa fa-layer-group" /> {t("Plan Allocations & Limits")}
          </div>
          <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">
            <span>{t("Amazon Connection:")}</span>
            <span className="bg-white dark:bg-slate-900 px-2.5 py-0.5 rounded-lg border border-gray-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 font-extrabold">
              {Number(pkg.amazonConnectLimit || pkg.allowAmazonConnection) >= 100
                ? t("Unlimited")
                : (pkg.amazonConnectLimit !== undefined ? pkg.amazonConnectLimit : (pkg.allowAmazonConnection ?? 0))}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">
            <span>{t("Profile Limit:")}</span>
            <span className="bg-white dark:bg-slate-900 px-2.5 py-0.5 rounded-lg border border-gray-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 font-extrabold">
              {Number(pkg.profileLimit) >= 100 ? t("Unlimited") : (pkg.profileLimit || 0)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">
            <span>{t("Team Invites:")}</span>
            <span className="bg-white dark:bg-slate-900 px-2.5 py-0.5 rounded-lg border border-gray-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 font-extrabold">
              {Number(pkg.numberOfInvites) >= 100 ? t("Unlimited") : (pkg.numberOfInvites || 0)}
            </span>
          </div>
        </div>

        {/* Single-column feature list */}
        <ul className="plan-feature-list">
          {Array.isArray(pkg.features) && pkg.features.length > 0 ? (
            pkg.features.map((feat, i) => (
              <li key={i} className="plan-feature-row">
                <i className="fa fa-check feat-check" />
                <span>{t(feat)}</span>
              </li>
            ))
          ) : (
            FEATURES.map((f, i) => (
              <li key={i} className="plan-feature-row">
                <i className="fa fa-check feat-check" />
                <span>{f.label(pkg)}</span>
              </li>
            ))
          )}
        </ul>

        <p className="plan-fine-print">{t("Cancel anytime · No hidden charges")}</p>
      </div>
    </div>
  );
};

export default PackageCard;
