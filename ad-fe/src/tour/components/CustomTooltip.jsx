import React from "react";
import { useTranslation } from "react-i18next";

export const CustomTooltip = ({
    step,
    index,
    size,
    isLastStep,
    backProps,
    closeProps,
    primaryProps,
    skipProps,
    tooltipProps,
}) => {
    const { t } = useTranslation();
    // Animate the target element when blockTargetInteraction is not set or it's a child tour
    React.useEffect(() => {
        const isBodyStep = !step.target || step.target === 'body' || step.placement === 'center';
        const isBlocked = Boolean(step.blockTargetInteraction);

        if (isBodyStep) return;

        const targetEl = typeof step.target === 'string'
            ? document.querySelector(step.target)
            : step.target;

        if (!(targetEl instanceof HTMLElement)) return;

        // If it's a child tour or not blocked from interaction, show the ripple
        if (step.childTourId || !isBlocked) {
            targetEl.classList.add('tour-target-ripple');
        }

        return () => {
            targetEl.classList.remove('tour-target-ripple');
        };
    }, [step]);

    const renderProgress = () => {
        if (size <= 3) {
            // Use dots for small tours (2 to 3 steps)
            return Array.from({ length: size }).map((_, i) => (
                <div
                    key={i}
                    style={{
                        width: i === index ? "12px" : "6px",
                        height: "6px",
                        borderRadius: "3px",
                        background: i === index ? "var(--save-bg-color, #1A82F4)" : "var(--table-header-text, #94a3b8)",
                        opacity: i === index ? 1 : 0.4,
                        transition: "all 0.3s ease",
                    }}
                />
            ));
        } else {
            // Use badge for long tours to save space and reduce clutter at the bottom
            return (
                <span style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    background: "rgba(26, 130, 244, 0.1)",
                    color: "var(--save-bg-color, #1A82F4)",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    whiteSpace: "nowrap"
                }}>
                    {index + 1} / {size}
                </span>
            );
        }
    };

    return (
        <div
            {...tooltipProps}
            className="custom-tour-tooltip bg-white dark:bg-[#151D2A] text-slate-900 dark:text-slate-100"
            style={{
                borderRadius: "16px",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                borderTop: "4px solid var(--save-bg-color, #1A82F4)",
                padding: "20px 24px",
                width: "min(450px, calc(100vw - 24px))",
                maxWidth: "calc(100vw - 24px)",
                boxSizing: "border-box",
                boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
                animation: "tourFadeIn 0.25s cubic-bezier(0.22,1,0.36,1) both",
                fontFamily: "inherit",
                position: "relative",
            }}
        >
            <style>{`
                @keyframes tourFadeIn {
                    from { opacity: 0; transform: translateY(10px) scale(0.98); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                .tour-btn-close:hover { opacity: 0.7; }
                .tour-btn-skip:hover { color: var(--title-text-color) !important; }
                .tour-btn-next:hover { opacity: 0.9; transform: translateY(-1px); }
                .tour-btn-back:hover { background: rgba(148, 163, 184, 0.1) !important; }
                @media (max-width: 480px) {
                    .custom-tour-tooltip {
                        width: calc(100vw - 24px) !important;
                        max-width: calc(100vw - 24px) !important;
                        padding: 16px !important;
                        border-radius: 14px !important;
                    }
                    .tour-btn-next {
                        padding: 8px 14px !important;
                    }
                    .tour-btn-back {
                        padding: 8px 12px !important;
                    }
                    .tour-btn-skip {
                        font-size: 10px !important;
                    }
                }
            `}</style>

            <div className="flex items-center justify-between" style={{ marginBottom: "16px" }}>
                <div className="flex items-center" style={{ gap: "10px" }}>
                    <div style={{
                        background: "var(--save-bg-color, #1A82F4)",
                        color: "#ffffff",
                        borderRadius: "12px",
                        width: "40px",
                        height: "40px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "18px",
                        flexShrink: 0,
                        boxShadow: "0 4px 12px rgba(26, 130, 244, 0.3)"
                    }}>
                        {step.icon ? React.createElement(step.icon, { size: 20, color: "#ffffff", weight: "bold" }) : <i className="fa-solid fa-wand-magic-sparkles" style={{ color: "#ffffff" }}></i>}
                    </div>
                    <div className="flex items-center" style={{ gap: '10px' }}>
                        {step.title && (
                            <h4 style={{ fontSize: "18px", fontWeight: 800, color: "var(--title-text-color, #111827)", margin: 0, letterSpacing: "-0.3px" }}>
                                {typeof step.title === "string" ? t(step.title) : step.title}
                            </h4>
                        )}
                    </div>
                </div>
                <button
                    {...closeProps}
                    className="tour-btn-close"
                    aria-label="Close tour"
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: "16px", color: "var(--table-header-text, #94a3b8)", transition: "opacity 0.2s", outline: 'none' }}
                >
                    ✕
                </button>
            </div>

            <p style={{ fontSize: "15px", color: "var(--table-text-color, #4b5563)", lineHeight: 1.6, margin: "0 0 24px", fontWeight: 500 }}>
                {typeof step.content === "string" ? t(step.content) : step.content}
            </p>

            <div className="flex items-center justify-between" style={{ paddingTop: "12px", borderTop: "1px solid rgba(148, 163, 184, 0.1)" }}>
                {/* Progress Indicators */}
                <div className="flex gap-1 flex-wrap" style={{ maxWidth: "40%" }}>
                    {renderProgress()}
                </div>

                <div className="flex items-center gap-4" >
                    <button
                        {...skipProps}
                        className="tour-btn-skip"
                        style={{ border: 'none', background: 'none', color: 'var(--table-header-text, #94a3b8)', cursor: 'pointer', fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", transition: "color 0.2s", whiteSpace: "nowrap", outline: 'none' }}
                    >
                        {t("Skip Tour")}
                    </button>

                    <div className="flex gap-3" >
                        {index > 0 && (
                            <button
                                {...backProps}
                                className="tour-btn-back"
                                style={{ border: '1px solid rgba(148, 163, 184, 0.4)', background: 'transparent', color: 'var(--title-text-color, #374151)', borderRadius: "100px", padding: '8px 16px', cursor: 'pointer', fontSize: "12px", fontWeight: 800, transition: "background 0.2s", whiteSpace: "nowrap", outline: 'none' }}
                            >
                                <i className="fa-solid fa-angle-left" style={{ marginRight: '4px', fontSize: '11px' }}></i> {t("BACK")}
                            </button>
                        )}

                        <button
                            {...primaryProps}
                            className="tour-btn-next"
                            style={{
                                border: 'none', background: 'var(--save-bg-color, #1A82F4)',
                                color: 'white', borderRadius: "100px", padding: '8px 20px',
                                cursor: 'pointer', fontSize: "12px", fontWeight: 800,
                                transition: "all 0.2s", whiteSpace: "nowrap", flexShrink: 0,
                                boxShadow: "0 4px 12px rgba(26, 130, 244, 0.3)",
                                outline: 'none',
                                display: step.requireClick ? 'none' : 'block'
                            }}
                        >
                            {isLastStep ? t("DONE") : (
                                <>
                                    {t("NEXT")} <i className="fa-solid fa-angle-right" style={{ marginLeft: '4px', fontSize: '11px' }}></i>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
