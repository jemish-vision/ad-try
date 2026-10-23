import React, { useEffect, useRef, useState } from "react";
import ReactApexChart from "react-apexcharts";
import { useTranslation } from "react-i18next";
import CurrencyCode from "./currencyCode/CurrencyCode";

/* ─── Sparkline ──────────────────────────────────────────────────────────── */
function Sparkline({ data, color }) {
  const seriesData = Array.isArray(data)
    ? data.map(v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; })
    : [];

  const options = {
    chart: { type: "area", sparkline: { enabled: true }, animations: { enabled: false } },
    stroke: { curve: "smooth", width: 2 },
    fill: { type: "gradient", gradient: { opacityFrom: 0.35, opacityTo: 0 } },
    colors: [color || "#2374F2"],
    tooltip: { enabled: false },
  };

  return (
    <div className="kpi-item-sparkline" style={{ width: "70px", paddingLeft: 0, flexShrink: 0 }}>
      <ReactApexChart type="area" options={options} series={[{ data: seriesData }]} height={36} width={70} />
    </div>
  );
}

/* ─── Animated Counter Hook ──────────────────────────────────────────────── */
// eslint-disable-next-line no-unused-vars
function useCountUp(target, duration = 1000, enabled = true) {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!enabled || target === null || target === undefined) return;
    // Only animate pure numbers (no currency strings, etc.)
    const numTarget = parseFloat(String(target).replace(/[^0-9.-]/g, ""));
    if (isNaN(numTarget)) { setDisplay(target); return; }

    const start = performance.now();
    const from = 0;

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (numTarget - from) * eased;
      // preserve prefix/suffix from original value string
      const prefix = String(target).match(/^[^0-9-]*/)?.[0] || "";
      const suffix = String(target).match(/[^0-9.]+$/)?.[0] || "";
      setDisplay(`${prefix}${current % 1 === 0 ? Math.round(current) : current.toFixed(2)}${suffix}`);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, enabled]);

  return display;
}

/* ─── Delta Badge ─────────────────────────────────────────────────────────── */
function formatDeltaAbs(val, isCur) {
  if (val === null || val === undefined) return "";
  const sign = val >= 0 ? "+" : "-";
  const num = Math.abs(val);
  const formatted = isCur
    ? CurrencyCode(num)
    : (num >= 1000 ? (num / 1000).toFixed(1) + "k" : num.toString());
  return `${sign}${formatted}`;
}

