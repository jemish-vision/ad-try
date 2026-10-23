import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { FiAlertTriangle, FiX } from "react-icons/fi";

const CancelPlanModal = ({ show, onClose, onConfirm, loading }) => {
    const { t } = useTranslation();
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
    useEffect(() => {
        const handleTheme = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handleTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    return (
        <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[420px] w-[95vw] p-8 rounded-[24px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/90 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col [&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-white/10 [&>button]:bg-slate-50 dark:[&>button]:bg-white/5 [&>button]:text-slate-500 dark:[&>button]:text-white/70 hover:[&>button]:text-slate-900 dark:hover:[&>button]:text-white [&>button]:rounded-full [&>button]:p-1.5 [&>button]:transition-all">
                {/* Circuit top glow line indicator */}
                <div 
                    className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                    style={{
                        background: "linear-gradient(90deg, transparent 0%, #ef4444 25%, #f59e0b 60%, #7c64ff 80%, transparent 100%)",
                        opacity: 0.8
                    }}
                />

                {/* Warning Icon Banner */}
                <div className="flex flex-col items-center text-center mt-2">
                    <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mb-4 animate-pulse">
                        <FiAlertTriangle size={24} />
                    </div>

                    <h4 className="text-[20px] font-bold tracking-tight mb-2 font-sans text-slate-900 dark:text-white">
                        {t("Cancel Subscription")}
                    </h4>
                    
                    <p className="text-[14.5px] font-semibold text-slate-800 dark:text-slate-200 mb-2 leading-relaxed">
                        {t("Are you sure you want to cancel your subscription?")}
                    </p>

                    <p className="text-[13px] font-normal text-slate-500 dark:text-white/50 mb-6 leading-relaxed">
                        {t("If you cancel immediately, your subscription and access to paid features will end right away.")}
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-3 w-full">
                    <button
                        onClick={() => onConfirm("immediate")}
                        disabled={loading}
                        className="w-full h-[46px] rounded-xl flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 bg-rose-600 hover:bg-rose-700 text-white active:scale-[0.98] disabled:opacity-50"
                        type="button"
                    >
                        {t("Cancel Immediately")}
                    </button>

                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="w-full h-[46px] rounded-xl flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white active:scale-[0.98] disabled:opacity-50 mt-1"
                        type="button"
                    >
                        {t("Keep Subscription")}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default CancelPlanModal;

