import React, { useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";

function TooltipWrapper({ text, children }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);

  const show = useCallback(() => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({
        top: r.top - 8,
        left: r.left + r.width / 2,
      });
    }
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{ display: "inline-flex", alignItems: "center" }}
      >
        {children}
      </div>
      {visible &&
        ReactDOM.createPortal(
          <div
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              transform: "translate(-50%, -100%)",
              zIndex: 99999,
              pointerEvents: "none",
              whiteSpace: "nowrap",
              background: "linear-gradient(135deg, #1A9FD4 0%, #2374F2 100%)",
              color: "#fff",
              fontSize: "11px",
              fontWeight: 600,
              padding: "5px 10px",
              borderRadius: "6px",
              boxShadow: "0 4px 14px rgba(2,70,139,0.3)",
              border: "1px solid rgba(255,255,255,0.15)",
              marginBottom: "6px",
            }}
          >
            {text}
            <div
              style={{
                position: "absolute",
                bottom: "-5px",
                left: "50%",
                transform: "translateX(-50%) rotate(45deg)",
                width: "8px",
                height: "8px",
                backgroundColor: "#2374F2",
              }}
            />
          </div>,
          document.body
        )}
    </>
  );
}

export const FieldTitle = ({ title, tooltip = "Fill this field" }) => {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-start mb-0" style={{ fontSize: "14px", fontWeight: 600 }}>
            <p className="mb-0 mr-1 text-left" style={{ fontWeight: 600, fontSize: "14px" }}>{t(title)} <span className="text-red-500">*</span></p>
            {tooltip && (
                <TooltipWrapper text={t(tooltip)}>
                    <i
                        className="fa fa-question-circle ml-1"
                        aria-hidden="true"
                        style={{ cursor: "pointer", fontSize: "13px" }}
                    ></i>
                </TooltipWrapper>
            )}
        </div>
    );
};
