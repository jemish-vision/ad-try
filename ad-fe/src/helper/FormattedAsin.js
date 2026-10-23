import React from "react";

/**
 * FormattedAsin renders ASIN/SKU text, guaranteeing a centered diagonal slash
 * inside any digit '0' while preserving natural font baseline alignment.
 */
export const FormattedAsin = ({ code, className = "", style = {} }) => {
    if (!code && code !== 0) return null;
    const str = String(code);

    return (
        <span 
            className={`formatted-asin ${className}`}
            style={{ 
                letterSpacing: "0.06em",
                ...style 
            }}
        >
            {str.split("").map((char, i) => {
                if (char === "0") {
                    return (
                        <span key={i} className="slashed-zero" title="0 (Zero)">
                            0
                        </span>
                    );
                }
                return char;
            })}
        </span>
    );
};

export default FormattedAsin;

