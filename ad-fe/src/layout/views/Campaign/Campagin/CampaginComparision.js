import { useTranslation } from "react-i18next";
import { Buffer } from "buffer";
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../../common/helper/calendarValues/calendarValues";
import CurrencyCode from "../../../../helper/currencyCode/CurrencyCode";
import { tableStyles } from "../../../../helper/table/TableStyle";
import { ApiCampainListing } from "../../../../api-wrapper/campaign/ApiCampaign";
import { useContext, useEffect, useMemo, useState } from "react";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import moment from "moment";
import { Link } from "react-router-dom";
import CurrencyFormat from "../../../../helper/currencyCode/CurrencyFormat";
import DataTable from "react-data-table-component";
import { FiCalendar, FiArrowRight, FiActivity, FiArrowUpRight, FiArrowDownRight, FiTrendingUp, FiCheckCircle } from "react-icons/fi";
import { CampaignNameCell } from "../../../../utility/campaignNavigation";


const getPreviousPeriod = (currentRange) => {

    if (!currentRange || currentRange.length !== 2) return [];

    const [from, to] = currentRange;
    const diffDays = moment(to).startOf("day").diff(moment(from).startOf("day"), "days") + 1;

    const prevTo = moment(from).subtract(1, "day");
    const prevFrom = moment(prevTo).subtract(diffDays - 1, "days");

    return [prevFrom.toDate(), prevTo.toDate()];
};

