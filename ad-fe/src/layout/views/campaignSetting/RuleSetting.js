import { useEffect, useContext, useState } from "react";

import { Formik, Form as FormikForm, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/ui/button";
import Filter from "../../../helper/filter/Filter";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { Toast } from "../../../helper/links/Link";
import { ApiGetRuleSettings, ApiSaveRuleSettings } from "../../../api-wrapper/ApiAdsConfig";
import { Input } from "../../../components/ui/input";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";

function RuleSetting() {
  const { t } = useTranslation();
  const { profileId, selectedAdType } = useContext(ProfileContext);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
  const hasUpdatePermission = PermissionCheck(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.UPDATE);

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const styles = getStyles(isDark);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [initialValues, setInitialValues] = useState({
    budgetRuleSetting: { minBudget: "", maxBudget: "" },
    placementRuleSetting: { minBid: "", maxBid: "" },
    targetingRuleSetting: { minBid: "", maxBid: "" },
  });

  const validationSchema = Yup.object({
    budgetRuleSetting: Yup.object({
      minBudget: Yup.number()
        .typeError(t("Min Budget must be a number"))
        .required(t("Min Budget is required"))
        .min(0, t("Min Budget cannot be negative")),
      maxBudget: Yup.number()
        .typeError(t("Max Budget must be a number"))
        .required(t("Max Budget is required"))
        .min(0, t("Max Budget cannot be negative"))
        .when("minBudget", (minBudget, schema) =>
          minBudget
            ? schema.min(minBudget, t("Max Budget must be greater than or equal to Min Budget ({{min}})", { min: minBudget }))
            : schema
        ),
    }),
    placementRuleSetting: Yup.object({
      minBid: Yup.number()
        .typeError(t("Min Bid must be a number"))
        .required(t("Min Bid is required"))
        .min(0, t("Min Bid cannot be negative")),
      maxBid: Yup.number()
        .typeError(t("Max Bid must be a number"))
        .required(t("Max Bid is required"))
        .min(0, t("Max Bid cannot be negative"))
        .when("minBid", (minBid, schema) =>
          minBid
            ? schema.min(minBid, t("Max Bid must be greater than or equal to Min Bid ({{min}})", { min: minBid }))
            : schema
        ),
    }),
    targetingRuleSetting: Yup.object({
      minBid: Yup.number()
        .typeError(t("Min Bid must be a number"))
        .required(t("Min Bid is required"))
        .min(0, t("Min Bid cannot be negative")),
      maxBid: Yup.number()
        .typeError(t("Max Bid must be a number"))
        .required(t("Max Bid is required"))
        .min(0, t("Max Bid cannot be negative"))
        .when("minBid", (minBid, schema) =>
          minBid
            ? schema.min(minBid, t("Max Bid must be greater than or equal to Min Bid ({{min}})", { min: minBid }))
            : schema
        ),
    }),
  });

  useEffect(() => {
    const fetchData = () => {
      ApiGetRuleSettings({ profileId: profileId?.value })
        .then((res) => {
          if (res?.isSuccess) {
            setInitialValues({
              budgetRuleSetting: res?.data?.budgetRuleSetting || { minBudget: "", maxBudget: "" },
              placementRuleSetting: res?.data?.placementRuleSetting || { minBid: "", maxBid: "" },
              targetingRuleSetting: res?.data?.targetingRuleSetting || { minBid: "", maxBid: "" },
            });
          } else {
            Toast.error(res?.message);
          }
        })
        .catch(() => Toast.error(t("Failed to load rule settings")));
    };

    if (profileId?.value && selectedAdType) fetchData();
  }, [profileId, selectedAdType]);

  const handleSubmit = (values) => {
    const payload = { profileId: profileId?.value, ...values };
    ApiSaveRuleSettings(payload)
      .then((res) => {
        if (res?.isSuccess) Toast.success(res?.message);
        else Toast.error(res?.message);
      })
      .catch(() => Toast.error(t("Something went wrong")));
  };

  const RuleField = ({ label, name, prefix = "₹", touched, errors, disabled }) => {
    const keys = name.split(".");
    const isTouched = touched?.[keys[0]]?.[keys[1]];
    const errorMsg = errors?.[keys[0]]?.[keys[1]];
    const hasError = isTouched && errorMsg;

    return (
      <div className="flex flex-col mb-3">
        <label className={`text-[13px] font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
          {label}
        </label>
        <div className="flex rounded-md shadow-sm">
          <span 
            className={`flex items-center justify-center px-3 border border-r-0 rounded-l-md text-[14px] ${
              hasError 
                ? (isDark ? "bg-red-500/10 border-red-500 text-red-500" : "bg-red-50 border-red-400 text-red-500") 
                : (isDark ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-slate-100 border-gray-200 text-slate-500")
            }`}
          >
            {prefix}
          </span>
          <Field name={name}>
            {({ field }) => (
              <Input
                {...field}
                type="number"
                min="0"
                placeholder={t("0.00")}
                className={`rounded-l-none ${hasError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                disabled={disabled}
                style={{
                  borderColor: hasError ? (isDark ? "#ef4444" : "#fca5a5") : (isDark ? "#334155" : "#e2e8f0"),
                  backgroundColor: isDark ? "#1e293b" : "#ffffff",
                  color: isDark ? "#f8fafc" : "#111827",
                }}
              />
            )}
          </Field>
        </div>
        <ErrorMessage name={name}>
          {(msg) => (
            <div className="mt-1 text-[12px] text-red-500 flex items-center gap-1">
              <span className="text-[11px]">⚠</span> {msg}
            </div>
          )}
        </ErrorMessage>
      </div>
    );
  };

  const SectionCard = ({ icon, title, subtitle, children }) => (
    <div style={styles.sectionCard}>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionIconWrap}>
          <span style={styles.sectionIcon}>{icon}</span>
        </div>
        <div>
          <div style={styles.sectionTitle}>{title}</div>
          <div style={styles.sectionSubtitle}>{subtitle}</div>
        </div>
      </div>
      <div style={styles.sectionBody}>{children}</div>
    </div>
  );

  return (
    <>
      <div className="bg-white">
        <Filter name={t("Rule Setting")} dateShow={false} profileShow />
      </div>

      <div className="middle_container">
        <div className="glass-grid-container overflow-hidden" style={{ padding: "24px", marginTop: "12px" }}>
          <div className='data_content data_content_btn' style={{ background: "transparent", border: "none", boxShadow: "none", margin: 0, padding: 0 }}>
            <Formik
              enableReinitialize
              initialValues={initialValues}
              validationSchema={validationSchema}
              onSubmit={handleSubmit}
            >
              {({ errors, touched, isValid, dirty }) => (
                <FormikForm>
                  <div style={styles.pageHeader}>
                    <div>
                      <h5 style={styles.pageTitle}>{t("Rule Settings")}</h5>
                      <p style={styles.pageSubtitle}>
                        {t("Configure min/max thresholds for budget, placement, and targeting rules")}
                      </p>
                    </div>
                  </div>

                  {Object.keys(errors).length > 0 && Object.keys(touched).length > 0 && (
                    <div style={styles.errorSummary}>
                      <strong style={{ color: "#991b1b" }}>⚠ {t("Please fix the following errors before saving:")}</strong>
                      <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                        {errors?.budgetRuleSetting?.minBudget && touched?.budgetRuleSetting?.minBudget && (
                          <li style={styles.summaryItem}>{t("Budget Rule — Min Budget:")} {errors.budgetRuleSetting.minBudget}</li>
                        )}
                        {errors?.budgetRuleSetting?.maxBudget && touched?.budgetRuleSetting?.maxBudget && (
                          <li style={styles.summaryItem}>{t("Budget Rule — Max Budget:")} {errors.budgetRuleSetting.maxBudget}</li>
                        )}
                        {errors?.placementRuleSetting?.minBid && touched?.placementRuleSetting?.minBid && (
                          <li style={styles.summaryItem}>{t("Placement Rule — Min Bid:")} {errors.placementRuleSetting.minBid}</li>
                        )}
                        {errors?.placementRuleSetting?.maxBid && touched?.placementRuleSetting?.maxBid && (
                          <li style={styles.summaryItem}>{t("Placement Rule — Max Bid:")} {errors.placementRuleSetting.maxBid}</li>
                        )}
                        {errors?.targetingRuleSetting?.minBid && touched?.targetingRuleSetting?.minBid && (
                          <li style={styles.summaryItem}>{t("Targeting Rule — Min Bid:")} {errors.targetingRuleSetting.minBid}</li>
                        )}
                        {errors?.targetingRuleSetting?.maxBid && touched?.targetingRuleSetting?.maxBid && (
                          <li style={styles.summaryItem}>{t("Targeting Rule — Max Bid:")} {errors.targetingRuleSetting.maxBid}</li>
                        )}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="col-span-1 md:col-span-12" id="budget-rule-config">
                      <SectionCard
                        icon="💰"
                        title={t("Budget Rule")}
                        subtitle={t("Set the minimum and maximum daily budget limits for your campaigns")}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="col-span-1 md:col-span-6">
                            <RuleField
                              label={t("Min Budget")}
                              name="budgetRuleSetting.minBudget"
                              touched={touched}
                              errors={errors}
                              disabled={!hasUpdatePermission}
                            />
                          </div>
                          <div className="col-span-1 md:col-span-6">
                            <RuleField
                              label={t("Max Budget")}
                              name="budgetRuleSetting.maxBudget"
                              touched={touched}
                              errors={errors}
                              disabled={!hasUpdatePermission}
                            />
                          </div>
                        </div>
                        <RangeHint
                          min={initialValues.budgetRuleSetting.minBudget}
                          max={initialValues.budgetRuleSetting.maxBudget}
                          unit="₹"
                        />
                      </SectionCard>
                    </div>

                    <div className="col-span-1 md:col-span-6" id="placement-rule-config">
                      <SectionCard
                        icon="📍"
                        title={t("Placement Rule")}
                        subtitle={t("Control bid range for ad placements across your campaigns")}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="col-span-1 md:col-span-6">
                            <RuleField
                              label={t("minBid")}
                              name="placementRuleSetting.minBid"
                              touched={touched}
                              errors={errors}
                              disabled={!hasUpdatePermission}
                            />
                          </div>
                          <div className="col-span-1 md:col-span-6">
                            <RuleField
                              label={t("maxBid")}
                              name="placementRuleSetting.maxBid"
                              touched={touched}
                              errors={errors}
                              disabled={!hasUpdatePermission}
                            />
                          </div>
                        </div>
                        <RangeHint
                          min={initialValues.placementRuleSetting.minBid}
                          max={initialValues.placementRuleSetting.maxBid}
                          unit="₹"
                        />
                      </SectionCard>
                    </div>

                    <div className="col-span-1 md:col-span-6" id="targeting-rule-config">
                      <SectionCard
                        icon="🎯"
                        title={t("Targeting Rule")}
                        subtitle={t("Define bid boundaries for keyword and product targeting")}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="col-span-1 md:col-span-6">
                            <RuleField
                              label={t("minBid")}
                              name="targetingRuleSetting.minBid"
                              touched={touched}
                              errors={errors}
                              disabled={!hasUpdatePermission}
                            />
                          </div>
                          <div className="col-span-1 md:col-span-6">
                            <RuleField
                              label={t("maxBid")}
                              name="targetingRuleSetting.maxBid"
                              touched={touched}
                              errors={errors}
                              disabled={!hasUpdatePermission}
                            />
                          </div>
                        </div>
                        <RangeHint
                          min={initialValues.targetingRuleSetting.minBid}
                          max={initialValues.targetingRuleSetting.maxBid}
                          unit="₹"
                        />
                      </SectionCard>
                    </div>
                  </div>

                  <div style={{ ...styles.bottomBar, flexDirection: isMobile ? "column" : "row", gap: isMobile ? "12px" : "0px", textAlign: isMobile ? "center" : "left" }}>
                    <span style={styles.bottomHint}>
                      {dirty ? <>⚪ {t("You have unsaved changes")}</> : <>✅ {t("All changes saved")}</>}
                    </span>
                    <Button
                      type="submit"
                      disabled={!isValid || !hasUpdatePermission}
                      className={`improve add_btn h-[38px] bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] !text-white hover:opacity-90 !border-0 px-[22px] text-[13px] font-semibold shadow-sm flex items-center justify-center m-0 transition-all duration-200 ${(!isValid || !hasUpdatePermission) ? 'opacity-70 cursor-not-allowed' : ''}`}
                      style={{
                      }}
                      onMouseLeave={(e) => {
                        if (isValid) {
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = "0 4px 12px rgba(2, 70, 139, 0.2)";
                        }
                      }}
                    >
                      {t("Save Settings")}
                    </Button>
                  </div>

                </FormikForm>
              )}
            </Formik>
          </div>
        </div>
      </div>
    </>
  );
}

// Range indicator helper
function RangeHint({ min, max, unit }) {
  const { t } = useTranslation();
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const styles = getStyles(isDark);
  if (!min && !max) return null;
  return (
    <div style={styles.rangeHint}>
      <span style={styles.rangeLabel}>{t("Current range:")}</span>
      <span style={styles.rangeBadge}>{unit}{min || "—"}</span>
      <span style={{ color: "#94a3b8", fontSize: "12px" }}>{t("to")}</span>
      <span style={styles.rangeBadge}>{unit}{max || "—"}</span>
    </div>
  );
}

const getStyles = (isDark) => ({
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "15px",
    flexWrap: "wrap",
    gap: "12px",
  },
  pageTitle: {
    fontSize: "20px",
    fontWeight: 600,
    margin: 0,
    color: isDark ? "#f8fafc" : "#1e293b",
  },
  pageSubtitle: {
    fontSize: "13px",
    color: isDark ? "#cbd5e1" : "#64748b",
    margin: "4px 0 0 0",
  },
  saveBtn: {
    background: "#2563eb",
    border: "none",
    borderRadius: "8px",
    padding: "0px 24px",
    height: "40px",
    fontSize: "14px",
    fontWeight: 500,
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  errorSummary: {
    background: isDark ? "rgba(239, 68, 68, 0.1)" : "#fef2f2",
    border: isDark ? "1px solid #7f1d1d" : "1px solid #fecaca",
    borderRadius: "10px",
    padding: "14px 18px",
    marginBottom: "20px",
    fontSize: "13px",
    color: isDark ? "#f8fafc" : "#7f1d1d",
  },
  summaryItem: {
    marginTop: "4px",
    color: isDark ? "#fca5a5" : "#991b1b",
  },
  sectionCard: {
    background: isDark ? "rgba(255, 255, 255, 0.03)" : "#fff",
    border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
    borderRadius: "12px",
    overflow: "hidden",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "16px 20px",
    background: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc",
    borderBottom: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
  },
  sectionIconWrap: {
    width: "40px",
    height: "40px",
    borderRadius: "10px",
    background: isDark ? "rgba(37, 99, 235, 0.15)" : "#eff6ff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sectionIcon: {
    fontSize: "18px",
  },
  sectionTitle: {
    fontSize: "15px",
    fontWeight: 600,
    color: isDark ? "#f8fafc" : "#1e293b",
  },
  sectionSubtitle: {
    fontSize: "12px",
    color: isDark ? "#cbd5e1" : "#64748b",
    marginTop: "2px",
  },
  sectionBody: {
    padding: "20px",
  },
  fieldLabel: {
    fontSize: "13px",
    fontWeight: 500,
    color: isDark ? "#cbd5e1" : "#374151",
    marginBottom: "6px",
  },
  prefix: {
    background: isDark ? "#1e293b" : "#f1f5f9",
    border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
    borderRight: "none",
    color: isDark ? "#cbd5e1" : "#64748b",
    fontSize: "14px",
  },
  prefixError: {
    background: isDark ? "rgba(239, 68, 68, 0.1)" : "#fef2f2",
    border: isDark ? "1px solid #ef4444" : "1px solid #fca5a5",
    borderRight: "none",
    color: "#ef4444",
    fontSize: "14px",
  },
  input: {
    fontSize: "14px",
    borderColor: isDark ? "#334155" : "#e2e8f0",
    backgroundColor: isDark ? "#1e293b" : "#fff",
    color: isDark ? "#f8fafc" : "#1e293b",
  },
  errorMsg: {
    marginTop: "5px",
    fontSize: "12px",
    color: "#dc2626",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  errorIcon: {
    fontSize: "11px",
  },
  rangeHint: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginTop: "14px",
    padding: "8px 12px",
    background: isDark ? "rgba(22, 163, 74, 0.1)" : "#f0fdf4",
    borderRadius: "8px",
  },
  rangeLabel: {
    fontSize: "12px",
    color: isDark ? "#cbd5e1" : "#64748b",
  },
  rangeBadge: {
    fontSize: "12px",
    fontWeight: 600,
    color: isDark ? "#4ade80" : "#15803d",
    background: isDark ? "rgba(22, 163, 74, 0.2)" : "#dcfce7",
    padding: "2px 8px",
    borderRadius: "999px",
  },
  bottomBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "28px",
    padding: "16px 20px",
    background: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc",
    borderRadius: "12px",
    border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
  },
  bottomHint: {
    fontSize: "13px",
    color: isDark ? "#cbd5e1" : "#64748b",
  },
});

export default RuleSetting;