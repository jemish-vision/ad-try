import React from "react";

const getCVRConfig = (value) => {
    if (value === null || value === undefined || value === "") {
        return { label: "N/A", cls: "cvr-na", icon: "●" };
    }

    const cvr = parseFloat(value);

    if (cvr >= 10) return { label: "Excellent", cls: "cvr-excellent", icon: "▲" };
    if (cvr >= 5) return { label: "Good", cls: "cvr-good", icon: "▲" };
    if (cvr > 0) return { label: "Average", cls: "cvr-average", icon: "◆" };
    return { label: "No Conversion", cls: "cvr-none", icon: "▼" };
};

const CustomCVRTag = ({ value, isValueShow = true }) => {
    const { label, cls, icon } = getCVRConfig(value);
    const isNA = value === null || value === undefined || value === "";

    return (
        <span className={`cvr-tag ${cls}`}>
            <span className="cvr-icon">{icon}</span>
            {!isNA && isValueShow && (
                <>
                    <span className="cvr-value">{value}%</span>
                    <span className="cvr-divider" />
                </>
            )}
            <span className="cvr-label">{label}</span>
        </span>
    );
};

export default CustomCVRTag;