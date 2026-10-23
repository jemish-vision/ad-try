import React from "react";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
} from "../../../components/ui/dialog";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { MdFilterAlt } from "react-icons/md";

const getColors = (isDark) => ({
    primary: "#1A9FD4",
    primaryRgb: "2, 70, 139",
    primaryLight: isDark ? "rgba(26, 159, 212, 0.15)" : "#E0F4FD",
    neutral50: isDark ? "rgba(255, 255, 255, 0.05)" : "#F8FAFC",
    neutral100: isDark ? "rgba(255, 255, 255, 0.08)" : "#F1F5F9",
    neutral200: isDark ? "rgba(255, 255, 255, 0.1)" : "#E2E8F0",
    neutral400: isDark ? "rgba(255, 255, 255, 0.4)" : "#94A3B8",
    neutral600: isDark ? "rgba(255, 255, 255, 0.6)" : "#475569",
    neutral700: isDark ? "rgba(255, 255, 255, 0.8)" : "#334155",
    neutral800: isDark ? "rgba(255, 255, 255, 0.9)" : "#1E293B",
    danger: "#E74C3C",
    warning: "#F59E0B",
    success: "#16A34A",
});

/* ── Reusable sub-components ─────────────────────────────── */

const SectionLabel = ({ children, P }) => (
    <div style={{
        fontSize: 10.5,
        fontWeight: 700,
        color: P.neutral400,
        textTransform: "uppercase",
        letterSpacing: "0.8px",
        marginBottom: 10,
        paddingBottom: 6,
        borderBottom: `1px solid ${P.neutral100}`,
    }}>
        {children}
    </div>
);

const CheckItem = ({ checked, onChange, label, style, P }) => (
    <label
        style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 12px",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13.5,
            fontWeight: 500,
            color: checked ? P.primary : P.neutral800,
            transition: "all 0.15s",
            border: `1px solid ${checked ? `rgba(${P.primaryRgb}, 0.2)` : "transparent"}`,
            background: checked ? P.primaryLight : "transparent",
            ...style
        }}
        onMouseEnter={e => { if (!checked) e.currentTarget.style.background = P.neutral50; }}
        onMouseLeave={e => { if (!checked) e.currentTarget.style.background = "transparent"; }}
    >
        <input
            type="checkbox"
            checked={checked}
            onChange={onChange}
            style={{ accentColor: P.primary, width: 15, height: 15, flexShrink: 0 }}
        />
        {label}
    </label>
);

const RadioItem = ({ name, checked, onChange, label, P }) => (
    <label
        style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 12px",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13.5,
            fontWeight: 500,
            color: checked ? P.primary : P.neutral800,
            transition: "all 0.15s",
            border: `1px solid ${checked ? `rgba(${P.primaryRgb}, 0.2)` : "transparent"}`,
            background: checked ? P.primaryLight : "transparent",
        }}
        onMouseEnter={e => { if (!checked) e.currentTarget.style.background = P.neutral50; }}
        onMouseLeave={e => { if (!checked) e.currentTarget.style.background = "transparent"; }}
    >
        <input
            type="radio"
            name={name}
            checked={checked}
            onChange={onChange}
            style={{ accentColor: P.primary, width: 15, height: 15, flexShrink: 0 }}
        />
        {label}
    </label>
);

/* ── Main Component ─────────────────────────────────────── */

