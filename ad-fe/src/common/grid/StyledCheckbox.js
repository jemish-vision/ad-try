import React from "react";

export const StyledCheckbox = ({ checked, disabled, onChange, className = "", style = {}, ...rest }) => (
    <div className={`relative flex items-center justify-center select-none shrink-0 ${className}`} style={{ width: 18, height: 18 }}>
        <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            onClick={(e) => e.stopPropagation()}
            className="peer absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10 disabled:cursor-not-allowed"
            {...rest}
        />
        <div
            className={`w-[18px] h-[18px] rounded-[4px] border flex items-center justify-center transition-all duration-150
                peer-focus:ring-2 peer-focus:ring-[var(--accent-primary)]/20
                ${checked 
                    ? "bg-[var(--accent-primary)] border-[var(--accent-primary)]" 
                    : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500"
                }
                ${disabled ? "opacity-50 cursor-not-allowed" : ""}
            `}
            style={style}
        >
            {checked && (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3 h-3"
                >
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            )}
        </div>
    </div>
);