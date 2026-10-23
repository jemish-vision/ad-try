import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Cookies from "js-cookie";
import { ApiPackageList } from "../../api-wrapper/ApiPackages";
import { ApiCreateSubscription, ApiSaveTrialSubscription, ApiCancelSubscription } from "../../api-wrapper/ApiUsers";
import { ApiGetProfile } from "../../api-wrapper/customer/ApiCustomer";
import { Toast } from "../../helper/links/Link";
import Spinner from "../../common/helper/loader/Loader";
import { ProfileContext } from "../../helper/usecontext/useContext";
import Logo from "../../common/logo/logo.png";
import PackageCard from "./organizations/PackageCard";
import CancelPlanModal from "../../helper/modal/CancelSubscriptionModal";
import SwitchPlanModal from "../../helper/modal/SwitchPlanModal";
import { ROLES } from "../../common/constants";

const SelectPlan = () => {
  const { t } = useTranslation();
  const { loginUser, setLoginUser, profileData, setProfileData } = useContext(ProfileContext);
  const [localProfile, setLocalProfile] = useState(loginUser || profileData || null);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
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
    setLoading(true);
    try {
      const res = await ApiPackageList();
      if (res?.isSuccess) {
        setPackages(res.data || []);
      } else {
        Toast.error(res?.message || t("Failed to load plans"));
      }
    } catch (err) {
      Toast.error(t("Unable to load plans"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    // Clear all cookies
    try {
      const allCookies = Cookies.get() || {};
      Object.keys(allCookies).forEach((cookieName) => {
        Cookies.remove(cookieName);
        Cookies.remove(cookieName, { path: "/" });
        Cookies.remove(cookieName, { domain: window.location.hostname, path: "/" });
      });
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
    } catch (e) {
      console.error("Error clearing cookies", e);
    }

    // Clear all local storage and session storage
    localStorage.clear();
    sessionStorage.clear();

    // Redirect to login screen
    window.location.href = "/login";
  };

  useEffect(() => {
    fetchPackages();
    ApiGetProfile()
      .then((res) => {
        if (res?.isSuccess && res.profile) {
          setLocalProfile(res.profile);
          if (setLoginUser) setLoginUser(res.profile);
          if (setProfileData) setProfileData(res.profile);
        }
      })
      .catch(() => { });

    const handlePopState = () => {
      handleGoBack();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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

  const getPostPlanRedirectUrl = () => {
    const storedSellerId = sessionStorage.getItem("appstore_seller_id") || localStorage.getItem("appstore_seller_id");
    const storedFlow = sessionStorage.getItem("amazon_appstore_flow") || localStorage.getItem("amazon_appstore_flow");
    const isAppstoreFlow = storedFlow === "true" || Boolean(storedSellerId);

    if (isAppstoreFlow) {
      sessionStorage.removeItem("amazon_appstore_flow");
      localStorage.removeItem("amazon_appstore_flow");
      const sellerIdQuery = storedSellerId ? `&sellerId=${encodeURIComponent(storedSellerId)}` : "";
      return `/settings?status=success&flow=amazon_appstore_seller${sellerIdQuery}`;
    }
    const currentRole = localStorage.getItem("role");
    return currentRole === ROLES.SUPER_ADMIN ? "/admin-dashboard" : "/";
  };

  const handleTrialNow = async (pkgId, packageName) => {
    try {
      const res = await ApiSaveTrialSubscription({ packageId: pkgId, packageName });
      if (res?.isSuccess) {
        localStorage.setItem("isPlanActive", "true");
        localStorage.setItem("isTrialActive", "true");
        localStorage.setItem("hasUsedTrial", "false");
        Toast.success("Free trial activated successfully!");
        window.location.href = getPostPlanRedirectUrl();
      } else {
        Toast.error(res?.message || t("Failed to activate trial"));
      }
    } catch {
      Toast.error(t("Something went wrong activating trial"));
    }
  };

  const handleBuyNow = async (packageName, price, pkgId) => {
    if (price <= 0 || packageName === "Free Trial") {
      return handleTrialNow(pkgId, packageName);
    }

    setActionLoadingId(`buy-${pkgId}`);
    try {
      const res = await ApiCreateSubscription({ packageName, billingCycle });
      if (res?.isSuccess && res.data) {
        Toast.success(t("Redirecting to checkout…"));
        window.location.href = res.data;
      } else {
        Toast.error(res?.message || t("Could not initiate purchase"));
        setActionLoadingId(null);
      }
    } catch {
      Toast.error(t("Something went wrong initiating purchase"));
      setActionLoadingId(null);
    }
  };

  const activeUser = loginUser || profileData || localProfile || {};
  const activeOrg = activeUser.organization || {};
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
  const isPurchased = Boolean(activeUser.subscriptionId || activeOrg?.subscriptionId);

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
        pendingSwitchPlan.pkg._id
      );
    } finally {
      setSwitchLoading(false);
      setShowSwitchModal(false);
    }
  };

  if (loading) {
    return <Spinner />;
  }

  return (
    <main className="auth-page select-plan-page min-h-screen py-10 px-4 relative overflow-x-hidden flex flex-col justify-between">
      {/* 3D Animated Background exactly matching system reference */}
      <div className="auth-3d-bg">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />

        {/* 3D Wireframe Cubes */}
        <div className="cube-3d-container cube-pos-1">
          <div className="cube-3d-box">
            <div className="cube-face face-front"></div>
            <div className="cube-face face-back"></div>
            <div className="cube-face face-left"></div>
            <div className="cube-face face-right"></div>
            <div className="cube-face face-top"></div>
            <div className="cube-face face-bottom"></div>
          </div>
        </div>
        <div className="cube-3d-container cube-pos-2">
          <div className="cube-3d-box">
            <div className="cube-face face-front"></div>
            <div className="cube-face face-back"></div>
            <div className="cube-face face-left"></div>
            <div className="cube-face face-right"></div>
            <div className="cube-face face-top"></div>
            <div className="cube-face face-bottom"></div>
          </div>
        </div>

        {/* Concentric Tech Rings */}
        <div className="tech-rings-container">
          <div className="tech-ring ring-1"></div>
          <div className="tech-ring ring-2"></div>
        </div>

        {/* Premium Background Visual SVG */}
        <svg
          className="auth-bg-visual"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="lgPlan" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2374F2" stopOpacity="0" />
              <stop offset="25%" stopColor="#2374F2" stopOpacity="0.45" />
              <stop offset="65%" stopColor="#FF9900" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#FF9900" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M -100 750 C 300 450, 700 850, 1540 350"
            stroke="url(#lgPlan)"
            strokeWidth="2.5"
            fill="none"
          />
        </svg>
      </div>

      <div className="max-w-6xl w-full mx-auto relative z-10 py-6">
        {/* Top Brand Logo & Header */}
        <div className="text-center mb-8 relative">
          <button
            type="button"
            onClick={handleGoBack}
            className="absolute left-0 sm:left-4 top-0 flex items-center justify-center w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors z-20 cursor-pointer"
            title="Back to Login"
          >
            <i className="fa fa-arrow-left" />
          </button>
          <div className="flex justify-center mb-5">
            <button
              type="button"
              onClick={handleGoBack}
              className="inline-flex justify-center items-center transition-transform hover:scale-105 bg-transparent border-0 cursor-pointer"
            >
              <img src={Logo} alt="Advertise IQ" className="h-12 sm:h-14 w-auto object-contain drop-shadow-md" />
            </button>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold text-xs tracking-wide uppercase mb-3.5 border border-blue-200/80 dark:border-blue-800 shadow-sm">
            <i className="fa fa-gem text-xs" /> {t("Step 2 of 2 · Subscription Setup")}
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            {t("Choose Your Subscription Plan")}
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mt-3 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
            {t("Select the perfect plan to unlock comprehensive AI automation and analytics for your organization's campaigns.")}
          </p>

          {/* Animated Billing Cycle Tabs with Sliding Indicator */}
          <div className="mt-8 flex justify-center">
            <div className="relative grid grid-cols-2 p-1.5 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-gray-200/80 dark:border-slate-800 shadow-xl shadow-black/5 min-w-[360px] max-w-[440px] w-full">
              {/* Sliding Background Pill Indicator */}
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
        </div >

        {/* ── Status Banner: Upcoming Scheduled Plan (Paid) ── */}
        {
          isUpcomingPlanPaid && (
            <div className="current-status-banner border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-slate-900/60 mb-6">
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
          )
        }

        {/* ── Status Banner: Purchased Plan (Stripe) ── */}
        {
          hasActivePlan && checkPackages && isPurchased && (
            <div className="current-status-banner mb-6">
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
          )
        }

        {/* ── Status Banner: Super Admin Assigned Trial Plan ── */}
        {
          hasActivePlan && checkPackages && !isPurchased && (
            <div className="current-status-banner mb-6">
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
          )
        }

        {/* ── Status Banner: Expired Subscription ── */}
        {
          isExpiredPlan && checkPackages && (
            <div className="current-status-banner current-status-banner--expired mb-6">
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
          )
        }

        {/* ── Status Banner: Standard Trial (date-based, no package) ── */}
        {
          !hasActivePlan && hasTrial && !isExpiredPlan && (
            <div className="current-status-banner mb-6">
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
          )
        }

        {/* ── Status Banner: No Subscription ── */}
        {
          !hasActivePlan && !hasTrial && !isExpiredPlan && (
            <div className="current-status-banner mb-6">
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
          )
        }

        {/* Pricing Grid */}
        <div className="plans-cards-wrapper mt-4">
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
      </div >

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

      {/* Footer copyright */}
      <div className="text-center py-6 relative z-10 text-xs text-gray-500 dark:text-gray-400">
        © {new Date().getFullYear()} Advertise IQ. All rights reserved.
      </div>
    </main >
  );
};

export default SelectPlan;
