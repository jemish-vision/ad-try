import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ProfileContext } from '../../../helper/usecontext/useContext';
import { Card } from '../../../components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../components/ui/tooltip';
import './AdminDashboard.css';

const METRICS = [
    { value: 'sales', label: 'Ad Revenue' },
    { value: 'spend', label: 'Spend' },
    { value: 'acos', label: 'ACOS' },
    { value: 'roas', label: 'ROAS' },
    { value: 'impressions', label: 'Impressions' },
    { value: 'orders', label: 'Orders' },
    { value: 'clicks', label: 'Clicks' },
    { value: 'ctr', label: 'CTR' },
    { value: 'cpc', label: 'CPC' }
];

const TopChangesWidget = ({ id, title, apiEndpoint, profileId, fromDate, toDate }) => {
    const { t } = useTranslation();
    const { selectedAdType, currencyCode } = useContext(ProfileContext);
    const [metric, setMetric] = useState('sales');
    const [data, setData] = useState([]);
    const [page, setPage] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [perPage] = useState(5);
    const [maxPercentage, setMaxPercentage] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [currentRange, setCurrentRange] = useState(null);
    const navigate = useNavigate();

    const getDaysCount = () => {
        if (!fromDate || !toDate) return 0;
        const start = new Date(fromDate);
        const end = new Date(toDate);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return diffDays;
    };
    const daysCount = getDaysCount();

    const getTooltipText = () => {
        const days = daysCount || 14;
        const entityKey = title.toLowerCase().includes("campaign")
            ? "campaigns"
            : title.toLowerCase().includes("asin") || title.toLowerCase().includes("product")
                ? "products (ASINs)"
                : "Sponsored Product keywords";

        const staticKey = `Displays the most significant performance variations for ${entityKey} within the selected timeframe (last ${days} days) compared to the preceding period of identical duration.`;
        const translatedStatic = t(staticKey);
        if (translatedStatic !== staticKey) {
            return translatedStatic;
        }

        const translatedEntity = t(entityKey);
        return t("Displays the most significant performance variations for {{entity}} within the selected timeframe (last {{days}} days) compared to the preceding period of identical duration.", {
            entity: translatedEntity,
            days
        });
    };

    useEffect(() => {
        if (profileId && fromDate && toDate) {
            fetchData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [metric, page, profileId, fromDate, toDate, selectedAdType]);

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const authToken = localStorage.getItem('sellerToken');

            // Since backend uses application/x-www-form-urlencoded based on the cURL, we format it:
            const params = new URLSearchParams();
            params.append('profileId', profileId);
            params.append('fromDate', fromDate);
            params.append('toDate', toDate);
            params.append('metric', metric);
            params.append('pageNo', page);
            params.append('perPage', perPage);

            const res = await axios.post(
                apiEndpoint,
                params,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Authorization: `Bearer ${authToken}`
                    }
                }
            );

            if (res.data?.isSuccess) {
                setData(res.data.data);
                setTotalRecords(res.data.totalRecords);
                setCurrentRange(res.data.currentRange);

                // max absolute percentage for the bar scaling
                let maxP = 0;
                res.data.data.forEach(item => {
                    if (item.differencePercentage !== Infinity && item.differencePercentage !== null && item.differencePercentage !== undefined) {
                        if (Math.abs(item.differencePercentage) > maxP) maxP = Math.abs(item.differencePercentage);
                    }
                });
                setMaxPercentage(maxP || 100);
            } else {
                setData([]);
                setTotalRecords(0);
            }
        } catch (err) {
            console.error("TopChangesWidget error:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleNext = () => {
        if (page * perPage < totalRecords) {
            setPage(p => p + 1);
        }
    };
    const handlePrev = () => {
        if (page > 1) setPage(p => p - 1);
    };
    const totalPages = Math.ceil(totalRecords / perPage) || 1;

    const formatCompactVal = (value, isCurrency) => {
        let absVal = Math.abs(value);
        let valStr = '';
        if (absVal >= 1000) {
            valStr = (absVal / 1000).toFixed(2) + 'K';
        } else {
            valStr = absVal % 1 === 0 ? absVal : absVal.toFixed(2);
        }

        let prefix = value >= 0 ? '+' : '-';
        if (isCurrency) {
            const symbol = currencyCode === 'INR' ? '₹' : (currencyCode === 'GBP' ? '£' : '$');
            return `${prefix}${symbol}${valStr}`;
        }
        return `${prefix}${valStr}`;
    };

    const handleNameClick = (item) => {
        if (title === "Biggest Changes By Campaigns" && currentRange) {
            navigate("/campaigns", {
                state: {
                    searchName: item.name,
                    fromDate: currentRange.fromDate,
                    toDate: currentRange.toDate
                }
            });
        } else if (title === "Biggest Changes By ASIN (Products)" && currentRange) {
            navigate("/products", {
                state: {
                    searchName: item.asin || item.sku || item.itemName, // Pass asin, sku or itemName as search term
                    fromDate: currentRange.fromDate,
                    toDate: currentRange.toDate
                }
            });
        } else if (title.includes("Biggest Changes By SP Keywords") && currentRange) {
            navigate("/targeting", {
                state: {
                    searchName: item.targeting,
                    keywordType: item.keywordType,
                    fromDate: currentRange.fromDate,
                    toDate: currentRange.toDate
                }
            });
        }
    };

    const widgetTypeClass = title?.toLowerCase().includes("campaign")
        ? "widget-campaigns"
        : title?.toLowerCase().includes("asin") || title?.toLowerCase().includes("product")
            ? "widget-products"
            : "widget-keywords";

    return (
        <Card className={`dash-changes-widget ${widgetTypeClass}`} id={id}>
            <div className="dash-changes-header">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="dash-changes-title-wrapper" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help', gap: '6px' }}>
                                <h6 className="dash-changes-title" style={{ margin: 0 }}>{t(title)}</h6>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="info-icon" style={{ opacity: 0.65, color: 'var(--text-secondary, #64748b)' }}>
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="16" x2="12" y2="12" />
                                    <line x1="12" y1="8" x2="12.01" y2="8" />
                                </svg>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="z-[9999] max-w-xs text-xs p-2">
                            <p>{getTooltipText()}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <div className="dash-changes-metric shrink-0">
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                className="flex items-center justify-between h-[32px] px-3 text-[13px] font-semibold rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-transparent text-slate-700 dark:text-slate-300 hover:border-sky-400 dark:hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-all outline-none shadow-sm whitespace-nowrap shrink-0"
                                id={`metric-dropdown-${title.replace(/\s+/g, '-')}`}
                            >
                                <span>{t(METRICS.find(m => m.value === metric)?.label || 'Ad Revenue')}</span>
                                <svg className="ml-2 w-3.5 h-3.5 text-slate-600 dark:text-slate-400 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
                            </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-[150px] z-[9999] rounded-xl p-1 border-gray-200 dark:border-gray-800">
                            {METRICS.map(m => (
                                <div className="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 text-[13px] py-1.5 px-3 font-medium text-slate-600 dark:text-slate-300 cursor-pointer rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                                    key={m.value}
                                    onClick={() => { setMetric(m.value); setPage(1); }}

                                >
                                    {t(m.label)}
                                </div>
                            ))}
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <div className="dash-changes-body">
                {isLoading ? (
                    <div className="dash-changes-body-rows">
                        {[...Array(5)].map((_, i) => (
                            <div className="tcw-skeleton-row" key={i} style={{ animationDelay: `${i * 80}ms` }}>
                                <div className="tcw-skeleton-label" />
                                <div className="tcw-skeleton-bar" />
                                <div className="tcw-skeleton-pct" />
                            </div>
                        ))}
                    </div>
                ) : data.length > 0 ? (
                    data.map((item, idx) => {
                        let pct = item.differencePercentage;
                        let isInfinite = pct === Infinity || pct === null || pct === undefined;
                        let isPos = item.differenceValue >= 0;
                        let diffValAbs = Math.abs(item.differenceValue);

                        // If difference percentage is 0 but diff value is large, handle new campaign anomaly
                        if (pct === 0 && diffValAbs > 0 && item.previous === 0) {
                            isInfinite = true;
                        }

                        let barWidth = isInfinite ? 100 : (Math.abs(pct) / maxPercentage) * 100;
                        if (barWidth > 100) barWidth = 100;

                        let isCurrency = ['sales', 'spend', 'cpc'].includes(metric);
                        let displayVal = formatCompactVal(item.differenceValue, isCurrency);

                        let displayTitle = "";
                        if (title?.toLowerCase().includes("asin") || title?.toLowerCase().includes("product")) {
                            displayTitle = item.asin || item.sku || item.itemName || item.name || "";
                        } else if (title?.toLowerCase().includes("keyword")) {
                            displayTitle = item.targeting ? `${item.targeting} (${item.keywordType})` : (item.name || "");
                        } else {
                            displayTitle = item.name || item.itemName || item.asin || "";
                        }
                        const hoverTitle = item.itemName && item.itemName !== displayTitle ? `${displayTitle} - ${item.itemName}` : displayTitle;

                        return (
                            <div className="dash-changes-row" key={idx}>
                                <div
                                    className="dash-changes-name"
                                    title={hoverTitle}
                                    onClick={() => handleNameClick(item)}
                                    style={{ cursor: (title === "Biggest Changes By Campaigns" || title === "Biggest Changes By ASIN (Products)" || title.includes("Biggest Changes By SP Keywords")) ? "pointer" : "default" }}
                                >
                                    {displayTitle}
                                </div>

                                <div className="dash-changes-track-container">
                                    <div className="dash-changes-track-text">
                                        {isInfinite ? '-' : `${isPos && pct > 0 ? '' : ''}${pct % 1 === 0 ? pct : parseFloat(pct).toFixed(0)}%`}
                                    </div>
                                    <div className="dash-changes-line-bg">
                                        <div className="dash-changes-line-center"></div>
                                        <div className={`dash-changes-line-fill ${isPos ? 'fill-pos' : 'fill-neg'}`} style={{ width: `${barWidth / 2}%` }}></div>
                                    </div>
                                </div>

                                <div className="dash-changes-val">
                                    {displayVal}
                                </div>
                            </div>
                        )
                    })
                ) : (
                    <div className="dash-changes-loading" style={{ height: '210px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t("No items found")}</div>
                )}
            </div>

            <div className="dash-changes-footer">
                <span>{t("Page")} {page} {t("of")} {totalRecords > 0 ? totalPages : 1}</span>
                <div className="dash-changes-pagination">
                    {page > 1 ? <span onClick={handlePrev} className="cp active">{t("Prev")}</span> : <span className="cp disabled">{t("Prev")}</span>}
                    {page < totalPages ? <span onClick={handleNext} className="cp active">{t("Next")}</span> : <span className="cp disabled">{t("Next")}</span>}
                </div>
            </div>
        </Card>
    );
}

export default TopChangesWidget;
