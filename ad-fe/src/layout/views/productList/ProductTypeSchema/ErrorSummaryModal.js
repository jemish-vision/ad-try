import { useState } from "react";
import { getIn } from "formik";
import { t } from "i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { AlertCircle, AlertTriangle, X } from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────
function flattenErrors(obj, prefix = "") {
    const results = [];
    if (!obj || typeof obj !== "object") return results;

    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;

        if (typeof value === "string") {
            results.push({ path, message: value });
        } else if (Array.isArray(value)) {
            value.forEach((item, i) => {
                if (typeof item === "string") {
                    results.push({ path: `${path}[${i}]`, message: item });
                } else if (item && typeof item === "object") {
                    results.push(...flattenErrors(item, `${path}[${i}]`));
                }
            });
        } else if (typeof value === "object") {
            results.push(...flattenErrors(value, path));
        }
    }

    return results;
}

// ─── ErrorRow ────────────────────────────────────────────────────────────────
function ErrorRow({ path, message, type }) {
    const isAmazon = type === "amazon";
    return (
        <div className={`flex items-start gap-3 p-3.5 rounded-lg mb-2.5 border text-left ${
            isAmazon 
                ? "bg-red-500/5 border-red-500/20 text-slate-800 dark:text-slate-100" 
                : "bg-amber-500/5 border-amber-500/20 text-slate-800 dark:text-slate-100"
        }`}>
            <span className={`mt-0.5 shrink-0 ${isAmazon ? "text-red-500" : "text-amber-500"}`}>
                {isAmazon ? <AlertCircle className="h-4.5 w-4.5" /> : <AlertTriangle className="h-4.5 w-4.5" />}
            </span>
            <div className="flex-1 min-w-0">
                <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500 mb-1 break-all select-all font-semibold">
                    {path}
                </div>
                <div className="text-xs font-semibold leading-relaxed">
                    {message}
                </div>
            </div>
        </div>
    );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
function EmptyState({ label }) {
    return (
        <div className="p-8 text-center flex flex-col items-center justify-center">
            <span className="text-3xl mb-2 select-none">✅</span>
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                {t("No")} {label} {t("errors found")}
            </span>
        </div>
    );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function ErrorSummaryModal({ formikErrors = {}, amazonErrors = {}, groupFields = {}, steps = [] }) {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState("platform");

    // Flatten platform (Formik) errors
    const platformErrors = flattenErrors(formikErrors);

    // Flatten Amazon errors
    const amazonFlat = Object.entries(amazonErrors).map(([path, message]) => ({
        path,
        message: typeof message === "string" ? message : JSON.stringify(message),
    }));

    const totalCount = platformErrors.length + amazonFlat.length;
    if (totalCount === 0) return null;

    function getStepLabel(fieldKey) {
        const step = steps.find((s) =>
            Object.keys(groupFields?.[s.label]?.fields ?? {}).includes(fieldKey.split(".")[0].replace(/\[.*\]/, ""))
        );
        return step?.label ?? "other";
    }

    const platformByStep = {};
    platformErrors.forEach((e) => {
        const step = getStepLabel(e.path);
        if (!platformByStep[step]) platformByStep[step] = [];
        platformByStep[step].push(e);
    });

    const amazonByStep = {};
    amazonFlat.forEach((e) => {
        const step = getStepLabel(e.path);
        if (!amazonByStep[step]) amazonByStep[step] = [];
        amazonByStep[step].push(e);
    });

    const activeErrors = tab === "platform" ? platformByStep : amazonByStep;
    const activeFlat = tab === "platform" ? platformErrors : amazonFlat;

    return (
        <>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="ml-auto mr-4 mt-0.5 h-8 px-3 rounded-lg border border-red-500/35 hover:border-red-500 text-red-500 hover:bg-red-500/5 font-bold text-xs flex items-center gap-1.5 focus:outline-none transition-all"
            >
                <div className="relative flex items-center justify-center">
                    <AlertCircle className="h-4.5 w-4.5" />
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full bg-red-500 text-[8px] font-black text-white leading-none shadow-sm">
                        {totalCount}
                    </span>
                </div>
                <span>{t("Errors")}</span>
            </button>

            {/* Modal Dialog */}
            <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) setOpen(false); }}>
                <DialogContent className="max-w-[550px] p-0 overflow-hidden bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col h-[75vh]">
                    
                    {/* Header */}
                    <DialogHeader className="px-6 py-4 flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-850 shrink-0 bg-slate-50 dark:bg-slate-900/40">
                        <DialogTitle className="flex items-center gap-2 text-base font-extrabold text-slate-800 dark:text-slate-100">
                            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                            <span>{t("Error Summary")}</span>
                            <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-red-500/10 text-red-500 dark:text-red-400">
                                {totalCount} {t("errors")}
                            </span>
                        </DialogTitle>
                    </DialogHeader>

                    {/* Tab Selection */}
                    <div className="flex border-b border-slate-100 dark:border-slate-850 shrink-0 bg-slate-50/50 dark:bg-slate-900/20 px-4">
                        <button
                            type="button"
                            onClick={() => setTab("platform")}
                            className={`flex-1 py-3 text-xs font-bold border-b-2 flex items-center justify-center gap-1.5 focus:outline-none transition-all ${
                                tab === "platform"
                                    ? "border-amber-500 text-amber-600 dark:text-amber-400"
                                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-350"
                            }`}
                        >
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            <span>{t("Platform Errors")}</span>
                            {platformErrors.length > 0 && (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                    {platformErrors.length}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab("amazon")}
                            className={`flex-1 py-3 text-xs font-bold border-b-2 flex items-center justify-center gap-1.5 focus:outline-none transition-all ${
                                tab === "amazon"
                                    ? "border-red-500 text-red-500 dark:text-red-400"
                                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-350"
                            }`}
                        >
                            <AlertCircle className="h-4 w-4 text-red-500" />
                            <span>{t("Amazon Errors")}</span>
                            {amazonFlat.length > 0 && (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-red-500/10 text-red-500 dark:text-red-400">
                                    {amazonFlat.length}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto min-h-0 bg-white dark:bg-[#0f172a]">
                        {activeFlat.length === 0 ? (
                            <EmptyState label={tab === "platform" ? t("Platform") : t("Amazon")} />
                        ) : (
                            <div className="divide-y divide-slate-100 dark:divide-slate-850">
                                {Object.entries(activeErrors).map(([stepLabel, errors]) => {
                                    const step = steps.find((s) => s.label === stepLabel);
                                    return (
                                        <div key={stepLabel} className="first:border-0 border-t border-slate-100 dark:border-slate-850">
                                            {/* Step label header */}
                                            <div className="px-6 py-2 bg-slate-50/50 dark:bg-slate-900/10 border-b border-slate-100 dark:border-slate-850 flex items-center gap-2 sticky top-0 z-10 backdrop-blur-md">
                                                <span className="text-[10px] font-extrabold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                                                    {step ? t(step.title ?? step.label) : stepLabel}
                                                </span>
                                                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-slate-200/60 dark:bg-slate-800 text-slate-500">
                                                    {errors.length}
                                                </span>
                                            </div>

                                            {/* Errors list */}
                                            <div className="px-6 py-4">
                                                {errors.map((e, i) => (
                                                    <ErrorRow
                                                        key={i}
                                                        path={e.path}
                                                        message={e.message}
                                                        type={tab}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-850 bg-slate-50 dark:bg-slate-900/40 flex justify-end shrink-0">
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="px-5 h-8.5 rounded-lg text-xs font-bold bg-[#1e293b] hover:bg-[#0f172a] text-white focus:outline-none transition-all shadow-sm"
                        >
                            {t("Close")}
                        </button>
                    </div>

                </DialogContent>
            </Dialog>
        </>
    );
}