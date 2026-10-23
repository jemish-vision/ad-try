import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

const InlineEditPopup = ({
    value,
    onSave,
    currency,
    title,
    formatter,
    min = 0,
    disabled = false,
    append,
}) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState(value);
    const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        window.addEventListener("themeChanged", handle);
        return () => window.removeEventListener("themeChanged", handle);
    }, []);

    useEffect(() => {
        if (!open) return;

        const handleScroll = () => {
            handleClose();
        };

        window.addEventListener("scroll", handleScroll, true);
        return () => {
            window.removeEventListener("scroll", handleScroll, true);
        };
    }, [open]);

    const handleOpen = (e) => {
        if (disabled) return;
        e.stopPropagation();
        setInputValue(value);
        setOpen(true);
    };

    const handleClose = () => setOpen(false);

    const handleSave = () => {
        onSave(Number(inputValue));
        handleClose();
    };

    const numericInput = Number(inputValue);
    const isChanged = !Number.isNaN(numericInput) && inputValue !== "" && numericInput >= min;

    return (
        <Popover open={open} onOpenChange={(val) => {
            if (!disabled) setOpen(val);
        }}>
            {/* Clickable Value Trigger */}
            <PopoverTrigger asChild>
                <div
                    onClick={handleOpen}
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        cursor: disabled ? "not-allowed" : "pointer",
                        background: isDark ? "rgba(255,255,255,0.06)" : "#ffffff",
                        border: isDark ? "1.5px solid rgba(255,255,255,0.12)" : "1.5px solid #dce8f7",
                        borderRadius: "8px",
                        padding: "6px 12px",
                        transition: "all 0.2s ease-in-out",
                        boxShadow: isDark ? "none" : "0 1px 2px rgba(0,0,0,0.02)",
                        width: "100%",
                        justifyContent: "center",
                        opacity: disabled ? 0.6 : 1
                    }}
                    onMouseEnter={e => {
                        if (disabled) return;
                        e.currentTarget.style.borderColor = isDark ? "#2374F2" : "#1A9FD4";
                        e.currentTarget.style.boxShadow = isDark ? "0 0 0 3px rgba(60,187,242,0.10)" : "0 2px 8px rgba(2,70,139,0.08)";
                    }}
                    onMouseLeave={e => {
                        if (disabled) return;
                        e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.12)" : "#dce8f7";
                        e.currentTarget.style.boxShadow = isDark ? "none" : "0 1px 2px rgba(0,0,0,0.02)";
                    }}
                >
                    <span style={{ fontWeight: "600", color: isDark ? "rgba(255,255,255,0.90)" : "#1e293b", fontSize: "12px", fontFamily: "Inter" }}>
                        {formatter ? formatter(value) : value}
                    </span>
                    {append && (
                        <span style={{ color: isDark ? "rgba(255,255,255,0.45)" : "#64748b", fontSize: "11px", fontWeight: "600", marginLeft: "4px", fontFamily: "Inter" }}>
                            {append}
                        </span>
                    )}
                    <i className="fa-solid fa-pen ml-2" style={{ fontSize: "9px", color: isDark ? "rgba(255,255,255,0.35)" : "#94a3b8" }} />
                </div>
            </PopoverTrigger>

            <PopoverContent
                className="p-3 w-[230px] rounded-xl border shadow-xl z-[9999]"
                style={{
                    borderRadius: 12,
                    background: isDark ? "rgba(14,18,30,0.97)" : "#fff",
                    borderColor: isDark ? "rgba(255,255,255,0.10)" : "#dce8f7",
                }}
                onClick={(e) => e.stopPropagation()}
                align="start"
                side="bottom"
                sideOffset={5}
            >
                <div style={{ fontFamily: "Inter" }}>
                    <div className="font-semibold mb-2" style={{ color: isDark ? "rgba(255,255,255,0.92)" : "#1e293b", fontSize: "13px" }}>{typeof title === 'string' ? t(title) : title}</div>

                    {/* Input field */}
                    <div className="flex items-stretch mb-3 w-full">
                        {!append && currency && (
                            <span
                                className="flex items-center justify-center px-3 animate-none"
                                style={{
                                    fontSize: "13px",
                                    background: isDark ? "rgba(255,255,255,0.06)" : "#f8f9fa",
                                    border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #dce8f7",
                                    borderRight: "none",
                                    borderRadius: "8px 0 0 8px",
                                    color: isDark ? "rgba(255,255,255,0.60)" : "#475569",
                                }}
                            >
                                {currency}
                            </span>
                        )}
                        <Input
                            type="number"
                            className="w-full focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none"
                            style={{
                                border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #dce8f7",
                                borderRight: append ? "none" : (isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #dce8f7"),
                                borderLeft: (!append && currency) ? "none" : (isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #dce8f7"),
                                borderRadius: append ? "8px 0 0 8px" : ((!append && currency) ? "0 8px 8px 0" : "8px"),
                                padding: "6px 12px",
                                fontSize: "13px",
                                fontWeight: "600",
                                color: isDark ? "rgba(255,255,255,0.92)" : "#1e293b",
                                background: isDark ? "rgba(255,255,255,0.06)" : "#fff",
                                boxShadow: "none",
                                outline: "none",
                            }}
                            min={min}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && isChanged) {
                                    handleSave();
                                } else if (e.key === "Escape") {
                                    handleClose();
                                }
                            }}
                        />
                        {append && (
                            <span
                                className="flex items-center justify-center px-3"
                                style={{
                                    border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #dce8f7",
                                    borderRadius: "0px 8px 8px 0px",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                    background: isDark ? "rgba(255,255,255,0.06)" : "#f8f9fa",
                                    color: isDark ? "rgba(255,255,255,0.60)" : "#64748b",
                                }}
                            >
                                {append}
                            </span>
                        )}
                    </div>

                    {min > 0 && !isNaN(numericInput) && inputValue !== "" && numericInput < min && (
                        <div className="text-[11px] text-rose-500 font-semibold mb-2 flex items-center gap-1">
                            <i className="fa-solid fa-circle-exclamation text-[10px]" />
                            {t("Minimum value is")} {min}
                        </div>
                    )}

                    {/* Buttons */}
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            className="h-8 px-3 rounded-lg text-xs font-semibold"
                            style={{
                                background: isDark ? "rgba(255,255,255,0.06)" : "transparent",
                                borderColor: isDark ? "rgba(255,255,255,0.15)" : "#94a3b8",
                                color: isDark ? "rgba(255,255,255,0.70)" : "#475569",
                            }}
                            onClick={handleClose}
                        >
                            {t("Cancel")}
                        </Button>
                        <Button
                            className="h-8 px-3 rounded-lg text-xs font-semibold"
                            style={{
                                background: isDark ? "#1A9FD4" : "linear-gradient(135deg, #2374F2 0%, #2374F2 100%)",
                                color: "#fff",
                                opacity: isChanged ? 1 : 0.45,
                            }}
                            onClick={handleSave}
                            disabled={!isChanged}
                        >
                            {t("Save")}
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};

export default InlineEditPopup;