const ReturnTrackingFilterModal = ({
    showFilterModal,
    handleModalClose,
    selectedFilterOption,
    dropdownOptions,
    selectedReturnTypes, setSelectedReturnTypes,
    selectedReturnReasonCodes, setSelectedReturnReasonCodes,
    selectedReturnSources, setSelectedReturnSources,
    selectedReturnStatuses, setSelectedReturnStatuses,
    isPrime, setIsPrime,
    inPolicy, setInPolicy,
    orderDateRange, setOrderDateRange,
    returnRequestDateRange, setReturnRequestDateRange,
    returnDeliveryDateRange, setReturnDeliveryDateRange,
    selectedCondition, setSelectedCondition,
    filterValue, setFilterValue,
    onApply,
    isDark,
}) => {
    const { t } = useTranslation();
    const P = getColors(isDark);

    const SOURCE_BADGE_MAP = isDark ? {
        FBA: { label: "FBA", bg: "rgba(37, 99, 235, 0.15)", color: "#60a5fa", icon: "fa-warehouse" },
        MFN: { label: "MFN", bg: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", icon: "fa-store" },
    } : {
        FBA: { label: "FBA", bg: "#dbeafe", color: "#1d4ed8", icon: "fa-warehouse" },
        MFN: { label: "MFN", bg: "#fef3c7", color: "#b45309", icon: "fa-store" },
    };

    if (!selectedFilterOption) return null;
    const filterType = selectedFilterOption.value;

    const toggleMulti = (val, current, setter) => {
        if (current.includes(val)) setter(current.filter((v) => v !== val));
        else setter([...current, val]);
    };

    const renderContent = () => {

        if (filterType === "ReturnType") {
            const opts = dropdownOptions?.returnTypes || [];
            return (
                <>
                    <SectionLabel P={P}>{t("Select Return Types")}</SectionLabel>
                    {opts.length === 0
                        ? <p style={{ color: P.neutral400, fontSize: 13 }}>{t("No options available")}</p>
                        : opts.map((opt) => (
                            <CheckItem
                                key={opt.value}
                                checked={selectedReturnTypes.includes(opt.value)}
                                onChange={() => toggleMulti(opt.value, selectedReturnTypes, setSelectedReturnTypes)}
                                label={opt.label}
                                P={P}
                            />
                        ))
                    }
                </>
            );
        }

        if (filterType === "ReturnReasonCode") {
            const opts = dropdownOptions?.returnReasonCodes || [];
            return (
                <>
                    <SectionLabel P={P}>{t("Select Reason Codes")}</SectionLabel>
                    {opts.length === 0
                        ? <p style={{ color: P.neutral400, fontSize: 13 }}>{t("No options available")}</p>
                        : opts.map((opt) => (
                            <CheckItem
                                key={opt.value}
                                checked={selectedReturnReasonCodes.includes(opt.value)}
                                onChange={() => toggleMulti(opt.value, selectedReturnReasonCodes, setSelectedReturnReasonCodes)}
                                label={opt.label}
                                P={P}
                            />
                        ))
                    }
                </>
            );
        }

        if (filterType === "ReturnStatus") {
            const opts = dropdownOptions?.returnStatuses || [];
            return (
                <>
                    <SectionLabel P={P}>{t("Select Status")}</SectionLabel>
                    <RadioItem
                        name="returnStatus"
                        label={t("All Statuses")}
                        checked={selectedReturnStatuses.length === 0}
                        onChange={() => setSelectedReturnStatuses([])}
                        P={P}
                    />
                    {opts.map((opt) => (
                        <RadioItem
                            key={opt.value}
                            name="returnStatus"
                            label={opt.label}
                            checked={selectedReturnStatuses.includes(opt.value)}
                            onChange={() => setSelectedReturnStatuses([opt.value])}
                            P={P}
                        />
                    ))}
                </>
            );
        }

        if (filterType === "ReturnSource") {
            const sources = dropdownOptions?.returnSources || [];
            return (
                <>
                    <SectionLabel P={P}>{t("Select Fulfillment Source")}</SectionLabel>
                    <div className="flex flex-col" style={{ gap: 8 }}>
                        {sources.length === 0 && (
                            <p style={{ color: P.neutral400, fontSize: 13 }}>{t("No options available")}</p>
                        )}
                        {sources.map((opt) => {
                            const badge = SOURCE_BADGE_MAP[opt.value];
                            const isChecked = selectedReturnSources.includes(opt.value);
                            return (
                                <label
                                    key={opt.value}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 12,
                                        padding: "12px 14px",
                                        borderRadius: 10,
                                        border: `1.5px solid ${isChecked ? `rgba(${P.primaryRgb}, 0.25)` : P.neutral200}`,
                                        background: isChecked ? P.primaryLight : isDark ? "rgba(255, 255, 255, 0.02)" : "#fff",
                                        cursor: "pointer",
                                        transition: "all 0.15s",
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleMulti(opt.value, selectedReturnSources, setSelectedReturnSources)}
                                        style={{ accentColor: P.primary, width: 15, height: 15, flexShrink: 0 }}
                                    />
                                    <div className="flex items-center" style={{ gap: 10, flex: 1 }}>
                                        {badge && (
                                            <span style={{
                                                display: "inline-flex", alignItems: "center", gap: 5,
                                                padding: "4px 12px", borderRadius: 6,
                                                fontSize: 11, fontWeight: 700,
                                                backgroundColor: badge.bg, color: badge.color,
                                                letterSpacing: "0.4px", textTransform: "uppercase",
                                                border: isDark ? "1px solid rgba(255,255,255,0.05)" : "none"
                                            }}>
                                                <i className={`fa-solid ${badge.icon}`} style={{ fontSize: 10 }} />
                                                {badge.label}
                                            </span>
                                        )}
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: P.neutral800 }}>{opt.label}</div>
                                            <div style={{ fontSize: 11, color: P.neutral400, marginTop: 1 }}>
                                                {opt.value === "FBA" ? "Fulfilled by Amazon" : opt.value === "MFN" ? "Merchant Fulfilled" : ""}
                                            </div>
                                        </div>
                                    </div>
                                    {isChecked && (
                                        <i className="fa-solid fa-circle-check" style={{ color: P.primary, fontSize: 15 }} />
                                    )}
                                </label>
                            );
                        })}
                    </div>
                </>
            );
        }

        if (filterType === "IsPrime") {
            return (
                <>
                    <SectionLabel P={P}>{t("Prime Order Filter")}</SectionLabel>
                    {[
                        { label: t("All Orders"), val: null, desc: t("Show both Prime and non-Prime") },
                        { label: t("Prime Only"), val: true, desc: t("Orders placed with Prime membership") },
                        { label: t("Non-Prime Only"), val: false, desc: t("Orders without Prime") },
                    ].map(({ label, val, desc }) => (
                        <label
                            key={String(val)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                padding: "10px 14px",
                                borderRadius: 10,
                                border: `1.5px solid ${isPrime === val ? `rgba(${P.primaryRgb}, 0.25)` : P.neutral200}`,
                                background: isPrime === val ? P.primaryLight : isDark ? "rgba(255, 255, 255, 0.02)" : "#fff",
                                cursor: "pointer",
                                transition: "all 0.15s",
                                marginBottom: 6,
                            }}
                        >
                            <input
                                type="radio"
                                name="isPrime"
                                checked={isPrime === val}
                                onChange={() => setIsPrime(val)}
                                style={{ accentColor: P.primary, width: 15, height: 15, flexShrink: 0 }}
                            />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: isPrime === val ? P.primary : P.neutral800 }}>{label}</div>
                                <div style={{ fontSize: 11.5, color: P.neutral400, marginTop: 2 }}>{desc}</div>
                            </div>
                            {isPrime === val && (
                                <i className="fa-solid fa-circle-check" style={{ color: P.primary, fontSize: 15 }} />
                            )}
                        </label>
                    ))}
                </>
            );
        }

        if (filterType === "InPolicy") {
            return (
                <>
                    <SectionLabel P={P}>{t("Return Policy Filter")}</SectionLabel>
                    {[
                        { label: t("All Returns"), val: null, desc: t("Show all regardless of policy") },
                        { label: t("Within Policy"), val: true, desc: t("Returns that fall within Amazon's window") },
                        { label: t("Outside Policy"), val: false, desc: t("Returns outside the policy window") },
                    ].map(({ label, val, desc }) => (
                        <label
                            key={String(val)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                padding: "10px 14px",
                                borderRadius: 10,
                                border: `1.5px solid ${inPolicy === val ? `rgba(${P.primaryRgb}, 0.25)` : P.neutral200}`,
                                background: inPolicy === val ? P.primaryLight : isDark ? "rgba(255, 255, 255, 0.02)" : "#fff",
                                cursor: "pointer",
                                transition: "all 0.15s",
                                marginBottom: 6,
                            }}
                        >
                            <input
                                type="radio"
                                name="inPolicy"
                                checked={inPolicy === val}
                                onChange={() => setInPolicy(val)}
                                style={{ accentColor: P.primary, width: 15, height: 15, flexShrink: 0 }}
                            />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: inPolicy === val ? P.primary : P.neutral800 }}>{label}</div>
                                <div style={{ fontSize: 11.5, color: P.neutral400, marginTop: 2 }}>{desc}</div>
                            </div>
                            {inPolicy === val && (
                                <i className="fa-solid fa-circle-check" style={{ color: P.primary, fontSize: 15 }} />
                            )}
                        </label>
                    ))}
                </>
            );
        }

        if (["OrderDate", "ReturnRequestDate", "ReturnDeliveryDate"].includes(filterType)) {
            const rangeMap = {
                OrderDate: [orderDateRange, setOrderDateRange],
                ReturnRequestDate: [returnRequestDateRange, setReturnRequestDateRange],
                ReturnDeliveryDate: [returnDeliveryDateRange, setReturnDeliveryDateRange],
            };
            const labelMap = {
                OrderDate: t("Order Date Range"),
                ReturnRequestDate: t("Return Request Date Range"),
                ReturnDeliveryDate: t("Return Delivery Date Range"),
            };
            const [range, setRange] = rangeMap[filterType];

            return (
                <>
                    <SectionLabel P={P}>{labelMap[filterType]}</SectionLabel>
                    <div style={{
                        background: P.neutral50,
                        border: `1.5px solid ${P.neutral200}`,
                        borderRadius: 10,
                        padding: "12px 14px",
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: P.neutral600, marginBottom: 8 }}>
                            <i className="fa-regular fa-calendar" style={{ marginRight: 6 }} />
                            {t("Select a date range to filter")}
                        </div>
                        <DateRangePicker
                            className="w-full sm:w-[260px]"
                            ranges={predefinedRanges}
                             value={range}
                            placeholder={t("Start – End")}
                            onChange={setRange}
                            placement="bottomStart"
                            format="yyyy-MM-dd"
                            cleanable={true}
                            style={{ width: "100%" }}
                        />
                    </div>
                </>
            );
        }

        return null;
    };

    return (
        <Dialog open={showFilterModal} onOpenChange={(open) => { if (!open) handleModalClose(); }}>
            <DialogContent className="sm:max-w-[750px] p-0 overflow-hidden" hideCloseButton={false}>
                <DialogHeader className="p-5 border-b" style={{ borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #f1f5f9", background: isDark ? "transparent" : "#fff" }}>
                    <DialogTitle asChild>
                        <div className="w-full flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <div style={{
                                    width: "36px",
                                    height: "36px",
                                    borderRadius: "10px",
                                    background: isDark ? "rgba(26, 159, 212, 0.15)" : "#E0F4FD",
                                    color: "#1A9FD4",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center"
                                }}>
                                    <MdFilterAlt size={20} style={{ display: 'inline-block' }} />
                                </div>
                                <div>
                                    <span className="font-bold" style={{ fontSize: "16px", color: isDark ? "rgba(255, 255, 255, 0.92)" : "#0f172a" }}>
                                        {t(selectedFilterOption.labelKey || selectedFilterOption.label)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div style={{ padding: "24px", maxHeight: 460, overflowY: "auto", background: isDark ? "transparent" : "#fff" }}>
                    {renderContent()}
                </div>

                <DialogFooter className="p-4 border-t" style={{ borderTop: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #f1f5f9", background: isDark ? "transparent" : "#fff" }}>
                    <button
                        style={{
                            background: isDark ? "transparent" : "#fff",
                            color: P.neutral700,
                            fontWeight: 600,
                            borderRadius: 8,
                            padding: "8px 16px",
                            border: isDark ? "1px solid rgba(255, 255, 255, 0.15)" : `1.5px solid ${P.neutral200}`,
                            cursor: "pointer",
                            fontSize: 13,
                            transition: "all 0.15s",
                        }}
                        onClick={handleModalClose}
                    >
                        {t("Cancel")}
                    </button>
                    <button
                        style={{
                            background: "linear-gradient(135deg, #1A9FD4 0%, #2374F2 100%)",
                            border: "none",
                            borderRadius: "8px",
                            padding: "8px 24px",
                            fontWeight: "600",
                            fontSize: "14px",
                            color: "#fff",
                            boxShadow: "0 4px 12px rgba(2, 70, 139, 0.15)",
                            cursor: "pointer"
                        }}
                        onClick={onApply}
                    >
                        {t("Apply")}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ReturnTrackingFilterModal;