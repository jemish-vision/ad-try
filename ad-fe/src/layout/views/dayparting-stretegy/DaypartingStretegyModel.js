import React, { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button as ShadcnButton } from "../../../components/ui/button";
import { Formik, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { FiSliders, FiClock } from "react-icons/fi";
import { X } from "lucide-react";
import { RuleWizardChoosePath, RuleWizardTemplates } from "../../../components/rule-wizard/RuleWizardSteps";
import { getDaypartingStrategyTemplates } from "./daypartingStrategyTemplate";

/* ---------- SLOT CONFIG ---------- */
const SLOT_STEP = {
    "1_HOUR": 1,
    "2_HOUR": 2,
    "3_HOUR": 3,
    "4_HOUR": 4,
    "6_HOUR": 6,
};

const generateSlots = (slotType, bidChangeType) => {
    const step = SLOT_STEP[slotType];
    const slots = [];
    const defaultVal = bidChangeType === 'PERCENTAGE' ? 0 : 1;

    for (let i = 0; i < 24; i += step) {
        slots.push({
            slotIndex: slots.length,
            startTime: `${String(i).padStart(2, "0")}:00`,
            endTime: `${String(i + step).padStart(2, "0")}:00`,
            enabled: true,
            multiplier: 1, // Base multiplier for engine
            displayMultiplier: defaultVal, // UI display value
        });
    }
    return slots;
};

/* ---------- VALIDATION ---------- */
const validationSchema = Yup.object().shape({
    name: Yup.string().required("Strategy name is required"),
    type: Yup.string().required("Type is required"),
    frequency: Yup.string().required(),
    slotType: Yup.string().required(),
    slots: Yup.array().test(
        "at-least-one-slot",
        "Enable at least one time slot",
        (slots) => slots?.some((s) => s.enabled)
    ),
});

const DaypartingStrategyModal = ({
    show,
    mode = "add",
    initialData = {},
    onClose,
    onSubmit,
}) => {
    const { t } = useTranslation();
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
    const [step, setStep] = useState(mode === 'edit' ? 'form' : 'choose-path');
    const [templateValues, setTemplateValues] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const applyTemplate = (template) => {
        setTemplateValues(template.data);
        setStep('form');
    };

    useEffect(() => {
        if (show) {
            setStep(mode === 'edit' ? 'form' : 'choose-path');
            setTemplateValues(null);
        }
    }, [show, mode]);

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const initialValues = useMemo(
        () => {
            const baseData = templateValues || initialData;
            return {
                name: baseData.name || "",
                type: baseData.type || "TARGETS",
                ruleType: "BID",
                frequency: baseData.frequency || "DAILY",
                slotType: baseData.slotType || "4_HOUR",
                status: baseData.status || "ACTIVE",
                bidChangeType: baseData.bidChangeType || "MULTIPLIER",
                slots:
                    baseData.slots?.length > 0
                        ? baseData.slots.map(s => ({
                            ...s,
                            displayMultiplier: baseData.bidChangeType === 'PERCENTAGE'
                                ? Number(((s.multiplier - 1) * 100).toFixed(0))
                                : s.multiplier || 1
                        }))
                        : generateSlots(baseData.slotType || "4_HOUR", baseData.bidChangeType || "MULTIPLIER"),
            };
        },
        [initialData, templateValues]
    );

    return (
        <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                id="dayparting-strategy-modal"
                hideCloseButton={true}
                className="max-w-[900px] w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col font-sans max-h-[90vh] gap-0"
                onInteractOutside={(e) => e.preventDefault()}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                {/* Glow Line Indicator */}
                <div
                    className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                    style={{
                        background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
                        opacity: 0.8
                    }}
                />

                {/* Header */}
                <div id="dayparting-strategy-close" className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-white/10 shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="p-2 rounded-xl flex items-center justify-center bg-sky-500/10 border border-sky-500/20 text-sky-500 dark:text-sky-400">
                            <FiSliders size={16} />
                        </span>
                        <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                            {mode === "add" ? t("Create Dayparting Strategy") : t("Edit Dayparting Strategy")}
                        </DialogTitle>
                    </div>
                    <button type="button" disabled={submitting} className="absolute right-4 top-4 rounded-full border border-gray-300 dark:border-gray-600 p-1.5 opacity-70 ring-offset-background transition-all text-slate-800 dark:text-slate-200 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground" onClick={onClose}>
                        <X className="h-5 w-5" />
                        <span className="sr-only">{t("Close")}</span>
                    </button>
                </div>

                {step === 'choose-path' && (
                    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0c1222]">
                        <RuleWizardChoosePath
                            title={t("Create Dayparting Strategy")}
                            description="Automation helps you optimize bids by the hour. Select how you want to start building your logic."
                            templateCardTitle="Browse Templates"
                            templateCardDesc="Choose from pre-configured dayparting strategies."
                            scratchCardTitle="Build Custom Strategy"
                            scratchCardDesc="Create a blank strategy and define your own hourly bid multipliers."
                            onSelectTemplates={() => setStep('templates')}
                            onSelectScratch={() => setStep('form')}
                        />
                    </div>
                )}

                {step === 'templates' && (
                    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0c1222]">
                        <RuleWizardTemplates
                            templates={getDaypartingStrategyTemplates(t)}
                            onApplyTemplate={applyTemplate}
                            onBack={() => setStep('choose-path')}
                        />
                    </div>
                )}

                {step === 'form' && (
                    <div id="dayparting-strategy-rule-add" className="new_rule flex-grow overflow-hidden">
                        <Formik
                            initialValues={initialValues}
                            validationSchema={validationSchema}
                            enableReinitialize
                            onSubmit={async (values) => {
                                const payload = {
                                    ...values,
                                    slots: values.slots
                                        .filter((s) => s.enabled)
                                        .map(s => {
                                            const { displayMultiplier, ...rest } = s;
                                            const val = (displayMultiplier === "" || displayMultiplier === null) ? 0 : displayMultiplier;
                                            const finalMultiplier = values.bidChangeType === 'PERCENTAGE'
                                                ? 1 + (Number(val) / 100)
                                                : Number(val || 1);
                                            return { ...rest, multiplier: Number(finalMultiplier.toFixed(2)) };
                                        }),
                                    ...(mode !== "add" && { ruleId: initialData?._id }),
                                };
                                setSubmitting(true);
                                try {
                                    await onSubmit(payload);
                                } finally {
                                    setSubmitting(false);
                                }
                            }}
                        >
                            {({ values, setFieldValue, handleSubmit, errors }) => (
                                <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[calc(90vh-100px)] overflow-hidden">
                                    <div className="p-6 overflow-y-auto flex-grow flex flex-col gap-4 bg-slate-50/50 dark:bg-white/5 custom-scroll">

                                        {/* Strategy Type Selection */}
                                        <div id="dayparting-strategy-type" className="flex flex-col gap-2">
                                            <label className="text-xs font-bold text-slate-700 dark:text-slate-350">{t("Strategy Type")} <span className="text-red-500">*</span></label>
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                                                {[
                                                    { label: "Targeting Dayparting", value: "TARGETS" },
                                                    { label: "Budget Dayparting", value: "BUDGETS" },
                                                    { label: "Placement Dayparting", value: "PLACEMENTS" },
                                                    { label: "Keyword Dayparting", value: "KEYWORDS" }
                                                ].map((opt) => {
                                                    const isChecked = values.type === opt.value;
                                                    return (
                                                        <label
                                                            key={opt.value}
                                                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${isChecked
                                                                ? "bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-400"
                                                                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-750 dark:text-slate-300"
                                                                }`}
                                                        >
                                                            <input
                                                                type="radio"
                                                                name="type"
                                                                value={opt.value}
                                                                checked={isChecked}
                                                                onChange={() => setFieldValue("type", opt.value)}
                                                                className="h-3.5 w-3.5"
                                                            />
                                                            {t(opt.label)}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                            <ErrorMessage name="type" component="div" className="text-red-500 text-[10px] font-bold mt-0.5" />
                                        </div>

                                        {/* Bid Change Type Selection */}
                                        <div id="dayparting-strategy-mode" className="flex flex-col gap-2">
                                            <label className="text-xs font-bold text-slate-700 dark:text-slate-350">{t("Adjustment Mode")} <span className="text-red-500">*</span></label>
                                            <div className="flex gap-4">
                                                {[
                                                    { label: "Multiplier (x)", value: "MULTIPLIER", default: 1 },
                                                    { label: "Percentage (%)", value: "PERCENTAGE", default: 0 }
                                                ].map((opt) => {
                                                    const isChecked = values.bidChangeType === opt.value;
                                                    return (
                                                        <label key={opt.value} className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                                                            <input
                                                                type="radio"
                                                                name="bidChangeType"
                                                                value={opt.value}
                                                                checked={isChecked}
                                                                onChange={() => {
                                                                    const newSlots = values.slots.map(s => ({
                                                                        ...s,
                                                                        displayMultiplier: opt.default
                                                                    }));
                                                                    setFieldValue("bidChangeType", opt.value);
                                                                    setFieldValue("slots", newSlots);
                                                                }}
                                                                className="h-3.5 w-3.5"
                                                            />
                                                            {t(opt.label)}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Name Input */}
                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs font-bold text-slate-700 dark:text-slate-350">{t("Dayparting Strategy Name")} <span className="text-red-500">*</span></label>
                                            <Field
                                                id="dayparting-strategy-name-input"
                                                name="name"
                                                placeholder={t("Enter strategy name")}
                                                className={`w-full h-[40px] px-3 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-transparent text-slate-900 dark:text-white ${errors?.name ? 'border-red-500' : ''}`}
                                            />
                                            <ErrorMessage name="name" component="div" className="text-red-500 text-[10px] font-bold" />
                                        </div>

                                        {/* Frequency + Slot Type Selects */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="flex flex-col gap-2">
                                                <label className="text-xs font-bold text-slate-700 dark:text-slate-350">{t("Frequency")} <span className="text-red-500">*</span></label>
                                                <Field
                                                    id="dayparting-strategy-frequency"
                                                    as="select"
                                                    name="frequency"
                                                    className="w-full h-[40px] px-3 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                                                >
                                                    <option value="DAILY">{t("Daily")}</option>
                                                    <option value="WEEKDAY">{t("Weekday")}</option>
                                                    <option value="WEEKEND">{t("Weekend")}</option>
                                                </Field>
                                            </div>

                                            <div className="flex flex-col gap-2">
                                                <label className="text-xs font-bold text-slate-700 dark:text-slate-350">{t("Slot Type")} <span className="text-red-500">*</span></label>
                                                <Field
                                                    id="dayparting-strategy-slot-type"
                                                    as="select"
                                                    name="slotType"
                                                    className="w-full h-[40px] px-3 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                                                    onChange={(e) => {
                                                        const value = e.target.value;
                                                        setFieldValue("slotType", value);
                                                        setFieldValue("slots", generateSlots(value, values.bidChangeType));
                                                    }}
                                                >
                                                    <option value="1_HOUR">1 {t("Hour")}</option>
                                                    <option value="2_HOUR">2 {t("Hour")}</option>
                                                    <option value="3_HOUR">3 {t("Hour")}</option>
                                                    <option value="4_HOUR">4 {t("Hour")}</option>
                                                    <option value="6_HOUR">6 {t("Hour")}</option>
                                                </Field>
                                            </div>
                                        </div>

                                        {/* Slot Grid Configuration */}
                                        <div id="dayparting-strategy-grid" className="flex flex-col gap-2 border border-slate-200 dark:border-white/10 rounded-xl p-4 bg-white dark:bg-slate-900">
                                            <div className="grid grid-cols-12 gap-3 text-xs font-bold text-slate-700 dark:text-slate-300 pb-2 border-b border-slate-100 dark:border-white/5 items-center">
                                                <div className="col-span-5 flex items-center gap-1.5"><FiClock size={14} className="text-slate-400" /> {t("Time Range")}</div>
                                                <div className="col-span-7">
                                                    <span>{values.bidChangeType === 'PERCENTAGE' ? t('Bid Percentage (%)') : t('Bid Multiplier (x)')}</span>
                                                    {values.bidChangeType === 'PERCENTAGE' && (
                                                        <span className="block text-[10px] text-sky-500 font-semibold normal-case mt-0.5">({t("e.g. 20 for +20% bid, -10 for -10% bid")})</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto custom-scroll pr-1 mt-2">
                                                {values.slots.map((slot, index) => (
                                                    <div key={slot.slotIndex} className="grid grid-cols-12 gap-3 items-center hover:bg-slate-50 dark:hover:bg-white/5 py-1 px-2 rounded-lg transition-colors">
                                                        <div className="col-span-5 text-xs font-bold text-slate-800 dark:text-slate-200">
                                                            {slot.startTime} – {slot.endTime}
                                                        </div>
                                                        <div className="col-span-7">
                                                            <input
                                                                type="number"
                                                                step={values.bidChangeType === 'PERCENTAGE' ? "1" : "0.1"}
                                                                min={values.bidChangeType === 'PERCENTAGE' ? "-90" : "0.1"}
                                                                max={values.bidChangeType === 'PERCENTAGE' ? "500" : "5"}
                                                                disabled={!slot.enabled}
                                                                value={slot.displayMultiplier}
                                                                onChange={(e) => setFieldValue(`slots.${index}.displayMultiplier`, e.target.value)}
                                                                className="w-full h-8 px-2.5 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 text-slate-900 dark:text-white"
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <ErrorMessage name="slots" component="div" className="text-red-500 text-[10px] font-bold mt-1" />
                                        </div>

                                    </div>

                                    {/* Footer */}
                                    <div className="flex !justify-between items-center px-6 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 shrink-0">
                                        <div>
                                            {mode === 'add' && (
                                                <ShadcnButton
                                                    variant="outline"
                                                    type="button"
                                                    disabled={submitting}
                                                    className="h-[36px] px-4 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10"
                                                    onClick={() => setStep('choose-path')}
                                                >
                                                    {t("Back")}
                                                </ShadcnButton>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <ShadcnButton
                                                variant="outline"
                                                type="button"
                                                disabled={submitting}
                                                className="h-[36px] px-4 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10"
                                                onClick={onClose}
                                            >
                                                {t("Cancel")}
                                            </ShadcnButton>
                                            <ShadcnButton
                                                type="submit"
                                                disabled={submitting}
                                                className="h-[36px] px-4 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
                                                id="dayparting-strategy-submit"
                                            >
                                                {submitting ? (
                                                    <>
                                                        <i className="fa fa-spinner fa-spin mr-1.5" />
                                                        {mode === "add" ? t("Create Strategy....") : t("Update Strategy....")}
                                                    </>
                                                ) : (
                                                    mode === "add" ? t("Create Strategy") : t("Update Strategy")
                                                )}
                                            </ShadcnButton>
                                        </div>
                                    </div>
                                </form>
                            )}
                        </Formik>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default DaypartingStrategyModal;
