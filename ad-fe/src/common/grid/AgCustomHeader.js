import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import CustomFilter from "../../helper/filter/CustomFilter";

const AgCustomHeader = (props) => {
    const { t } = useTranslation();
    const {
        displayName,
        field,
        enableSorting,
        progressSort,
        column,
        conditionObj,
        setConditionObj,
        setfieldName,
        setCustomFilterFlag,
        defaultValue,
        hasFilter = false,
        hideOperator = false,
        openFilterField,
        setOpenFilterField,
    } = props;

    const [showFilter, setShowFilter] = useState(false);

    useEffect(() => {
        if (openFilterField && openFilterField === field) {
            setShowFilter(true);
            setOpenFilterField(null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openFilterField, field]);

    const handleSortClick = () => {
        if (enableSorting) progressSort();
    };

    const sort = column?.getSort?.();
    const infoTooltip = props?.infoTooltip || column?.getColDef()?.headerComponentParams?.infoTooltip;

    return (
        <div className="flex items-center justify-between" style={{ width: "100%", height: "100%", overflow: "hidden" }}>
            <div className="flex items-center"
                onClick={handleSortClick}
                style={{ gap: 4, cursor: enableSorting ? "pointer" : "default", overflow: "hidden", flex: 1, minWidth: 0 }}
            >
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t(displayName || column?.getColDef()?.headerName || column?.getColDef()?.title || "")}
                </span>
                {infoTooltip && (
                    <span
                        onClick={(e) => e.stopPropagation()}
                        title={t(infoTooltip)}
                        style={{ display: "inline-flex", alignItems: "center", opacity: 0.65, cursor: "help", flexShrink: 0 }}
                        className="hover:opacity-100 transition-opacity"
                    >
                        <i className="fa-solid fa-circle-info" style={{ fontSize: 11 }} />
                    </span>
                )}
                {enableSorting && sort && (
                    <span style={{ color: "inherit", opacity: 0.8, fontSize: 10, flexShrink: 0 }}>
                        {sort === "asc" ? "▲" : "▼"}
                    </span>
                )}
            </div>

            {hasFilter && (
                <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, position: "relative" }}>
                    <CustomFilter
                        isLight={true}
                        field={field}
                        showFilter={showFilter}
                        setShowFilter={setShowFilter}
                        conditionObj={conditionObj}
                        setConditionObj={setConditionObj}
                        setfieldName={setfieldName}
                        setCustomFilterFlag={() => setCustomFilterFlag(prev => !prev)}
                        defaultValue={defaultValue}
                        hideOperator={hideOperator}
                    />
                </div>
            )}
        </div>
    );
};

export default AgCustomHeader;