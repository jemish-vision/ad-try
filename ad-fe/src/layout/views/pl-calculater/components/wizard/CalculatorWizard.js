import React, { useState, useContext } from 'react';
import WizardCharts from './WizardCharts';
import { calculateProfit, Hu } from './calculatorLogic';
import { useTranslation } from "react-i18next";
import CurrencyFormat from "../../../../../helper/currencyCode/CurrencyFormat";
import { getCurrencySymbol } from "../../../../../helper/currencyCode/CurrencyCode";
import { ProfileContext } from "../../../../../helper/usecontext/useContext";
import PdfTemplate from './PdfTemplate';
import { AppTooltip } from "../../../../../components/ui/AppTooltip";
import { Input } from "../../../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../../components/ui/select";
import { Calculator } from "lucide-react";

export default function CalculatorWizard({ isDark }) {
  const { t } = useTranslation();
  const { currencyCode } = useContext(ProfileContext);
  const sym = getCurrencySymbol(currencyCode);
  const pdfRef = React.useRef(null);


  const [formData, setFormData] = useState({
    sellingPrice: '',
    landedCost: '',
    category: 'electronics',
    fulfillmentMode: 'easyship',
    shippingZone: 'local',
    weight: '',
    packageSize: 'standard',
    packaging: '',
    acos: '',
    returnRate: '',
  });

  const updateFormData = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const hasInputs = formData.sellingPrice !== '' && parseFloat(formData.sellingPrice) > 0;
  const metrics = calculateProfit(formData);

  const categories = Object.keys(Hu).map(key => ({
    id: key,
    name: t(Hu[key].categoryName),
    maxFee: (Hu[key].referral.above1000 * 100).toFixed(1) + '%'
  }));

  // Utility to handle percentage inputs and display correctly
  const renderPercentage = (value) => {
    return isNaN(value) || value === '' ? '0' : CurrencyFormat(value);
  };

  const downloadPDF = async () => {
    const element = pdfRef.current;
    if (!element) return;

    // Temporarily make it visible for html2canvas to capture it if needed,
    // but since it's just positioned off-screen, html2canvas should capture it fine.
    try {
      const [html2canvasModule, jsPdfModule] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);
      const html2canvas = html2canvasModule.default || html2canvasModule;
      const jsPDF = jsPdfModule.jsPDF || jsPdfModule.default;

      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save('Profit_Breakdown.pdf');
    } catch (error) {
      console.error("Error generating PDF:", error);
    }
  };

  const getPercent = (value) => {
    const sp = parseFloat(formData.sellingPrice);
    if (!sp || isNaN(sp)) return '0';
    return CurrencyFormat((value / sp) * 100);
  };

  return (
    <div className="w-full mx-auto font-sans">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2.5" style={{ color: isDark ? "#f8fafc" : "#0f172a" }}>
            {t("Amazon Profit Calculator")}
          </h1>
          <p className="text-xs text-slate-500 mt-1">{t("Free · Live · Net profit per unit, instantly")}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 dark:bg-emerald-900/30 dark:text-emerald-400">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            {t("LIVE")}
          </div>
          <button
            onClick={downloadPDF}
            className={`${hasInputs ? "flex" : "hidden"} items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t("Download PDF")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        {/* LEFT COLUMN: Input Parameters */}
        <div id="pl-input-parameters" className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl shadow-sm p-5">
            <h3 className="text-[11px] font-extrabold tracking-widest text-slate-500 uppercase mb-5">{t("Input Parameters")}</h3>

            <div className="flex flex-col gap-5">
              {/* Selling Price */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{t("Selling Price")} ({sym})</label>
                <Input
                  type="number"
                  min="0"
                  onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                  value={formData.sellingPrice}
                  onChange={(e) => updateFormData('sellingPrice', e.target.value)}
                  placeholder={t("999")}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              {/* Product Cost */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{t("Product Cost (Landed)")}</label>
                <Input
                  type="number"
                  min="0"
                  onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                  value={formData.landedCost}
                  onChange={(e) => updateFormData('landedCost', e.target.value)}
                  placeholder={t("400")}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              {/* Weight & Packaging */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{t("Weight (kg)")}</label>
                  <Input
                    type="number"
                    min="0"
                    onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                    step="0.1"
                    value={formData.weight}
                    onChange={(e) => updateFormData('weight', e.target.value)}
                    placeholder={t("0.5")}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{t("Packaging")} ({sym})</label>
                  <Input
                    type="number"
                    min="0"
                    onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                    value={formData.packaging}
                    onChange={(e) => updateFormData('packaging', e.target.value)}
                    placeholder={t("15")}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{t("Category")}</label>
                <Select value={formData.category} onValueChange={(val) => updateFormData('category', val)}>
                  <SelectTrigger className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                    <SelectValue placeholder={t("Select Category")} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name} (up to {cat.maxFee})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Size Tier moved to Logistics Config */}

              {/* Logistics Config */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">{t("Logistics Config")}</label>
                <div className="flex bg-slate-100 dark:bg-slate-900/60 p-1 rounded-lg mb-2 dark:border dark:border-slate-800">
                  {[
                    { label: 'Easy Ship', value: 'easyship' },
                    { label: 'FBA', value: 'fba' },
                    { label: 'Self', value: 'self' }
                  ].map((method) => (
                    <button
                      key={method.value}
                      onClick={() => updateFormData('fulfillmentMode', method.value)}
                      className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all ${formData.fulfillmentMode === method.value
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-transparent dark:ring-slate-600'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                    >
                      {t(method.label)}
                    </button>
                  ))}
                </div>
                {formData.fulfillmentMode !== 'self' && (
                  <div className="flex bg-slate-100 dark:bg-slate-900/60 p-1 rounded-lg dark:border dark:border-slate-800">
                    {[
                      { label: 'Local Zone', value: 'local' },
                      { label: 'National', value: 'national' }
                    ].map((zone) => (
                      <button
                        key={zone.value}
                        onClick={() => updateFormData('shippingZone', zone.value)}
                        className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all ${formData.shippingZone === zone.value
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-transparent dark:ring-slate-600'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                      >
                        {t(zone.label)}
                      </button>
                    ))}
                  </div>
                )}

                {/* Size Tier (only FBA) */}
                {formData.fulfillmentMode === 'fba' && (
                  <div className="mt-4">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{t("Size Tier")}</label>
                    <Select value={formData.packageSize} onValueChange={(val) => updateFormData('packageSize', val)}>
                      <SelectTrigger className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                        <SelectValue placeholder={t("Select Size")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                        <SelectItem value="oversize">Oversize</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Marketing & Returns */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4 block">{t("Marketing & Returns")}</label>

                <div className="mb-5">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{t("Target ACOS")}</span>
                    <AppTooltip text="Click to edit value" side="top">
                      <div className="relative group">
                        <input
                          type="number"
                          min="0"
                          onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                          value={formData.acos}
                          onChange={(e) => updateFormData('acos', e.target.value)}
                          placeholder={t("10")}
                          className="w-14 text-right text-sm font-bold text-slate-900 dark:text-white bg-transparent border-0 border-b border-dashed border-slate-400 dark:border-slate-500 hover:border-slate-800 dark:hover:border-slate-300 focus:outline-none focus:border-solid cursor-text appearance-none focus:ring-0 pr-3"
                        />
                        <span className="absolute right-0 top-0 text-sm font-bold text-slate-900 dark:text-white pointer-events-none">%</span>
                      </div>
                    </AppTooltip>
                  </div>
                  <input
                    type="range"
                    min="0" max="100"
                    value={formData.acos === "" ? 0 : formData.acos}
                    onChange={(e) => updateFormData('acos', e.target.value)}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{t("Returns Rate")}</span>
                    <AppTooltip text="Click to edit value" side="top">
                      <div className="relative group">
                        <input
                          type="number"
                          min="0"
                          onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                          value={formData.returnRate}
                          onChange={(e) => updateFormData('returnRate', e.target.value)}
                          placeholder={t("3")}
                          className="w-14 text-right text-sm font-bold text-red-500 bg-transparent border-0 border-b border-dashed border-red-300 hover:border-red-500 focus:outline-none focus:border-solid cursor-text appearance-none focus:ring-0 pr-3"
                        />
                        <span className="absolute right-0 top-0 text-sm font-bold text-red-500 pointer-events-none">%</span>
                      </div>
                    </AppTooltip>
                  </div>
                  <input
                    type="range"
                    min="0" max="50"
                    value={formData.returnRate === "" ? 0 : formData.returnRate}
                    onChange={(e) => updateFormData('returnRate', e.target.value)}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                  />
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Outputs */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {!hasInputs ? (
            <div className={`flex flex-col items-center justify-center text-center p-8 py-20 rounded-xl border-2 border-dashed h-full min-h-[400px] ${isDark ? 'border-slate-700 bg-slate-900/10' : 'border-slate-200 bg-slate-50/50'}`}>
              <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4">
                <Calculator className="w-8 h-8 text-blue-500" />
              </div>
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">{t("Awaiting Input Parameters")}</h4>
              <p className="text-xs text-slate-500 max-w-sm leading-relaxed">{t("Please fill in the Selling Price and Landed Cost on the left to calculate your Amazon profit breakdown, margins, and benchmarks.")}</p>
            </div>
          ) : (
            <>
              {/* Top 4 Metrics Cards */}
              <div id="pl-top-metrics" className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 shadow-sm flex flex-col justify-center min-w-0 overflow-hidden">
                  <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase mb-1 truncate">{t("Settlement")}</span>
                  <span className="font-bold text-xl text-slate-900 dark:text-white truncate" title={`${sym}${CurrencyFormat(metrics.settlement, currencyCode)}`}>{sym}{CurrencyFormat(metrics.settlement, currencyCode)}</span>
                </div>

                <div className={`border rounded-xl p-4 shadow-sm flex flex-col justify-center min-w-0 overflow-hidden ${metrics.netProfit >= 0 ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/40 dark:border-blue-700/50' : 'bg-[#FFF4F4] border-[#FECACA] dark:bg-red-900/40 dark:border-red-700/50'}`}>
                  <span className={`text-[10px] font-extrabold tracking-wider uppercase mb-1 truncate ${metrics.netProfit >= 0 ? 'text-blue-600 dark:text-blue-300' : 'text-red-600 dark:text-red-300'}`}>{t("Net Profit")}</span>
                  <span className={`font-bold text-2xl truncate ${metrics.netProfit >= 0 ? 'text-blue-600 dark:text-blue-300' : 'text-red-600 dark:text-red-300'}`} title={`${sym}${CurrencyFormat(metrics.netProfit, currencyCode)}`}>{sym}{CurrencyFormat(metrics.netProfit, currencyCode)}</span>
                </div>

                <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 shadow-sm flex flex-col justify-center min-w-0 overflow-hidden">
                  <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase mb-1 truncate">{t("Margin %")}</span>
                  <span className="font-bold text-xl text-slate-900 dark:text-white truncate" title={`${CurrencyFormat(metrics.netMargin)}%`}>{CurrencyFormat(metrics.netMargin)}%</span>
                </div>

                <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 shadow-sm flex flex-col justify-center min-w-0 overflow-hidden">
                  <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase mb-1 truncate">{t("ROI %")}</span>
                  <span className="font-bold text-xl text-slate-900 dark:text-white truncate" title={`${CurrencyFormat(metrics.roi)}%`}>{CurrencyFormat(metrics.roi)}%</span>
                </div>
              </div>

              {/* Cost Breakdown Table */}
              <div id="pl-cost-breakdown-table" className="bg-white dark:bg-slate-800/40 border border-emerald-100 dark:border-slate-700/60 rounded-xl shadow-sm flex flex-col h-fit">
                <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/60 rounded-t-xl">
                  <span className="text-[10px] font-extrabold tracking-wider text-slate-500 dark:text-slate-400 uppercase">{t("Cost Breakdown")}</span>
                  <div className="flex gap-8 text-[10px] font-extrabold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
                    <span>{t("Amount")}</span>
                    <span>{t("% of SP")}</span>
                  </div>
                </div>

                <div className="p-5 flex flex-col gap-3 text-[13px]">
                  {/* Selling Price */}
                  <div className="flex justify-between items-center min-w-0">
                    <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">{t("Selling Price")}</span>
                    <div className="flex gap-4 text-right min-w-0">
                      <span className="font-bold text-slate-900 dark:text-white w-32 truncate" title={`${sym}${formData.sellingPrice || 0}`}>{sym}{formData.sellingPrice || 0}</span>
                      <span className="text-slate-400 w-12 flex-shrink-0">100%</span>
                    </div>
                  </div>

                  {/* Amazon Referral Fee */}
                  <div className="flex justify-between items-center min-w-0">
                    <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {t("Amazon Referral Fee")} <span className="text-slate-400 dark:text-slate-500">({getPercent(metrics.breakdown.referralFee)}%)</span>
                    </span>
                    <div className="flex gap-4 text-right min-w-0">
                      <span className="font-bold text-red-500 w-32 truncate" title={`-${sym}${CurrencyFormat(metrics.breakdown.referralFee, currencyCode)}`}>-{sym}{CurrencyFormat(metrics.breakdown.referralFee, currencyCode)}</span>
                      <span className="text-slate-400 w-12 flex-shrink-0">{getPercent(metrics.breakdown.referralFee)}%</span>
                    </div>
                  </div>

                  {/* Fixed Closing Fee */}
                  <div className="flex justify-between items-center min-w-0">
                    <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">{t("Fixed Closing Fee")}</span>
                    <div className="flex gap-4 text-right min-w-0">
                      <span className="font-bold text-red-500 w-32 truncate" title={`-${sym}${CurrencyFormat(metrics.breakdown.closingFee, currencyCode)}`}>-{sym}{CurrencyFormat(metrics.breakdown.closingFee, currencyCode)}</span>
                      <span className="text-slate-400 w-12 flex-shrink-0">{getPercent(metrics.breakdown.closingFee)}%</span>
                    </div>
                  </div>

                  {/* Shipping / Weight Handling */}
                  <div className="flex justify-between items-center min-w-0">
                    <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">{t("Shipping")}</span>
                    <div className="flex gap-4 text-right min-w-0">
                      <span className="font-bold text-red-500 w-32 truncate" title={`-${sym}${CurrencyFormat(metrics.breakdown.shippingFee, currencyCode)}`}>-{sym}{CurrencyFormat(metrics.breakdown.shippingFee, currencyCode)}</span>
                      <span className="text-slate-400 w-12 flex-shrink-0">{getPercent(metrics.breakdown.shippingFee)}%</span>
                    </div>
                  </div>

                  {/* FBA Pick & Pack */}
                  {metrics.breakdown.fbaPickPack > 0 && (
                    <div className="flex justify-between items-center min-w-0">
                      <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">{t("FBA pick & pack")}</span>
                      <div className="flex gap-4 text-right min-w-0">
                        <span className="font-bold text-red-500 w-32 truncate" title={`-${sym}${CurrencyFormat(metrics.breakdown.fbaPickPack, currencyCode)}`}>-{sym}{CurrencyFormat(metrics.breakdown.fbaPickPack, currencyCode)}</span>
                        <span className="text-slate-400 w-12 flex-shrink-0">{getPercent(metrics.breakdown.fbaPickPack)}%</span>
                      </div>
                    </div>
                  )}

                  {/* FBA Storage */}
                  {metrics.breakdown.fbaStorage > 0 && (
                    <div className="flex justify-between items-center min-w-0">
                      <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">{t("FBA storage")}</span>
                      <div className="flex gap-4 text-right min-w-0">
                        <span className="font-bold text-red-500 w-32 truncate" title={`-${sym}${CurrencyFormat(metrics.breakdown.fbaStorage, currencyCode)}`}>-{sym}{CurrencyFormat(metrics.breakdown.fbaStorage, currencyCode)}</span>
                        <span className="text-slate-400 w-12 flex-shrink-0">{getPercent(metrics.breakdown.fbaStorage)}%</span>
                      </div>
                    </div>
                  )}

                  {/* GST on Amazon Fees */}
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800 min-w-0">
                    <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {t("GST on Amazon Fees")} <span className="text-slate-400">(18%)</span>
                    </span>
                    <div className="flex gap-4 text-right min-w-0">
                      <span className="font-bold text-red-500 w-32 truncate" title={`-${sym}${CurrencyFormat(metrics.breakdown.gstOnFees, currencyCode)}`}>-{sym}{CurrencyFormat(metrics.breakdown.gstOnFees, currencyCode)}</span>
                      <span className="text-slate-400 w-12 flex-shrink-0">{getPercent(metrics.breakdown.gstOnFees)}%</span>
                    </div>
                  </div>

                  {/* Settlement from Amazon */}
                  <div className="flex justify-between items-center py-1 min-w-0">
                    <span className="text-slate-900 dark:text-white font-bold whitespace-nowrap">{t("Settlement from Amazon")}</span>
                    <div className="flex gap-4 text-right min-w-0">
                      <span className="font-bold text-blue-600 dark:text-blue-400 w-32 truncate" title={`${sym}${CurrencyFormat(metrics.settlement, currencyCode)}`}>{sym}{CurrencyFormat(metrics.settlement, currencyCode)}</span>
                      <span className="text-blue-400/70 w-12 flex-shrink-0">{getPercent(metrics.settlement)}%</span>
                    </div>
                  </div>

                  {/* Product + Packaging */}
                  <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800 min-w-0">
                    <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">{t("Product + Packaging")}</span>
                    <div className="flex gap-4 text-right min-w-0">
                      <span className="font-bold text-red-500 w-32 truncate" title={`-${sym}${CurrencyFormat(metrics.breakdown.productCost + metrics.breakdown.packaging, currencyCode)}`}>-{sym}{CurrencyFormat(metrics.breakdown.productCost + metrics.breakdown.packaging, currencyCode)}</span>
                      <span className="text-slate-400 w-12 flex-shrink-0">{getPercent(metrics.breakdown.productCost + metrics.breakdown.packaging)}%</span>
                    </div>
                  </div>

                  {/* Marketing + Returns */}
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800 min-w-0">
                    <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {t("Marketing")} ({formData.acos || 0}%) + {t("Returns")} ({formData.returnRate || 0}%)
                    </span>
                    <div className="flex gap-4 text-right min-w-0">
                      <span className="font-bold text-red-500 w-32 truncate" title={`-${sym}${CurrencyFormat(metrics.breakdown.marketing + metrics.breakdown.returnLoss, currencyCode)}`}>-{sym}{CurrencyFormat(metrics.breakdown.marketing + metrics.breakdown.returnLoss, currencyCode)}</span>
                      <span className="text-slate-400 w-12 flex-shrink-0">{getPercent(metrics.breakdown.marketing + metrics.breakdown.returnLoss)}%</span>
                    </div>
                  </div>

                  {/* Net Profit per Unit */}
                  <div className={`flex justify-between items-center py-2 px-3 -mx-3 rounded-lg min-w-0 ${metrics.netProfit >= 0 ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : 'bg-[#FFF4F4] dark:bg-red-900/10'}`}>
                    <span className={`font-bold whitespace-nowrap ${metrics.netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-[#991B1B] dark:text-red-400'}`}>{t("Net Profit per Unit")}</span>
                    <div className="flex gap-4 text-right min-w-0">
                      <span className={`font-bold w-32 truncate ${metrics.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#DC2626] dark:text-red-500'}`} title={`${sym}${CurrencyFormat(metrics.netProfit, currencyCode)}`}>{sym}{CurrencyFormat(metrics.netProfit, currencyCode)}</span>
                      <span className={`font-bold w-12 flex-shrink-0 ${metrics.netProfit >= 0 ? 'text-emerald-500' : 'text-[#DC2626] dark:text-red-400'}`}>{CurrencyFormat(metrics.netMargin)}%</span>
                    </div>
                  </div>

                </div>
              </div>

              {/* Warning / Loss Cards */}
              {metrics.netProfit < 0 ? (
                <div className="bg-[#FFF4F4] border border-[#FECACA] dark:bg-red-900/20 dark:border-red-700/50 rounded-xl p-3 text-[13px] text-[#991B1B] dark:text-red-400 flex items-center gap-2 shadow-sm">
                  <svg className="w-4 h-4 flex-shrink-0 text-[#DC2626] dark:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <span className="font-bold">Loss: </span>
                    {sym}{CurrencyFormat(Math.abs(metrics.netProfit), currencyCode)}/unit. Raise price, cut cost, or lower ACOS.
                  </div>
                </div>
              ) : metrics.netMargin < 15 ? (
                <div className="bg-[#FFF9E5] border border-[#FBE38E] dark:bg-yellow-900/40 dark:border-yellow-700/50 rounded-xl p-3 text-[13px] text-[#936605] dark:text-yellow-400 flex items-center gap-2 shadow-sm">
                  <svg className="w-4 h-4 flex-shrink-0 text-[#C98F00] dark:text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <span className="font-bold">Low margin: </span>
                    {metrics.netMargin}% is below the 15-25% sustainable band.
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Bottom Charts Row */}
      {hasInputs && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
          <WizardCharts type="breakdown" metrics={metrics} formData={formData} isDark={isDark} />
          <WizardCharts type="benchmark" metrics={metrics} formData={formData} isDark={isDark} />
        </div>
      )}

      {/* Hidden PDF Template for rendering via html2canvas */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div ref={pdfRef}>
          <PdfTemplate formData={formData} metrics={metrics} />
        </div>
      </div>

    </div>
  );
}
