import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Filter from "../../helper/filter/Filter";
import { ApiPackageList } from "../../api-wrapper/ApiPackages";
import { ApiCancelSubscription, ApiCreateSubscription, ApiSaveTrialSubscription } from "../../api-wrapper/ApiUsers";
import { Toast } from "../../helper/links/Link";
import { ProfileContext } from "../../helper/usecontext/useContext";

import CancelPlanModal from "../../helper/modal/CancelSubscriptionModal";
import SwitchPlanModal from "../../helper/modal/SwitchPlanModal";

import PackageCard from "./organizations/PackageCard";




const PurchasePlans = () => {
  const { t } = useTranslation();
  const { loginUser, profileData } = useContext(ProfileContext);
  const [packages, setPackages] = useState([]);
  const [billingCycle, setBillingCycle] = useState("monthly");

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [pendingSwitchPlan, setPendingSwitchPlan] = useState(null);
  const [switchLoading, setSwitchLoading] = useState(false);

  const hasTrialBeenUsed = Boolean(
    profileData?.hasUsedTrial ||
    profileData?.organization?.hasUsedTrial ||
    profileData?.organization?.isTrialActive ||
    profileData?.organization?.planId ||
    loginUser?.hasUsedTrial ||
    loginUser?.organization?.hasUsedTrial ||
    loginUser?.organization?.isTrialActive ||
    loginUser?.organization?.planId ||
    loginUser?.packageId
  );

  const fetchPackages = async () => {
    try {
      const res = await ApiPackageList();
      if (res?.isSuccess) setPackages(res.data);
      else Toast.error(res.message);
    } catch {
      Toast.error(t("Unable to load plans"));
    }
  };

  const activeUser = loginUser || profileData || {};
  const activeOrg = activeUser.organization || profileData?.organization || {};
  const rawPackageId = activeUser.packageId || activeOrg.planId;
  const activePackageId = typeof rawPackageId === "object" && rawPackageId !== null ? rawPackageId._id : rawPackageId;

  const isUpcomingPlanPaid = Boolean(activeOrg?.isUpcomingPlanPaid || activeUser?.isUpcomingPlanPaid || profileData?.isUpcomingPlanPaid);
  const rawUpcomingPlanId = activeOrg?.upcomingPlanId || activeUser?.upcomingPlanId || profileData?.upcomingPlanId;
  const upcomingPlanId = typeof rawUpcomingPlanId === "object" && rawUpcomingPlanId !== null ? rawUpcomingPlanId._id : rawUpcomingPlanId;
  const upcomingPlan = packages.find((p) => p._id === upcomingPlanId) || (typeof rawUpcomingPlanId === "object" ? rawUpcomingPlanId : null) || activeUser?.upcomingPlan;
  const upcomingStartDate = activeOrg?.upcomingStartDate || activeUser?.upcomingStartDate || null;

  const checkPackages = packages.find((p) => p._id === activePackageId);
  const effectiveEndDate = activeUser.packageEndDate || activeOrg.endDate;
  const isNotExpired = Boolean(effectiveEndDate) && new Date(effectiveEndDate) > new Date();
  const activePlan = checkPackages && isNotExpired;
  const hasActivePlan = Boolean(activePlan);
  const isExpiredPlan = Boolean(checkPackages) && !isNotExpired;
  const hasTrial = !hasActivePlan && isNotExpired;
  const isPurchased = Boolean(activeUser.subscriptionId || activeOrg.subscriptionId) && !activeOrg.isTrialActive;

  const handleCancelPlan = async (cancelType) => {
    try {
      setCancelLoading(true);
      const res = await ApiCancelSubscription({ cancelType });
      if (res?.isSuccess) {
        Toast.success(cancelType === "immediate" ? t("Subscription canceled immediately") : t("Subscription will cancel at period end"));
        setShowCancelModal(false);
        window.location.reload();
      } else {
        Toast.error(res.message);
      }
    } catch (err) {
      Toast.error(t("Unable to cancel subscription"));
    } finally {
      setCancelLoading(false);
    }
  };

  const handleTrialNow = async (pkgId, packageName) => {
    try {
      const res = await ApiSaveTrialSubscription({ packageId: pkgId, packageName });
      if (res?.isSuccess) {
        Toast.success(t("Free trial activated successfully!"));
        window.location.href = "/";
      } else {
        Toast.error(res?.message || t("Failed to activate trial"));
      }
    } catch {
      Toast.error(t("Something went wrong activating trial"));
    }
  };

  const handleBuyNow = async (packageName, price, pkgId, cycle = billingCycle) => {
    if (price <= 0 || packageName === "Free Trial") {
      return handleTrialNow(pkgId, packageName);
    }

    try {
      const res = await ApiCreateSubscription({ packageName, billingCycle: cycle });
      if (res?.isSuccess && res.data) {
        Toast.success(t("Redirecting to checkout…"));
        window.location.href = res.data;
      } else {
        Toast.error(res?.message || t("Could not initiate purchase"));
      }
    } catch {
      Toast.error(t("Something went wrong"));
    }
  };

  const handleSwitchPlanPrompt = (pkg, displayPrice) => {
    setPendingSwitchPlan({ pkg, displayPrice, billingCycle });
    setShowSwitchModal(true);
  };

  const handleConfirmSwitchPlan = async () => {
    if (!pendingSwitchPlan) return;
    setSwitchLoading(true);
    try {
      await handleBuyNow(
        pendingSwitchPlan.pkg.name,
        pendingSwitchPlan.displayPrice,
        pendingSwitchPlan.pkg._id,
        pendingSwitchPlan.billingCycle
      );
    } finally {
      setSwitchLoading(false);
      setShowSwitchModal(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  return (
    <>
      <Filter
        name="Purchase Plans"
        nameShow={false}
        dateShow={false}
        profileShow
      />

      <div className="middle_container">
        <div className="glass-grid-container purchase-plans-card-wrapper">
          <div className="purchase-plans-container">
            {/* Header */}
            <div className="plans-header text-center">
              <h2>{t("Manage Your Subscription")}</h2>
              <p>{t("Select the plan that fits your business needs. Upgrade, downgrade, or cancel anytime.")}</p>
            </div>

            {/* Animated Billing Cycle Tabs with Sliding Indicator */}
            <div className="mt-6 mb-4 flex justify-center">
              <div className="relative grid grid-cols-2 p-1.5 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-gray-200/80 dark:border-slate-800 shadow-xl shadow-black/5 min-w-[360px] max-w-[440px] w-full">
                <div
                  className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md shadow-blue-500/30 transition-all duration-300 ease-in-out z-0 ${billingCycle === "monthly" ? "left-1.5 translate-x-0" : "left-1.5 translate-x-full"
                    }`}
                />

                <button
                  type="button"
                  onClick={() => setBillingCycle("monthly")}
                  className={`relative z-10 py-3 px-4 rounded-xl text-sm font-extrabold transition-colors duration-300 flex items-center justify-center gap-2 select-none ${billingCycle === "monthly"
                    ? "text-white"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                >
                  <i className="fa fa-calendar-alt text-xs" />
                  <span>{t("Monthly Plan")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setBillingCycle("yearly")}
                  className={`relative z-10 py-3 px-4 rounded-xl text-sm font-extrabold transition-colors duration-300 flex items-center justify-center gap-2 select-none ${billingCycle === "yearly"
                    ? "text-white"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                >
                  <i className="fa fa-sync-alt text-xs" />
                  <span>{t("Yearly Plan")}</span>
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-2xs transition-colors duration-300 ${billingCycle === "yearly"
                      ? "bg-white/20 text-white border border-white/30"
                      : "bg-emerald-500 text-white"
                      }`}
                  >
                    {t("Save 20%")}
                  </span>
                </button>
              </div>
            </div>

            {/* ── Status Banner: Upcoming Scheduled Plan (Paid) ── */}
            {isUpcomingPlanPaid && (
              <div className="current-status-banner border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-slate-900/60 mb-4">
                <div className="status-info">
                  <div className="status-icon-wrapper text-blue-600 bg-blue-100 dark:bg-blue-950/60">
                    <i className="fa fa-calendar-check" />
                  </div>
                  <div className="status-texts">
                    <div className="status-title">{t("Next Month's Scheduled Plan (Paid)")}</div>
                    <div className="status-value text-blue-600 dark:text-blue-400">
                      {upcomingPlan?.name || upcomingPlan?.packageName || t("Upcoming Plan")}
                    </div>
                  </div>
                </div>
                <div className="status-meta">
                  <div className="meta-label">{t("Takes Effect On")}</div>
                  <div className="meta-date text-blue-600 dark:text-blue-400 font-semibold">
                    {upcomingStartDate
                      ? new Date(upcomingStartDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                      : (effectiveEndDate ? new Date(effectiveEndDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : "—")}
                  </div>
                </div>
              </div>
            )}

            {/* ── Status Banner: Purchased Plan (Stripe) ── */}
            {hasActivePlan && checkPackages && isPurchased && (
              <div className="current-status-banner">
                <div className="status-info">
                  <div className="status-icon-wrapper">
                    <i className="fa fa-credit-card" />
                  </div>
                  <div className="status-texts">
                    <div className="status-title">{t("Current Plan")}</div>
                    <div className="status-value">{checkPackages.packageName || checkPackages.name}</div>
                  </div>
                </div>
                <div className="status-meta">
                  <div className="meta-label">{t("Next Renewal Date")}</div>
                  <div className="meta-date">
                    {effectiveEndDate
                      ? new Date(effectiveEndDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                      : "—"}
                  </div>
                </div>
              </div>
            )}

            {/* ── Status Banner: Super Admin Assigned Trial Plan ── */}
            {hasActivePlan && checkPackages && !isPurchased && (
              <div className="current-status-banner">
                <div className="status-info">
                  <div className="status-icon-wrapper">
                    <i className="fa fa-gift" />
                  </div>
                  <div className="status-texts">
                    <div className="status-title">{t("Current Status")}</div>
                    <div className="status-value">{checkPackages.packageName || checkPackages.name} ({t("Trial")})</div>
                  </div>
                </div>
                <div className="status-meta">
                  <div className="meta-label">{t("Valid Until")}</div>
                  <div className="meta-date">
                    {effectiveEndDate
                      ? new Date(effectiveEndDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                      : "—"}
                  </div>
                </div>
              </div>
            )}

            {/* ── Status Banner: Expired Subscription ── */}
            {isExpiredPlan && checkPackages && (
              <div className="current-status-banner current-status-banner--expired">
                <div className="status-info">
                  <div className="status-icon-wrapper status-icon-wrapper--expired">
                    <i className="fa fa-exclamation-triangle" />
                  </div>
                  <div className="status-texts">
                    <div className="status-title">{t("Current Status")}</div>
                    <div className="status-value text-rose-600 dark:text-rose-400">
                      {checkPackages.packageName || checkPackages.name} ({t("Expired")})
                    </div>
                  </div>
                </div>
                <div className="status-meta">
                  <div className="meta-label">{t("Expired On")}</div>
                  <div className="meta-date text-rose-600 dark:text-rose-400">
                    {effectiveEndDate
                      ? new Date(effectiveEndDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                      : "—"}
                  </div>
                </div>
              </div>
            )}

            {/* ── Status Banner: Standard Trial (date-based, no package) ── */}
            {!hasActivePlan && hasTrial && !isExpiredPlan && (
              <div className="current-status-banner">
                <div className="status-info">
                  <div className="status-icon-wrapper">
                    <i className="fa fa-gift" />
                  </div>
                  <div className="status-texts">
                    <div className="status-title">{t("Current Status")}</div>
                    <div className="status-value">{t("Free Trial (Active)")}</div>
                  </div>
                </div>
                <div className="status-meta">
                  <div className="meta-label">{t("Expires On")}</div>
                  <div className="meta-date">
                    {effectiveEndDate
                      ? new Date(effectiveEndDate).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                      : "—"}
                  </div>
                </div>
              </div>
            )}

            {/* ── Status Banner: No Subscription ── */}
            {!hasActivePlan && !hasTrial && !isExpiredPlan && (
              <div className="current-status-banner">
                <div className="status-info">
                  <div className="status-icon-wrapper">
                    <i className="fa fa-exclamation-circle" />
                  </div>
                  <div className="status-texts">
                    <div className="status-title">{t("Current Status")}</div>
                    <div className="status-value">{t("No Active Subscription")}</div>
                  </div>
                </div>
                <div className="status-meta">
                  <div className="meta-label">{t("Status Details")}</div>
                  <div className="meta-date">{t("Choose a plan below to activate")}</div>
                </div>
              </div>
            )}


            {/* Plans cards wrapper — dedicated container */}
            <div className="plans-cards-wrapper">
              <div className="pricing-grid">
                {packages.filter(p => p.isPublic !== false || p._id === activePackageId).map((pkg) => (
                  <PackageCard
                    key={pkg._id}
                    pkg={pkg}
                    isActive={pkg._id === activePackageId && isNotExpired}
                    isPreviousPlan={pkg._id === activePackageId && !isNotExpired}
                    onBuy={handleBuyNow}
                    onSwitchPlan={handleSwitchPlanPrompt}
                    onTrial={handleTrialNow}
                    onCancel={() => setShowCancelModal(true)}
                    billingCycle={billingCycle}
                    hasTrialBeenUsed={hasTrialBeenUsed}
                    isPurchased={isPurchased}
                    hasActivePlan={hasActivePlan}
                    isUpcomingPlanPaid={isUpcomingPlanPaid}
                    isUpcomingPlan={pkg._id === upcomingPlanId}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <CancelPlanModal
          show={showCancelModal}
          loading={cancelLoading}
          onClose={() => setShowCancelModal(false)}
          onConfirm={handleCancelPlan}
        />

        <SwitchPlanModal
          show={showSwitchModal}
          loading={switchLoading}
          onClose={() => setShowSwitchModal(false)}
          onConfirm={handleConfirmSwitchPlan}
          currentPlan={checkPackages}
          targetPlan={pendingSwitchPlan?.pkg}
          effectiveDate={upcomingStartDate || effectiveEndDate}
          currencySymbol="$"
          billingCycle={pendingSwitchPlan?.billingCycle || billingCycle}
        />
      </div>
    </>
  );
};

export default PurchasePlans;
