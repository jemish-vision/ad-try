import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { XCircle, AlertCircle, RefreshCw, HelpCircle, ShieldAlert, ArrowRight } from "lucide-react";
import Logo from "../../common/logo/logo.png";

const PaymentFailed = () => {
  const { t } = useTranslation();

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
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-rose-400/20 to-orange-400/20 dark:from-rose-600/15 dark:to-orange-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container Card */}
      <div className="relative z-10 w-full max-w-[800px] bg-white dark:bg-[#131d36] rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden backdrop-blur-md">
        
        {/* Top Header Section */}
        <div className="pt-8 pb-6 px-6 sm:px-10 text-center border-b border-slate-100 dark:border-slate-800/60 bg-gradient-to-b from-rose-50/40 via-white to-white dark:from-slate-800/30 dark:via-[#131d36] dark:to-[#131d36]">
          <div className="flex justify-center mb-6">
            <img src={Logo} alt="Advertise IQ" className="h-12 sm:h-14 w-auto object-contain drop-shadow-sm" />
          </div>

          {/* Status Icon */}
          <div className="relative inline-flex items-center justify-center mb-5">
            <div className="absolute inset-0 rounded-full bg-rose-400/30 blur-xl animate-pulse" />
            <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-400 border-2 shadow-inner">
              <XCircle className="w-10 h-10" />
            </div>
          </div>

          {/* Badge */}
          <div>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shadow-sm mb-3">
              <AlertCircle className="w-3.5 h-3.5" />
              {t("Transaction Incomplete")}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t("Payment Unsuccessful")}
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-lg mx-auto mt-2 leading-relaxed">
            {t("We were unable to process your payment. Don't worry — no charges or hidden deductions were made to your account.")}
          </p>
        </div>

        {/* Content Body Section */}
        <div className="p-6 sm:p-10 space-y-6">
          
          {/* Troubleshooting Box */}
          <div className="bg-slate-50/80 dark:bg-slate-800/40 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800">
            <div className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-3 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              {t("Common Reasons & Next Steps:")}
            </div>
            <ul className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 space-y-2.5 list-disc pl-5">
              <li>{t("The bank or card issuer may have declined the automated transaction.")}</li>
              <li>{t("Insufficient account balance, limit restrictions, or 3D Secure timeout.")}</li>
              <li>{t("Card details, expiration date, or security CVV code entered may have been incorrect.")}</li>
            </ul>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <Link
              to="/purchase-plans"
              className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] transition-all shadow-lg shadow-blue-600/25 cursor-pointer text-decoration-none"
            >
              <RefreshCw className="w-4 h-4" />
              {t("Retry Payment / Select Plan")}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>

            <Link
              to="/"
              className="w-full sm:w-auto flex items-center justify-center py-3.5 px-6 rounded-2xl text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer text-decoration-none"
            >
              {t("Go to Dashboard")}
            </Link>
          </div>

          {/* Assistance Footer */}
          <div className="text-center text-xs text-slate-500 dark:text-slate-400 pt-2 flex items-center justify-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-slate-400" />
            <span>{t("Need help with billing?")}</span>
            <Link to="/purchase-plans" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
              {t("Contact Support")}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default PaymentFailed;

