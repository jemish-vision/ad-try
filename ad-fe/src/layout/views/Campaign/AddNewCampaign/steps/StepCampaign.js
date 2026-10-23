import React, { useContext, useEffect } from "react";
import TextInput from "./common/InputText";
import BooleanInput from "./common/BooleanInput";
import { useTranslation } from "react-i18next";
import { Field } from "formik";
import { ProfileContext } from "../../../../../helper/usecontext/useContext";
import { ShadcnDatePicker } from "../../../../../components/ui/date-picker";

const StepCampaign = ({ formik }) => {
  const { t } = useTranslation();
  const { values, setFieldValue, touched, errors } = formik;
  const { currencyCode } = useContext(ProfileContext);

  const currencySymbol = React.useMemo(() => {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode || "USD",
      })
        .formatToParts(0)
        .find((x) => x.type === "currency").value;
    } catch (err) {
      return "$";
    }
  }, [currencyCode]);

  useEffect(() => {
    const isAdGroupTouched = touched.adGroups || touched["adGroups[0]"];
    if (!isAdGroupTouched) {
      setFieldValue("adGroups", [values.campaignName || ""]);
    }
  }, [values.campaignName, touched, setFieldValue]);

  const targetingTypeField = {
    key: "targetingType",
    label: t("Targeting"),
    description: t("Choose how you want to target shoppers"),
    enum: ["AUTO", "MANUAL"],
    enumNames: [t("automaticTargeting"), t("manualTargeting")],
    enumDescriptions: [
      t("Amazon will target keywords and products that are similar to your product."),
      t("Choose keywords or products to target shopper searches and set custom bids."),
    ],
  };

  const placementFields = [
    {
      key: "placements.topOfSearch",
      keyValue: "topOfSearch",
      label: `${t("Top of Search")} (%)`,
      type: "number",
    },
    {
      key: "placements.restOfSearch",
      keyValue: "restOfSearch",
      label: `${t("Rest of Search")} (%)`,
      type: "number",
    },
    {
      key: "placements.productPage",
      keyValue: "productPage",
      label: `${t("Product Pages")} (%)`,
      type: "number",
    },
  ];

  const BiddingStrategies = [
    {
      id: "AUTO_FOR_SALES",
      title: t("Target CPA"),
      desc: t("Maximize conversions at a set cost per action."),
      icon: "fa-arrow-trend-up",
    },
    {
      id: "LEGACY_FOR_SALES",
      title: t("Maximize Clicks"),
      desc: t("Get as many clicks as possible within budget."),
      icon: "fa-bullseye",
    },
    {
      id: "MANUAL",
      title: t("Viewable CPM"),
      desc: t("Pay for every 1,000 viewable impressions."),
      icon: "fa-eye",
    },
  ];

  return (
    <div className="campaign-step-container">
      {/* Card 1: Basic Configuration (from the image) */}
      <div id="campaign-basic-config" className="modern-card">
        <h3 className="card-title">{t("Basic Configuration")}</h3>
        <p className="card-subtitle">
          {t("Set the foundational parameters for your new marketing initiative.")}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div id="campaign-name-field" className="mb-3">
            <div className="modern-label">{t("Campaign Name")}</div>
            <Field
              name="campaignName"
              className={`modern-input ${touched.campaignName && errors.campaignName ? "border-red-500" : ""}`}
              placeholder={t("e.g. Q4 Global Brand Awareness")}
            />
            {touched.campaignName && errors.campaignName && (
              <div className="text-red-500 text-xs mt-1">
                {t(errors.campaignName)}
              </div>
            )}
          </div>

          <div id="campaign-budget-field" className="mb-3">
            <div className="modern-label">{t("Daily Budget")}</div>
            <div className="modern-input-group">
              <span className="modern-input-prefix">{currencySymbol}</span>
              <Field
                name="dailyBudget"
                type="number"
                className={`modern-input has-prefix ${touched.dailyBudget && errors.dailyBudget ? "border-red-500" : ""}`}
                placeholder={t("0.00")}
              />
            </div>
            <div
              className="text-slate-500 dark:text-slate-400 text-xs mt-1"
              style={{ fontSize: "11px", fontWeight: 600 }}
            >
              {t("SUGGESTED")}: {currencySymbol}250.00 - {currencySymbol}1,500.00
            </div>
            {touched.dailyBudget && errors.dailyBudget && (
              <div className="text-red-500 text-xs mt-1">{t(errors.dailyBudget)}</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <div id="campaign-start-date" className="mb-3">
            <div className="modern-label">{t("Start Date")}</div>
            <ShadcnDatePicker
              value={values.startDate || ""}
              onChange={(val) => setFieldValue("startDate", val || "")}
              placeholder={t("Select Start Date")}
              className={touched.startDate && errors.startDate ? "border-red-500" : ""}
            />
            {touched.startDate && errors.startDate && (
              <div className="text-red-500 text-xs mt-1">{t(errors.startDate)}</div>
            )}
          </div>

          <div id="campaign-end-date" className="mb-3">
            <div className="modern-label">{t("End Date (Optional)")}</div>
            <ShadcnDatePicker
              value={values.endDate || ""}
              onChange={(val) => setFieldValue("endDate", val || "")}
              placeholder={t("Select End Date (Optional)")}
              className={touched.endDate && errors.endDate ? "border-red-500" : ""}
              disabledDate={values.startDate ? (date) => date < new Date(values.startDate) : undefined}
            />
            {touched.endDate && errors.endDate && (
              <div className="text-red-500 text-xs mt-1">{t(errors.endDate)}</div>
            )}
          </div>
        </div>

        {/* Visual Banner */}
        <div
          className="mt-4 rounded"
          style={{
            background:
              "linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.6)), url(https://images.unsplash.com/photo-1460925895917-afdab827c52f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            padding: "24px 32px",
            color: "white",
          }}
        >
          <h4
            style={{ fontWeight: 700, fontSize: "18px", marginBottom: "4px" }}
          >
            {t("Optimization Engine Active")}
          </h4>
          <p style={{ fontSize: "13px", margin: 0, opacity: 0.9 }}>
            {t("Our AI will automatically adjust bids based on your selected strategy to ensure maximum efficiency across all placements.")}
          </p>
        </div>
      </div>

      {/* Card 2: Advanced Configuration */}
      <div className="modern-card">
        <h3 className="card-title">{t("Advanced Settings")}</h3>
        <p className="card-subtitle">
          {t("Configure ad groups, targeting types, and platform selection.")}
        </p>

        <div className="grid grid-cols-1 gap-4">
          <div id="campaign-adgroup-field" className="mb-3">
            <TextInput
              field={{
                label: t("Ad Group Name"),
                key: "adGroups[0]",
                type: "text",
              }}
              value={formik.values.adGroups[0]}
              setFieldValue={(key, val) => {
                formik.setFieldTouched(key, true);
                formik.setFieldValue(key, val);
              }}
              formik={formik}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div id="campaign-site-field" className="mb-4">
            <BooleanInput
              field={{
                label: t("Select Site"),
                key: "siteType",
                type: "boolean",
                enum: ["AMAZON_HAUL", "AMAZON_BUSINESS"],
                enumNames: [t("Amazon"), t("Amazon Business")],
                enumDescriptions: [
                  t("Ads appear on Amazon—including both Amazon retail and Amazon Business."),
                  t("Use a B2B strategy to increase sales and exclusively reach business shoppers on Amazon Business."),
                ],
                description: t("Choose the site where your campaign will run."),
              }}
              value={formik.values.siteType}
              setFieldValue={formik.setFieldValue}
              formik={formik}
            />
          </div>

          <div id="campaign-targeting-field" className="mb-4">
            <BooleanInput
              field={targetingTypeField}
              value={values.targetingType}
              setFieldValue={setFieldValue}
              formik={formik}
            />
          </div>
        </div>

        <div id="campaign-bidding-strategy" className="mb-4">
          <div className="modern-label mb-2">{t("Bidding Strategy Mode")}</div>
          <div className="strategy-cards">
            {BiddingStrategies.map((strategy) => (
              <div
                key={strategy.id}
                className={`strategy-card ${values.bidStrategy === strategy.id ? "active" : ""} ${touched.bidStrategy && errors.bidStrategy ? "border-danger" : ""}`}
                onClick={() => setFieldValue("bidStrategy", strategy.id)}
              >
                <div className="strategy-header">
                  <div className="strategy-icon-wrapper">
                    <i
                      className={`fa-solid ${strategy.icon} strategy-icon`}
                    ></i>
                  </div>
                  <div className="strategy-radio"></div>
                </div>
                <div className="strategy-title">{t(strategy.title)}</div>
                <div className="strategy-desc">{t(strategy.desc)}</div>
              </div>
            ))}
          </div>
          {touched.bidStrategy && errors.bidStrategy && (
            <div className="text-red-500 text-xs mt-1">{t(errors.bidStrategy)}</div>
          )}
        </div>

        <div>
          <div className="modern-label mb-2">{t("Placements Adjustments")}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div id="campaign-top-search">
              <div
                className="modern-label text-slate-500 dark:text-slate-400 flex items-center gap-1"
                style={{ fontSize: "11px", textTransform: "uppercase" }}
              >
                <span className="text-red-500">*</span> {t("Top of Search")}{" "}
                <i
                  className="fa-solid fa-circle-question"
                  title={t("Top of search page")}
                ></i>
              </div>
              <Field
                name="placements.topOfSearch"
                type="number"
                className={`modern-input ${touched.placements?.topOfSearch && errors.placements?.topOfSearch ? "border-red-500" : ""}`}
                placeholder={t("Top of Search (%)")}
              />
              {touched.placements?.topOfSearch &&
                errors.placements?.topOfSearch && (
                  <div className="text-red-500 text-xs mt-1">
                    {t(errors.placements.topOfSearch)}
                  </div>
                )}
            </div>
            <div id="campaign-rest-search">
              <div
                className="modern-label text-slate-500 dark:text-slate-400 flex items-center gap-1"
                style={{ fontSize: "11px", textTransform: "uppercase" }}
              >
                <span className="text-red-500">*</span> {t("Rest of Search")}{" "}
                <i
                  className="fa-solid fa-circle-question"
                  title={t("Middle or bottom of search page")}
                ></i>
              </div>
              <Field
                name="placements.restOfSearch"
                type="number"
                className={`modern-input ${touched.placements?.restOfSearch && errors.placements?.restOfSearch ? "border-red-500" : ""}`}
                placeholder={t("Rest of Search (%)")}
              />
              {touched.placements?.restOfSearch &&
                errors.placements?.restOfSearch && (
                  <div className="text-red-500 text-xs mt-1">
                    {t(errors.placements.restOfSearch)}
                  </div>
                )}
            </div>
            <div id="campaign-product-pages">
              <div
                className="modern-label text-slate-500 dark:text-slate-400 flex items-center gap-1"
                style={{ fontSize: "11px", textTransform: "uppercase" }}
              >
                <span className="text-red-500">*</span> {t("Product Pages")}{" "}
                <i
                  className="fa-solid fa-circle-question"
                  title={t("Product detail pages")}
                ></i>
              </div>
              <Field
                name="placements.productPage"
                type="number"
                className={`modern-input ${touched.placements?.productPage && errors.placements?.productPage ? "border-red-500" : ""}`}
                placeholder={t("Product Pages (%)")}
              />
              {touched.placements?.productPage &&
                errors.placements?.productPage && (
                  <div className="text-red-500 text-xs mt-1">
                    {t(errors.placements.productPage)}
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepCampaign;
