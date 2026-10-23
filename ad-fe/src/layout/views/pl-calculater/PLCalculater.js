import Filter from "../../../helper/filter/Filter";
import { useTranslation } from "react-i18next";
import { Formik, Form as FormikForm, Field } from "formik";
import * as Yup from "yup";
import { useState, useContext, useEffect, useRef } from "react";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import { Toast } from "../../../helper/links/Link";
import { ApiGetPLHistory, ApiRemovePLHistory, ApiSavePLHistory } from "../../../api-wrapper/campaign/ApiCampaign";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { Card, CardHeader, CardContent } from "src/components/ui/card";
import { Input } from "src/components/ui/input";

/* 🔹 MUI */
import { Calculator, TrendingUp, Info, Tag, FileText, CheckCircle2, Scale, XCircle, Lightbulb } from "lucide-react";
import CalculatorWizard from "./components/wizard/CalculatorWizard";

function PLCalculater() {
  const { t } = useTranslation();
  const { profileId, selectedAdType } = useContext(ProfileContext);

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }, []);

  const [activeTab, setActiveTab] = useState("pl"); // "pl" | "breakeven"
  const tabTrackRef = useRef(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 4, width: 0, opacity: 0 });

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
  }, [activeTab]);
  const [result, setResult] = useState(null);
  const [breakEvenResult, setBreakEvenResult] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [history, setHistory] = useState([]);

  const initialValues = {
    units: "",
    revenue: "",
    cogs: "",
    amazonFees: "",
    shipping: "",
    itemFees: "",
    adSpend: "",
  };

  const validationSchema = Yup.object({
    units: Yup.number().required("Required").min(0),
    revenue: Yup.number().required("Required").min(0),
    cogs: Yup.number().required("Required").min(0),
    amazonFees: Yup.number().required("Required").min(0),
    shipping: Yup.number().required("Required").min(0),
    itemFees: Yup.number().required("Required").min(0),
    adSpend: Yup.number().required("Required").min(0),
  });

  const handleCalculate = (values) => {
    const netPL = values?.revenue - values?.amazonFees - values?.cogs - values?.shipping - values?.itemFees - values?.adSpend;
    const profitPercent = (netPL / values?.revenue) * 100;
    const tcos = (values?.adSpend / values?.revenue) * 100;

    const payload = {
      ...values,
      netPL,
      profitPercent,
      tcos,
      profileId: profileId.value,
    };
    ApiSavePLHistory(payload)
      .then((res) => {
        if (res.isSuccess) {
          setResult({ netPL, profitPercent, tcos });
          fetchHistory();
        } else {
          Toast.error(res.message);
        }
      })
      .catch(() => {
        Toast.error(t("something went wrong!!"));
      });
  };

  const removeHistory = (ids) => {
    ApiRemovePLHistory({ profileId: profileId.value, ids })
      .then((res) => {
        if (res.isSuccess) fetchHistory();
      })
      .catch(() => Toast.error(t("Delete failed")));
  };

  const fetchHistory = () => {
    ApiGetPLHistory({ profileId: profileId.value })
      .then((res) => {
        if (res.isSuccess) setHistory(res?.data || []);
      })
      .catch(() => Toast.error(t("Failed to load history")));
  };

  useEffect(() => {
    if (profileId?.value && selectedAdType) fetchHistory();
  }, [profileId, selectedAdType]);

  const breakEvenInitialValues = {
    sellingPrice: "",
    productCost: "",
    amazonFees: "",
    shipping: "",
  };

  const breakEvenValidationSchema = Yup.object({
    sellingPrice: Yup.number().required("Required").min(0),
    productCost: Yup.number().required("Required").min(0),
    amazonFees: Yup.number().required("Required").min(0),
    shipping: Yup.number().required("Required").min(0),
  });

  const handleBreakEvenCalculate = (values) => {
    const sp = Number(values.sellingPrice);
    const totalNonAdsCost = Number(values.productCost) + Number(values.amazonFees) + Number(values.shipping);
    const remainingMargin = sp - totalNonAdsCost;
    const breakEvenACOS = (remainingMargin / sp) * 100;

    setBreakEvenResult({
      totalNonAdsCost,
      remainingMargin,
      breakEvenACOS,
    });
  };

  return (
    <>
      <Filter
        name={"P/L Calculater"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
        tourId={activeTab === "pl" ? "pl-calculater" : "breakeven-calculater"}
      />

      <div className="middle_container budget_container">
        <Card
          className="overflow-hidden"
          style={{
            backgroundColor: isDark ? "#1e293b" : "#fff",
            borderColor: isDark ? "#334155" : "#e2e8f0",
          }}
        >
          {/* ── HEADER ── */}
          <CardHeader
            className="border-b space-y-0"
            style={{
              padding: "12px 24px",
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottomColor: isDark ? "#334155" : "#e2e8f0",
              backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "transparent",
            }}
          >
            <div className="flex items-center gap-2">
              <div id="pl-tab-view" className="or-tab-switcher m-0">
                <div className="or-tab-switcher__track" ref={tabTrackRef}>
                  <div
                    className="or-tab-switcher__indicator"
                    style={{
                      ...indicatorStyle,
                      transform: 'none',
                      transition: 'left 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  />
                  <button
                    className={`or-tab-switcher__btn ${activeTab === "pl" ? "or-tab-switcher__btn--active" : ""}`}
                    onClick={() => setActiveTab("pl")}
                  >
                    <Calculator style={{ fontSize: 16, width: 16, height: 16 }} />
                    <span>{t("P/L Calculator")}</span>
                  </button>
                  <button
                    className={`or-tab-switcher__btn ${activeTab === "breakeven" ? "or-tab-switcher__btn--active" : ""}`}
                    onClick={() => setActiveTab("breakeven")}
                  >
                    <TrendingUp style={{ fontSize: 16, width: 16, height: 16 }} />
                    <span>{t("Break Even Calculator")}</span>
                  </button>
                </div>
              </div>
            </div>
            {/* History button removed to make space for Download PDF */}
          </CardHeader>

          <CardContent className="p-6">
            {activeTab === "pl" && (
              <CalculatorWizard isDark={isDark} />
            )}

            {activeTab === "breakeven" && (
              <Formik
                initialValues={breakEvenInitialValues}
                validationSchema={breakEvenValidationSchema}
                onSubmit={handleBreakEvenCalculate}
              >
                {({ errors, touched, resetForm, values }) => {
                  const liveSp = parseFloat(values.sellingPrice) || 0;
                  const liveProductCost = parseFloat(values.productCost) || 0;
                  const liveAmazonFees = parseFloat(values.amazonFees) || 0;
                  const liveShipping = parseFloat(values.shipping) || 0;
                  const liveTotalNonAdCost = liveProductCost + liveAmazonFees + liveShipping;
                  const liveRemainingMargin = liveSp - liveTotalNonAdCost;

                  return (
                    <FormikForm>
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* ── INPUT PANELS COLUMN ── */}
                        <div className="lg:col-span-7 flex flex-col gap-4">
                          {[
                            {
                              id: "be-revenue-details",
                              title: t("Revenue"),
                              color: "#10b981",
                              fields: [
                                { label: t("Selling Price (SP)"), name: "sellingPrice", placeholder: "e.g. 1000" },
                              ]
                            },
                            {
                              id: "be-cost-details",
                              title: t("Non-Advertising Costs"),
                              color: "#f59e0b",
                              fields: [
                                { label: t("Product Cost"), name: "productCost", placeholder: "e.g. 400" },
                                { label: t("Amazon Fees"), name: "amazonFees", placeholder: "e.g. 180" },
                                { label: t("Shipping & Other Cost"), name: "shipping", placeholder: "e.g. 120" },
                              ]
                            }
                          ].map((group) => (
                            <div key={group.id} id={group.id} style={{ background: isDark ? "rgba(255,255,255,0.03)" : "#f8fafc", border: isDark ? "1px solid #334155" : "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px" }}>
                              <div className="flex items-center gap-2 mb-3">
                                <div style={{ width: 4, height: 18, borderRadius: 2, background: group.color }} />
                                <h6 className="m-0 font-bold" style={{ color: isDark ? "#f8fafc" : "#1e293b" }}>{group.title}</h6>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {group.fields.map((field) => (
                                  <div key={field.name} className="flex flex-col gap-1.5">
                                    <label className="font-semibold text-xs" style={{ color: isDark ? "#cbd5e1" : "#4b5563" }}>{field.label}</label>
                                    <Field
                                      as={Input}
                                      type="number"
                                      min="0"
                                      onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                                      name={field.name}
                                      placeholder={field.placeholder}
                                      style={{
                                        borderRadius: 8,
                                        height: 40,
                                        marginTop: 0,
                                        fontSize: "13px",
                                        border: touched[field.name] && errors[field.name] ? "1px solid #ef4444" : (isDark ? "1px solid #334155" : "1px solid #cbd5e1"),
                                        backgroundColor: isDark ? "#1e293b" : "#fff",
                                        color: isDark ? "#f8fafc" : "#0f172a"
                                      }}
                                    />
                                    {touched[field.name] && errors[field.name] && (
                                      <span className="text-red-500 text-[11px] font-medium">{errors[field.name]}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}

                          {/* 🔹 LIVE PREVIEW SUMMARY */}
                          <div className="p-4 flex flex-col gap-3" style={{ background: isDark ? "rgba(255,255,255,0.03)" : "#f8fafc", border: isDark ? "1px solid #334155" : "1px solid #e2e8f0", borderRadius: 12 }}>
                            <div className="flex justify-between items-center text-[13px] font-semibold" style={{ color: isDark ? "#cbd5e1" : "#4b5563" }}>
                              <div className="flex items-center gap-1.5">
                                {t("Total Non-Advertising Costs")}
                              </div>
                              <div className="text-[14px]" style={{ color: isDark ? "#f8fafc" : "#1e293b" }}>{CurrencyCode(liveTotalNonAdCost)}</div>
                            </div>
                            <div className="flex justify-between items-center text-[13px] font-semibold" style={{ color: isDark ? "#cbd5e1" : "#4b5563" }}>
                              <div className="flex items-center gap-1.5">
                                {t("Remaining Margin (SP - Non-Ad Costs)")}
                              </div>
                              <div className="text-[14px]" style={{ color: isDark ? "#f8fafc" : "#1e293b" }}>{CurrencyCode(liveRemainingMargin)}</div>
                            </div>
                          </div>

                          {/* 🔹 ACTION BUTTONS */}
                          <div id="be-action-buttons" className="flex gap-2">
                            <button
                              type="submit"
                              className="h-10 px-6 rounded-md font-semibold text-white transition-all hover:opacity-90"
                              style={{
                                background: "linear-gradient(135deg, #2374F2, #1A9FD4)",
                                fontSize: "13px",
                              }}
                            >
                              {t("Calculate Break Even")}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                resetForm();
                                setBreakEvenResult(null);
                              }}
                              className="h-10 px-6 rounded-md font-semibold border transition-all hover:bg-slate-50 dark:hover:bg-slate-800"
                              style={{
                                backgroundColor: isDark ? "#1e293b" : "#fff",
                                borderColor: isDark ? "#334155" : "#cbd5e1",
                                color: isDark ? "#f8fafc" : "#1e293b",
                                fontSize: "13px",
                              }}
                            >
                              {t("Reset")}
                            </button>
                          </div>
                        </div>

                        {/* ── OUTPUT COLUMN ── */}
                        <div id="be-output-card" className="lg:col-span-5 flex flex-col gap-3">
                          {breakEvenResult ? (
                            (() => {
                              const breakEvenVal = breakEvenResult?.breakEvenACOS || 0;
                              const isBreakEvenLoss = breakEvenVal < 0;
                              const isBreakEvenZero = breakEvenVal === 0;

                              const primaryColor = isBreakEvenLoss ? "#ef4444" : (isBreakEvenZero ? "#f59e0b" : "#10b981");
                              const badgeBg = isBreakEvenLoss ? (isDark ? "rgba(248,113,113,0.15)" : "#fee2e2") : (isBreakEvenZero ? (isDark ? "rgba(251,191,36,0.15)" : "#fef3c7") : (isDark ? "rgba(74,222,128,0.15)" : "#dcfce7"));
                              const badgeText = isBreakEvenLoss ? (isDark ? "#f87171" : "#991b1b") : (isBreakEvenZero ? (isDark ? "#fbbf24" : "#b45309") : (isDark ? "#4ade80" : "#166534"));
                              const badgeBorder = isBreakEvenLoss ? (isDark ? "1px solid rgba(248,113,113,0.2)" : "1px solid #fecaca") : (isBreakEvenZero ? (isDark ? "1px solid rgba(251,191,36,0.2)" : "1px solid #fde68a") : (isDark ? "1px solid rgba(74,222,128,0.2)" : "1px solid #bbf7d0"));

                              const alertBg = isBreakEvenLoss ? (isDark ? "rgba(248,113,113,0.1)" : "#fef2f2") : (isBreakEvenZero ? (isDark ? "rgba(251,191,36,0.1)" : "#fffbeb") : (isDark ? "rgba(74,222,128,0.1)" : "#f0fdf4"));
                              const alertBorder = isBreakEvenLoss ? (isDark ? "rgba(248,113,113,0.2)" : "#fecaca") : (isBreakEvenZero ? (isDark ? "rgba(251,191,36,0.2)" : "#fde68a") : (isDark ? "rgba(74,222,128,0.2)" : "#bbf7d0"));
                              const alertText = isBreakEvenLoss ? (isDark ? "#f87171" : "#991b1b") : (isBreakEvenZero ? (isDark ? "#fbbf24" : "#b45309") : (isDark ? "#4ade80" : "#166534"));

                              const rmVal = breakEvenResult?.remainingMargin || 0;
                              const isRmLoss = rmVal < 0;
                              const isRmZero = rmVal === 0;

                              const rmIconBg = isRmLoss ? (isDark ? "rgba(248,113,113,0.15)" : "#fee2e2") : (isRmZero ? (isDark ? "rgba(251,191,36,0.15)" : "#fef3c7") : (isDark ? "rgba(74,222,128,0.15)" : "#dcfce7"));
                              const rmIconColor = isRmLoss ? (isDark ? "#f87171" : "#991b1b") : (isRmZero ? (isDark ? "#fbbf24" : "#b45309") : (isDark ? "#4ade80" : "#166534"));

                              return (
                                <div className="flex flex-col gap-3 h-full" style={{ background: isDark ? "rgba(255,255,255,0.02)" : "#ffffff", border: isDark ? "1px solid #334155" : "1px solid #e2e8f0", borderRadius: 12, padding: "20px" }}>

                                  {/* Heading */}
                                  <div className="flex items-center gap-2 mb-2">
                                    <div style={{ width: 4, height: 18, borderRadius: 2, background: primaryColor }} />
                                    <h6 className="m-0 font-bold" style={{ color: isDark ? "#f8fafc" : "#1e293b" }}>{t("Break-even Results")}</h6>
                                  </div>

                                  {/* Break Even ACOS Primary Card */}
                                  <div className="flex flex-col items-center justify-center p-6 border rounded-xl" style={{ border: isDark ? "1px solid #334155" : "1px solid #e2e8f0", background: isDark ? "rgba(255,255,255,0.02)" : "#f8fafc" }}>
                                    <div className="font-semibold mb-1" style={{ fontSize: 14, color: isDark ? "#cbd5e1" : "#4b5563" }}>{t("Break-even ACOS")}</div>
                                    <div className="flex items-center gap-2">
                                      <h3 className={`fw-extrabold m-0`} style={{ fontSize: 40, letterSpacing: "-0.04em", color: primaryColor }}>
                                        {CurrencyFormat(breakEvenResult?.breakEvenACOS)}%
                                      </h3>
                                    </div>
                                    <div className="mt-3 px-3 py-1 rounded-full text-xs font-bold" style={{ background: badgeBg, color: badgeText, border: badgeBorder }}>
                                      {t("Maximum Ad Spend Limit")}
                                    </div>
                                  </div>

                                  {/* Alert Box */}
                                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl border mt-1" style={{ background: alertBg, borderColor: alertBorder, color: alertText }}>
                                    <Info className="w-4 h-4 shrink-0" />
                                    <span className="text-sm font-medium">
                                      {isBreakEvenLoss
                                        ? t("You are currently operating at a loss even without ad spend.")
                                        : isBreakEvenZero
                                          ? t("You are exactly at break-even (No profit, no loss).")
                                          : <>{t("Keep your ACOS at or below")} {CurrencyFormat(breakEvenResult?.breakEvenACOS)}% {t("to avoid losses.")}</>}
                                    </span>
                                  </div>

                                  {/* Split Metric Cards */}
                                  <div className="grid grid-cols-2 gap-3 mt-2">
                                    {/* Remaining Margin */}
                                    <div className="p-4 border rounded-xl flex flex-col justify-between" style={{ border: isDark ? "1px solid #334155" : "1px solid #e2e8f0", background: isDark ? "rgba(255,255,255,0.02)" : "#ffffff" }}>
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <div className="font-semibold text-xs mb-1" style={{ color: isDark ? "#cbd5e1" : "#64748b" }}>{t("Remaining Margin")}</div>
                                          <h4 className="m-0 fw-bold text-lg" style={{ color: isDark ? "#f8fafc" : "#1e293b" }}>
                                            {CurrencyCode(breakEvenResult?.remainingMargin)}
                                          </h4>
                                        </div>
                                        <div className="p-2 rounded-lg" style={{ background: rmIconBg, color: rmIconColor }}>
                                          <Tag className="w-5 h-5" />
                                        </div>
                                      </div>
                                      <div className="text-xs mt-2" style={{ color: isDark ? "#94a3b8" : "#64748b" }}>{t("Available for ads or profit")}</div>
                                    </div>

                                    {/* Total Non-Ad Costs */}
                                    <div className="p-4 border rounded-xl flex flex-col justify-between" style={{ border: isDark ? "1px solid #334155" : "1px solid #e2e8f0", background: isDark ? "rgba(255,255,255,0.02)" : "#ffffff" }}>
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <div className="font-semibold text-xs mb-1" style={{ color: isDark ? "#cbd5e1" : "#64748b" }}>{t("Total Non-Ad Costs")}</div>
                                          <h4 className="m-0 fw-bold text-lg" style={{ color: isDark ? "#f8fafc" : "#1e293b" }}>
                                            {CurrencyCode(breakEvenResult?.totalNonAdsCost)}
                                          </h4>
                                        </div>
                                        <div className="p-2 rounded-lg" style={{ background: isDark ? "rgba(59,130,246,0.15)" : "#eff6ff", color: isDark ? "#60a5fa" : "#1d4ed8" }}>
                                          <FileText className="w-5 h-5" />
                                        </div>
                                      </div>
                                      <div className="text-xs mt-2" style={{ color: isDark ? "#94a3b8" : "#64748b" }}>{t("All costs excluding ads")}</div>
                                    </div>
                                  </div>

                                  {/* What does this mean? */}
                                  <div className="mt-4">
                                    <h6 className="font-bold text-sm mb-3" style={{ color: isDark ? "#f8fafc" : "#1e293b" }}>{t("What does this mean?")}</h6>
                                    <div className="flex flex-col gap-2">
                                      {/* Profit Row */}
                                      <div className="flex items-center justify-between p-3 rounded-xl border" style={{ background: isDark ? "rgba(255,255,255,0.02)" : "#ffffff", borderColor: isDark ? "#334155" : "#e2e8f0" }}>
                                        <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: isDark ? "rgba(74,222,128,0.15)" : "#f0fdf4", color: isDark ? "#4ade80" : "#166534" }}>
                                            <CheckCircle2 className="w-4 h-4" />
                                          </div>
                                          <div>
                                            <div className="font-bold text-[13px]" style={{ color: isDark ? "#4ade80" : "#166534" }}>ACOS &lt; {CurrencyFormat(breakEvenResult?.breakEvenACOS)}%</div>
                                            <div className="text-xs" style={{ color: isDark ? "#94a3b8" : "#64748b" }}>{t("You are making a profit")}</div>
                                          </div>
                                        </div>
                                        <div className="px-3 py-1 rounded-full text-[11px] font-bold" style={{ background: isDark ? "rgba(74,222,128,0.15)" : "#f0fdf4", color: isDark ? "#4ade80" : "#166534" }}>{t("Profit")}</div>
                                      </div>

                                      {/* Break-even Row */}
                                      <div className="flex items-center justify-between p-3 rounded-xl border" style={{ background: isDark ? "rgba(255,255,255,0.02)" : "#ffffff", borderColor: isDark ? "#334155" : "#e2e8f0" }}>
                                        <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: isDark ? "rgba(251,191,36,0.15)" : "#fffbeb", color: isDark ? "#fbbf24" : "#b45309" }}>
                                            <Scale className="w-4 h-4" />
                                          </div>
                                          <div>
                                            <div className="font-bold text-[13px]" style={{ color: isDark ? "#fbbf24" : "#b45309" }}>ACOS = {CurrencyFormat(breakEvenResult?.breakEvenACOS)}%</div>
                                            <div className="text-xs" style={{ color: isDark ? "#94a3b8" : "#64748b" }}>{t("You are at break-even (No profit, no loss)")}</div>
                                          </div>
                                        </div>
                                        <div className="px-3 py-1 rounded-full text-[11px] font-bold" style={{ background: isDark ? "rgba(251,191,36,0.15)" : "#fffbeb", color: isDark ? "#fbbf24" : "#b45309" }}>{t("Break-even")}</div>
                                      </div>

                                      {/* Loss Row */}
                                      <div className="flex items-center justify-between p-3 rounded-xl border" style={{ background: isDark ? "rgba(255,255,255,0.02)" : "#ffffff", borderColor: isDark ? "#334155" : "#e2e8f0" }}>
                                        <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: isDark ? "rgba(248,113,113,0.15)" : "#fef2f2", color: isDark ? "#f87171" : "#b91c1c" }}>
                                            <XCircle className="w-4 h-4" />
                                          </div>
                                          <div>
                                            <div className="font-bold text-[13px]" style={{ color: isDark ? "#f87171" : "#b91c1c" }}>ACOS &gt; {CurrencyFormat(breakEvenResult?.breakEvenACOS)}%</div>
                                            <div className="text-xs" style={{ color: isDark ? "#94a3b8" : "#64748b" }}>{t("You are making a loss")}</div>
                                          </div>
                                        </div>
                                        <div className="px-3 py-1 rounded-full text-[11px] font-bold" style={{ background: isDark ? "rgba(248,113,113,0.15)" : "#fef2f2", color: isDark ? "#f87171" : "#b91c1c" }}>{t("Loss")}</div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Tip Box */}
                                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl border mt-2" style={{ background: isDark ? "rgba(59,130,246,0.1)" : "#eff6ff", borderColor: isDark ? "rgba(59,130,246,0.2)" : "#bfdbfe", color: isDark ? "#60a5fa" : "#1d4ed8" }}>
                                    <Lightbulb className="w-4 h-4 shrink-0" />
                                    <span className="text-[13px] font-medium"><span className="font-bold">{t("Tip")}:</span> {t("Aim for an ACOS lower than your break-even ACOS to maximize profits.")}</span>
                                  </div>

                                </div>
                              );
                            })()
                          ) : (
                            <div className="flex flex-col items-center justify-center text-center p-5 h-full" style={{ background: isDark ? "rgba(255,255,255,0.01)" : "#f8fafc", border: isDark ? "1px dashed #334155" : "1px dashed #cbd5e1", borderRadius: 12, minHeight: 320 }}>
                              <div style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 52, height: 52, borderRadius: 12, background: isDark ? "rgba(59,130,246,0.15)" : "#eff6ff", color: isDark ? "#60a5fa" : "#3b82f6",
                                marginBottom: 14
                              }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="12" y1="8" x2="12" y2="12" />
                                  <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                              </div>
                              <h6 className="font-bold m-0" style={{ color: isDark ? "#f8fafc" : "#1e293b" }}>{t("No calculation performed")}</h6>
                              <p className="mt-1 mb-0" style={{ fontSize: 12, maxWidth: 220, color: isDark ? "#cbd5e1" : "#64748b" }}>
                                {t("Enter your product and cost data on the left, then click Calculate Break Even.")}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </FormikForm>
                  );
                }}
              </Formik>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default PLCalculater;
