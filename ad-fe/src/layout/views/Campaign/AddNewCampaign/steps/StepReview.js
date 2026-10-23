import React from "react";
import { useTranslation } from "react-i18next";
import FormattedAsin from "../../../../../helper/FormattedAsin";
import { t } from "i18next";

const StepReview = ({ formik, currencySymbol = "₹" }) => {
    const { t } = useTranslation();
    const { values } = formik;

    return (
        <div id="campaign-step-review" className="campaign-step-container pb-5">
            <h2 className="flow-title mb-2">{t("Review Campaign Details")}</h2>
            <p className="flow-subtitle mb-4">{t("Please review all settings carefully before launching your campaign.")}</p>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                {/* Campaign Basics */}
                <div className="xl:col-span-6">
                    <div className="modern-card h-full">
                        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
                            <div className="flex items-center justify-center rounded-full" style={{ width: '40px', height: '40px', background: 'rgba(35, 116, 242, 0.1)', color: '#2374F2' }}>
                                <i className="fa-solid fa-bullhorn fs-5"></i>
                            </div>
                            <h3 className="card-title m-0">{t("Campaign Basics")}</h3>
                        </div>

                        <div className="flex flex-col gap-3">
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-400" style={{ fontSize: '13px' }}>{t("Campaign Name")}</span>
                                <span className="font-semibold text-right">{values.campaignName || <span className="text-red-500">{t("Missing")}</span>}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-400" style={{ fontSize: '13px' }}>{t("Date Range")}</span>
                                <span className="font-semibold text-right">
                                    {values.startDate || t("Not Set")} {values.endDate ? `${t("to")} ${values.endDate}` : t("(No End Date)")}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-400" style={{ fontSize: '13px' }}>{t("Daily Budget")}</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-right">{currencySymbol}{values.dailyBudget || '0.00'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-400" style={{ fontSize: '13px' }}>{t("Bidding Strategy")}</span>
                                <span className="font-semibold text-right">
                                    <span className="rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold px-2.5 py-0.5 text-xs">{values.bidStrategy ? t(values.bidStrategy) : t("Not Set")}</span>
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-400" style={{ fontSize: '13px' }}>{t("Ad Group Name")}</span>
                                <span className="font-semibold text-right">{values.adGroups?.[0] || t("Not Set")}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-400" style={{ fontSize: '13px' }}>{t("Site")}</span>
                                <span className="font-semibold text-right">
                                    {values.siteType === 'AMAZON_BUSINESS' ? t('Amazon Business') : t('Amazon')}
                                </span>
                            </div>
                            <div className="flex flex-col mt-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                                <span className="text-slate-500 dark:text-slate-400 mb-2" style={{ fontSize: '13px', fontWeight: 600 }}>{t("Placements Adjustments")}</span>
                                <div className="flex justify-between mb-1">
                                    <span className="text-slate-500 dark:text-slate-400 text-xs">{t("Top of Search")}</span>
                                    <span className="font-semibold text-xs">{values.placements?.topOfSearch || 0}%</span>
                                </div>
                                <div className="flex justify-between mb-1">
                                    <span className="text-slate-500 dark:text-slate-400 text-xs">{t("Rest of Search")}</span>
                                    <span className="font-semibold text-xs">{values.placements?.restOfSearch || 0}%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500 dark:text-slate-400 text-xs">{t("Product Pages")}</span>
                                    <span className="font-semibold text-xs">{values.placements?.productPage || 0}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Selected Products */}
                <div className="xl:col-span-6">
                    <div className="modern-card h-full">
                        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
                            <div className="flex items-center justify-center rounded-full" style={{ width: '40px', height: '40px', background: 'rgba(35, 116, 242, 0.1)', color: '#2374F2' }}>
                                <i className="fa-solid fa-box fs-5"></i>
                            </div>
                            <h3 className="card-title m-0">{t("Promoted Products")}</h3>
                            <span className="ml-auto rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1 text-xs font-semibold">{values.products.length}</span>
                        </div>

                        {values.products.length === 0 ? (
                            <div className="text-red-500 text-xs"><i className="fa-solid fa-circle-exclamation mr-1"></i> {t("No products selected. Campaign will not deliver.")}</div>
                        ) : (
                            <div className="flex flex-col gap-2 overflow-auto" style={{ maxHeight: '200px' }}>
                                {values.products.map((p, i) => (
                                    <div key={i} className="flex items-center gap-2 p-2.5 border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800">
                                        <div className="flex-1 truncate" style={{ fontSize: '12px' }}>
                                            <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">{p.itemName || p.asin}</div>
                                            <div className="text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                                                <span className="px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-700 font-bold text-xs">
                                                    <FormattedAsin code={p.asin} />
                                                </span>
                                                {p.sku && (
                                                    <span className="text-xs truncate text-slate-500 dark:text-slate-400">
                                                        <FormattedAsin code={p.sku} />
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Targeting Configuration */}
                <div className="xl:col-span-12">
                    <div className="modern-card">
                        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
                            <div className="flex items-center justify-center rounded-full" style={{ width: '40px', height: '40px', background: 'rgba(35, 116, 242, 0.1)', color: '#2374F2' }}>
                                <i className="fa-solid fa-crosshairs fs-5"></i>
                            </div>
                            <h3 className="card-title m-0">{t("Targeting Configuration")}</h3>
                            <span className="ml-auto rounded-full bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-slate-700 px-3 py-1 text-xs font-bold uppercase tracking-wider">{t(values.targetingType)}</span>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                            <div className="xl:col-span-6 xl:border-r border-slate-200 dark:border-slate-700 xl:pr-4">
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--theme-text-muted)', textTransform: 'uppercase' }} className="mb-3">{t("Active Targets")}</h4>

                                {values.targetingType === "MANUAL" && values.manualTargetType === "keyword" && (
                                    <div>
                                        {values.manualKeywordTargeting.length === 0 ? (
                                            <div className="text-slate-500 dark:text-slate-400 text-xs">{t("No keywords added.")}</div>
                                        ) : (
                                            <table className="w-full text-left" style={{ fontSize: '12px' }}>
                                                <thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="py-2.5">{t("Keyword")}</th><th className="py-2.5">{t("Match")}</th><th className="py-2.5 text-right">{t("Bid")}</th></tr></thead>
                                                <tbody>
                                                    {values.manualKeywordTargeting.map((k, i) => (
                                                        <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                                                            <td className="truncate py-2.5 font-medium" style={{ maxWidth: '120px' }}>{k.keyword}</td>
                                                            <td className="py-2.5"><span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-slate-700 uppercase tracking-wider">{t(k.matchType)}</span></td>
                                                            <td className="text-right font-semibold text-emerald-600 dark:text-emerald-400 py-2.5">{currencySymbol}{k.bid}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )}

                                {values.targetingType === "MANUAL" && values.manualTargetType === "product" && (
                                    <div>
                                        {values.manualProductTargeting.length === 0 ? (
                                            <div className="text-slate-500 dark:text-slate-400 text-xs">{t("No products targeted.")}</div>
                                        ) : (
                                            <table className="w-full text-left" style={{ fontSize: '12px' }}>
                                                <thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="py-2.5">{t("Product/ASIN")}</th><th className="py-2.5">{t("Type")}</th><th className="py-2.5 text-right">{t("Bid")}</th></tr></thead>
                                                <tbody>
                                                    {values.manualProductTargeting.map((p, i) => (
                                                        <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                                                            <td className="truncate py-2.5 font-medium" style={{ maxWidth: '120px' }}>{p.summaries?.[0]?.itemName || p.asin}</td>
                                                            <td className="py-2.5"><span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 uppercase tracking-wider">{t(p.type)}</span></td>
                                                            <td className="text-right font-semibold text-emerald-600 dark:text-emerald-400 py-2.5">{currencySymbol}{p.bid}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )}

                                {values.targetingType === "AUTO" && (
                                    <div>
                                        <div className="text-slate-500 dark:text-slate-400 text-xs mb-3">
                                            {t("Automatic targeting is enabled. Amazon will automatically target your ads based on your product information.")}
                                        </div>
                                        <table className="w-full text-left" style={{ fontSize: '12px' }}>
                                            <thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="py-2.5">{t("Auto Bid Type")}</th><th className="py-2.5 text-right">{t("Bid")}</th></tr></thead>
                                            <tbody>
                                                {values.autoBidMode === "default" && (
                                                    <tr className="border-b border-slate-100 dark:border-slate-800">
                                                        <td className="py-2.5 font-medium">{t("Default Bid")}</td>
                                                        <td className="text-right font-semibold text-emerald-600 dark:text-emerald-400 py-2.5">{currencySymbol}{values.autoBidDefault || '0.00'}</td>
                                                    </tr>
                                                )}
                                                {values.autoBidMode === "group" && (
                                                    <>
                                                        <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-2.5 font-medium">{t("Close Match")}</td><td className="text-right font-semibold text-emerald-600 dark:text-emerald-400 py-2.5">{currencySymbol}{values.autoBidGroups.closeMatch || '0.00'}</td></tr>
                                                        <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-2.5 font-medium">{t("Loose Match")}</td><td className="text-right font-semibold text-emerald-600 dark:text-emerald-400 py-2.5">{currencySymbol}{values.autoBidGroups.looseMatch || '0.00'}</td></tr>
                                                        <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-2.5 font-medium">{t("Substitutes")}</td><td className="text-right font-semibold text-emerald-600 dark:text-emerald-400 py-2.5">{currencySymbol}{values.autoBidGroups.substitutes || '0.00'}</td></tr>
                                                        <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-2.5 font-medium">{t("Complements")}</td><td className="text-right font-semibold text-emerald-600 dark:text-emerald-400 py-2.5">{currencySymbol}{values.autoBidGroups.complements || '0.00'}</td></tr>
                                                    </>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="xl:col-span-6 xl:pl-4 mt-4 xl:mt-0">
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--theme-text-muted)', textTransform: 'uppercase' }} className="mb-3">{t("Negative Targets")}</h4>

                                {values.negativeKeywords.length === 0 && values.negativeProducts.length === 0 ? (
                                    <div className="text-slate-500 dark:text-slate-400 text-xs">{t("No negative targets applied.")}</div>
                                ) : (
                                    <table className="w-full text-left" style={{ fontSize: '12px' }}>
                                        <thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="py-2.5">{t("Target")}</th><th className="py-2.5 text-right">{t("Type")}</th></tr></thead>
                                        <tbody>
                                            {values.negativeKeywords.map((k, i) => (
                                                <tr key={`nk-${i}`} className="border-b border-slate-100 dark:border-slate-800">
                                                    <td className="truncate py-2.5 font-medium" style={{ maxWidth: '180px' }}>{k.keyword}</td>
                                                    <td className="py-2.5 text-right">
                                                        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 uppercase tracking-wider">{t(k.matchType.replace("NEGATIVE_", ""))}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {values.negativeProducts.map((p, i) => (
                                                <tr key={`np-${i}`} className="border-b border-slate-100 dark:border-slate-800">
                                                    <td className="truncate py-2.5 font-medium" style={{ maxWidth: '180px' }}>{p.type === 'brand' ? p.product?.summaries?.[0]?.brandName : (p.product?.summaries?.[0]?.itemName || p.product?.asin)}</td>
                                                    <td className="py-2.5 text-right">
                                                        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 uppercase tracking-wider">{t(p.type === 'brand' ? 'Brand' : 'Product')}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StepReview;