const DiffBadge = ({ value, isFormat, isPercent }) => {
    const isPositive = value > 0;
    const isZero = value === 0;
    const absValue = Math.abs(value);
    const displayVal = isPercent ? `${absValue?.toFixed(2)}%` : isFormat ? CurrencyFormat(absValue) : CurrencyCode(absValue);

    if (isZero) {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-white/10 text-slate-500">
                0.00
            </span>
        );
    }

    return (
        <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${isPositive
            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
            : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
            }`}>
            {isPositive ? <FiArrowUpRight size={10} /> : <FiArrowDownRight size={10} />}
            {displayVal}
        </span>
    );
};

const CampaignComparision = ({ show, onClose, campaginIds, date }) => {
    const { t } = useTranslation();
    const { profileId, selectedAdType } = useContext(ProfileContext);
    const [activeTab, setActiveTab] = useState(0);

    const [currentData, setCurrentData] = useState([]);
    const [previousData, setPreviousData] = useState([]);
    const [previousDate, setPreviousDate] = useState([]);

    const [currentTotal, setCurrentTotal] = useState(null);
    const [previousTotal, setPreviousTotal] = useState(null);

    const dateStart = date?.[0] ? moment(date[0]).format("YYYY-MM-DD") : null;
    const dateEnd = date?.[1] ? moment(date[1]).format("YYYY-MM-DD") : null;
    const prevDateStart = previousDate?.[0] ? moment(previousDate[0]).format("YYYY-MM-DD") : null;
    const prevDateEnd = previousDate?.[1] ? moment(previousDate[1]).format("YYYY-MM-DD") : null;
    const campaginIdsStr = campaginIds?.join(',') || "";

    useEffect(() => {
        if (date?.length === 2) setPreviousDate(getPreviousPeriod(date));
    }, [dateStart, dateEnd]);

    const disabledPreviousDate = (dateValue) => {
        if (!date?.[0]) return false;
        const currentStart = moment(date[0]).startOf("day");
        return moment(dateValue).isSameOrAfter(currentStart);
    };

    const compareRanges = useMemo(() => {
        const currentStart = date?.[0] ? moment(date[0]).startOf("day") : null;

        const isRangeDisabled = (rangeValue) => {
            if (!currentStart) return false;
            const val = typeof rangeValue === 'function' ? rangeValue() : rangeValue;
            if (!val || val.length !== 2) return true;
            return moment(val[1]).isSameOrAfter(currentStart) || moment(val[0]).isSameOrAfter(currentStart);
        };

        return [
            {
                label: "Previous Period",
                value: date?.length === 2 ? getPreviousPeriod(date) : [],
                disabled: false
            },
            ...predefinedRanges.map(r => ({
                ...r,
                disabled: isRangeDisabled(r.value)
            }))
        ];
    }, [date]);

    const fetchCampaignData = async (fromDate, toDate, setter, totalSetter) => {
        const payload = {
            profileId: profileId.value,
            fromDate,
            toDate,
            pageNo: 1,
            perPage: 50,
            filteredCampaignIds: campaginIds,
        };

        const res = await ApiCampainListing(payload);
        if (res?.isSuccess) {
            setter(res?.getCampaign || []);
            totalSetter?.(res?.totalRow || null);
        }
    };

    useEffect(() => {
        if (show && profileId?.value && selectedAdType && dateStart && dateEnd && prevDateStart && prevDateEnd && campaginIds?.length) {
            fetchCampaignData(
                dateStart,
                dateEnd,
                setCurrentData,
                setCurrentTotal,
            );

            fetchCampaignData(
                prevDateStart,
                prevDateEnd,
                setPreviousData,
                setPreviousTotal,
            );
        }
    }, [profileId?.value, selectedAdType, show, dateStart, dateEnd, prevDateStart, prevDateEnd, campaginIdsStr]);

    const mergedData = useMemo(() => {
        return currentData.map((curr) => {
            const prev = previousData.find((p) => p.campaignId === curr.campaignId);
            const calcDiff = (c = 0, p = 0) => c - p;
            return {
                ...curr,
                previous: prev || {},
                diff: {
                    spend: calcDiff(curr.spend, prev?.spend),
                    sales: calcDiff(curr.sales, prev?.sales),
                    acos: calcDiff(curr.acos, prev?.acos),
                    roas: calcDiff(curr.roas, prev?.roas),
                    orders: calcDiff(curr.orders, prev?.orders),
                    cpc: calcDiff(curr.cpc, prev?.cpc),
                },
            };
        });
    }, [currentData, previousData]);

    const totalComparisonRows = useMemo(() => {
        if (!currentTotal || !previousTotal) return [];
        const calcDiff = (c = 0, p = 0) => c - p;
        return [
            { label: "Spend", c: currentTotal.spend, p: previousTotal.spend },
            { label: "Sales", c: currentTotal.sales, p: previousTotal.sales },
            { label: "ACOS", c: currentTotal.acos, p: previousTotal.acos, percent: true },
            { label: "ROAS", c: currentTotal.roas, p: previousTotal.roas },
            { label: "Orders", c: currentTotal.orders, p: previousTotal.orders, format: true },
            { label: "CPC", c: currentTotal.cpc, p: previousTotal.cpc },
        ].map((row) => ({
            ...row,
            diff: calcDiff(row.c, row.p),
        }));
    }, [currentTotal, previousTotal]);

    const columns = [
        {
            name: t("Campaign Name"),
            title: "Campaign Name",
            width: "320px",
            selector: (row) => row.name,
            cell: (row) => (
                <div className="campaignStatus w-full flex justify-between items-center pr-4">
                    <div className="flex items-center gap-2 truncate">
                        {!row?.isTotalRow ? (
                            <CampaignNameCell row={row} name={row.name} campaignId={row.campaignId} showStatusDot={true} />
                        ) : (
                            <span className="text-xs font-bold text-slate-800 dark:text-white">{row.name}</span>
                        )}
                    </div>
                </div>
            ),
        },
        {
            name: t("spend"),
            cell: (row) => (
                <div className="mx-auto flex items-center flex-col gap-1 my-1 text-center">
                    <span className="text-xs font-bold text-slate-800 dark:text-white">{CurrencyCode(row.spend)}</span>
                    <DiffBadge value={row.diff.spend} />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        vs. {CurrencyCode(row.previous?.spend ?? 0)}
                    </span>
                </div>
            ),
        },
        {
            name: t("sales"),
            cell: (row) => (
                <div className="mx-auto flex items-center flex-col gap-1 my-1 text-center">
                    <span className="text-xs font-bold text-slate-800 dark:text-white">{CurrencyCode(row.sales)}</span>
                    <DiffBadge value={row.diff.sales} />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        vs. {CurrencyCode(row.previous?.sales ?? 0)}
                    </span>
                </div>
            ),
        },
        {
            name: t("acos"),
            cell: (row) => (
                <div className="mx-auto flex items-center flex-col gap-1 my-1 text-center">
                    <span className="text-xs font-bold text-slate-800 dark:text-white">{row.acos}%</span>
                    <DiffBadge value={row.diff.acos} isPercent />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        vs. {row.previous?.acos ?? 0}%
                    </span>
                </div>
            ),
        },
        {
            name: t("roas"),
            cell: (row) => (
                <div className="mx-auto flex items-center flex-col gap-1 my-1 text-center">
                    <span className="text-xs font-bold text-slate-800 dark:text-white">{CurrencyFormat(row.roas)}</span>
                    <DiffBadge value={row.diff.roas} isFormat />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        vs. {CurrencyFormat(row.previous?.roas ?? 0)}
                    </span>
                </div>
            ),
        },
        {
            name: t("Orders"),
            cell: (row) => (
                <div className="mx-auto flex items-center flex-col gap-1 my-1 text-center">
                    <span className="text-xs font-bold text-slate-800 dark:text-white">{CurrencyFormat(row.orders)}</span>
                    <DiffBadge value={row.diff.orders} isFormat />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        vs. {CurrencyFormat(row.previous?.orders ?? 0)}
                    </span>
                </div>
            ),
        },
        {
            name: t("cpc"),
            cell: (row) => (
                <div className="mx-auto flex items-center flex-col gap-1 my-1 text-center">
                    <span className="text-xs font-bold text-slate-800 dark:text-white">{CurrencyCode(row.cpc)}</span>
                    <DiffBadge value={row.diff.cpc} />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        vs. {CurrencyCode(row.previous?.cpc ?? 0)}
                    </span>
                </div>
            ),
        },
    ];

    const totalColumns = [
        {
            name: "Metric",
            selector: (row) => row.label,
            grow: 2,
            cell: (row) => <span className="text-xs font-bold text-slate-700 dark:text-slate-350">{row.label}</span>
        },
        {
            name: "Current Period",
            cell: (row) => <span className="text-xs font-bold text-slate-800 dark:text-white">{row.percent ? `${row.c}%` : row.format ? CurrencyFormat(row.c) : CurrencyCode(row.c)}</span>,
        },
        {
            name: "Previous Period",
            cell: (row) => <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{row.percent ? `${row.p}%` : row.format ? CurrencyFormat(row.p) : CurrencyCode(row.p)}</span>,
        },
        {
            name: "Change",
            cell: (row) => <DiffBadge value={row.diff} isPercent={row.percent} isFormat={row.format} />,
        },
    ];

    return (
        <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className="max-w-[1240px] w-[95vw] p-0 rounded-[24px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[90vh] font-sans"
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
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-white/10 shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="p-2 rounded-xl flex items-center justify-center bg-sky-500/10 border border-sky-500/20 text-sky-500 dark:text-sky-400">
                            <FiActivity size={16} />
                        </span>
                        <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                            Campaign Comparison
                        </DialogTitle>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-5 max-h-[calc(90vh-140px)]">

                    {/* Visual Period Compare Display Card */}
                    <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl p-4 shrink-0">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 md:gap-6">
                            {/* Current Date Card */}
                            <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 px-4 py-2.5 rounded-xl shadow-sm">
                                <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500 dark:text-sky-400 shrink-0">
                                    <FiCalendar size={14} />
                                </span>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Current Period</span>
                                    <span className="text-xs font-bold text-slate-800 dark:text-white">
                                        {moment(date?.[0]).format("DD MMM YYYY")} – {moment(date?.[1]).format("DD MMM YYYY")}
                                    </span>
                                </div>
                            </div>

                            {/* Center arrow connector */}
                            <div className="hidden sm:flex items-center justify-center text-slate-300 dark:text-slate-700">
                                <FiArrowRight size={18} />
                            </div>

                            {/* Previous Date Card */}
                            <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 px-4 py-2.5 rounded-xl shadow-sm">
                                <span className="p-1.5 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-400 dark:text-slate-500 shrink-0">
                                    <FiCalendar size={14} />
                                </span>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Previous Period</span>
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                        {moment(previousDate?.[0]).format("DD MMM YYYY")} – {moment(previousDate?.[1]).format("DD MMM YYYY")}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Date Range Picker */}
                        <div className="flex flex-col gap-1.5 justify-center">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Compare Previous To</span>
                            <DateRangePicker
                                className="w-full sm:w-[260px] h-9 text-xs"
                                ranges={compareRanges}
                                value={previousDate}
                                placeholder={t("Previous Period")}
                                onChange={setPreviousDate}
                                format="yyyy-MM-dd"
                                cleanable={false}
                                style={{ width: 260 }}
                                disabledDate={disabledPreviousDate}
                            />
                        </div>
                    </div>

                    {/* Segmented Controller / Tabs */}
                    <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl w-fit shrink-0">
                        {[
                            { label: "Campaign Breakdown", id: 0 },
                            { label: "Overall Summary", id: 1 }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`py-1.5 px-4 rounded-lg text-xs font-bold transition-all duration-200 ${activeTab === tab.id
                                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Table View Component */}
                    <div className="flex-1 overflow-y-auto border border-slate-100 dark:border-white/5 rounded-2xl bg-white dark:bg-transparent shadow-sm">
                        {activeTab === 0 && (
                            <div className="data_table position-relative" id="campaign-main-table">
                                <DataTable
                                    className="table_content"
                                    customStyles={tableStyles}
                                    columns={columns}
                                    data={mergedData}
                                    fixedHeader
                                    noDataComponent={
                                        <div className="flex flex-col items-center justify-center p-12 text-center gap-3">
                                            <span className="p-4 rounded-full bg-slate-50 dark:bg-white/5 text-slate-400 dark:text-slate-600">
                                                <FiTrendingUp size={24} />
                                            </span>
                                            <div>
                                                <h6 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">No Comparison Data</h6>
                                                <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-[280px]">Select a date range and campaigns above to begin your analysis.</p>
                                            </div>
                                        </div>
                                    }
                                />
                            </div>
                        )}

                        {activeTab === 1 && (
                            <div className="data_table position-relative" id="campaign-main-table">
                                <DataTable
                                    className="table_content"
                                    customStyles={tableStyles}
                                    columns={totalColumns}
                                    data={totalComparisonRows}
                                    fixedHeader
                                    noDataComponent={
                                        <div className="flex flex-col items-center justify-center p-12 text-center gap-3">
                                            <span className="p-4 rounded-full bg-slate-50 dark:bg-white/5 text-slate-400 dark:text-slate-600">
                                                <FiTrendingUp size={24} />
                                            </span>
                                            <div>
                                                <h6 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">No Comparison Data</h6>
                                                <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-[280px]">Select a date range and campaigns above to begin your analysis.</p>
                                            </div>
                                        </div>
                                    }
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 shrink-0">
                    <ShadcnButton
                        variant="outline"
                        className="h-[36px] px-4 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10"
                        onClick={onClose}
                    >
                        {t("Close")}
                    </ShadcnButton>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default CampaignComparision;
