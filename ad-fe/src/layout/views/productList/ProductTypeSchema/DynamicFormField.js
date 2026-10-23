import { Formik, Form, getIn } from "formik";
import { RenderInput } from "./DynamicFormField/RenderInput";
import { AlertCircle, CheckCircle2, Cloud, FolderOpen, Loader2 } from "lucide-react";
import { t } from "i18next";
import { useEffect, useState, useRef } from "react";
import { isFieldVisible } from "./DynamicFormField/groupFormFields";
import { buildNestedErrors, buildVisibleFieldsObject, filterVisibleValues, generateYupSchema } from "./DynamicFormField/ProductFormBasic";

const formTabOrder = ["product_identity", "product_details", "offer", "safety_and_compliance", "images", "shipping"]

function groupFormFields(formFields, groups) {
    const output = Object.fromEntries(Object.entries(groups).map(([key, g]) => [key, { ...g, fields: {} }]));

    for (const [fieldKey, fieldValue] of Object.entries(formFields)) {
        const groupKey = Object.entries(groups).find(([_, g]) => g.propertyNames.includes(fieldKey))?.[0] || "other";
        output[groupKey].fields[fieldKey] = fieldValue;
    }

    const filterEmptyFields = Object.fromEntries(Object.entries(output).filter(([_, group]) => Object.keys(group?.fields).length > 0));
    const sortedFields = Object.fromEntries(
        Object.entries(filterEmptyFields).sort(([a], [b]) => {
            const ai = formTabOrder.indexOf(a);
            const bi = formTabOrder.indexOf(b);

            const A = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
            const B = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;

            return A - B;
        })
    );

    return sortedFields
}

function hasUserValue(val) {
    if (val === undefined || val === null || val === "") return false;
    if (typeof val === "number" || typeof val === "boolean") return true;
    if (typeof val === "string") return val.trim().length > 0;
    if (val instanceof Date) return !isNaN(val.getTime());
    if (Array.isArray(val)) {
        return val.length > 0 && val.some((item) => hasUserValue(item));
    }
    if (typeof val === "object") {
        if ("value" in val) {
            return hasUserValue(val.value);
        }
        return Object.entries(val).some(([k, v]) => {
            if (["marketplace_id", "language_tag", "unit", "currency", "source"].includes(k)) return false;
            return hasUserValue(v);
        });
    }
    return false;
}

