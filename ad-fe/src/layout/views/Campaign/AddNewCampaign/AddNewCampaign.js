import { useContext, useState, useMemo } from "react";
import { Formik, Form } from "formik";
import { initialValues } from "./initialValues";
import { validationSchemas } from "./validation";

import { useNavigate } from "react-router-dom";

import StepCampaign from "./steps/StepCampaign";
import StepProducts from "./steps/StepProducts";
import StepTargeting from "./steps/StepTargeting";
import StepNegativeTargeting from "./steps/StepNegativeTargeting";
import StepReview from "./steps/StepReview";
import { Toast, handleLoader, useDispatch } from "../../../../helper/links/Link";
import { useTranslation } from "react-i18next";
import { ApiCreateSPCampaign } from "../../../../api-wrapper/campaign/ApiCampaign";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import { CustomModal } from "../../../../helper/modal/CustomModal";

const steps = [
    { label: 0, visibleText: "Campaign Details", title: "Campaign", description: "Name, timeline, budget, and bidding goals." },
    { label: 1, visibleText: "Products", title: "Products", description: "Select items or services to promote." },
    { label: 2, visibleText: "Targeting", title: "Targeting", description: "Define audiences and placement locations." },
    { label: 3, visibleText: "Negative Targeting", title: "Negative Targeting", description: "Exclude specific keywords and audiences." },
    { label: 4, visibleText: "Review", title: "Review", description: "Review and submit your campaign details." },
];

