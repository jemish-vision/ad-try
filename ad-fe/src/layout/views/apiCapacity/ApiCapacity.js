import React, { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import ReactApexChart from "react-apexcharts";
import {
  Gauge,
  Lightning,
  ShieldCheck,
  Warning,
  MagnifyingGlass,
  CheckCircle,
  Database,
  CloudCheck,
  X,
  Buildings,
  ChartPie,
  Key,
  ListBullets,
} from "@phosphor-icons/react";
import AgTable from "../../../common/grid/AgTable";
import { firstPageRows } from "../../../helper/table/TableStyle";
import {
  VOLUME_PRESETS,
  CATEGORIES,
  TRAFFIC_DISTRIBUTION,
  RATE_LIMIT_BENCHMARKS,
  ENDPOINT_DATA,
} from "./apiCapacityData";
import "./ApiCapacity.css";

const ApiCapacity = () => {
  const { t } = useTranslation();

  // Dark/Light Theme Detection
  const [isDark, setIsDark] = useState(
    document.documentElement.getAttribute("data-theme") === "dark"
  );

  useEffect(() => {
    const handleThemeChange = () =>
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handleThemeChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Controls State
  const [selectedPresetId, setSelectedPresetId] = useState("typical");
  const [activeTab, setActiveTab] = useState("endpoints"); // 'endpoints' | 'benchmarks'
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination for AgTable
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(firstPageRows);
  const gridRef = useRef(null);

  // Active Preset
  const activePreset = useMemo(
    () => VOLUME_PRESETS.find((p) => p.id === selectedPresetId) || VOLUME_PRESETS[0],
    [selectedPresetId]
  );

  // Filtered Endpoints
  const filteredEndpoints = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return ENDPOINT_DATA.filter((item) => {
      if (selectedCategoryId !== "all" && item.category !== selectedCategoryId) {
        return false;
      }
      if (query) {
        const matchEndpoint = item.endpoint.toLowerCase().includes(query);
        const matchDomain = item.domain.toLowerCase().includes(query);
        const matchMethod = item.method.toLowerCase().includes(query);
        const matchBatch = item.batchCapacity.toLowerCase().includes(query);
        if (!matchEndpoint && !matchDomain && !matchMethod && !matchBatch) {
          return false;
        }
      }
      return true;
    }).map((item) => {
      const calculatedCalls = Math.round(
        item.dailyCallsTypical * activePreset.multiplier
      );
      return {
        ...item,
        displayCalls: calculatedCalls,
      };
    });
  }, [selectedCategoryId, searchQuery, activePreset]);

  // Paginated Rows
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * perPage;
    return filteredEndpoints.slice(startIndex, startIndex + perPage);
  }, [filteredEndpoints, currentPage, perPage]);

  // Reset page when search, preset, or category changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedPresetId, selectedCategoryId, searchQuery]);

  // Dynamic Workload Distribution for Active Preset
  const currentDistribution = useMemo(() => {
    const rawDistribution = activePreset.distribution || TRAFFIC_DISTRIBUTION;
    const totalPresetCalls = activePreset.dailyCallsTotal;

    return rawDistribution.map((item) => {
      const calls = item.value;
      const percentage = Number(((item.value / totalPresetCalls) * 100).toFixed(1));
      return {
        ...item,
        calls,
        percentage,
      };
    });
  }, [activePreset]);

  const currentTotalCalls = useMemo(() => {
    return activePreset.dailyCallsTotal;
  }, [activePreset]);

  // Dynamic Benchmarks based on Active Preset
  const currentBenchmarks = useMemo(() => {
    return RATE_LIMIT_BENCHMARKS.map((bm) => {
      if (bm.dimension === "Ads API Throughput") {
        return {
          ...bm,
          currentHitRate: activePreset.throughputSec || bm.currentHitRate,
          percentage: activePreset.throughputPct || bm.percentage,
        };
      }
      return bm;
    });
  }, [activePreset]);

  // Contrast text color for donut data labels (especially critical for light mode)
  const sliceTextColors = useMemo(() => {
    return currentDistribution.map((d) => {
      if (isDark) return "#ffffff";
      // Bright slices (cyan, emerald) require dark high-contrast text in light mode
      if (d.color === "#06b6d4" || d.color === "#10b981") {
        return "#0f172a";
      }
      return "#ffffff";
    });
  }, [currentDistribution, isDark]);

  // Donut Chart Config
  const donutOptions = useMemo(
    () => ({
      chart: {
        type: "donut",
        background: "transparent",
        sparkline: {
          enabled: true,
        },
        parentHeightOffset: 0,
        animations: {
          enabled: true,
          dynamicAnimation: { speed: 450, animateGradually: { enabled: true, delay: 100 } },
        },
      },
      labels: currentDistribution.map((d) => t(d.name)),
      colors: currentDistribution.map((d) => d.color),
      legend: { show: false },
      dataLabels: {
        enabled: true,
        formatter: (val) => `${val.toFixed(1)}%`,
        style: {
          fontSize: "10.5px",
          fontWeight: "700",
          fontFamily: "Inter, sans-serif",
          colors: sliceTextColors,
        },
        dropShadow: {
          enabled: true,
          top: 1,
          left: 1,
          blur: 2,
          color: "#000000",
          opacity: isDark ? 0.65 : 0.25,
        },
      },
      tooltip: {
        theme: isDark ? "dark" : "light",
        fillSeriesColor: false,
        y: { formatter: (val) => `${val.toLocaleString()} ${t("calls / day")}` },
      },
      stroke: {
        show: true,
        width: 3,
        colors: [isDark ? "#0f172a" : "#ffffff"],
      },
      states: {
        hover: {
          filter: {
            type: "lighten",
            value: 0.08,
          },
        },
        active: {
          filter: {
            type: "none",
          },
        },
      },
      plotOptions: {
        pie: {
          customScale: 1,
          offsetX: 0,
          offsetY: 0,
          expandOnClick: true,
          donut: {
            size: "60%",
            labels: {
              show: false,
            },
          },
          dataLabels: {
            offset: -4,
            minAngleToShowLabel: 4,
          },
        },
      },
    }),
    [isDark, currentDistribution, currentTotalCalls, sliceTextColors, t]
  );

  const donutSeries = useMemo(
    () => currentDistribution.map((d) => d.calls),
    [currentDistribution]
  );

  // AgTable Column Definitions
  const columnDefs = useMemo(
    () => [
      {
        headerName: t("Category"),
        field: "category",
        width: 130,
        cellRenderer: (params) => {
          const cat = params.value;
          if (cat === "ADS_API") return <span className="api-cap-method-badge api-cap-method-post">{t("Ads API")}</span>;
          if (cat === "SP_API") return <span className="api-cap-method-badge api-cap-method-put">{t("SP-API")}</span>;
          return <span className="api-cap-method-badge api-cap-method-post-get">{t("OAuth")}</span>;
        },
      },
      {
        headerName: t("Domain"),
        field: "domain",
        width: 160,
        cellStyle: { fontSize: "12px", fontWeight: "500" },
      },
      {
        headerName: t("Endpoint / Operation"),
        field: "endpoint",
        flex: 1.3,
        minWidth: 230,
        cellRenderer: (params) => (
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px", fontWeight: "600" }}>
            {params.value}
          </span>
        ),
      },
      {
        headerName: t("Method"),
        field: "method",
        width: 105,
        cellRenderer: (params) => {
          const m = String(params.value || "").toUpperCase();
          if (m.includes("POST") && m.includes("GET")) return <span className="api-cap-method-badge api-cap-method-post-get">POST+GET</span>;
          if (m === "GET") return <span className="api-cap-method-badge api-cap-method-get">GET</span>;
          if (m === "POST") return <span className="api-cap-method-badge api-cap-method-post">POST</span>;
          if (m === "PUT") return <span className="api-cap-method-badge api-cap-method-put">PUT</span>;
          return <span className="api-cap-method-badge">{m}</span>;
        },
      },
      {
        headerName: t("Frequency"),
        field: "frequency",
        width: 130,
        cellStyle: { fontSize: "12px", color: isDark ? "#94a3b8" : "#64748b" },
      },
      {
        headerName: t("Batch Limit"),
        field: "batchCapacity",
        width: 130,
        cellStyle: { fontSize: "12px" },
      },
      {
        headerName: t("Rate Limit / TPS"),
        field: "rateLimit",
        width: 150,
        cellStyle: { fontSize: "12px", fontWeight: "600" },
      },
      {
        headerName: t("Daily Calls"),
        field: "displayCalls",
        width: 135,
        cellRenderer: (params) => (
          <span style={{ fontWeight: "700", color: params.value === 0 ? "#64748b" : isDark ? "#60a5fa" : "#2563eb" }}>
            {params.value === 0 ? "0 (AMS)" : `${params.value.toLocaleString()} ${t("reqs")}`}
          </span>
        ),
      },
      {
        headerName: t("Status"),
        field: "status",
        width: 145,
        cellRenderer: (params) => {
          const s = params.value;
          if (s === "Safe") {
            return (
              <span className="api-cap-status-badge api-cap-status-safe">
                <CheckCircle size={12} weight="fill" /> {t("Safe (>98%)")}
              </span>
            );
          }
          if (s === "At Threshold") {
            return (
              <span className="api-cap-status-badge api-cap-status-threshold">
                <Warning size={12} weight="fill" /> {t("At Threshold")}
              </span>
            );
          }
          if (s === "Rate Sensitive") {
            return (
              <span className="api-cap-status-badge api-cap-status-sensitive">
                <Warning size={12} weight="fill" /> {t("Sensitive")}
              </span>
            );
          }
          return (
            <span className="api-cap-status-badge api-cap-status-stream">
              <CloudCheck size={12} weight="fill" /> {t("Zero-Call")}
            </span>
          );
        },
      },
    ],
    [isDark, t]
  );

  return (
    <div className="api-cap-container">
      {/* Header Bar */}
      <div className="api-cap-header">
        <div className="api-cap-title-row">
          <h1>{t("Amazon API Capacity & Usage")}</h1>
        </div>

        <div className="api-cap-header-controls">
          {/* Volume Preset Switcher */}
          <div className="api-cap-segmented">
            {VOLUME_PRESETS.map((p) => (
              <button
                key={p.id}
                className={`api-cap-seg-btn ${selectedPresetId === p.id ? "active" : ""}`}
                onClick={() => setSelectedPresetId(p.id)}
              >
                {t(p.shortLabel)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="api-cap-main-tabs">
        <button
          className={`api-cap-main-tab-btn ${activeTab === "endpoints" ? "active" : ""}`}
          onClick={() => setActiveTab("endpoints")}
        >
          <ListBullets size={16} weight="bold" />
          {t("Endpoints Directory")} ({filteredEndpoints.length})
        </button>

        <button
          className={`api-cap-main-tab-btn ${activeTab === "benchmarks" ? "active" : ""}`}
          onClick={() => setActiveTab("benchmarks")}
        >
          <ChartPie size={16} weight="bold" />
          {t("Workload & Rate Limits")}
        </button>
      </div>

      {/* Tab 1: Endpoints Table View */}
      {activeTab === "endpoints" && (
        <div className="api-cap-card">
          <div className="api-cap-table-toolbar">
            {/* Category Pills */}
            <div className="api-cap-cat-pills">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  className={`api-cap-cat-pill ${selectedCategoryId === cat.id ? "active" : ""}`}
                  onClick={() => setSelectedCategoryId(cat.id)}
                >
                  {t(cat.label)} ({cat.count})
                </button>
              ))}
            </div>

            {/* Quick Search */}
            <div className="api-cap-search-wrap">
              <MagnifyingGlass size={15} className="api-cap-search-icon" />
              <input
                type="text"
                placeholder={t("Filter by endpoint, domain, method...")}
                className="api-cap-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <X
                  size={14}
                  style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#94a3b8" }}
                  onClick={() => setSearchQuery("")}
                />
              )}
            </div>
          </div>

          <div style={{ width: "100%", height: "580px" }}>
            <AgTable
              ref={gridRef}
              tableId="amazon-api-capacity-table"
              height="560px"
              loading={false}
              rowData={paginatedRows}
              columnDefs={columnDefs}
              totalRecords={filteredEndpoints.length}
              perPage={perPage}
              currentPage={currentPage}
              onPageChange={(page) => setCurrentPage(page)}
              onPerPageChange={(newPerPage) => {
                setPerPage(newPerPage);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>
      )}

      {/* Tab 2: Workload & Throughput Benchmarks View */}
      {activeTab === "benchmarks" && (
        <div className="api-cap-benchmarks-grid">
          {/* Traffic Distribution Donut */}
          <div className="api-cap-card">
            <div className="api-cap-card-header-flex">
              <div>
                <h3 className="api-cap-card-title">
                  <ChartPie size={18} weight="bold" style={{ color: "#2563eb" }} />
                  {t("Workload Traffic Distribution")}
                </h3>
                <p className="api-cap-card-desc">
                  {t("Outgoing daily requests per engine domain for")} <strong>{t(activePreset.shortLabel)}</strong> (~{currentTotalCalls.toLocaleString()} {t("calls / day")}).
                </p>
              </div>
              <span className="api-cap-audit-pill">
                {t(activePreset.shortLabel)}
              </span>
            </div>

            <div className="api-cap-donut-container">
              <div className="api-cap-donut-stage">
                <div className="api-cap-donut-ambient" />
                <div className="api-cap-donut-ring-guide" />
                <div className="api-cap-chart-box">
                  <ReactApexChart
                    options={donutOptions}
                    series={donutSeries}
                    type="donut"
                    height={250}
                    width={250}
                  />
                  <div className="api-cap-donut-center">
                    <span className="api-cap-donut-center-label">{t("DAILY CALLS")}</span>
                    <span className="api-cap-donut-center-val">~{currentTotalCalls.toLocaleString()}</span>
                    <span className="api-cap-donut-center-unit">{t("calls / day")}</span>
                  </div>
                </div>
              </div>

              <div className="api-cap-workload-list">
                {currentDistribution.map((item) => (
                  <div key={item.name} className="api-cap-workload-row">
                    <div className="api-cap-wl-top">
                      <div className="api-cap-wl-left">
                        <span
                          className="api-cap-wl-indicator"
                          style={{
                            background: item.color,
                            boxShadow: `0 0 8px ${item.color}66`,
                          }}
                        />
                        <span className="api-cap-wl-name">{t(item.name)}</span>
                        {item.badge && (
                          <span className="api-cap-wl-badge">{t(item.badge)}</span>
                        )}
                      </div>
                      <div className="api-cap-wl-right">
                        <span className="api-cap-wl-calls">{item.calls.toLocaleString()} {t("reqs")}</span>
                        <span
                          className="api-cap-wl-pct"
                          style={{
                            background: `${item.color}18`,
                            color: item.color,
                            border: `1px solid ${item.color}35`,
                          }}
                        >
                          {item.percentage}%
                        </span>
                      </div>
                    </div>
                    <div className="api-cap-wl-track">
                      <div
                        className="api-cap-wl-fill"
                        style={{
                          width: `${item.percentage}%`,
                          background: item.gradient || item.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Summary Stats Bar */}
            <div className="api-cap-wl-footer-stats">
              <div className="api-cap-wl-fstat">
                <span className="api-cap-wl-fstat-label">{t("Read & Ingestion")}</span>
                <span className="api-cap-wl-fstat-val" style={{ color: "#2563eb" }}>
                  {activePreset.readIngestionPct || "76.2%"}
                </span>
              </div>
              <div className="api-cap-wl-fstat-divider" />
              <div className="api-cap-wl-fstat">
                <span className="api-cap-wl-fstat-label">{t("Mutations & Writes")}</span>
                <span className="api-cap-wl-fstat-val" style={{ color: "#f97316" }}>
                  {activePreset.mutationsPct || "3.8%"}
                </span>
              </div>
              <div className="api-cap-wl-fstat-divider" />
              <div className="api-cap-wl-fstat">
                <span className="api-cap-wl-fstat-label">{t("System Headroom")}</span>
                <span className="api-cap-wl-fstat-val" style={{ color: "#10b981" }}>&gt;98%</span>
              </div>
            </div>
          </div>

          {/* Rate Limits vs Throughput */}
          <div className="api-cap-card">
            <div className="api-cap-card-header-flex">
              <div>
                <h3 className="api-cap-card-title">
                  <Lightning size={18} weight="bold" style={{ color: "#f59e0b" }} />
                  {t("Amazon Allowed Rate Limits vs. Actual Hit Rate")}
                </h3>
                <p className="api-cap-card-desc">
                  {t("Official Amazon TPS and burst boundaries compared against current application throughput.")}
                </p>
              </div>
              <span
                className="api-cap-audit-pill"
                style={{
                  color: "#10b981",
                  borderColor: "rgba(16, 185, 129, 0.3)",
                  background: "rgba(16, 185, 129, 0.08)",
                }}
              >
                {t("Verified")}
              </span>
            </div>

            <div className="api-cap-bm-list">
              {currentBenchmarks.map((bm) => (
                <div key={bm.dimension} className="api-cap-bm-item">
                  <div className="api-cap-bm-head">
                    <span style={{ fontWeight: 600 }}>{t(bm.dimension)}</span>
                    <span
                      className="api-cap-bm-status-pill"
                      style={{
                        color: bm.level === "threshold" ? "#f59e0b" : "#10b981",
                        background: bm.level === "threshold" ? "rgba(245, 158, 11, 0.12)" : "rgba(16, 185, 129, 0.12)",
                      }}
                    >
                      {t(bm.headroomStatus)}
                    </span>
                  </div>
                  <div className="api-cap-bm-meta">
                    <span>{t("Allowed")}: <strong>{bm.allowedLimit}</strong></span>
                    <span>{t("Current")}: <strong style={{ color: bm.level === "threshold" ? "#f59e0b" : "#10b981" }}>{bm.currentHitRate}</strong></span>
                  </div>
                  <div className="api-cap-bm-bar">
                    <div
                      className="api-cap-bm-bar-fill"
                      style={{
                        width: `${Math.min(100, Math.max(3, bm.percentage))}%`,
                        background: bm.level === "threshold" ? "#f59e0b" : "#10b981",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiCapacity;