export default function DynamicFormField({ formFields, group, initialValues, validationSchema, marketplace_id, language_tag, isInner = false, onSubmit, handlePrevious, amazonErrors = {}, onAmazonErrorClear }) {
    const groupFields = groupFormFields(formFields, group)
    const steps = Object.entries(groupFields).map(([key, value]) => ({ label: key, ...value }));

    const [activeStep, setActiveStep] = useState(steps?.[0]?.label ?? null);
    const currentIndex = steps.findIndex((s) => s.label === activeStep);

    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const tabTrackRef = useRef(null);
    const [indicatorStyle, setIndicatorStyle] = useState({ left: 3, width: 0, opacity: 0 });

    useEffect(() => {
        const updateIndicator = () => {
            if (!tabTrackRef.current) return;
            const activeButton = tabTrackRef.current.querySelector('.or-tab-switcher__btn--active');
            if (activeButton) {
                setIndicatorStyle((prev) => {
                    const nextLeft = activeButton.offsetLeft;
                    const nextWidth = activeButton.offsetWidth;
                    if (prev.left === nextLeft && prev.width === nextWidth && prev.opacity === 1) return prev;
                    return { left: nextLeft, width: nextWidth, opacity: 1 };
                });
            }
        };

        updateIndicator();
        if (!tabTrackRef.current) return;

        const ro = new ResizeObserver(() => updateIndicator());
        ro.observe(tabTrackRef.current);
        Array.from(tabTrackRef.current.children).forEach((child) => ro.observe(child));

        const mo = new MutationObserver(() => updateIndicator());
        mo.observe(tabTrackRef.current, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

        return () => {
            ro.disconnect();
            mo.disconnect();
        };
    }, [activeStep, steps.length, amazonErrors]);

    const stepHasError = (stepLabel, formikErrors, submitCount) => {
        if (submitCount === 0) return false;

        const fieldKeys = Object.keys(groupFields?.[stepLabel]?.fields ?? {});

        const hasFormikError = fieldKeys.some((fieldKey) => Boolean(getIn(formikErrors, fieldKey)));
        const hasAmazonError = fieldKeys.some((fieldKey) => Boolean(amazonErrors?.[fieldKey]));

        return hasFormikError || hasAmazonError;
    }

    useEffect(() => {
        if (steps?.length && !activeStep) setActiveStep(steps?.[0]?.label ?? null)
    }, [formFields])

    const handleSubmit = (values) => {
        if (Object.keys(amazonErrors).length > 0) {
            const firstErrorStep = steps.find((step) => Object.keys(groupFields?.[step.label]?.fields ?? {}).some((fieldKey) => Boolean(amazonErrors?.[fieldKey])));
            if (firstErrorStep) setActiveStep(firstErrorStep.label);
            return;
        }
        onSubmit(filterVisibleValues(values, buildVisibleFieldsObject(formFields, values)));
    };

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 1024);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const formatTitle = (title, key) => {
        if (title) return t(title);
        return t(key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
    }

    return (
        <Formik
            initialValues={initialValues}
            enableReinitialize={true}
            validate={async (values) => {
                try {
                    const schema = generateYupSchema(formFields, values, marketplace_id, language_tag)
                    await schema.validate(values, { abortEarly: false })
                } catch (err) {
                    return buildNestedErrors(err.inner || [])
                }
            }}
            onSubmit={handleSubmit}
        >
            {({ values, errors, setFieldValue, submitCount, handleSubmit }) => {
                const stepFields = groupFields?.[activeStep]?.fields ?? {};
                const visibleFieldsObject = buildVisibleFieldsObject(formFields, values);
                const filteredFields = Object.entries(stepFields).filter(([fieldKey]) => isFieldVisible(fieldKey, visibleFieldsObject));

                // Overall progress calculations
                const allFieldKeys = Object.keys(formFields);
                const visibleFields = allFieldKeys.filter(k => isFieldVisible(k, visibleFieldsObject));
                const totalVisibleFields = visibleFields.length;
                let doneCount = 0;
                visibleFields.forEach((fieldKey) => {
                    const val = getIn(values, fieldKey);
                    if (hasUserValue(val)) {
                        doneCount++;
                    }
                });

                const progressPercentage = Math.round((doneCount / (totalVisibleFields || 1)) * 100);

                // Count validation errors (formik + amazon)
                const formikErrorsCount = Object.keys(errors || {}).filter(k => visibleFields.includes(k)).length;
                const amazonErrorsCount = Object.keys(amazonErrors).filter(k => visibleFields.includes(k)).length;
                const alertCount = formikErrorsCount + amazonErrorsCount;

                const leftCount = totalVisibleFields - doneCount;

                const allErrors = [];
                visibleFields.forEach((fieldKey) => {
                    const formikErr = getIn(errors, fieldKey);
                    const amazonErr = amazonErrors?.[fieldKey];
                    const stepLabel = steps.find(s => Object.keys(s.fields).includes(fieldKey))?.title ?? "";

                    if (formikErr) {
                        allErrors.push({
                            key: `${fieldKey}-formik`,
                            title: formatTitle(formFields[fieldKey]?.title, fieldKey),
                            stepLabel: t(stepLabel),
                            message: typeof formikErr === 'string' ? formikErr : t("field_error")
                        });
                    }
                    if (amazonErr) {
                        allErrors.push({
                            key: `${fieldKey}-amazon`,
                            title: formatTitle(formFields[fieldKey]?.title, fieldKey),
                            stepLabel: t(stepLabel),
                            message: typeof amazonErr === 'string' ? amazonErr : amazonErr?.[0]?.message ?? t("amazon_error")
                        });
                    }
                });

                const disableSubmit = submitCount > 0 && allErrors.length > 0;

                return (
                    <Form id="df-header" onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden" style={{ height: isMobile ? 'calc(100dvh - 130px)' : 'calc(100vh - 240px)' }}>
                        {/* Tab Switcher */}
                        <div className="shrink-0 w-full bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-2 overflow-x-auto select-none no-print">
                            <div id="df-sub-tabs" className="relative flex min-w-max p-1 bg-slate-100 dark:bg-slate-950 rounded-xl" ref={tabTrackRef}>
                                <div
                                    className="absolute top-1 bottom-1 bg-gradient-to-r from-[#1A9FD4] to-[#2374F1] dark:from-slate-800 dark:to-slate-800 rounded-lg shadow-sm transition-all duration-300 pointer-events-none"
                                    style={indicatorStyle}
                                />
                                {steps.map((step) => (
                                    <button
                                        key={step.label}
                                        type="button"
                                        className={`relative z-10 px-4 py-2 text-xs font-semibold rounded-lg transition-colors duration-200 flex items-center gap-1.5 focus:outline-none ${activeStep === step.label
                                            ? "or-tab-switcher__btn--active text-white"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-350"
                                            }`}
                                        onClick={() => setActiveStep(step?.label)}
                                    >
                                        {t(step.title)}
                                        {stepHasError(step.label, errors, submitCount) && (
                                            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 animate-in fade-in duration-200" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2-Column Layout */}
                        <div id="df-center" className="flex-1 flex flex-row flex-nowrap p-4 gap-4 min-h-0 overflow-hidden">
                            {/* Left Column (Form Fields) */}
                            <div id="df-left-side" className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
                                {!Boolean(filteredFields?.length) && (
                                    <div className="p-8 text-center text-slate-500 font-medium italic bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
                                        {t("no_fields_found")}
                                    </div>
                                )}
                                {filteredFields.map(([fieldKey, field]) => {
                                    const isComplex = !isInner && !["string", "number", "integer", "boolean"].includes(field.type) && !field.enum;
                                    const displayTitle = formatTitle(field.title, fieldKey);

                                    return (
                                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-2" key={fieldKey}>
                                            {isComplex && (
                                                <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-950/40 rounded-t-2xl flex items-center gap-2">
                                                    <FolderOpen className="h-4.5 w-4.5 text-slate-400 shrink-0" />
                                                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{displayTitle}</span>
                                                </div>
                                            )}
                                            <div className="p-4 flex flex-col gap-2">
                                                {!isComplex && !isInner && <h6 className="font-bold text-slate-800 dark:text-slate-250 mb-2 text-sm">{displayTitle}</h6>}
                                                <div className="w-full flex flex-col gap-2">
                                                    <RenderInput
                                                        field={{ ...field, key: fieldKey }}
                                                        fullPath={fieldKey}
                                                        value={getIn(values, fieldKey)}
                                                        setFieldValue={setFieldValue}
                                                        marketplace_id={marketplace_id}
                                                        language_tag={language_tag}
                                                        amazonError={amazonErrors}
                                                        onAmazonErrorClear={onAmazonErrorClear}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Right Column (Sidebar) */}
                            <div id="df-right-side" className="hidden lg:flex flex-col gap-4 w-[320px] shrink-0 min-h-0 overflow-y-auto pr-1">
                                {/* Listing Progress */}
                                <div id="df-listing-progress" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-4">
                                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{t("Listing Progress")}</h4>

                                    <div className="flex items-center gap-4">
                                        <div className="relative inline-flex h-[76px] w-[76px] items-center justify-center shrink-0">
                                            <svg className="w-full h-full transform -rotate-90">
                                                <circle
                                                    cx="38"
                                                    cy="38"
                                                    r="33"
                                                    stroke={isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9"}
                                                    strokeWidth="5"
                                                    fill="transparent"
                                                />
                                                <circle
                                                    cx="38"
                                                    cy="38"
                                                    r="33"
                                                    stroke="#2374F1"
                                                    strokeWidth="5"
                                                    fill="transparent"
                                                    strokeDasharray={2 * Math.PI * 33}
                                                    strokeDashoffset={2 * Math.PI * 33 * (1 - progressPercentage / 100)}
                                                    className="transition-all duration-300"
                                                />
                                            </svg>
                                            <div className="absolute flex items-center justify-center">
                                                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{progressPercentage}%</span>
                                            </div>
                                        </div>

                                        <div className="flex-1 space-y-1">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{t("Overall Progress")}</span>
                                            <p className="text-xs font-bold text-[#2374F1]">{doneCount} {t("of")} {totalVisibleFields} {t("fields")}</p>
                                            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-[#2374F1] rounded-full" style={{ width: `${progressPercentage}%` }} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <div className="flex-1 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 p-2.5 rounded-xl text-center border border-emerald-100 dark:border-emerald-950/30">
                                            <p className="text-lg font-bold mb-0.5 leading-none">{doneCount}</p>
                                            <span className="text-[10px] font-bold uppercase tracking-wider">{t("Done")}</span>
                                        </div>
                                        <div className="flex-1 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-450 p-2.5 rounded-xl text-center border border-amber-100 dark:border-amber-950/30">
                                            <p className="text-lg font-bold mb-0.5 leading-none">{leftCount}</p>
                                            <span className="text-[10px] font-bold uppercase tracking-wider">{t("Left")}</span>
                                        </div>
                                        <div className="flex-1 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 p-2.5 rounded-xl text-center border border-red-100 dark:border-red-950/30">
                                            <p className="text-lg font-bold mb-0.5 leading-none">{alertCount}</p>
                                            <span className="text-[10px] font-bold uppercase tracking-wider">{t("Alerts")}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Validation Checks */}
                                <div id="df-validation-checks" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col min-h-0 max-h-[450px] overflow-hidden">
                                    <div className="border-b border-slate-200 dark:border-slate-850 px-4 py-3 bg-slate-50 dark:bg-slate-950/40">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("Validation Checks")}</span>
                                    </div>
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto min-h-0">
                                        {allErrors.length === 0 ? (
                                            <div className="flex justify-between items-center px-4 py-3 bg-white dark:bg-slate-900">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                                                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("No errors found")}</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-emerald-600 uppercase">{t("Validated")}</span>
                                            </div>
                                        ) : (
                                            allErrors.map((err) => (
                                                <div key={err.key} className="flex justify-between items-center px-4 py-3 bg-red-50/30 dark:bg-red-950/10">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={err.title}>{err.title}</p>
                                                            <span className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase block leading-tight mt-0.5">{err.stepLabel}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bottom Bar */}
                        <div
                            id="df-bottom-view"
                            className="shrink-0 flex justify-between items-center px-6 py-4 w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-10"
                        >
                            <div>
                                {handlePrevious && (
                                    <button
                                        id="df-back-preview"
                                        type="button"
                                        className="h-10 px-4 text-xs font-semibold rounded-lg border border-slate-250 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors focus:outline-none"
                                        onClick={() => handlePrevious(values)}
                                    >
                                        {isMobile ? t("Back") : t("Back to Field Selection")}
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-2 items-center">
                                <button
                                    id="df-prev-btn"
                                    type="button"
                                    className="h-10 px-4 text-xs font-semibold rounded-lg border border-slate-250 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                                    onClick={() => setActiveStep(steps[currentIndex - 1]?.label ?? activeStep)}
                                    disabled={!currentIndex}
                                >
                                    {t("Previous")}
                                </button>

                                <button
                                    id="df-next-btn"
                                    type="button"
                                    className="h-10 px-4 text-xs font-semibold rounded-lg border border-slate-250 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                                    onClick={() => {
                                        if (currentIndex < steps.length - 1) {
                                            setActiveStep(steps[currentIndex + 1].label);
                                        }
                                    }}
                                    disabled={currentIndex === steps.length - 1}
                                >
                                    {isMobile ? t("Next") : t("Next Step")}
                                </button>

                                <button
                                    id="df-submit-btn"
                                    type="submit"
                                    disabled={disableSubmit}
                                    className="customize-button clicked h-10 px-6 text-xs font-semibold rounded-lg bg-[#2374F2] hover:bg-[#1A9FD4] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none shadow-sm"
                                >
                                    {t("Submit")}
                                </button>
                            </div>
                        </div>
                    </Form>
                );
            }}
        </Formik>
    );
}
