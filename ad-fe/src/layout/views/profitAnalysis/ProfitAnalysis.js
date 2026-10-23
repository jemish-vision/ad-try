import React, { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import useSpConnection from "../../../helper/hooks/useSpConnection";
import SpAccountNotConnected from "../../../common/components/SpAccountNotConnected";
import Filter from "../../../helper/filter/Filter";
import moment from "moment";
import { Button as ShadcnButton } from "../../../components/ui/button";
import { Toast } from "../../../helper/links/Link";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { Input } from "../../../components/ui/input";
import { ApiGetProfitAnalysisSummary, ApiGetProfitAnalysisMonthly, ApiGetProfitAnalysisProducts } from "../../../api-wrapper/profitAnalysis/ApiProfitAnalysis";
import { ApiGetProductTypes } from "../../../api-wrapper/productList/ApiProductList";
import { ProfitLossMonthlyGrid } from "./components/ProfitLossMonthlyGrid";
import { ProductAnalysisGrid } from "./components/ProductAnalysisGrid";
import { MultiSelect } from "../../../components/ui/multi-select";
import { MdOutlineClose } from "react-icons/md";
import Chart from "react-apexcharts";
import { Skeleton } from "../../../components/ui/skeleton";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import { Link } from "react-router-dom";
import CurrencyCode, { getCurrencySymbol } from "../../../helper/currencyCode/CurrencyCode";

// ─── Theme ────────────────────────────────────────────────────────────────────
const P = {
  primary: "#1A9FD4",
  neutral100: "#F1F5F9",
  neutral200: "#E2E8F0",
  neutral800: "#1E293B",
  danger: "#E74C3C",
  success: "#16A34A",
};

const ProfitAnalysis = () => {
  const { t } = useTranslation();
  // Context for profile and global date range
  const { profileId, selectedDate, setSelectedDate, currencyCode } = useContext(ProfileContext);

  const { isConnected: isSpConnected, isLoaded: isSpLoaded } = useSpConnection();

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
  const [chartFocus, setChartFocus] = useState("sales"); // "sales", "profit", "spend"
  useEffect(() => {
    const handleTheme = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handleTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Filters State ──────────────────────────────────────────────────────────
  const [searchName, setSearchName] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [skuOptions, setSkuOptions] = useState([]);
  const [selectedSkus, setSelectedSkus] = useState([]);
  const [loadingSkus, setLoadingSkus] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [dateRange, setDateRange] = useState([
    moment().subtract(120, "days").toDate(),
    new Date(),
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchName);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchName]);

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      setDateRange([moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()]);
    }
  }, [selectedDate]);

  const handleDateChange = (val) => {
    setDateRange(val);
    setProductPage(1);
    if (val && Array.isArray(val) && val.length >= 2) {
      const arr = [moment(val[0]).format("YYYY-MM-DD"), moment(val[1]).format("YYYY-MM-DD")];
      setSelectedDate(arr);
      try {
        let storeData = JSON.parse(localStorage.getItem('profile')) || {};
        storeData.date = arr;
        localStorage.setItem('profile', JSON.stringify(storeData));
      } catch (err) { }
    }
  };

  const [activeTab, setActiveTab] = useState("monthly");

  // Fetch SKUs List for selected profile
  useEffect(() => {
    const fetchSkus = async () => {
      if (!profileId?.value) {
        setSkuOptions([]);
        setSelectedSkus([]);
        return;
      }
      setLoadingSkus(true);
      try {
        const res = await ApiGetProfitAnalysisProducts({
          profileId: profileId.value,
          pageNo: 1,
          perPage: 1000,
        });
        if (res?.isSuccess && res.data && Array.isArray(res.data)) {
          const skuDetailsMap = {};
          res.data.forEach(item => {
            const sku = item.productDetails?.sku;
            const name = item.productDetails?.name;
            const image = item.productDetails?.image;
            if (sku && !skuDetailsMap[sku]) {
              skuDetailsMap[sku] = { name: name || "", image: image || "" };
            }
          });
          const uniqueSkus = Object.keys(skuDetailsMap);
          setSkuOptions(
            uniqueSkus.map(sku => {
              const details = skuDetailsMap[sku];
              return {
                value: sku,
                badgeLabel: sku,
                searchLabel: `${sku} ${details.name}`,
                label: (
                  <div className="flex items-center gap-2.5 py-1.5 w-full min-w-0 select-none">
                    {details.image ? (
                      <img src={details.image} alt={sku} className="w-8 h-8 object-contain rounded border border-gray-200/50 bg-white shrink-0" />
                    ) : (
                      <div className="w-8 h-8 bg-gray-100 rounded border border-gray-200/50 flex items-center justify-center text-[10px] text-gray-400 font-semibold shrink-0">SKU</div>
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-bold text-xs text-blue-500 truncate" style={{ fontFamily: 'monospace' }}>{sku}</span>
                      <span className="text-[10px] text-gray-500 dark:text-slate-400 truncate leading-normal" title={details.name}>
                        {details.name}
                      </span>
                    </div>
                  </div>
                )
              };
            })
          );
        } else {
          setSkuOptions([]);
        }
      } catch (err) {
        console.error("SKU fetch error:", err);
        setSkuOptions([]);
      } finally {
        setLoadingSkus(false);
      }
    };
    fetchSkus();
    setSelectedSkus([]);
  }, [profileId?.value]);

  // Fetch Categories
  useEffect(() => {
    const fetchCategories = async () => {
      if (!profileId?.value) return;
      try {
        const res = await ApiGetProductTypes({ profileId: profileId.value });
        if (res?.isSuccess && res.productType && Array.isArray(res.productType)) {
          const opts = res.productType.map(c => {
            return {
              value: c.name,
              label: c.displayName || c.name,
              searchLabel: c.displayName || c.name
            };
          });
          setCategoryOptions(opts);
        } else {
          setCategoryOptions([]);
        }
      } catch (err) {
        setCategoryOptions([]);
        console.error("Categories error:", err);
      }
    };
    fetchCategories();
  }, [profileId?.value]);

  // ── Data State ─────────────────────────────────────────────────────────────
  const [summaryData, setSummaryData] = useState({
    salesSummary: { totalSales: 0, units: 0, breakdown: [] },
    profitSummary: { profit: 0, margin: 0, roas: 0 },
    adSpend: { spend: 0, tacos: 0 }
  });
  const [monthlyGridData, setMonthlyGridData] = useState([]);
  const [chartData, setChartData] = useState([]);

  const [productGridData, setProductGridData] = useState([]);
  const [totalProductRecords, setTotalProductRecords] = useState(0);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingMonthly, setLoadingMonthly] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const monthlyGridRef = React.useRef(null);
  const productGridRef = React.useRef(null);

  // Pagination & Sorting State
  const [productPage, setProductPage] = useState(1);
  const [productPerPage, setProductPerPage] = useState(25);
  const [productSortBy, setProductSortBy] = useState(null);
  const [productSortDir, setProductSortDir] = useState(null);

  // ── Fetch Functions ────────────────────────────────────────────────────────
  const fetchSummary = async () => {
    if (!profileId?.value) return;
    if (isSpLoaded && !isSpConnected) {
      setSummaryData({
        salesSummary: { totalSales: 0, units: 0, breakdown: [] },
        profitSummary: { profit: 0, margin: 0, roas: 0 },
        adSpend: { spend: 0, tacos: 0 }
      });
      setLoadingSummary(false);
      return;
    }
    setLoadingSummary(true);
    try {
      const payload = {
        profileId: profileId.value,
        fromDate: dateRange?.[0] ? moment(dateRange[0]).format("YYYY-MM-DD") : undefined,
        toDate: dateRange?.[1] ? moment(dateRange[1]).format("YYYY-MM-DD") : undefined,
        search: debouncedSearch ? debouncedSearch : (selectedSkus.length ? selectedSkus : undefined),
        searchBy: "ALL",
        categories: categories.length ? categories : undefined
      };
      const res = await ApiGetProfitAnalysisSummary(payload);
      if (res?.isSuccess) {
        setSummaryData(res.data.summary);
      }
    } catch (err) {
      console.error("Summary Error:", err);
    } finally {
      setLoadingSummary(false);
    }
  };

  const fetchMonthly = async () => {
    if (!profileId?.value) return;
    if (isSpLoaded && !isSpConnected) {
      setMonthlyGridData([]);
      setChartData([]);
      setLoadingMonthly(false);
      return;
    }
    setLoadingMonthly(true);
    try {
      const payload = {
        profileId: profileId.value,
        fromDate: dateRange?.[0] ? moment(dateRange[0]).format("YYYY-MM-DD") : undefined,
        toDate: dateRange?.[1] ? moment(dateRange[1]).format("YYYY-MM-DD") : undefined,
        search: debouncedSearch ? debouncedSearch : (selectedSkus.length ? selectedSkus : undefined),
        searchBy: "ALL",
        categories: categories.length ? categories : undefined
      };
      const res = await ApiGetProfitAnalysisMonthly(payload);
      if (res?.isSuccess) {
        setMonthlyGridData(res.data.monthlyData);
        setChartData(res.data.chartData);
      }
    } catch (err) {
      console.error("Monthly Error:", err);
    } finally {
      setLoadingMonthly(false);
    }
  };


  const handleExport = async () => {
    if (activeTab === 'monthly') {
      if (monthlyGridRef.current) monthlyGridRef.current.exportToExcel();
    } else if (activeTab === 'products') {
      if (!profileId?.value) return;
      setIsExporting(true);
      try {
        const payload = {
          profileId: profileId.value,
          fromDate: dateRange?.[0] ? moment(dateRange[0]).format("YYYY-MM-DD") : undefined,
          toDate: dateRange?.[1] ? moment(dateRange[1]).format("YYYY-MM-DD") : undefined,
          search: debouncedSearch ? debouncedSearch : (selectedSkus.length ? selectedSkus : undefined),
          searchBy: "ALL",
          categories: categories.length ? categories : undefined,
          pageNo: 1,
          perPage: totalProductRecords > 0 ? totalProductRecords : 1000,
          sortBy: productSortBy || undefined,
          sortDir: productSortDir || undefined
        };
        const res = await ApiGetProfitAnalysisProducts(payload);
        if (res?.isSuccess) {
          if (productGridRef.current) productGridRef.current.exportToExcel(res.data || []);
        } else {
          Toast.error(res?.message || "Failed to fetch data for export");
        }
      } catch (err) {
        console.error("Export Error:", err);
        Toast.error(t("Something went wrong during export"));
      } finally {
        setIsExporting(false);
      }
    }
  };

  const fetchProducts = async (page = productPage, perPage = productPerPage) => {
    if (!profileId?.value) return;
    if (isSpLoaded && !isSpConnected) {
      setProductGridData([]);
      setTotalProductRecords(0);
      setLoadingProducts(false);
      return;
    }
    setLoadingProducts(true);
    try {
      const payload = {
        profileId: profileId.value,
        fromDate: dateRange?.[0] ? moment(dateRange[0]).format("YYYY-MM-DD") : undefined,
        toDate: dateRange?.[1] ? moment(dateRange[1]).format("YYYY-MM-DD") : undefined,
        search: debouncedSearch ? debouncedSearch : (selectedSkus.length ? selectedSkus : undefined),
        searchBy: "ALL",
        categories: categories.length ? categories : undefined,
        pageNo: page,
        perPage: perPage,
        sortBy: productSortBy || undefined,
        sortDir: productSortDir || undefined
      };
      const res = await ApiGetProfitAnalysisProducts(payload);
      if (res?.isSuccess) {
        setProductGridData(res.data || []);
        setTotalProductRecords(res.totalRecords || 0);
      }
    } catch (err) {
      console.error("Products Error:", err);
    } finally {
      setLoadingProducts(false);
    }
  };


  // 1. Fetch Summary & Monthly Data (Global Widgets) when global filters change
  useEffect(() => {
    if (profileId?.value) {
      fetchSummary();
      fetchMonthly();
    }
  }, [profileId?.value, selectedSkus, categories, dateRange, debouncedSearch]);

  // 2. Fetch Products Data ONLY when on the products tab
  useEffect(() => {
    if (profileId?.value && activeTab === "products") {
      fetchProducts(productPage, productPerPage);
    }
  }, [profileId?.value, activeTab, productPage, productPerPage, selectedSkus, categories, dateRange, debouncedSearch, productSortBy, productSortDir]);


  const chartOptions = {
    chart: {
      type: chartFocus === "sales" ? 'bar' : 'line',
      stacked: chartFocus === "sales",
      toolbar: { show: false },
      foreColor: isDark ? '#94a3b8' : '#64748b',
      fontFamily: 'Inter, sans-serif'
    },
    plotOptions: {
      bar: {
        horizontal: false,
        borderRadius: 4,
        columnWidth: chartFocus === "sales" ? '35%' : '20%'
      }
    },
    stroke: {
      width: chartFocus === "sales" ? 1 : [3, 3, 3, 4],
      colors: chartFocus === "sales" ? [isDark ? '#1e293b' : '#ffffff'] : undefined,
      curve: 'smooth'
    },
    dataLabels: { enabled: false },
    grid: {
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } }
    },
    xaxis: {
      categories: chartData.map(d => d.month),
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: [
      {
        labels: {
          formatter: (value) => {
            const sym = getCurrencySymbol(currencyCode);
            if (Math.abs(value) >= 1000000) return `${sym}${(value / 1000000).toFixed(1)}M`;
            if (Math.abs(value) >= 100000) return `${sym}${(value / 100000).toFixed(1)}L`;
            if (Math.abs(value) >= 1000) return `${sym}${(value / 1000).toFixed(1)}K`;
            return `${sym}${value}`;
          },
          style: {
            fontSize: '11px',
            fontWeight: 500
          }
        }
      },
      ...(chartFocus === "spend" ? [{
        opposite: true,
        title: {
          text: "TACOS %",
          style: { color: '#a855f7', fontFamily: 'Inter, sans-serif', fontWeight: 600 }
        },
        labels: {
          formatter: (val) => `${Number(val).toFixed(0)}%`,
          style: { color: '#a855f7' }
        }
      }] : [])
    ],
    tooltip: {
      theme: isDark ? 'dark' : 'light',
      y: {
        formatter: (value, { seriesIndex }) => {
          if (chartFocus === "spend" && seriesIndex === 1) {
            return `${Number(value).toFixed(2)}%`;
          }
          return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(value);
        }
      }
    },
    legend: {
      position: 'bottom',
      fontSize: '12px',
      fontWeight: 500,
      fontFamily: 'Inter, sans-serif',
      markers: { radius: 12 }
    },
    colors: chartFocus === "sales"
      ? ['#2374F2', '#ef4444', '#22c55e', '#f59e0b']
      : chartFocus === "profit"
        ? ['#3b82f6', '#f43f5e', '#a855f7', '#10b981']
        : ['#a855f7', '#fbbf24']
  };

  const chartSeries = chartFocus === "sales"
    ? [
      { name: t('Gross Sales'), type: 'bar', data: chartData.map(d => d.grossSales || 0) },
      { name: t('Cancelled'), type: 'bar', data: chartData.map(d => d.cancelledSales || 0) },
      { name: t('Return'), type: 'bar', data: chartData.map(d => d.returnedSales || 0) },
      { name: t('Claimed'), type: 'bar', data: chartData.map(d => d.claimedSales || 0) }
    ]
    : chartFocus === "profit"
      ? [
        { name: t('Net Sales'), type: 'bar', data: chartData.map(d => d.netSales || 0) },
        { name: t('Product Cost'), type: 'bar', data: chartData.map(d => d.productCost || 0) },
        { name: t('Amazon Fees & Cost'), type: 'bar', data: chartData.map(d => (d.amazonFees || 0) + (d.shippingFees || 0) + (d.otherCost || 0)) },
        { name: t('Net Profit'), type: 'line', data: chartData.map(d => d.profit || 0) }
      ]
      : [
        { name: t('Ad Spend'), type: 'bar', data: chartData.map(d => d.adSpend || 0) },
        { name: t('TACOS %'), type: 'line', data: chartData.map(d => d.tacos || 0) }
      ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="profit-analysis-container flex flex-col min-h-screen">
      <style>{`
        /* Core Presets for Preserving 3D Space */
        .iso-3d-scene {
          width: 44px;
          height: 44px;
          perspective: 1000px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 10;
        }
        
        .iso-3d-group {
          transform-style: preserve-3d;
          transform: rotateX(60deg) rotateZ(-45deg);
          transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
          width: 30px;
          height: 30px;
          position: relative;
        }
        
        .profit-kpi-card:hover .iso-3d-group {
          transform: rotateX(50deg) rotateZ(-35deg) translateY(-6px);
        }

        /* 3D Bar Element styling */
        .bar-3d {
          position: absolute;
          width: 6px;
          height: 6px;
          transform-style: preserve-3d;
        }
        .bar-3d-face {
          position: absolute;
          width: 100%;
          height: 100%;
        }
        /* Positions for standard 3D cubes */
        .bar-3d-front  { transform: rotateY(0deg) translateZ(3px); background: var(--bar-front, #1d4ed8); }
        .bar-3d-back   { transform: rotateY(180deg) translateZ(3px); background: var(--bar-back, #1e40af); }
        .bar-3d-left   { transform: rotateY(-90deg) translateZ(3px); background: var(--bar-left, #111827); }
        .bar-3d-right  { transform: rotateY(90deg) translateZ(3px); background: var(--bar-right, #2563eb); }
        .bar-3d-top    { transform: rotateX(90deg) translateZ(3px); background: var(--bar-top, #60a5fa); }
        
        /* 3D Layer elements for Profit */
        .layer-3d {
          position: absolute;
          width: 24px;
          height: 24px;
          background: rgba(34, 197, 94, 0.12);
          border: 1.5px solid rgba(34, 197, 94, 0.5);
          border-radius: 5px;
          transform-style: preserve-3d;
          box-shadow: inset 0 0 6px rgba(34, 197, 94, 0.2);
          transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.5s ease;
        }
        
        .profit-kpi-card:hover .layer-3d-1 { transform: translateZ(14px); background: rgba(34, 197, 94, 0.28); }
        .profit-kpi-card:hover .layer-3d-2 { transform: translateZ(7px); opacity: 0.85; }
        .profit-kpi-card:hover .layer-3d-3 { transform: translateZ(0px); opacity: 0.5; }
        
        /* Glowing Core in Profit */
        .glowing-core {
          position: absolute;
          width: 6px;
          height: 6px;
          background: #22c55e;
          border-radius: 50%;
          transform: translateZ(8px);
          filter: blur(3px) drop-shadow(0 0 6px #22c55e);
          animation: pulseGlow 2s infinite ease-in-out;
        }
        
        @keyframes pulseGlow {
          0%, 100% { transform: translateZ(8px) scale(0.9); opacity: 0.6; }
          50% { transform: translateZ(8px) scale(1.3); opacity: 1; }
        }

        /* 3D Ring/Sphere styling for Ad Spend */
        .ring-3d {
          position: absolute;
          width: 24px;
          height: 24px;
          border: 1.5px solid #eab308;
          border-radius: 50%;
          transform-style: preserve-3d;
          animation: rotateRing 8s linear infinite;
        }
        .ring-3d-inner {
          position: absolute;
          width: 14px;
          height: 14px;
          border: 1.5px solid #fbbf24;
          border-radius: 50%;
          transform: rotateX(90deg);
          animation: rotateRingInner 4s linear infinite reverse;
        }
        @keyframes rotateRing {
          0% { transform: rotateZ(0deg); }
          100% { transform: rotateZ(360deg); }
        }

        /* Premium KPI Card Styling */
        .profit-kpi-card {
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease-in-out;
          border-radius: 16px !important;
          cursor: pointer !important;
        }

        .profit-kpi-card:hover {
          box-shadow: 0 10px 20px -10px rgba(0, 0, 0, 0.08) !important;
        }

        /* Subtle active background shifts instead of borders */
        .card-active {
          background-color: #f3f8fe !important;
          border-color: #cbdcf7 !important;
        }
        [data-theme="dark"] .card-active {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }

        /* Subtle mesh glow backgrounds */
        .profit-kpi-card::after {
          content: "";
          position: absolute;
          width: 130px;
          height: 130px;
          border-radius: 50%;
          top: -40px;
          right: -40px;
          filter: blur(40px);
          opacity: 0.06;
          transition: opacity 0.4s ease, transform 0.4s ease;
          pointer-events: none;
          z-index: 1;
        }
        .card-sales::after { background: radial-gradient(circle, #3b82f6, transparent); }
        .card-profit::after { background: radial-gradient(circle, #22c55e, transparent); }
        .card-spend::after { background: radial-gradient(circle, #a855f7, transparent); }

        .profit-kpi-card:hover::after {
          opacity: 0.12;
          transform: scale(1.25);
        }

        /* Dynamic Morphing Liquid Orbs */
        .kpi-liquid-orb {
          position: absolute;
          width: 140px;
          height: 140px;
          bottom: -40px;
          right: -40px;
          filter: blur(28px);
          opacity: 0.12;
          transition: all 0.6s ease;
          animation: morphBlob 8s infinite alternate ease-in-out;
          pointer-events: none;
          z-index: 1;
        }
        @keyframes morphBlob {
          0% { border-radius: 42% 58% 70% 30% / 45% 45% 55% 55%; }
          50% { border-radius: 70% 30% 52% 48% / 60% 40% 60% 40%; }
          100% { border-radius: 30% 70% 40% 60% / 50% 60% 40% 50%; }
        }
        .card-sales .kpi-liquid-orb { background: #3b82f6; }
        .card-profit .kpi-liquid-orb { background: #22c55e; }
        .card-spend .kpi-liquid-orb { background: #a855f7; }

        .profit-kpi-card:hover .kpi-liquid-orb {
          opacity: 0.22;
          transform: scale(1.15) translate(-10px, -10px);
        }

        /* Mini indicator badge */
        .kpi-focus-badge {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(35, 116, 242, 0.08);
          color: #2374F2;
          transition: all 0.3s ease;
          margin-left: 8px;
          display: inline-block;
          z-index: 10;
        }
        .card-active .kpi-focus-badge {
          background: var(--pulse-color, #3b82f6);
          color: white;
        }

        /* Dark Theme AG-Grid Highlight Cell Overrides */
        [data-theme="dark"] .ag-theme-alpine .ag-cell.monthly-highlight-neutral,
        [data-theme="dark"] .ag-theme-alpine .ag-pinned-left-cols-container .ag-cell.monthly-highlight-neutral {
          background-color: rgba(56, 189, 248, 0.06) !important;
          background: rgba(56, 189, 248, 0.06) !important;
          color: #38bdf8 !important;
        }
        
        [data-theme="dark"] .ag-theme-alpine .ag-cell.monthly-highlight-positive,
        [data-theme="dark"] .ag-theme-alpine .ag-pinned-left-cols-container .ag-cell.monthly-highlight-positive {
          background-color: rgba(74, 222, 128, 0.06) !important;
          background: rgba(74, 222, 128, 0.06) !important;
          color: #4ade80 !important;
        }
        
        [data-theme="dark"] .ag-theme-alpine .ag-cell.monthly-highlight-negative,
        [data-theme="dark"] .ag-theme-alpine .ag-pinned-left-cols-container .ag-cell.monthly-highlight-negative {
          background-color: rgba(248, 113, 113, 0.06) !important;
          background: rgba(248, 113, 113, 0.06) !important;
          color: #f87171 !important;
        }

        /* Light Theme AG-Grid Highlight Cell Overrides */
        .ag-theme-alpine .ag-cell.monthly-highlight-neutral,
        .ag-theme-alpine .ag-pinned-left-cols-container .ag-cell.monthly-highlight-neutral {
          background-color: #e0f2fe !important;
          background: #e0f2fe !important;
          color: #0369a1 !important;
        }
        
        .ag-theme-alpine .ag-cell.monthly-highlight-positive,
        .ag-theme-alpine .ag-pinned-left-cols-container .ag-cell.monthly-highlight-positive {
          background-color: #dcfce7 !important;
          background: #dcfce7 !important;
          color: #166534 !important;
        }
        
        .ag-theme-alpine .ag-cell.monthly-highlight-negative,
        .ag-theme-alpine .ag-pinned-left-cols-container .ag-cell.monthly-highlight-negative {
          background-color: #fee2e2 !important;
          background: #fee2e2 !important;
          color: #991b1b !important;
        }
      `}</style>
      <Filter nameShow={false} dateShow={false} profileShow={true} />

      <div className="middle_container flex flex-col gap-6 p-4">

        {/* ── Sticky Top Bar matching Campaign page ── */}
        <div
          id="profit-filters"
          className={`glass-sticky-header dash-filter-bar ${!isMobile ? "sticky-top" : ""}`}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            columnGap: 12,
            rowGap: 10,
            padding: isMobile ? "10px 16px" : "10px 24px",
            zIndex: 90,
            position: !isMobile ? "sticky" : "relative",
            top: !isMobile ? "-10px" : 0,
            marginLeft: 0,
            marginRight: 0,
            marginTop: "-10px",
            marginBottom: "0px",
          }}
        >
          {/* Search Option */}
          <div
            id="profit-search"
            className="search_option m-0 flex items-center"
            style={{
              position: "relative",
              flex: isMobile ? "1 1 100%" : "1 1 240px",
              minWidth: 200,
              maxWidth: isMobile ? "100%" : 280,
              height: "40px"
            }}
          >
            <Input
              type="text"
              placeholder={t("searchHere")}
              value={searchName}
              onChange={(e) => { setSearchName(e.target.value); setProductPage(1); }}
              className="flex-grow w-full h-[40px] bg-transparent"
              style={{ paddingRight: searchName ? "30px" : "10px" }}
            />
            {searchName && (
              <MdOutlineClose
                onClick={() => { setSearchName(""); setProductPage(1); }}
                style={{
                  position: "absolute",
                  right: "10px",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  fontSize: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0.7,
                  transition: "opacity 0.2s"
                }}
                onMouseEnter={(e) => e.target.style.opacity = 1}
                onMouseLeave={(e) => e.target.style.opacity = 0.7}
              />
            )}
          </div>

          {/* SKU select */}
          <div
            id="profit-sku-select"
            style={{
              flex: isMobile ? "1 1 100%" : "1 1 240px",
              minWidth: 200,
              maxWidth: isMobile ? "100%" : 280,
            }}
          >
            <MultiSelect
              options={skuOptions}
              value={selectedSkus}
              onChange={(val) => { setSelectedSkus(val || []); setProductPage(1); }}
              placeholder={loadingSkus ? t("Loading SKUs...") : t("All SKUs")}
              className="bg-transparent h-10 w-full"
              maxCount={1}
            />
          </div>

          {/* Category Multi-Select */}
          <div
            id="profit-category"
            style={{
              flex: isMobile ? "1 1 100%" : "1 1 240px",
              minWidth: 200,
              maxWidth: isMobile ? "100%" : 280,
            }}
          >
            <MultiSelect
              options={categoryOptions}
              value={categories}
              onChange={(val) => { setCategories(val || []); setProductPage(1); }}
              placeholder={t("All Categories")}
              className="bg-transparent h-10 w-full"
              maxCount={2}
            />
          </div>

          {/* Grouped Right-Aligned Controls */}
          <div
            className="flex items-center gap-3 flex-wrap"
            style={{
              marginLeft: !isMobile ? "auto" : 0,
              width: isMobile ? "100%" : "auto"
            }}
          >
            {/* Date Range */}
            <div id="profit-date-picker" style={{ width: isMobile ? "100%" : "auto" }}>
              <DateRangePicker
                className="w-full sm:w-[260px]"
                ranges={predefinedRanges}
                value={dateRange}
                placeholder={t("Select Date Range")}
                onChange={handleDateChange}
                placement="bottomEnd"
                format="yyyy-MM-dd"
                align="end"
                cleanable={true}
                style={{ height: 40, width: isMobile ? "100%" : 260 }}
              />
            </div>

            {/* Refresh Button */}
            <AppTooltip text={t("Refresh")} id="profit-refresh-button">
              <ShadcnButton
                variant="outline"
                className="btn border custom-secondary-btn h-10 px-3"
                onClick={() => {
                  fetchSummary();
                  fetchMonthly();
                  if (activeTab === "products") fetchProducts(productPage, productPerPage);
                }}
              >
                <i className="fa-solid fa-arrows-rotate text-sm" />
              </ShadcnButton>
            </AppTooltip>
          </div>
        </div>

        {/* Active Filter Badges Row */}
        {((categories && categories.length > 0) || (selectedSkus && selectedSkus.length > 0) || searchName) && (
          <div
            id="profit-applied-filter"
            className={`flex flex-wrap items-center gap-2.5 px-4 py-2.5 rounded-xl border text-xs transition-all ${isDark ? 'bg-slate-900/40 border-slate-800/80 text-slate-300' : 'bg-slate-50/50 border-slate-200/60 text-slate-600'}`}
          >
            <div className="flex items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400 mr-1 select-none">
              <span>{t("Active Filters")}:</span>
            </div>

            {searchName && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border select-none transition-all group hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-950/20 dark:hover:text-red-400 dark:hover:border-red-900/50 ${isDark
                  ? 'bg-[#2374F2]/20 text-[#3b82f6] border-[#2374F2]/30'
                  : 'bg-[#2374F2]/10 text-[#2374F2] border-[#2374F2]/20'
                  }`}
                style={{ cursor: 'pointer' }}
                onClick={() => { setSearchName(""); setProductPage(1); }}
              >
                <span className="opacity-70 font-normal">{t("Search")}:</span>
                <span>{searchName}</span>
                <span className="ml-1 text-xs opacity-60 group-hover:opacity-100">✕</span>
              </span>
            )}

            {categories && categories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {categories.map((c) => (
                  <span
                    key={c}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border select-none transition-all group hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-950/20 dark:hover:text-red-400 dark:hover:border-red-900/50 ${isDark
                      ? 'bg-[#2374F2]/20 text-[#3b82f6] border-[#2374F2]/30'
                      : 'bg-[#2374F2]/10 text-[#2374F2] border-[#2374F2]/20'
                      }`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => { setCategories(categories.filter((val) => val !== c)); setProductPage(1); }}
                  >
                    <span className="opacity-70 font-normal">{t("Category")}:</span>
                    <span>{c}</span>
                    <span className="ml-1 text-xs opacity-60 group-hover:opacity-100">✕</span>
                  </span>
                ))}
              </div>
            )}

            {selectedSkus && selectedSkus.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedSkus.map((sku) => (
                  <span
                    key={sku}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border select-none transition-all group hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-950/20 dark:hover:text-red-400 dark:hover:border-red-900/50 ${isDark
                      ? 'bg-[#2374F2]/20 text-[#3b82f6] border-[#2374F2]/30'
                      : 'bg-[#2374F2]/10 text-[#2374F2] border-[#2374F2]/20'
                      }`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => { setSelectedSkus(selectedSkus.filter((val) => val !== sku)); setProductPage(1); }}
                  >
                    <span className="opacity-70 font-normal">{t("SKU")}:</span>
                    <span className="font-mono">{sku}</span>
                    <span className="ml-1 text-xs opacity-60 group-hover:opacity-100">✕</span>
                  </span>
                ))}
              </div>
            )}

            <button
              type="button"
              className="ml-auto text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline transition-all bg-transparent border-0 p-0 cursor-pointer flex items-center gap-1 focus:outline-none"
              onClick={() => { setCategories([]); setSelectedSkus([]); setSearchName(""); setProductPage(1); }}
            >
              {t("Clear All")}
            </button>
          </div>
        )}

        {/* ── No SP Token / SP Not Connected State ── */}
        {(!isSpConnected && isSpLoaded) || (summaryData.hasSpTokens === false && !loadingSummary) ? (
          <SpAccountNotConnected feature={t("Profit Analysis")} isDark={isDark} />
        ) : (
          <>
            {/* Top Widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-12 gap-6">

              {/* Column 1: Sales Summary Table */}
              <div id="profit-sales-summary" className="col-span-1 xl:col-span-4 flex flex-col h-full">
                <AppTooltip text={chartFocus === 'sales' ? 'Sales trend active' : 'Click to focus chart on Sales Summary trend'} side="top" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
                  <div
                    onClick={() => setChartFocus("sales")}
                    className={`p-5 rounded-xl border shadow-sm flex flex-col h-full gap-4 relative overflow-hidden profit-kpi-card card-sales w-full ${chartFocus === 'sales' ? 'card-active' : ''} ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}
                  >
                    <div className="kpi-liquid-orb" />
                    <div className="flex items-center justify-between w-full z-10">
                      <h3 className={`text-sm font-bold flex items-center cursor-pointer ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                        {t("Sales Summary")}
                      </h3>
                      <div className="iso-3d-scene">
                        <div className="iso-3d-group">
                          {/* Bar 1 */}
                          <div className="bar-3d" style={{ left: '0px', top: '10px', height: '12px', transform: 'translateZ(6px)' }}>
                            <div className="bar-3d-face bar-3d-front" style={{ height: '12px', '--bar-front': '#3b82f6', '--bar-right': '#60a5fa' }} />
                            <div className="bar-3d-face bar-3d-back" style={{ height: '12px' }} />
                            <div className="bar-3d-face bar-3d-left" style={{ height: '12px' }} />
                            <div className="bar-3d-face bar-3d-right" style={{ height: '12px' }} />
                            <div className="bar-3d-face bar-3d-top" style={{ transform: 'rotateX(90deg) translateZ(12px)' }} />
                          </div>
                          {/* Bar 2 */}
                          <div className="bar-3d" style={{ left: '10px', top: '10px', height: '18px', transform: 'translateZ(9px)' }}>
                            <div className="bar-3d-face bar-3d-front" style={{ height: '18px', '--bar-front': '#2563eb', '--bar-right': '#3b82f6' }} />
                            <div className="bar-3d-face bar-3d-back" style={{ height: '18px' }} />
                            <div className="bar-3d-face bar-3d-left" style={{ height: '18px' }} />
                            <div className="bar-3d-face bar-3d-right" style={{ height: '18px' }} />
                            <div className="bar-3d-face bar-3d-top" style={{ transform: 'rotateX(90deg) translateZ(18px)' }} />
                          </div>
                          {/* Bar 3 */}
                          <div className="bar-3d" style={{ left: '20px', top: '10px', height: '24px', transform: 'translateZ(12px)' }}>
                            <div className="bar-3d-face bar-3d-front" style={{ height: '24px', '--bar-front': '#1d4ed8', '--bar-right': '#2563eb' }} />
                            <div className="bar-3d-face bar-3d-back" style={{ height: '24px' }} />
                            <div className="bar-3d-face bar-3d-left" style={{ height: '24px' }} />
                            <div className="bar-3d-face bar-3d-right" style={{ height: '24px' }} />
                            <div className="bar-3d-face bar-3d-top" style={{ transform: 'rotateX(90deg) translateZ(24px)' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {loadingSummary ? (
                        <Skeleton className="h-8 w-32" />
                      ) : (
                        <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{CurrencyCode(summaryData.salesSummary.totalSales, currencyCode)}</div>
                      )}
                      {loadingSummary ? (
                        <Skeleton className="h-5 w-24 mt-1 rounded-full" />
                      ) : (
                        <div className={`text-xs font-semibold w-max px-3 py-1 rounded-full mt-1 ${isDark ? 'text-blue-300 bg-blue-900/30' : 'text-blue-600 bg-blue-50'}`}>{t("Units")}: {new Intl.NumberFormat('en-IN').format(summaryData.salesSummary.units)}</div>
                      )}
                    </div>

                    <div className="mt-4 flex-1">
                      <table className="w-full text-[13px]">
                        <thead className={`border-b ${isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
                          <tr>
                            <th className={`text-left py-2 px-3 font-semibold rounded-l-md ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{t("Channel")}</th>
                            <th className={`text-right py-2 px-3 font-semibold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{t("Qty")}</th>
                            <th className={`text-right py-2 px-3 font-semibold rounded-r-md ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{t("Sales")} ({currencyCode || "INR"})</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadingSummary ? (
                            Array.from({ length: 4 }).map((_, idx) => (
                              <tr key={idx} className={`border-b last:border-0 ${isDark ? 'border-gray-700' : 'border-gray-50'}`}>
                                <td className="py-2 px-3"><Skeleton className="h-4 w-16" /></td>
                                <td className="py-2 px-3 flex justify-end"><Skeleton className="h-4 w-8" /></td>
                                <td className="py-2 px-3"><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></td>
                              </tr>
                            ))
                          ) : (
                            <>
                              {summaryData.salesSummary.breakdown?.map((item, i) => (
                                <tr key={i} className={`border-b last:border-0 ${isDark ? 'border-gray-700' : 'border-gray-50'}`}>
                                  <td className={`py-2 px-3 font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{t(item.label)}</td>
                                  <td className={`py-2 px-3 text-right ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{new Intl.NumberFormat('en-IN').format(item.qty)}</td>
                                  <td className={`py-2 px-3 text-right ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    {item.sales < 0 ? `-${CurrencyCode(Math.abs(item.sales), currencyCode)}` : CurrencyCode(item.sales, currencyCode)}
                                  </td>
                                </tr>
                              ))}
                              <tr className={`font-bold border-t ${isDark ? 'border-gray-600 text-gray-200' : 'border-gray-200 text-gray-800'}`}>
                                <td className="py-3 px-3">{t("Net")}</td>
                                <td className="py-3 px-3 text-right">{new Intl.NumberFormat('en-IN').format(summaryData.salesSummary.units)}</td>
                                <td className="py-3 px-3 text-right">{CurrencyCode(summaryData.salesSummary.totalSales, currencyCode)}</td>
                              </tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </AppTooltip>
              </div>

              {/* Column 2: Profit, Ad Spend, Profit/Loss */}
              <div className="col-span-1 xl:col-span-3 flex flex-col justify-between gap-6">

                {/* Profit Summary */}
                <AppTooltip text={chartFocus === 'profit' ? 'Profit trend active' : 'Click to focus chart on Profit Summary trend'} side="top" style={{ display: 'flex', width: '100%' }}>
                  <div
                    id="profit-summary-card"
                    onClick={() => setChartFocus("profit")}
                    className={`p-5 rounded-xl border shadow-sm flex flex-col gap-1 relative overflow-hidden profit-kpi-card card-profit w-full ${chartFocus === 'profit' ? 'card-active' : ''} ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}
                  >
                    <div className="kpi-liquid-orb" />
                    <div className="flex items-center justify-between w-full z-10">
                      <h3 className={`text-sm font-bold flex items-center cursor-pointer ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                        {t("Profit Summary")}
                      </h3>
                      <div className="iso-3d-scene">
                        <div className="iso-3d-group">
                          <div className="layer-3d layer-3d-3" style={{ transform: 'translateZ(0px)' }} />
                          <div className="layer-3d layer-3d-2" style={{ transform: 'translateZ(5px)', borderColor: 'rgba(34, 197, 94, 0.4)' }} />
                          <div className="layer-3d layer-3d-1" style={{ transform: 'translateZ(10px)', borderColor: '#22c55e' }} />
                          <div className="glowing-core" style={{ left: '9px', top: '9px' }} />
                        </div>
                      </div>
                    </div>
                    {loadingSummary ? (
                      <Skeleton className="h-8 w-32 mt-1" />
                    ) : (
                      <div className={`text-2xl font-bold mt-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{CurrencyCode(summaryData.profitSummary.profit, currencyCode)}</div>
                    )}
                    <div className="flex justify-between items-center mt-3">
                      {loadingSummary ? (
                        <>
                          <Skeleton className="h-6 w-16 rounded-md" />
                          <Skeleton className="h-6 w-16 rounded-md" />
                        </>
                      ) : (
                        <>
                          <span className={`text-[11px] font-bold px-2 py-1 rounded-md ${isDark ? 'text-orange-300 bg-orange-900/30' : 'text-orange-700 bg-orange-100/70'}`}>{t("Margin")}: {Number(summaryData.profitSummary.margin).toFixed(0)}%</span>
                          <span className={`text-[11px] font-bold px-2 py-1 rounded-md ${isDark ? 'text-green-400 bg-green-900/30' : 'text-green-700 bg-green-100/70'}`}>ROAS: {Number(summaryData.profitSummary.roas).toFixed(2)}x</span>
                        </>
                      )}
                    </div>
                  </div>
                </AppTooltip>

                {/* Ad Spend */}
                <AppTooltip text={chartFocus === 'spend' ? 'Ad Spend trend active' : 'Click to focus chart on Ad Spend trend'} side="top" style={{ display: 'flex', width: '100%' }}>
                  <div
                    onClick={() => setChartFocus("spend")}
                    className={`p-5 rounded-xl border shadow-sm flex flex-col gap-1 relative overflow-hidden profit-kpi-card card-spend w-full ${chartFocus === 'spend' ? 'card-active' : ''} ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}
                  >
                    <div className="kpi-liquid-orb" />
                    <div className="flex items-center justify-between w-full z-10">
                      <h3 className={`text-sm font-bold flex items-center cursor-pointer ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                        {t("Ad Spend")}
                      </h3>
                      <div className="iso-3d-scene">
                        <div className="iso-3d-group" style={{ width: '24px', height: '24px' }}>
                          <div className="ring-3d">
                            <div className="ring-3d-inner" />
                          </div>
                          <div className="glowing-core" style={{ background: '#eab308', filter: 'blur(2.5px) drop-shadow(0 0 5px #eab308)', left: '9px', top: '9px', transform: 'translateZ(6px)' }} />
                        </div>
                      </div>
                    </div>
                    {loadingSummary ? (
                      <Skeleton className="h-8 w-32 mt-1" />
                    ) : (
                      <div className={`text-2xl font-bold mt-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{CurrencyCode(summaryData.adSpend.spend, currencyCode)}</div>
                    )}
                    <div className="flex justify-end items-center mt-3">
                      {loadingSummary ? (
                        <Skeleton className="h-6 w-20 rounded-md" />
                      ) : (
                        <span className={`text-[11px] font-bold px-2 py-1 rounded-md ${isDark ? 'text-purple-300 bg-purple-900/30' : 'text-purple-700 bg-purple-100/70'}`}>TACOS: {Number(summaryData.adSpend.tacos).toFixed(0)}%</span>
                      )}
                    </div>
                  </div>
                </AppTooltip>

                {/* Profit / Loss Split */}
                <div className="grid grid-cols-2 gap-4">
                  <div className={`rounded-xl p-4 flex flex-col justify-between ${isDark ? 'bg-green-900/20 border border-green-800/40' : 'bg-[#e6f8ea]'}`}>
                    <div>
                      <h4 className={`text-sm font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{t("Profit")}</h4>
                      {loadingSummary ? (
                        <Skeleton className="h-4 w-12 mt-1" />
                      ) : (
                        <span className={`text-[11px] font-bold flex items-center gap-1 mt-1 ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                          {summaryData?.profitSummary?.profit > 0 ? `${Number(summaryData.profitSummary.margin).toFixed(2)}%` : "0%"}
                        </span>
                      )}
                    </div>
                    {loadingSummary ? (
                      <Skeleton className="h-4 w-20 mt-2" />
                    ) : (
                      <span className={`text-xs font-bold mt-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>INR {new Intl.NumberFormat('en-IN').format(summaryData?.profitSummary?.profit > 0 ? summaryData.profitSummary.profit : 0)}</span>
                    )}
                  </div>
                  <div className={`rounded-xl p-4 flex flex-col justify-between ${isDark ? 'bg-red-900/30 border border-red-800/50' : 'bg-[#fceae9]'}`}>
                    <div>
                      <h4 className={`text-sm font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{t("Loss")}</h4>
                      {loadingMonthly ? (
                        <Skeleton className="h-4 w-12 mt-1" />
                      ) : (
                        <span className={`text-[11px] font-bold flex items-center gap-1 mt-1 ${isDark ? 'text-red-400' : 'text-red-500'}`}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                          {summaryData?.profitSummary?.profit < 0 ? `${Math.abs(Number(summaryData.profitSummary.margin)).toFixed(2)}%` : "0%"}
                        </span>
                      )}
                    </div>
                    {loadingMonthly ? (
                      <Skeleton className="h-4 w-20 mt-2" />
                    ) : (
                      <span className={`text-xs font-bold mt-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>INR {new Intl.NumberFormat('en-IN').format(summaryData?.profitSummary?.profit < 0 ? Math.abs(summaryData.profitSummary.profit) : 0)}</span>
                    )}
                  </div>
                </div>

              </div>

              {/* Column 3: Sales Trend Chart */}
              <div id="profit-chart" className={`col-span-1 lg:col-span-2 xl:col-span-5 p-5 rounded-xl border shadow-sm flex flex-col h-full ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                <h3 className={`text-sm font-bold mb-4 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                  {chartFocus === "sales" ? t("Sales Trend Breakdown") : chartFocus === "profit" ? t("Profit & Cost Performance Trend") : t("Ad Spend vs TACOS Trend")}
                </h3>
                <div className="flex-1 w-full min-h-[250px]">
                  {loadingMonthly ? (
                    <Skeleton className="w-full h-[250px] rounded-lg" />
                  ) : chartData.length > 0 ? (
                    <Chart options={chartOptions} series={chartSeries} type="bar" height="100%" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">{t("No data available")}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Tab View */}
            <div className={`rounded-xl border shadow-sm flex flex-col ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
              <div className="flex justify-between items-center w-full pr-5">
                {/* 2026 Fluid Elastic Sliding Capsule Tabs */}
                <div
                  id="profit-tabs"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    alignSelf: "flex-start",
                    position: "relative",
                    background: isDark ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9",
                    padding: "4px",
                    borderRadius: "30px",
                    margin: "20px 20px 20px 20px",
                    border: isDark ? "1px solid var(--glass-border-color)" : "1px solid rgba(226, 232, 240, 0.8)",
                    userSelect: "none",
                  }}
                >
                  {/* Sliding Highlight Pill */}
                  <div
                    style={{
                      position: "absolute",
                      top: "4px",
                      bottom: "4px",
                      left: "4px",
                      width: "180px",
                      background: "linear-gradient(135deg, #1A9FD4 0%, #2374F2 100%)",
                      borderRadius: "26px",
                      transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                      transform: `translateX(${activeTab === "monthly" ? 0 : 180}px)`,
                      boxShadow: "0 4px 12px rgba(2, 70, 139, 0.25)",
                      zIndex: 1,
                    }}
                  />

                  {[
                    { key: "monthly", label: "Profit/Loss - Monthly", icon: "fa-calendar-alt" },
                    { key: "products", label: "Product Analysis", icon: "fa-cube" }
                  ].map(tab => {
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                          width: "180px",
                          height: "38px",
                          fontSize: "13.5px",
                          fontWeight: isActive ? "600" : "500",
                          border: "none",
                          background: "transparent",
                          color: isActive ? "#ffffff" : (isDark ? "rgba(255, 255, 255, 0.6)" : "#64748b"),
                          transition: "color 0.25s ease",
                          cursor: "pointer",
                          outline: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          position: "relative",
                          zIndex: 2,
                          fontFamily: "Inter, sans-serif"
                        }}
                      >
                        <i className={`fa ${tab.icon}`} style={{ fontSize: "12px", opacity: isActive ? 1 : 0.7 }} />
                        {t(tab.label)}
                      </button>
                    );
                  })}
                </div>

                <ShadcnButton
                  variant="outline"
                  onClick={handleExport}
                  disabled={isExporting}
                  className="m-0 h-9 bg-white dark:bg-[#1e293b] whitespace-nowrap"
                >
                  {isExporting ? t("Exporting...") : t("Export")}
                </ShadcnButton>
              </div>

              <div className="p-5 pt-0" id="profit-main-grid">
                {activeTab === 'monthly' && (
                  <ProfitLossMonthlyGrid ref={monthlyGridRef} rowData={monthlyGridData} loading={loadingMonthly} isDark={isDark} />
                )}
                {activeTab === 'products' && (
                  <ProductAnalysisGrid ref={productGridRef} rowData={productGridData}
                    loading={loadingProducts}
                    totalRecords={totalProductRecords}
                    currentPage={productPage}
                    perPage={productPerPage}
                    onPageChange={(newPage) => setProductPage(newPage)}
                    onPerPageChange={(newPerPage) => {
                      setProductPerPage(newPerPage);
                      setProductPage(1); // Reset to page 1 when changing items per page
                    }}
                    onSortChanged={(e) => {
                      const sortModel = e.api.getColumnState().find(s => s.sort != null);
                      if (sortModel) {
                        setProductSortBy(sortModel.colId);
                        setProductSortDir(sortModel.sort);
                      } else {
                        setProductSortBy(null);
                        setProductSortDir(null);
                      }
                      setProductPage(1);
                    }}
                  />
                )}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default ProfitAnalysis;