const AddCampaign = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const [activeStep, setActiveStep] = useState(0);
    const { profileId } = useContext(ProfileContext)

    const [submitConfirm, setSubmitConfirm] = useState(false);
    const [pendingSubmit, setPendingSubmit] = useState(null);

    const stepComponents = [
        StepCampaign,
        StepProducts,
        StepTargeting,
        StepNegativeTargeting,
        StepReview,
    ];

    const StepComponent = stepComponents[activeStep];

    const currencySymbol = useMemo(() => {
        const code = profileId?.currencyCode || 'INR';
        if (code === 'INR') return '₹';
        try {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).formatToParts(0).find(x => x.type === 'currency').value;
        } catch (err) {
            return '₹';
        }
    }, [profileId?.currencyCode]);

    // show red icon on tab if validation error exists in that step
    const stepHasError = (stepIndex, errors) => {
        const schemaKeys = Object.keys(validationSchemas[stepIndex].fields);
        return schemaKeys.some((key) => errors[key]);
    };

    // Helper to get first readable error message
    const getFirstErrorMessage = (errObj) => {
        if (!errObj) return null;
        if (typeof errObj === "string") return errObj;
        if (Array.isArray(errObj)) {
            for (const item of errObj) {
                const msg = getFirstErrorMessage(item);
                if (msg) return msg;
            }
        }
        if (typeof errObj === "object") {
            for (const val of Object.values(errObj)) {
                const msg = getFirstErrorMessage(val);
                if (msg) return msg;
            }
        }
        return null;
    };

    // Helper to recursively mark fields as touched
    const makeTouched = (errors) => {
        if (!errors || typeof errors !== "object") return true;
        if (Array.isArray(errors)) {
            return errors.map(makeTouched);
        }
        const touched = {};
        for (const key of Object.keys(errors)) {
            touched[key] = makeTouched(errors[key]);
        }
        return touched;
    };

    // handle next step with validation
    const handleNext = async (formik) => {
        const errors = await formik.validateForm();

        if (Object.keys(errors).length === 0) {
            setActiveStep((prev) => prev + 1);
        } else {
            formik.setTouched(makeTouched(errors));
            const firstError = getFirstErrorMessage(errors);
            Toast.error(firstError || "Please fill in all required fields before proceeding.");
        }
    };

    const handleBack = () => {
        if (activeStep > 0) {
            setActiveStep((prev) => prev - 1);
        }
    };

    return (
        <>
            <Formik
                initialValues={initialValues}
                validationSchema={validationSchemas[activeStep]}
                onSubmit={async (values) => {
                    try {
                        dispatch(handleLoader(true));

                        // Build the final payload matching the curl example
                        const payload = {
                            profileId: profileId?.value,
                            campaignName: values.campaignName,
                            dailyBudget: values.dailyBudget,
                            startDate: values.startDate,
                            endDate: values.endDate,
                            adGroups: values.adGroups, // Already an array of one string ["name"]
                            siteType: values.siteType,
                            targetingType: values.targetingType,
                            bidStrategy: values.bidStrategy,
                            placements: {
                                topOfSearch: Number(values.placements.topOfSearch),
                                restOfSearch: Number(values.placements.restOfSearch),
                                productPage: Number(values.placements.productPage)
                            },
                            products: values.products.map(p => ({
                                asin: p.asin,
                                sku: p.sku
                            })),

                            // Manual Targeting
                            ...(values.targetingType === "MANUAL" && {
                                manualTargetType: values.manualTargetType,
                                ...(values.manualTargetType === "keyword" && {
                                    manualKeywordTargeting: values.manualKeywordTargeting.map(k => ({
                                        keyword: k.keyword,
                                        matchType: k.matchType,
                                        bid: Number(k.bid)
                                    }))
                                }),
                                ...(values.manualTargetType === "product" && {
                                    manualProductTargeting: values.manualProductTargeting.map(p => ({
                                        type: p.type === "Exact" ? "asinSameAs" : (p.type === "Expanded" ? "asinExpanded" : p.type),
                                        bid: Number(p.bid),
                                        asin: p.asin
                                    }))
                                })
                            }),

                            // Automatic Targeting (Optional fields if needed by API)
                            ...(values.targetingType === "AUTO" && {
                                autoBidMode: values.autoBidMode,
                                ...(values.autoBidMode === "default" && {
                                    autoBidDefault: Number(values.autoBidDefault)
                                }),
                                ...(values.autoBidMode === "group" && {
                                    autoBidGroups: {
                                        closeMatch: Number(values.autoBidGroups.closeMatch),
                                        looseMatch: Number(values.autoBidGroups.looseMatch),
                                        substitutes: Number(values.autoBidGroups.substitutes),
                                        complements: Number(values.autoBidGroups.complements)
                                    }
                                })
                            }),

                            // Negative Targeting
                            negativeKeywords: values.negativeKeywords.map(k => ({
                                keyword: k.keyword,
                                matchType: k.matchType
                            })),
                            negativeProducts: values.negativeProducts.map(p => ({
                                product: { asin: p.product.asin }
                            }))
                        };

                        const res = await ApiCreateSPCampaign(payload);

                        if (res?.isSuccess) {
                            Toast.success(t("Campaign created successfully!"));
                            navigate("/campaigns");
                        } else {
                            Toast.error(res?.message || t("Failed to create campaign"));
                        }
                    } catch (err) {
                        console.log(err);
                        Toast.error(t("An error occurred during submission."));
                    } finally {
                        dispatch(handleLoader(false));
                    }
                }}
            >
                {(formik) => (
                    <Form className="campaign_form h-full">
                        <div className="campaign-flow-container">
                            <div className="campaign-flow-sidebar">
                                <h1 className="flow-title">{t("Create New Campaign")}</h1>
                                <p className="flow-subtitle">{t("Configure your advertising strategy for peak enterprise performance.")}</p>

                                <div id="campaign-stepper" className="stepper-container mt-4">
                                    {steps.map(step => (
                                        <div id={`campaign-step-${step.label}`} className="stepper-item" key={step.label}>
                                            <div className={`step-circle ${activeStep === step.label ? 'active' : ''} ${activeStep > step.label ? 'completed' : ''}`}>
                                                {activeStep > step.label ? <i className="fa-solid fa-check"></i> : (step.label + 1)}
                                            </div>
                                            <div className="step-text">
                                                <div className={`step-title ${activeStep < step.label ? 'inactive' : ''}`}>{t(step.visibleText)}</div>
                                                <div className="step-desc">{t(step.description)}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="setup-progress-box mt-5 mb-3">
                                    <div className="progress-header">
                                        <span className="progress-label">{t("SETUP PROGRESS")}</span>
                                        <span className="progress-pct">{Math.round(((activeStep + 1) / steps.length) * 100)}%</span>
                                    </div>
                                    <div className="progress-bar-bg">
                                        <div className="progress-bar-fill" style={{ width: `${Math.round(((activeStep + 1) / steps.length) * 100)}%` }}></div>
                                    </div>
                                </div>
                            </div>

                            <div className="campaign-flow-content">
                                {/* Mobile Header (Hidden on Desktop) */}
                                <div className="mobile-flow-header lg:hidden bg-white p-3 border-b border-slate-200 dark:border-slate-700 mb-3" style={{ margin: '-16px -16px 16px -16px' }}>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="font-bold" style={{ fontSize: '12px', color: 'var(--sidebar-active-text)', textTransform: 'uppercase' }}>{t("STEP")} {activeStep + 1} {t("OF")} {steps.length}</span>
                                        <span className="font-bold theme-text-dark" style={{ fontSize: '14px' }}>{t(steps[activeStep].visibleText)}</span>
                                    </div>
                                    <div className="progress-bar-bg" style={{ height: '6px', display: 'flex', gap: '4px', background: 'transparent' }}>
                                        {steps.map((s, i) => (
                                            <div key={i} className={`flex-1 ${i > activeStep ? 'theme-bg-slate' : ''}`} style={{ height: '100%', background: i <= activeStep ? 'var(--sidebar-active-text)' : '', borderRadius: '4px' }}></div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex-1 mt-3">
                                    <StepComponent formik={formik} currencySymbol={currencySymbol} />
                                </div>

                                <div className="form-footer">
                                    <button id="campaign-discard-btn" className="customize-button m-0 gap-0 mr-auto" type="button" style={{ height: "36px", display: "inline-flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" }} onClick={() => navigate("/campaigns")}>{t("Discard")}</button>
                                    {activeStep > 0 && (
                                        <button id="campaign-back-btn" className="customize-button m-0 gap-0" type="button" style={{ height: "36px", display: "inline-flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" }} onClick={handleBack}>
                                            <i className="fa-solid fa-arrow-left pr-1"></i> {t("Back")}
                                        </button>
                                    )}
                                    {activeStep < steps.length - 1 ? (
                                        <button id="campaign-next-btn" className="customize-button clicked m-0 gap-0" type="button" style={{ height: "36px", display: "inline-flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" }} onClick={() => handleNext(formik)}>{t("Next")}: {t(steps[activeStep + 1].visibleText)} <i className="fa-solid fa-arrow-right pl-1"></i></button>
                                    ) : (
                                        <button className="customize-button clicked m-0 gap-0" type="button" style={{ height: "36px", display: "inline-flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" }} onClick={async () => {
                                            const errors = await formik.validateForm();
                                            if (Object.keys(errors).length === 0) {
                                                setPendingSubmit(() => formik.submitForm);
                                                setSubmitConfirm(true);
                                            } else {
                                                formik.setTouched(errors);
                                                Toast.error(t("Please fix validation errors before submitting."));
                                            }
                                        }}>{t("Submit Campaign")}</button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Form>
                )}
            </Formik>

            <CustomModal
                show={submitConfirm}
                onHide={() => setSubmitConfirm(false)}
                title={t("Create Campaign")}
                subtitle={t("Review before submitting")}
                icon="campaign"
                iconVariant="primary"
                message={t("You are about to create a new campaign. Please ensure all settings, targeting, and products are correctly configured before proceeding.")}
                alertText={t("Once submitted, the campaign will be sent to Amazon Ads immediately. Review all steps before confirming.")}
                alertVariant="warning"
                closeOnBackdrop={false}
                actions={[
                    {
                        label: t("Cancel"),
                        cancel: true,
                        icon: "close",
                        onClick: () => {
                            setSubmitConfirm(false);
                            setPendingSubmit(null);
                        },
                    },
                    {
                        label: t("Submit Campaign"),
                        variant: "primary",
                        icon: "campaign",
                        onClick: async () => {
                            setSubmitConfirm(false);
                            if (pendingSubmit) await pendingSubmit();
                            setPendingSubmit(null);
                        },
                    },
                ]}
            />
        </>
    );
};

export default AddCampaign;
