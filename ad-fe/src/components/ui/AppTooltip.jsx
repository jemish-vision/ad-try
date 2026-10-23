import * as React from "react"
import { useTranslation } from "react-i18next"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "./tooltip"

export function AppTooltip({ text, children, id, side, placement, className, style }) {
  const { t } = useTranslation();
  const resolvedSide = side || placement || "top";
  if (!text) return children;

  let renderedContent = text;
  if (typeof text === "string") {
    renderedContent = t(text);
  } else if (React.isValidElement(text) && typeof text.props?.children === "string") {
    renderedContent = React.cloneElement(text, {}, t(text.props.children));
  }

  // Arrow positioning based on side
  const arrowStyle = (() => {
    const base = {
      position: "absolute",
      width: "8px",
      height: "8px",
      background: "#2374F2",
      transform: "rotate(45deg)",
      boxShadow: "2px 2px 2px rgba(2,70,139,0.1)",
    };
    switch (resolvedSide) {
      case "bottom":
        return { ...base, top: "-4px", left: "50%", transform: "rotate(45deg) translateX(-50%)" };
      case "left":
        return { ...base, right: "-4px", top: "50%", transform: "rotate(45deg) translateY(-50%)" };
      case "right":
        return { ...base, left: "-4px", top: "50%", transform: "rotate(45deg) translateY(-50%)" };
      case "top":
      default:
        return { ...base, bottom: "-4px", left: "50%", transform: "rotate(45deg) translateX(-50%)" };
    }
  })();

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div style={{ display: "inline-flex", ...style }} id={id}>
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent side={resolvedSide} sideOffset={8} className="z-[99999] p-0 border-0 bg-transparent shadow-none overflow-visible">
          <div
            className={className}
            style={{
              position: "relative",
              background: "linear-gradient(135deg, #1A9FD4 0%, #2374F2 100%)",
              color: "#fff",
              fontSize: "12px",
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: "6px",
              boxShadow: "0 4px 14px rgba(2,70,139,0.3)",
              whiteSpace: typeof renderedContent === 'string' && renderedContent.includes('\n') ? "pre-wrap" : "nowrap",
              textAlign: "center",
              lineHeight: "1.4"
            }}
          >
            {renderedContent}
            <div style={arrowStyle}></div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

