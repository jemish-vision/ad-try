import React from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { FiRefreshCw, FiArrowRight, FiCalendar, FiCheckCircle } from "react-icons/fi";

const SwitchPlanModal = ({
  show,
  onClose,
  onConfirm,
  loading,
  currentPlan,
  targetPlan,
  effectiveDate,
  currencySymbol = "$",
  billingCycle = "monthly"
}) => {
  const { t } = useTranslation();

  const formattedEffectiveDate = effectiveDate
    ? new Date(effectiveDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : t("next billing cycle");

  const isYearly = billingCycle === "yearly";
  const targetPrice = isYearly
    ? (targetPlan?.yearlyPrice !== undefined && targetPlan?.yearlyPrice !== null && Number(targetPlan.yearlyPrice) >= 0
        ? targetPlan.yearlyPrice
        : Math.round(Number(targetPlan?.monthlyPrice || targetPlan?.price || 0) * 12 * 0.8))
    : (targetPlan?.monthlyPrice !== undefined && targetPlan?.monthlyPrice !== null
        ? targetPlan.monthlyPrice
        : targetPlan?.price || 0);

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[460px] w-[95vw] p-7 rounded-[24px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col [&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-white/10 [&>button]:bg-slate-50 dark:[&>button]:bg-white/5 [&>button]:text-slate-500 dark:[&>button]:text-white/70 hover:[&>button]:text-slate-900 dark:hover:[&>button]:text-white [&>button]:rounded-full [&>button]:p-1.5 [&>button]:transition-all">
        {/* Top accent glow line indicator */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent 0%, #2563EB 25%, #38BDF8 60%, #818CF8 80%, transparent 100%)",
            opacity: 0.9,
          }}
        />

        {/* Header Icon */}
        <div className="flex flex-col items-center text-center mt-1">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500/15 to-blue-600/15 border border-sky-500/25 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-3.5 shadow-sm">
            <FiRefreshCw size={24} className="animate-spin-slow" />
          </div>

          <h4 className="text-[20px] font-extrabold tracking-tight mb-2 font-sans text-slate-900 dark:text-white">
            {t("Switch Subscription Plan")}
          </h4>

          {/* Main User Confirmation Prompt */}
          <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-sky-950/30 border border-blue-200/70 dark:border-sky-800/40 text-blue-900 dark:text-sky-200 text-sm font-semibold mb-4 leading-snug">
            {t("Your plan will reflect on next month. Are you sure you want to continue the payment?")}
          </div>
        </div>

        {/* Plan Transition Preview Card */}
        <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-3.5 border border-slate-200/80 dark:border-slate-800 space-y-2.5 mb-5 text-xs sm:text-sm">
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
            <span>{t("Current Plan")}:</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {t(currentPlan?.name) || currentPlan?.name || t("Active Plan")}
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
            <span>{t("New Plan")}:</span>
            <span className="font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-1">
              {t(targetPlan?.name) || targetPlan?.name} ({currencySymbol}{targetPrice}/{isYearly ? t("year") : t("mo")})
            </span>
          </div>

          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <FiCalendar className="text-sky-500" /> {t("Effective From")}:
            </span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {formattedEffectiveDate}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5 w-full">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="w-full h-[46px] rounded-xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider transition-all duration-200 bg-gradient-to-r from-[#1A9FD4] to-[#2374F2] hover:opacity-95 text-white shadow-md shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            type="button"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <i className="fa fa-circle-notch fa-spin" /> {t("Processing...")}
              </span>
            ) : (
              <>
                {t("Yes, Continue to Payment")} <FiArrowRight size={15} />
              </>
            )}
          </button>

          <button
            onClick={onClose}
            disabled={loading}
            className="w-full h-[42px] rounded-xl flex items-center justify-center font-semibold text-xs tracking-wider transition-all duration-200 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            type="button"
          >
            {t("Cancel")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SwitchPlanModal;
