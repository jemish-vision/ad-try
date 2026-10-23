import React from "react";
import { useTranslation } from "react-i18next";
import { FiFilter, FiSave } from "react-icons/fi";
import { formatCondition } from "../../../utility/common";

const CONDITION_LABEL_MAP = {
    "$eq": "equalTo",
    "$ne": "notEqualTo",
    "$gt": "greaterThan",
    "$gte": "greaterThanOrEqualTo",
    "$lt": "lessThan",
    "$lte": "lessThanOrEqualTo",
    "=": "equalTo",
    "≠": "notEqualTo",
    ">": "greaterThan",
    "≥": "greaterThanOrEqualTo",
    "<": "lessThan",
    "≤": "lessThanOrEqualTo",
};

const COND_TEXT_MAP = {
    "greater than": "greaterThan",
    "less than": "lessThan",
    "equal to": "equalTo",
    "not equal to": "notEqualTo",
    "greater than or equal to": "greaterThanOrEqualTo",
    "less than or equal to": "lessThanOrEqualTo",
    "greater than or equal": "greaterThanOrEqualTo",
    "less than or equal": "lessThanOrEqualTo",
};

export const getFilterDisplayText = (filter, t) => {
    if (!filter) return "";

    if (filter?.type === "OutOfBudget" || filter?.value === "OUT_OF_BUDGET") {
        return t("Out of budget");
    }

    if (filter?.type === "CampaignsAndAdGroups") {
        const totalSelections = Array.isArray(filter?.value) ? filter.value.length : 0;
        return `${t("Campaigns & Ad Groups")}: ${totalSelections} ${t("selected")}`;
    }

    if (filter?.condition && filter?.value !== undefined) {
        const fieldKey = filter.label || filter.type;
        const condKey = CONDITION_LABEL_MAP[filter.condition] || filter.condition;
        return `${t(fieldKey)}: ${t(condKey)} ${filter.value}`;
    }

    if (filter?.isCustom && filter?.conditionObj) {
        const fieldKey = filter?.field || filter?.type;
        return `${t(fieldKey)}: ${formatCondition(filter.conditionObj)}`;
    }

    if (filter?.displayText) {
        const text = String(filter.displayText);
        const match = text.match(/^([^:]+):\s*(.+?)\s+([0-9.,]+.*)$/);
        if (match) {
            const [, field, cond, val] = match;
            const fieldKey = field.trim();
            const lowerCond = cond.trim().toLowerCase();
            const condKey = COND_TEXT_MAP[lowerCond] || cond.trim();
            return `${t(fieldKey)}: ${t(condKey)} ${val.trim()}`;
        }
        const colonMatch = text.match(/^([^:]+):\s*(.+)$/);
        if (colonMatch) {
            const [, field, val] = colonMatch;
            const fieldKey = field.trim();
            const valKey = val.trim();
            return `${t(fieldKey)}: ${t(valKey)}`;
        }
        return t(filter.displayText);
    }

    return "";
};

const AppliedFilter = ({ appliedFilters, handleGridFilter, handleRemoveSingleFilter, setAppliedFilters, setShowSaveFilterModal, selectedCampaigns = [], selectedAdGroups = [], chipRefs = {}, onEditCustomFilter, id }) => {
    const { t } = useTranslation();

    const isSaveBtnVisible = appliedFilters.length > 0 && selectedCampaigns.length === 0 && selectedAdGroups.length === 0 && !appliedFilters.some(filter => filter.type === "CampaignsAndAdGroups") && typeof setShowSaveFilterModal === "function";

    return (
        <>
            {appliedFilters.length > 0 && (
                <div className="filter-bar" id={id}>
                    <div className="filter-bar__inner">

                        {/* Left: Label + Chips */}
                        <div className="filter-bar__left">
                            <span className="filter-bar__label" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                <FiFilter />
                                {t("Filters")}
                            </span>

                            <div className="filter-bar__chips">
                                {appliedFilters.map((filter) => {
                                    const displayText = getFilterDisplayText(filter, t);
                                    return (
                                        <div
                                            key={filter.id}
                                            className="filter-chip"
                                            style={{ display: "inline-flex", alignItems: "center" }}
                                        >
                                            <span
                                                ref={chipRefs?.[filter?.id]}
                                                className="filter-chip__label"
                                                style={{ cursor: "pointer" }}
                                                onClick={() => {
                                                    if (filter?.isCustom) {
                                                        onEditCustomFilter?.({
                                                            field: filter.field,
                                                            conditionObj: { ...filter?.conditionObj, fieldName: filter?.field },
                                                        });
                                                    } else {
                                                        handleGridFilter({ target: { value: filter?.type } });
                                                    }
                                                }}
                                            >
                                                {displayText}
                                            </span>
                                            <button
                                                className="filter-chip__remove"
                                                onClick={() => handleRemoveSingleFilter(filter.id)}
                                                aria-label={`${t("Remove filter")}: ${displayText}`}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    );
                                })}

                                <button className="filter-bar__clear-btn" onClick={() => setAppliedFilters([])}>
                                    <span style={{ marginRight: 4, fontWeight: "bold" }}>×</span>
                                    {t("Clear all")}
                                </button>
                            </div>
                        </div>

                        {/* Right: Save Filter */}
                        {isSaveBtnVisible && (
                            <button className="filter-bar__save-btn" onClick={() => setShowSaveFilterModal(true)} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                <FiSave />
                                {t("Save Filter")}
                            </button>
                        )}

                    </div>
                </div>
            )}
        </>
    );
};

export default AppliedFilter;