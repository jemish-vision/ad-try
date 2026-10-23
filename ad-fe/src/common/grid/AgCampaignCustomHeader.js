import React from "react";
import CampaignFilterModal from "../../layout/views/Targeting/Suggestions/CampaignFilterModal";

const AgCampaignCustomHeader = (props) => {
    const {
        displayName,
        field,
        enableSorting,
        progressSort,
        column,
        conditionObj,
        setConditionObj,
        hasFilter = false,
        fetchData,
        campaignType
    } = props;

    const handleSortClick = () => {
        if (enableSorting) progressSort();
    };

    const sort = column?.getSort?.();

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                height: "100%",
                overflow: "hidden",
            }}
        >
            <div
                onClick={handleSortClick}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    cursor: enableSorting ? "pointer" : "default",
                    overflow: "hidden",
                    flex: 1,
                    minWidth: 0,
                }}
            >
                <span
                    style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "#ffffff",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {displayName}
                </span>

                {enableSorting && sort && (
                    <span style={{ color: "#ffffff", fontSize: 10, flexShrink: 0 }}>
                        {sort === "asc" ? "▲" : "▼"}
                    </span>
                )}
            </div>

            {hasFilter && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ flexShrink: 0, position: "relative" }}
                >
                    <CampaignFilterModal
                        displayName={displayName}
                        paramId={field}
                        conditionObj={conditionObj}
                        setConditionObj={setConditionObj}
                        fetchData={fetchData}
                        campaignType={campaignType}
                    />
                </div>
            )}
        </div>
    );
};

export default AgCampaignCustomHeader;