const getIsometricSVG = (key) => {
  const normKey = String(key).toLowerCase();

  if (normKey === "spend") {
    return (
      <svg width="40" height="40" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" className="kpi-isometric-svg">
        <defs>
          <linearGradient id="goldTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="goldSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b45309" />
            <stop offset="100%" stopColor="#78350f" />
          </linearGradient>
        </defs>
        <ellipse cx="23" cy="35" rx="14" ry="5" fill="black" fillOpacity="0.15" />
        <path d="M 9 26 A 14 5 0 0 0 37 26 V 30 A 14 5 0 0 1 9 30 Z" fill="url(#goldSide)" />
        <ellipse cx="23" cy="26" rx="14" ry="5" fill="url(#goldTop)" />
        <path d="M 12 18 A 14 5 0 0 0 40 18 V 22 A 14 5 0 0 1 12 22 Z" fill="url(#goldSide)" />
        <ellipse cx="26" cy="18" rx="14" ry="5" fill="url(#goldTop)" />
        <path d="M 15 10 A 14 5 0 0 0 43 10 V 14 A 14 5 0 0 1 15 14 Z" fill="url(#goldSide)" />
        <ellipse cx="29" cy="10" rx="14" ry="5" fill="url(#goldTop)" />
      </svg>
    );
  }

  if (normKey === "sales" || normKey === "totalsales") {
    return (
      <svg width="40" height="40" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" className="kpi-isometric-svg">
        <defs>
          <linearGradient id="blueTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="blueRight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
        <path d="M 5 36 L 15 31 L 20 33 L 10 38 Z" fill="black" fillOpacity="0.1" />
        <path d="M 16 33 L 26 28 L 31 30 L 21 35 Z" fill="black" fillOpacity="0.1" />
        <path d="M 27 30 L 37 25 L 42 27 L 32 32 Z" fill="black" fillOpacity="0.1" />
        <path d="M 6 28 L 11 31 L 11 36 L 6 33 Z" fill="#1e40af" />
        <path d="M 11 31 L 16 28 L 16 33 L 11 36 Z" fill="url(#blueRight)" />
        <path d="M 6 28 L 11 25 L 16 28 L 11 31 Z" fill="url(#blueTop)" />
        <path d="M 17 21 L 22 24 L 22 32 L 17 29 Z" fill="#1e40af" />
        <path d="M 22 24 L 27 21 L 27 29 L 22 32 Z" fill="url(#blueRight)" />
        <path d="M 17 21 L 22 18 L 27 21 L 22 24 Z" fill="url(#blueTop)" />
        <path d="M 28 14 L 33 17 L 33 28 L 28 25 Z" fill="#1e40af" />
        <path d="M 33 17 L 38 14 L 38 25 L 33 28 Z" fill="url(#blueRight)" />
        <path d="M 28 14 L 33 11 L 38 14 L 33 17 Z" fill="url(#blueTop)" />
      </svg>
    );
  }

  if (normKey === "orders") {
    return (
      <svg width="40" height="40" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" className="kpi-isometric-svg">
        <defs>
          <linearGradient id="boxTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fcd34d" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id="boxLeft" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="boxRight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b45309" />
            <stop offset="100%" stopColor="#78350f" />
          </linearGradient>
        </defs>
        <path d="M 10 34 L 23 27 L 36 34 L 23 41 Z" fill="black" fillOpacity="0.15" />
        <path d="M 10 20 L 23 27 V 40 L 10 33 Z" fill="url(#boxLeft)" />
        <path d="M 23 27 L 36 20 V 33 L 23 40 Z" fill="url(#boxRight)" />
        <path d="M 10 20 L 23 13 L 36 20 L 23 27 Z" fill="url(#boxTop)" />
        <path d="M 20 15.5 L 23 17.2 L 26 15.5 L 23 13.8 Z" fill="#92400e" opacity="0.8" />
        <path d="M 21.5 25.8 V 38.5 L 24.5 37.0 V 24.2 Z" fill="#92400e" opacity="0.8" />
      </svg>
    );
  }

  if (normKey === "acos") {
    return (
      <svg width="40" height="40" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" className="kpi-isometric-svg">
        <defs>
          <linearGradient id="targetTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fca5a5" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
          <linearGradient id="targetSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b91c1c" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </linearGradient>
          <linearGradient id="arrowGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>
        <ellipse cx="23" cy="29" rx="17" ry="7" fill="black" fillOpacity="0.12" />
        <path d="M 6 22 A 17 7 0 0 0 40 22 V 26 A 17 7 0 0 1 6 26 Z" fill="url(#targetSide)" />
        <ellipse cx="23" cy="22" rx="17" ry="7" fill="url(#targetTop)" />
        <ellipse cx="23" cy="22" rx="11" ry="4.5" fill="#f87171" />
        <ellipse cx="23" cy="22" rx="5" ry="2" fill="#ef4444" />
        <path d="M 23 22 L 23 4" stroke="url(#arrowGrad)" strokeWidth="3" strokeLinecap="round" />
        <path d="M 20 7 L 23 4 L 26 7" stroke="url(#arrowGrad)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (normKey === "roas") {
    return (
      <svg width="40" height="40" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" className="kpi-isometric-svg">
        <defs>
          <linearGradient id="greenTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="greenSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#047857" />
            <stop offset="100%" stopColor="#065f46" />
          </linearGradient>
        </defs>
        <path d="M 12 37 L 27 29 L 34 32 L 19 40 Z" fill="black" fillOpacity="0.12" />
        <path d="M 10 32 L 20 27 V 33 L 10 38 Z" fill="url(#greenSide)" />
        <path d="M 20 27 L 20 33 L 25 30.5 V 24.5 Z" fill="#047857" />
        <path d="M 10 32 L 20 27 L 25 29.5 L 15 34.5 Z" fill="url(#greenTop)" />
        <path d="M 17 25 L 32 17 L 32 23 L 17 31 Z" fill="url(#greenSide)" />
        <path d="M 32 17 L 37 19.5 L 37 25.5 L 32 23 Z" fill="#045f46" />
        <path d="M 17 25 L 32 17 L 37 19.5 L 22 27.5 Z" fill="url(#greenTop)" />
      </svg>
    );
  }

  if (normKey === "impressions") {
    return (
      <svg width="40" height="40" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" className="kpi-isometric-svg">
        <defs>
          <linearGradient id="purpleTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <ellipse cx="23" cy="32" rx="16" ry="6.5" stroke="#a78bfa" strokeWidth="2.5" opacity="0.3" />
        <ellipse cx="23" cy="22" rx="11" ry="4.5" stroke="#8b5cf6" strokeWidth="2.5" opacity="0.6" />
        <ellipse cx="23" cy="12" rx="6" ry="2.5" fill="url(#purpleTop)" />
        <ellipse cx="23" cy="12" rx="6" ry="2.5" stroke="#7c3aed" strokeWidth="1" />
        <path d="M 23 35 L 23 8" stroke="#d8b4fe" strokeWidth="2" strokeDasharray="2 2" opacity="0.8" />
      </svg>
    );
  }

  if (normKey === "clicks") {
    return (
      <svg width="40" height="40" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" className="kpi-isometric-svg">
        <defs>
          <linearGradient id="cyanTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>
          <linearGradient id="cyanSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#0f766e" />
          </linearGradient>
        </defs>
        <path d="M 8 28 L 26 19 L 38 25 L 20 34 Z" fill="black" fillOpacity="0.1" />
        <path d="M 8 24 A 15 7 0 0 0 38 24 V 28 A 15 7 0 0 1 8 28 Z" fill="url(#cyanSide)" />
        <ellipse cx="23" cy="24" rx="15" ry="7" fill="url(#cyanTop)" />
        <path d="M 25 15 L 34 26 L 29 27 L 33 33 L 30 34 L 26 28 L 22 30 Z" fill="#ffffff" stroke="#0f172a" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }

  return null;
};

/* ─── KPICard ─────────────────────────────────────────────────────────────── */
const KPICard = ({
  label,
  value,
  delta,
  deltaAbs,
  green,
  red,
  sparkline,
  colorTheme = "",
  accentColor,
  isPrimary = false,
  onRemove,
  onClick,
  isCurrency,
  index = 0,          // stagger index passed from parent
  metricKey,
  style = {},
}) => {
  const { t } = useTranslation();

  /* Entrance animation via CSS custom property --card-delay */
  const cardStyle = {
    "--card-delay": `${index * 80}ms`,
    cursor: onClick ? "pointer" : "default",
    borderTop: isPrimary && accentColor ? `3px solid ${accentColor}` : undefined,
    ...style,
  };

  const trendClass =
    green ? "trend-positive"
      : (red || (delta !== null && delta !== undefined && delta !== 0)) ? "trend-negative"
        : "trend-neutral";

  /* Status-pulse dot color */
  const pulseColor =
    green ? "var(--accent-positive, #3ECFA8)"
      : delta < 0 ? "var(--accent-negative, #F07070)"
        : "var(--accent-warning, #F0B04A)";

  const isLoading = value === "...";

  return (
    <div
      className={`shared-kpi-card kpi-card-animate ${colorTheme} ${trendClass}${isPrimary ? " kpi-primary" : ""}`}
      onClick={onClick}
      style={cardStyle}
    >

      {/* Shimmer overlay (visible on hover via CSS) */}
      <div className="kpi-shimmer-overlay" aria-hidden="true" />

      {/* Header row: label + optional remove btn */}
      <div className="kpi-item-header-row">
        <div className="kpi-item-label">{t(label)}</div>
        <div className="kpi-header-right">
          {/* Live status pulse dot */}
          {!isLoading && (
            <span
              className="kpi-status-dot"
              style={{ "--dot-color": pulseColor }}
              title={green ? "Positive trend" : "Negative trend"}
            />
          )}
          {onRemove && (
            <button
              onPointerDown={e => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
              className="kpi-item-remove-btn"
              title={t("Remove")}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Body: value + sparkline/3D isometric icon */}
      {sparkline ? (
        <div className="kpi-item-bottom" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: "6px" }}>
          {isLoading ? (
            <div className="kpi-skeleton-value" />
          ) : (
            <span className={`kpi-item-value${green ? " green" : ""}${red ? " red" : ""}`} style={{ fontSize: "20px", fontWeight: "700" }}>
              {value}
            </span>
          )}

          <div className="kpi-sparkline-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%" }}>
            {!isLoading && delta !== null && delta !== undefined && (
              <span className={`kpi-item-delta inline-flex items-center ${green ? "positive" : "negative"}`}>
                <span className="kpi-delta-arrow mr-1">{delta < 0 ? "↘" : "↗"}</span>
                <span>{Math.abs(delta)}%</span>
                {deltaAbs !== undefined && deltaAbs !== null && (
                  <>
                    <span className="mx-1.5 h-2.5 w-[1px] bg-current opacity-20" />
                    <span className="opacity-90">{formatDeltaAbs(deltaAbs, isCurrency)}</span>
                  </>
                )}
              </span>
            )}
            <Sparkline data={sparkline.data} color={sparkline.color} />
          </div>
        </div>
      ) : (
        <div className="kpi-item-bottom" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <div className="kpi-item-value-row" style={{
            alignItems: metricKey ? "flex-start" : "center",
            textAlign: metricKey ? "left" : "center",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            flex: 1
          }}>
            {isLoading ? (
              <div className="kpi-skeleton-value" />
            ) : (
              <span className={`kpi-item-value${green ? " green" : ""}${red ? " red" : ""}`} style={{ fontSize: "20px", fontWeight: "700" }}>
                {value}
              </span>
            )}

            {isLoading ? (
              <div className="kpi-skeleton-delta" />
            ) : (
              delta !== null && delta !== undefined && (
                <span className={`kpi-item-delta inline-flex items-center ${green ? "positive" : "negative"}`}>
                  <span className="kpi-delta-arrow mr-1">{delta < 0 ? "↘" : "↗"}</span>
                  <span>{Math.abs(delta)}%</span>
                  {deltaAbs !== undefined && deltaAbs !== null && (
                    <>
                      <span className="mx-1.5 h-2.5 w-[1px] bg-current opacity-20" />
                      <span className="opacity-90">{formatDeltaAbs(deltaAbs, isCurrency)}</span>
                    </>
                  )}
                </span>
              )
            )}
          </div>

          {/* 3D Isometric SVG Icon (rendered if no sparkline but metricKey is provided) */}
          {metricKey && (
            <div className="kpi-isometric-icon-wrapper" style={{ flexShrink: 0, marginLeft: "10px" }}>
              {getIsometricSVG(metricKey)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default KPICard;
