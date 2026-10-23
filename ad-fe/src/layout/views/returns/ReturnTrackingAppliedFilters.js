import React from "react";
import { useTranslation } from "react-i18next";
import { FiFilter } from "react-icons/fi";

const ReturnTrackingAppliedFilters = ({
    appliedFilters = [],
    onRemove,
    onClearAll,
    onEdit,
}) => {
    const { t } = useTranslation();

    if (!appliedFilters.length) return null;

    return (
        <div className="filter-bar" id="returns-applied-filters">
            <div className="filter-bar__inner">
                <div className="filter-bar__left">
                    <span className="filter-bar__label" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <FiFilter />
                        {t("Filters")}
                    </span>

                    <div className="filter-bar__chips">
                        {appliedFilters.map((filter) => (
                            <div
                                key={filter.id}
                                className="filter-chip"
                                style={{ display: "inline-flex", alignItems: "center" }}
                            >
                                <span
                                    className="filter-chip__label"
                                    style={{ cursor: "pointer" }}
                                    onClick={() => onEdit && onEdit(filter)}
                                    title={onEdit ? t("Click to edit") : filter.displayText}
                                >
                                    {filter.displayText}
                                </span>
                                <button
                                    className="filter-chip__remove"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemove(filter.id);
                                    }}
                                    title={t("Remove filter")}
                                >
                                    ×
                                </button>
                            </div>
                        ))}

                        <button className="filter-bar__clear-btn" onClick={onClearAll}>
                            <span style={{ marginRight: 4, fontWeight: "bold" }}>×</span>
                            {t("Clear all")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReturnTrackingAppliedFilters;