import React, { useEffect, useState, useContext, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { 
  CheckCircle2, 
  ShieldCheck, 
  Zap, 
  ArrowRight, 
  Sparkles, 
  Loader2, 
  CreditCard, 
  Check, 
  LayoutDashboard,
  Layers,
  Bot
} from "lucide-react";
import Logo from "../../common/logo/logo.png";
import { ApiVerifyPaymentSession } from "../../api-wrapper/ApiUsers";
import { ApiGetProfile } from "../../api-wrapper/customer/ApiCustomer";
import { ProfileContext } from "../../helper/usecontext/useContext";

const PaymentSuccess = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { profileData, setProfileData, loginUser, setLoginUser } = useContext(ProfileContext);
  const [isVerifying, setIsVerifying] = useState(true);
  const [planInfo, setPlanInfo] = useState(null);
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    let isMounted = true;
    const processPayment = async () => {
      try {
        const sessionId = searchParams.get("session_id");
        if (sessionId) {
          await ApiVerifyPaymentSession({ sessionId });
        }

        const profileRes = await ApiGetProfile({ headers: { 'x-skip-loader': true }, skipLoader: true });
        if (profileRes?.isSuccess && profileRes.profile) {
          if (profileRes.profile.email) localStorage.setItem("userEmail", profileRes.profile.email);
          if (profileRes.profile.fullName || profileRes.profile.name) {
            localStorage.setItem("userName", profileRes.profile.fullName || profileRes.profile.name);
          }
          localStorage.setItem("userAccount", JSON.stringify(profileRes.profile));
          if (setProfileData) setProfileData(profileRes.profile);
          if (setLoginUser) setLoginUser(profileRes.profile);
          if (isMounted) {
            setPlanInfo(profileRes.profile?.packageName || profileRes.profile?.organization?.planName || null);
          }
        }

        localStorage.setItem("isPlanActive", "true");
        localStorage.setItem("isTrialActive", "false");
        localStorage.setItem("hasUsedTrial", "false");
        window.dispatchEvent(new Event("planStatusChanged"));
      } catch (error) {
        console.error("Error processing payment verification:", error);
      } finally {
        if (isMounted) {
          setIsVerifying(false);
        }
      }
    };

    processPayment();
    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  const activeUser = loginUser || profileData || {};
  const currentPlanName = planInfo || activeUser.packageName || activeUser.organization?.planName || t("Premium");

  const storedSellerId = localStorage.getItem("appstore_seller_id") || sessionStorage.getItem("appstore_seller_id");
  const storedFlow = localStorage.getItem("amazon_appstore_flow") || sessionStorage.getItem("amazon_appstore_flow");
  const isAppstoreFlow = storedFlow === "true" || Boolean(storedSellerId);
  const sellerIdQuery = storedSellerId ? `&sellerId=${encodeURIComponent(storedSellerId)}` : "";
  const continueUrl = isAppstoreFlow
    ? `/settings?status=success&flow=amazon_appstore_seller${sellerIdQuery}`
    : "/";

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#0b1329] flex items-center justify-center p-4 sm:p-6 md:p-10 font-sans relative overflow-hidden transition-colors">
      {/* Background Decorative Grids and Glow Blobs */}
      <div
        className="absolute inset-0 z-0 opacity-40 dark:opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-blue-400/20 to-emerald-400/20 dark:from-blue-600/15 dark:to-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container Card */}
      <div className="relative z-10 w-full max-w-[840px] bg-white dark:bg-[#131d36] rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden backdrop-blur-md">
        
        {/* Top Header Section */}
        <div className="pt-8 pb-6 px-6 sm:px-10 text-center border-b border-slate-100 dark:border-slate-800/60 bg-gradient-to-b from-blue-50/40 via-white to-white dark:from-slate-800/30 dark:via-[#131d36] dark:to-[#131d36]">
          <div className="flex justify-center mb-6">
            <img src={Logo} alt="Advertise IQ" className="h-12 sm:h-14 w-auto object-contain drop-shadow-sm" />
          </div>

          {/* Dynamic Status Icon */}
          <div className="relative inline-flex items-center justify-center mb-5">
            <div
              className={`absolute inset-0 rounded-full ${
                isVerifying ? "bg-blue-400/30" : "bg-emerald-400/30"
              } blur-xl animate-pulse`}
            />
            <div
              className={`relative flex items-center justify-center w-20 h-20 rounded-full ${
                isVerifying
                  ? "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-400"
                  : "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-400"
              } border-2 shadow-inner`}
            >
              {isVerifying ? (
                <Loader2 className="w-10 h-10 animate-spin" />
              ) : (
                <CheckCircle2 className="w-10 h-10" />
              )}
            </div>
          </div>

          {/* Badge */}
          <div>
            <span
              className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold ${
                isVerifying
                  ? "bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                  : "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
              } shadow-sm mb-3`}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t("Verifying Transaction...")}
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  {t("Payment Verified & Activated")}
                </>
              )}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {isVerifying ? t("Setting Up Your Subscription") : t("Welcome to {{plan}} Plan", { plan: t(currentPlanName) || currentPlanName })}
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-lg mx-auto mt-2 leading-relaxed">
            {isVerifying
              ? t("Please wait a moment while we synchronize and activate your account permissions...")
              : t("Your payment was processed successfully. All premium AI optimization engines and features are now unlocked.")}
          </p>
        </div>

        {/* Content Body Section */}
        <div className="p-6 sm:p-10 space-y-8">
          
          {/* 3 Metric Pills */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-400 dark:text-slate-400 font-medium uppercase tracking-wider">
                  {t("Status")}
                </div>
                <div className="text-sm font-bold text-slate-800 dark:text-white truncate">
                  {t("Active Paid")}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-400 dark:text-slate-400 font-medium uppercase tracking-wider">
                  {t("AI Engine")}
                </div>
                <div className="text-sm font-bold text-slate-800 dark:text-white truncate">
                  {t("Full Access")}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-400 dark:text-slate-400 font-medium uppercase tracking-wider">
                  {t("Sync Status")}
                </div>
                <div className="text-sm font-bold text-slate-800 dark:text-white truncate">
                  {t("Realtime Enabled")}
                </div>
              </div>
            </div>
          </div>

          {/* Key Feature Benefits Unlocked */}
          <div className="bg-slate-50/70 dark:bg-slate-800/30 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3.5 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" />
              {t("Included With Your Active Plan")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
              {[
                t("AI Bidding Automation & Optimization"),
                t("Hourly Dayparting & Schedule Rules"),
                t("Smart Placement & Keyword Harvesting"),
                t("Multi-Account Amazon Ads Integration"),
                t("Automated Budget Protection Rules"),
                t("24/7 Priority Support & Reporting"),
              ].map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Security & Receipt Notice */}
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold text-slate-900 dark:text-white">{t("Invoice & Confirmation:")}</span>{" "}
              {t("A detailed tax invoice and receipt have been delivered to your registered email address.")}
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <Link
              to={continueUrl}
              className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] transition-all shadow-lg shadow-blue-600/25 cursor-pointer text-decoration-none"
            >
              <LayoutDashboard className="w-4 h-4" />
              {isAppstoreFlow ? t("Go to Settings") : t("Go to Dashboard")}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>

            <Link
              to="/purchase-plans"
              className="w-full sm:w-auto flex items-center justify-center py-3.5 px-5 rounded-2xl text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer text-decoration-none"
            >
              {t("View Subscription Details")}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default PaymentSuccess;

