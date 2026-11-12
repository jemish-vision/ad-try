// Competitor Comparison — read-only.
//  • "Sellers on this ASIN"  (Case A): our offer vs other sellers / Buy Box  → GET /api/products/:asin/compare
//  • "Rival Brands"          (Case B): our product vs rival brand ASINs      → POST /api/products/competitors/list
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { FiSearch } from "react-icons/fi";
import { MdOutlineClose } from "react-icons/md";

import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import SpAccountNotConnected from "../../../common/components/SpAccountNotConnected";
import useSpConnection from "../../../helper/hooks/useSpConnection";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { getCurrencySymbol } from "../../../helper/currencyCode/CurrencyCode";
import { ApiGetCompetitorsLists, ApiGetProductComparison, ApiGetSPProduct } from "../../../api-wrapper/productList/ApiProductList";
import "./CompetitorComparison.css";

// Project palette (matches FBA Planning / Returns)
const P = {
  primary: "#1A9FD4",
  primaryDeep: "#2374F2",
  neutral100: "#F1F5F9",
  neutral200: "#E2E8F0",
  neutral400: "#94A3B8",
  neutral600: "#475569",
  neutral800: "#1E293B",
  danger: "#E74C3C",
  warning: "#F59E0B",
  success: "#16A34A",
};

const ASIN_REGEX = /^[A-Z0-9]{10}$/;
const DEFAULT_RIVAL_PAGE_SIZE = 10;
const GRID_DEFAULT_COL_DEF = { cellStyle: { display: "flex", alignItems: "center" } };
const GRID_AUTO_SIZE = { type: "fitGridWidth" };
const fitColumns = (p) => p?.api?.sizeColumnsToFit?.();
const isNum = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));

function useIsDark() {
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(document.documentElement.getAttribute("data-theme") === "dark"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

/* ── Small themed building blocks ───────────────────────────────────────── */

const toneColor = { good: P.success, bad: P.danger, warn: P.warning, info: P.primary, neutral: P.neutral400 };

function Badge({ tone = "neutral", icon, children, isDark }) {
  const c = toneColor[tone];
  return (
    <span
      className="badge inline-flex items-center gap-1 whitespace-nowrap"
      style={{
        fontSize: 11,
        fontWeight: 600,
        lineHeight: "16px",
        height: "fit-content",
        padding: "3px 8px",
        borderRadius: 6,
        color: tone === "neutral" ? (isDark ? "var(--text-secondary)" : P.neutral600) : c,
        background: tone === "neutral" ? (isDark ? "rgba(255,255,255,0.06)" : P.neutral100) : `${c}1A`,
        border: `1px solid ${tone === "neutral" ? (isDark ? "var(--glass-border-color)" : P.neutral200) : `${c}40`}`,
      }}
    >
      {icon && <i className={`fa-solid ${icon}`} style={{ fontSize: 10 }} />}
      {children}
    </span>
  );
}

function SummaryTile({ title, value, sub, icon, accent, isDark }) {
  return (
    <div
      style={{
        background: isDark ? "var(--glass-bg)" : "rgba(255, 255, 255, 0.65)",
        backdropFilter: "blur(20px) saturate(130%)",
        WebkitBackdropFilter: "blur(20px) saturate(130%)",
        border: isDark ? "1px solid var(--glass-border-color)" : "1px solid rgba(2, 70, 139, 0.12)",
        borderRadius: 16,
        padding: "16px 18px",
        minHeight: 104,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? "var(--text-secondary)" : P.neutral600 }}>{title}</span>
        <span
          className="flex items-center justify-center shrink-0"
          style={{ width: 32, height: 32, borderRadius: 10, background: `${accent}1A`, color: accent }}
        >
          <i className={`fa-solid ${icon}`} style={{ fontSize: 14 }} />
        </span>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: isDark ? "var(--text-primary)" : P.neutral800, lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, marginTop: 2, color: isDark ? "var(--text-secondary)" : P.neutral400 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Section({ title, count, right, children, isDark, isMobile, id }) {
  return (
    <div id={id} className="glass-grid-container overflow-hidden mt-4">
      <div
        className="data_model_btn camapgin_btn flex flex-col md:flex-row md:items-center justify-between gap-3"
        style={{ padding: isMobile ? "10px 16px" : "12px 24px", width: "100%" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h6 className="m-0 font-bold truncate" style={{ color: isDark ? "var(--text-primary)" : P.neutral800, fontSize: 15 }}>
            {title}
          </h6>
          {count !== undefined && count !== null && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">{count}</span>
          )}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function ProductThumb({ src, size = 54, isDark }) {
  return (
    <div
      className="rounded border flex items-center justify-center overflow-hidden shrink-0"
      style={{ width: size, minWidth: size, height: size, background: "#fff", borderColor: isDark ? "var(--glass-border-color)" : "#dee2e6" }}
    >
      {src ? (
        <img src={src} alt="" style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }} />
      ) : (
        <i className="fa-regular fa-image text-gray-500" style={{ fontSize: size > 60 ? 28 : 20 }} />
      )}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function CompetitorComparison() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isDark = useIsDark();
  const isMobile = useIsMobile();
  const { profileId, currencyCode } = useContext(ProfileContext);
  const { isConnected: isSpConnected, isLoaded: isSpLoaded } = useSpConnection();
  const pId = profileId?.value ?? profileId;

  const textPrimary = isDark ? "var(--text-primary)" : P.neutral800;
  const textSecondary = isDark ? "var(--text-secondary)" : P.neutral600;
  const textMuted = isDark ? "var(--text-secondary)" : P.neutral400;

  const initialAsin = (new URLSearchParams(location.search).get("asin") || "").toUpperCase();
  const [asinInput, setAsinInput] = useState(initialAsin);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("sellers");

  // Rival brands (Case B)
  const [rivals, setRivals] = useState({ lists: [], totalRecords: 0 });
  const [rivalsLoading, setRivalsLoading] = useState(false);
  const [rivalPage, setRivalPage] = useState(1);
  const [rivalPerPage, setRivalPerPage] = useState(DEFAULT_RIVAL_PAGE_SIZE);
  const [rivalSort, setRivalSort] = useState("price_asc");
  const [selectedRival, setSelectedRival] = useState(null);

  // Our-product suggestions for the search box
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimer = useRef(null);
  const boxRef = useRef(null);

  const currency = getCurrencySymbol(data?.currency || currencyCode);
  const fmt = (v) => (isNum(v) ? `${currency}${Number(v).toFixed(2)}` : "—");

  /* ── Data loading ── */

  const runCompare = useCallback(
    async (asin, refresh = false) => {
      const clean = String(asin || "").trim().toUpperCase();
      if (!ASIN_REGEX.test(clean)) {
        setError(t("Enter a valid 10-character ASIN"));
        return;
      }
      if (!pId) return;
      setLoading(true);
      setError(null);
      setShowSuggestions(false);
      const res = await ApiGetProductComparison({ asin: clean, profileId: pId, refresh });
      setLoading(false);
      if (res?.isSuccess) {
        setData(res.data);
        setSelectedRival(null);
        setRivalPage(1);
        // Single-seller ASINs have nothing to compare in Case A → open Rival Brands straight away.
        setActiveTab(res.data?.comparison?.competitorCount > 0 ? "sellers" : "rivals");
        if (new URLSearchParams(location.search).get("asin") !== clean) navigate({ search: `?asin=${clean}` }, { replace: true });
      } else {
        setData(null);
        setError(res?.message || t("Unable to load comparison"));
      }
    },
    [pId, t, navigate, location.search]
  );

  const loadRivals = useCallback(async () => {
    if (!data?.asin || !pId) return;
    const [fieldName, dir] = rivalSort === "bsr" ? ["classificationRanks", 1] : ["price", rivalSort === "price_desc" ? -1 : 1];
    setRivalsLoading(true);
    const res = await ApiGetCompetitorsLists({ profileId: pId, asin: data.asin, page: rivalPage, limit: rivalPerPage, fieldName, sortOrder: dir });
    setRivalsLoading(false);
    if (res?.isSuccess) {
      const lists = (res.data?.lists || []).map((x) => {
        const a = x.amazonData || {};
        return {
          asin: x.asin,
          name: a.name || x.asin,
          brand: a.brand || x.brand || "—",
          imageUrl: a.imageUrl || "",
          price: isNum(a.price?.amount) ? Number(a.price.amount) : isNum(x.price) ? Number(x.price) : null,
          size: a.size || null,
          unitValue: isNum(a.unitValue) ? Number(a.unitValue) : null,
          unitType: a.unitType || null,
          bsrCategory: a.salesRankCategory ?? (isNum(x.classificationRanks) ? Number(x.classificationRanks) : null),
          bsrCategoryName: a.salesRankCategoryName || x.classification || null,
          bsrOverall: a.salesRankOverall ?? null,
        };
      });
      setRivals({ lists, totalRecords: res.data?.totalRecords || 0 });
    } else {
      setRivals({ lists: [], totalRecords: 0 });
    }
  }, [data?.asin, pId, rivalPage, rivalPerPage, rivalSort]);

  useEffect(() => {
    loadRivals();
  }, [loadRivals]);

  // Auto-load when opened with ?asin= (e.g. from Product List) or when the profile changes.
  useEffect(() => {
    if (initialAsin && pId) runCompare(initialAsin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pId]);

  useEffect(() => {
    const onClick = (e) => boxRef.current && !boxRef.current.contains(e.target) && setShowSuggestions(false);
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const onAsinChange = (value) => {
    setAsinInput(value);
    clearTimeout(searchTimer.current);
    if (!value || value.trim().length < 2 || !pId) {
      setSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const res = await ApiGetSPProduct({ pageNo: 1, perPage: 8, profileId: pId, searchName: value.trim() });
      if (res?.isSuccess) {
        setSuggestions(res.products || []);
        setShowSuggestions(true);
      }
    }, 350);
  };

  /* ── Derived values ── */

  const ours = data?.ourOffer;
  const rival = data?.primaryRival;
  const cmp = data?.comparison;
  const delta = cmp?.vsPrimaryRival;
  const summary = data?.summary;
  const ourPrice = ours?.landedPrice ?? ours?.listingPrice ?? null;
  const lowestRivalBrandPrice = useMemo(() => {
    const prices = rivals.lists.map((r) => r.price).filter(isNum);
    return prices.length ? Math.min(...prices) : null;
  }, [rivals.lists]);

  // delta = ours - theirs; positive → we're more expensive (red)
  const priceDelta = (d) => {
    if (!isNum(d)) return <span style={{ color: textMuted }}>—</span>;
    if (Number(d) === 0) return <Badge isDark={isDark}>{t("Same")}</Badge>;
    const abs = `${currency}${Math.abs(d).toFixed(2)}`;
    return d > 0 ? (
      <Badge tone="bad" icon="fa-arrow-up" isDark={isDark}>{t("{{amount}} higher", { amount: abs })}</Badge>
    ) : (
      <Badge tone="good" icon="fa-arrow-down" isDark={isDark}>{t("{{amount}} lower", { amount: abs })}</Badge>
    );
  };

  const boolAdvantage = (ourVal, theirVal, label) => {
    if (ourVal === null || ourVal === undefined || theirVal === null || theirVal === undefined || ourVal === theirVal) return <Badge isDark={isDark}>{t("Even")}</Badge>;
    return ourVal ? <Badge tone="good" isDark={isDark}>{t("Our {{feature}} advantage", { feature: label })}</Badge> : <Badge tone="bad" isDark={isDark}>{t("Rival {{feature}} advantage", { feature: label })}</Badge>;
  };

  const yesNo = (v) => (v === null || v === undefined ? <span style={{ color: textMuted }}>—</span> : v ? t("Yes") : <span style={{ color: textMuted }}>{t("No")}</span>);

  const rating = (o) =>
    isNum(o?.feedbackPercent) ? (
      <span>
        <b>{o.feedbackPercent}%</b> <span style={{ color: textMuted }}>({t("{{num}} ratings", { num: Number(o.feedbackCount || 0).toLocaleString() })})</span>
      </span>
    ) : (
      <span style={{ color: textMuted }}>—</span>
    );

  const sellerLabel = (o) => (o ? (o.isOurs ? t("You") : o.sellerId || t("Unknown seller")) : "—");

  const pricePerUnit = (price, unitValue, unitType) => (isNum(price) && isNum(unitValue) && Number(unitValue) > 0 ? `${currency}${(price / unitValue).toFixed(2)}/${unitType || t("unit")}` : null);

  /* ── Case A: matrix rows ── */

  const sellerRows = [
    { key: "listing", label: t("Listing Price"), ours: fmt(ours?.listingPrice), rival: fmt(rival?.listingPrice), delta: priceDelta(delta?.listingPrice) },
    {
      key: "shipping",
      label: t("Shipping Cost"),
      ours: ours?.shipping === 0 ? t("Free") : fmt(ours?.shipping),
      rival: rival?.shipping === 0 ? t("Free") : fmt(rival?.shipping),
      delta: priceDelta(delta?.shipping),
    },
    { key: "landed", label: t("Landed Price (Total)"), ours: <b>{fmt(ours?.landedPrice)}</b>, rival: <b>{fmt(rival?.landedPrice)}</b>, delta: priceDelta(delta?.landedPrice), emphasis: true },
    {
      key: "bb",
      label: t("Buy Box Winner"),
      ours: yesNo(ours?.isBuyBoxWinner),
      rival: rival ? (rival.isBuyBoxWinner ? `${t("Yes")} (${sellerLabel(rival)})` : yesNo(false)) : "—",
      delta: cmp?.weHaveBuyBox ? (
        <Badge tone="good" icon="fa-crown" isDark={isDark}>{t("We own the Buy Box")}</Badge>
      ) : rival?.isBuyBoxWinner ? (
        <Badge tone="bad" icon="fa-crown" isDark={isDark}>{t("Rival owns the Buy Box")}</Badge>
      ) : (
        <Badge isDark={isDark}>{t("Not held by either")}</Badge>
      ),
    },
    {
      key: "fulfillment",
      label: t("Fulfillment"),
      ours: ours?.fulfillment || "—",
      rival: rival?.fulfillment || "—",
      delta: boolAdvantage(ours?.fulfillment ? ours.fulfillment === "FBA" : null, rival?.fulfillment ? rival.fulfillment === "FBA" : null, "FBA"),
    },
    { key: "prime", label: t("Prime Eligible"), ours: yesNo(ours?.isPrime), rival: yesNo(rival?.isPrime), delta: boolAdvantage(ours?.isPrime, rival?.isPrime, "Prime") },
    {
      key: "rating",
      label: t("Seller Rating"),
      ours: rating(ours),
      rival: rating(rival),
      delta:
        isNum(ours?.feedbackPercent) && isNum(rival?.feedbackPercent) && ours.feedbackPercent !== rival.feedbackPercent ? (
          ours.feedbackPercent > rival.feedbackPercent ? (
            <Badge tone="good" isDark={isDark}>{t("+{{value}}% better", { value: ours.feedbackPercent - rival.feedbackPercent })}</Badge>
          ) : (
            <Badge tone="bad" isDark={isDark}>{t("{{value}}% lower", { value: Math.abs(ours.feedbackPercent - rival.feedbackPercent) })}</Badge>
          )
        ) : (
          <Badge isDark={isDark}>{t("Even")}</Badge>
        ),
    },
  ];

  /* ── Case B: side-by-side rows ── */

  const sr = selectedRival || rivals.lists.find((r) => isNum(r.price)) || null;
  const ourBsr = data?.product?.salesRank;
  const sameCategory = sr && ourBsr?.category && sr.bsrCategoryName && ourBsr.category === sr.bsrCategoryName;
  const ourPpu = data?.product ? pricePerUnit(ourPrice, data.product.unitValue, data.product.unitType) : null;
  const rivalPpu = sr ? pricePerUnit(sr.price, sr.unitValue, sr.unitType) : null;

  const bsrDelta = () => {
    if (!sr || !isNum(ourBsr?.rank) || !isNum(sr.bsrCategory)) return <span style={{ color: textMuted }}>—</span>;
    if (!sameCategory) return <Badge isDark={isDark}>{t("Different category")}</Badge>;
    const d = Number(ourBsr.rank) - Number(sr.bsrCategory);
    if (d === 0) return <Badge isDark={isDark}>{t("Same")}</Badge>;
    return d < 0 ? (
      <Badge tone="good" icon="fa-arrow-up" isDark={isDark}>{t("{{ranks}} ranks ahead", { ranks: Math.abs(d).toLocaleString() })}</Badge>
    ) : (
      <Badge tone="bad" icon="fa-arrow-down" isDark={isDark}>{t("{{ranks}} ranks behind", { ranks: d.toLocaleString() })}</Badge>
    );
  };

  const ppuDelta = () => {
    if (!ourPpu || !rivalPpu || data?.product?.unitType !== sr?.unitType) return <span style={{ color: textMuted }}>—</span>;
    return priceDelta(Math.round((ourPrice / data.product.unitValue - sr.price / sr.unitValue) * 100) / 100);
  };

  const rivalRows = sr
    ? [
      { key: "brand", label: t("Brand"), ours: data?.product?.brand || "—", rival: sr.brand, delta: null },
      { key: "price", label: t("Price"), ours: <b>{fmt(ourPrice)}</b>, rival: <b>{fmt(sr.price)}</b>, delta: priceDelta(isNum(ourPrice) && isNum(sr.price) ? Math.round((ourPrice - sr.price) * 100) / 100 : null), emphasis: true },
      { key: "ppu", label: t("Price per Unit"), ours: ourPpu || "—", rival: rivalPpu || "—", delta: ppuDelta() },
      {
        key: "bsr",
        label: t("Best Seller Rank"),
        ours: isNum(ourBsr?.rank) ? `#${Number(ourBsr.rank).toLocaleString()}` : "—",
        rival: isNum(sr.bsrCategory) ? `#${Number(sr.bsrCategory).toLocaleString()}` : "—",
        delta: bsrDelta(),
      },
      { key: "cat", label: t("Category"), ours: ourBsr?.category || "—", rival: sr.bsrCategoryName || "—", delta: null },
      { key: "size", label: t("Size"), ours: data?.product?.size || "—", rival: sr.size || "—", delta: null },
      {
        key: "pack",
        label: t("Pack / Unit Count"),
        ours: isNum(data?.product?.unitValue) ? `${data.product.unitValue} ${data.product.unitType || ""}` : "—",
        rival: isNum(sr.unitValue) ? `${sr.unitValue} ${sr.unitType || ""}` : "—",
        delta: null,
      },
    ]
    : [];

  /* ── Grids ── */

  const allOffers = useMemo(
    () => (data ? [...(ours && ours.source === "offers" ? [ours] : []), ...data.competitors].sort((a, b) => (a.landedPrice ?? Infinity) - (b.landedPrice ?? Infinity)) : []),
    [data, ours]
  );

  // Stable grid callbacks — a new function/object identity on every render makes AgTable
  // re-apply column defaults, which resets the fitted column widths ("grid shrinks" on click).
  const highlightBg = isDark ? "rgba(26,159,212,0.08)" : "rgba(26,159,212,0.06)";
  const offerRowStyle = useCallback((p) => (p.data?.isOurs ? { background: highlightBg } : undefined), [highlightBg]);
  const selectedRivalAsin = sr?.asin;
  const rivalRowStyle = useCallback((p) => (selectedRivalAsin && p.data?.asin === selectedRivalAsin ? { background: highlightBg } : undefined), [selectedRivalAsin, highlightBg]);
  const onRivalRowClicked = useCallback((p) => p.data && setSelectedRival(p.data), []);

  const cell = (children, align = "left") => <div className={`flex items-center h-full ${align === "right" ? "justify-end" : ""}`}>{children}</div>;

  const offerColumns = useMemo(
    () => [
      {
        headerName: t("Seller"),
        field: "sellerId",
        width: 240,
        minWidth: 200,
        cellRenderer: ({ data: o }) =>
          o &&
          cell(
            <div className="flex items-center gap-2">
              <span style={{ fontWeight: o.isOurs ? 800 : 600, color: o.isOurs ? P.primary : textPrimary }}>{sellerLabel(o)}</span>
              {o.isBuyBoxWinner && <Badge tone={o.isOurs ? "good" : "bad"} icon="fa-crown" isDark={isDark}>{t("Buy Box")}</Badge>}
            </div>
          ),
      },
      { headerName: t("Price"), field: "listingPrice", width: 120, cellRenderer: ({ data: o }) => o && cell(fmt(o.listingPrice)) },
      { headerName: t("Shipping"), field: "shipping", width: 120, cellRenderer: ({ data: o }) => o && cell(o.shipping === 0 ? t("Free") : fmt(o.shipping)) },
      { headerName: t("Landed"), field: "landedPrice", width: 130, cellRenderer: ({ data: o }) => o && cell(<b>{fmt(o.landedPrice)}</b>) },
      {
        headerName: t("vs Ours"),
        field: "vs",
        width: 160,
        cellRenderer: ({ data: o }) =>
          o && cell(o.isOurs || !isNum(ours?.landedPrice) || !isNum(o.landedPrice) ? <span style={{ color: textMuted }}>—</span> : priceDelta(Math.round((ours.landedPrice - o.landedPrice) * 100) / 100)),
      },
      { headerName: t("Fulfillment"), field: "fulfillment", width: 120, cellRenderer: ({ data: o }) => o && cell(o.fulfillment || "—") },
      {
        headerName: t("Prime"),
        field: "isPrime",
        width: 100,
        cellRenderer: ({ data: o }) => o && cell(o.isPrime ? <Badge tone="info" isDark={isDark}>Prime</Badge> : <span style={{ color: textMuted }}>—</span>),
      },
      { headerName: t("Seller Rating"), field: "feedbackPercent", width: 200, minWidth: 170, cellRenderer: ({ data: o }) => o && cell(rating(o)) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDark, ours, currency, t]
  );

  const rivalColumns = useMemo(
    () => [
      {
        headerName: t("Product"),
        field: "name",
        width: 420,
        minWidth: 320,
        wrapText: true,
        autoHeight: true,
        cellRenderer: ({ data: r }) =>
          r && (
            <div className="flex items-center py-2 h-full gap-3">
              <ProductThumb src={r.imageUrl} isDark={isDark} />
              <div className="flex flex-col justify-center" style={{ minWidth: 0, lineHeight: 1.4 }}>
                <span className="font-bold mb-0.5" style={{ fontSize: 13, color: textPrimary, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "normal" }} title={r.name}>
                  {r.name}
                </span>
                <div className="flex flex-wrap items-center" style={{ fontSize: 11, color: textSecondary, columnGap: 16, rowGap: 2 }}>
                  <span><strong style={{ color: textMuted }}>{t("Brand")}:</strong> {r.brand}</span>
                  <span><strong style={{ color: textMuted }}>ASIN:</strong> {r.asin}</span>
                </div>
              </div>
            </div>
          ),
      },
      { headerName: t("Price"), field: "price", width: 120, cellRenderer: ({ data: r }) => r && cell(<b style={{ color: textPrimary }}>{fmt(r.price)}</b>) },
      {
        headerName: t("vs Ours"),
        field: "vs",
        width: 160,
        cellRenderer: ({ data: r }) => r && cell(isNum(ourPrice) && isNum(r.price) ? priceDelta(Math.round((ourPrice - r.price) * 100) / 100) : <span style={{ color: textMuted }}>—</span>),
      },
      { headerName: t("Price / Unit"), field: "ppu", width: 130, cellRenderer: ({ data: r }) => r && cell(pricePerUnit(r.price, r.unitValue, r.unitType) || <span style={{ color: textMuted }}>—</span>) },
      {
        headerName: t("Best Seller Rank"),
        field: "bsrCategory",
        width: 200,
        minWidth: 190,
        cellRenderer: ({ data: r }) =>
          r &&
          cell(
            <div className="flex flex-col justify-center" style={{ lineHeight: 1.35 }}>
              <span className="font-bold" style={{ color: textPrimary }}>{isNum(r.bsrCategory) ? `#${Number(r.bsrCategory).toLocaleString()}` : "—"}</span>
              {r.bsrCategoryName && <span style={{ fontSize: 11, color: textMuted }}>{r.bsrCategoryName}</span>}
            </div>
          ),
      },
      { headerName: t("Size"), field: "size", width: 120, cellRenderer: ({ data: r }) => r && cell(r.size || <span style={{ color: textMuted }}>—</span>) },
      {
        headerName: "",
        field: "action",
        width: 120,
        cellRenderer: ({ data: r }) =>
          r &&
          cell(
            <Button
              variant="outline"
              size="sm"
              className="h-[30px] text-[12px] font-semibold"
              style={{ borderColor: `${P.primary}60`, color: P.primary, background: isDark ? "rgba(255,255,255,0.04)" : `${P.primary}08` }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedRival(r);
                document.getElementById("cc-rival-compare")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {t("Compare")}
            </Button>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDark, ourPrice, currency, t]
  );

  /* ── Status banner (Case A) ── */

  const statusBanner = () => {
    if (!cmp) return null;
    const map = {
      winning: { tone: "good", icon: "fa-circle-check", text: t("You are winning the Buy Box") },
      losing: {
        tone: "bad",
        icon: "fa-circle-xmark",
        text: data?.buyBoxOffer ? t("You are losing the Buy Box to {{seller}}", { seller: sellerLabel(data.buyBoxOffer) }) : t("You don't hold the Buy Box"),
      },
      only_seller: { tone: "info", icon: "fa-circle-info", text: t("You are the only seller on this ASIN — see the Rival Brands tab for competing products") },
      no_offer: { tone: "warn", icon: "fa-triangle-exclamation", text: t("You have no active offer on this ASIN — showing competitor offers only") },
    };
    const s = map[cmp.status] || map.no_offer;
    const c = toneColor[s.tone];
    return (
      <div
        className="flex flex-wrap items-center gap-2 mt-4"
        style={{ padding: "12px 18px", borderRadius: 14, border: `1px solid ${c}40`, background: `${c}14`, color: c, fontSize: 13, fontWeight: 600 }}
      >
        <i className={`fa-solid ${s.icon}`} style={{ fontSize: 16 }} />
        <span>{s.text}</span>
        {cmp.buyBoxSuppressed && (
          <Badge tone="warn" icon="fa-ban" isDark={isDark}>
            {cmp.status === "only_seller" ? t("No Buy Box — offer not Buy Box eligible") : t("Buy Box suppressed")}
          </Badge>
        )}
        {ours?.source === "listing" && <Badge isDark={isDark}>{t("Our price taken from Product List")}</Badge>}
      </div>
    );
  };

  const MatrixTable = ({ rows, oursHeader, rivalHeader }) => (
    <div className="data_table" style={{ padding: isMobile ? "0 12px 16px" : "0 24px 24px", overflowX: "auto" }}>
      <table className="w-full" style={{ minWidth: 640, fontSize: 13, borderCollapse: "separate", borderSpacing: 0 }}>
        <thead>
          <tr>
            {[t("Metric"), oursHeader, rivalHeader, t("Delta / Highlight")].map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  color: textSecondary,
                  background: isDark ? "rgba(255,255,255,0.03)" : "#F8FAFC",
                  borderBottom: `1px solid ${isDark ? "var(--glass-border-color)" : P.neutral200}`,
                  borderTop: `1px solid ${isDark ? "var(--glass-border-color)" : P.neutral200}`,
                  width: i === 0 ? "22%" : undefined,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ background: r.emphasis ? (isDark ? "rgba(26,159,212,0.06)" : "rgba(26,159,212,0.04)") : "transparent" }}>
              {[<span style={{ fontWeight: 600, color: textSecondary }}>{r.label}</span>, r.ours, r.rival, r.delta ?? <span style={{ color: textMuted }}>—</span>].map((v, i) => (
                <td key={i} style={{ padding: "12px 14px", color: textPrimary, borderBottom: `1px solid ${isDark ? "var(--glass-border-color)" : P.neutral100}` }}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const ProductHeaderCell = ({ img, title, sub, highlight }) => (
    <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
      <ProductThumb src={img} size={44} isDark={isDark} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: highlight ? P.primary : textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>{sub}</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: textPrimary, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textTransform: "none" }} title={title}>
          {title}
        </div>
      </div>
    </div>
  );

  /* ── Tabs ── */

  const tabs = [
    { id: "sellers", label: t("Sellers on this ASIN"), count: cmp ? cmp.competitorCount + (ours?.source === "offers" ? 1 : 0) : 0, icon: "fa-store" },
    { id: "rivals", label: t("Rival Brands"), count: rivals.totalRecords, icon: "fa-people-arrows" },
  ];

  /* ── Render ── */

  return (
    <div className="competitor-comparison-container">
      <Filter nameShow={false} dateShow={false} profileShow={true} />

      <div className="middle_container">
        {/* Sticky search bar */}
        <div
          className="glass-sticky-header sticky-top cc-sticky-header flex flex-wrap items-center gap-3 w-full max-w-full box-border"
          style={{ padding: isMobile ? "10px 16px" : "10px 24px", marginTop: "-10px", marginBottom: "20px" }}
        >
          <div ref={boxRef} id="cc-search" className="relative" style={{ flex: isMobile ? "1 1 100%" : "1 1 420px", maxWidth: isMobile ? "100%" : 560 }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runCompare(asinInput);
              }}
              className="search_option m-0 flex items-center relative w-full"
              style={{ height: 40 }}
            >
              <span style={{ padding: "0 0 0 12px", color: "#94a3b8", display: "flex", alignItems: "center" }}>
                <FiSearch style={{ fontSize: 17 }} />
              </span>
              <input
                type="text"
                placeholder={t("Search your products by name, SKU or ASIN...")}
                value={asinInput}
                onChange={(e) => onAsinChange(e.target.value)}
                onFocus={() => suggestions.length && setShowSuggestions(true)}
                autoComplete="off"
                className="w-full min-w-0 h-full border-none outline-none bg-transparent shadow-none"
                style={{ paddingRight: asinInput ? 34 : 12 }}
              />
              {asinInput && (
                <MdOutlineClose
                  onClick={() => {
                    setAsinInput("");
                    setSuggestions([]);
                    setShowSuggestions(false);
                  }}
                  style={{ position: "absolute", right: 10, cursor: "pointer", color: "var(--text-secondary)", fontSize: 18, opacity: 0.7 }}
                />
              )}
            </form>
            {showSuggestions && suggestions.length > 0 && (
              <div
                className="absolute z-50 mt-1 w-full overflow-auto shadow-lg"
                style={{
                  maxHeight: 320,
                  borderRadius: 10,
                  background: isDark ? "#0f172a" : "#fff",
                  border: `1px solid ${isDark ? "var(--glass-border-color)" : P.neutral200}`,
                }}
              >
                {suggestions.map((p) => (
                  <div
                    role="button"
                    tabIndex={0}
                    key={`${p.asin}-${p.sku}`}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => {
                      setAsinInput(p.asin);
                      runCompare(p.asin);
                    }}
                  >
                    <ProductThumb src={p.imageURL} size={36} isDark={isDark} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{p.itemName}</span>
                      <span className="block" style={{ fontSize: 11, color: textMuted }}>
                        ASIN: {p.asin} · SKU: {p.sku}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2" style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
            <button
              type="button"
              id="cc-compare-btn"
              disabled={loading || !pId}
              onClick={() => runCompare(asinInput)}
              className="cc-btn-primary flex-1"
            >
              <i className="fa-solid fa-scale-balanced" style={{ fontSize: 13 }} />
              <span>{t("Compare")}</span>
            </button>
            {data && (
              <button
                type="button"
                id="cc-refresh-btn"
                disabled={loading}
                onClick={() => runCompare(data.asin, true)}
                className="glass-dropdown-btn cc-btn-secondary flex-1"
                title={t("Fetch the latest data from Amazon")}
              >
                <i className={`fa-solid fa-rotate-right ${loading ? "fa-spin" : ""}`} style={{ fontSize: 13 }} />
                <span>{t("Refresh")}</span>
              </button>
            )}
          </div>
        </div>

        {!isSpConnected && isSpLoaded ? (
          <SpAccountNotConnected feature={t("Competitor Comparison")} isDark={isDark} />
        ) : (
          <div style={{ padding: isMobile ? "0 4px" : "0 4px" }}>
            {error && !loading && (
              <div
                className="flex items-center gap-2"
                style={{ padding: "12px 18px", borderRadius: 14, border: `1px solid ${P.danger}40`, background: `${P.danger}14`, color: P.danger, fontSize: 13, fontWeight: 600 }}
              >
                <i className="fa-solid fa-triangle-exclamation" /> {error}
              </div>
            )}

            {loading && (
              <div className="space-y-4">
                <Skeleton className="h-[150px] w-full rounded-2xl" />
                <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-[104px] rounded-2xl" />
                  ))}
                </div>
                <Skeleton className="h-[320px] w-full rounded-2xl" />
              </div>
            )}

            {!loading && !data && !error && (
              <div className="glass-card flex flex-col items-center justify-center text-center" style={{ padding: "56px 24px" }}>
                <span className="flex items-center justify-center mb-3" style={{ width: 56, height: 56, borderRadius: 16, background: `${P.primary}1A`, color: P.primary }}>
                  <i className="fa-solid fa-scale-balanced" style={{ fontSize: 22 }} />
                </span>
                <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary }}>{t("Compare a product")}</div>
                <div style={{ fontSize: 13, color: textSecondary, maxWidth: 520, marginTop: 6 }}>
                  {t("Search one of your products above. You'll see the other sellers on the same ASIN (Buy Box, price, fulfillment, seller rating) and rival brand products (price, price per unit, Best Seller Rank).")}
                </div>
              </div>
            )}

            {!loading && data && (
              <>
                {/* Product hero */}
                <div id="cc-product" className="glass-card" style={{ padding: isMobile ? 16 : 20 }}>
                  <div className="flex flex-col md:flex-row gap-4">
                    <ProductThumb src={data.product?.image} size={isMobile ? 88 : 112} isDark={isDark} />
                    <div className="min-w-0 flex-1">
                      <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary, lineHeight: 1.4 }}>{data.product?.title || data.asin}</div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge isDark={isDark}>ASIN: {data.asin}</Badge>
                        {data.ourSku && <Badge isDark={isDark}>SKU: {data.ourSku}</Badge>}
                        {data.product?.brand && <Badge tone="info" isDark={isDark}>{data.product.brand}</Badge>}
                        {data.product?.salesRank && (
                          <Badge tone="info" icon="fa-ranking-star" isDark={isDark}>
                            BSR #{Number(data.product.salesRank.rank).toLocaleString()}
                            {data.product.salesRank.category ? ` · ${data.product.salesRank.category}` : ""}
                          </Badge>
                        )}
                        {ours?.fulfillment && <Badge isDark={isDark}>{ours.fulfillment}</Badge>}
                        {ours?.isPrime && <Badge tone="info" isDark={isDark}>Prime</Badge>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary tiles */}
                <div id="cc-summary" className="grid mt-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 150 : 190}px, 1fr))`, gap: isMobile ? 10 : 16 }}>
                  <SummaryTile isDark={isDark} title={t("Our Price")} value={fmt(ourPrice)} sub={ours?.source === "listing" ? t("From Product List") : t("Landed (price + shipping)")} icon="fa-tag" accent={P.primary} />
                  <SummaryTile
                    isDark={isDark}
                    title={t("Buy Box")}
                    value={fmt(summary?.buyBoxPrice?.landedPrice)}
                    sub={cmp?.weHaveBuyBox ? t("Owned by you") : data.buyBoxOffer ? t("Owned by {{seller}}", { seller: sellerLabel(data.buyBoxOffer) }) : t("No Buy Box winner")}
                    icon="fa-crown"
                    accent={cmp?.weHaveBuyBox ? P.success : data.buyBoxOffer ? P.danger : P.warning}
                  />
                  <SummaryTile isDark={isDark} title={t("Sellers on ASIN")} value={summary?.newOfferCount ?? summary?.totalOfferCount ?? "—"} sub={t("New condition offers")} icon="fa-store" accent={P.primaryDeep} />
                  <SummaryTile isDark={isDark} title={t("Rival Brands Tracked")} value={rivals.totalRecords} sub={t("Similar products found on Amazon")} icon="fa-people-arrows" accent={P.warning} />
                  <SummaryTile
                    isDark={isDark}
                    title={t("Cheapest Rival Brand")}
                    value={fmt(lowestRivalBrandPrice)}
                    sub={isNum(ourPrice) && isNum(lowestRivalBrandPrice) ? (ourPrice > lowestRivalBrandPrice ? t("You are {{amount}} higher", { amount: fmt(ourPrice - lowestRivalBrandPrice) }) : t("You are the cheaper option")) : t("On this page of results")}
                    icon="fa-arrow-trend-down"
                    accent={isNum(ourPrice) && isNum(lowestRivalBrandPrice) && ourPrice > lowestRivalBrandPrice ? P.danger : P.success}
                  />
                </div>

                {/* Tabs */}
                <div
                  id="cc-tabs"
                  className="inline-flex mt-5 p-1 gap-1 flex-wrap"
                  style={{ borderRadius: 12, background: isDark ? "rgba(255,255,255,0.04)" : P.neutral100, border: `1px solid ${isDark ? "var(--glass-border-color)" : P.neutral200}` }}
                >
                  {tabs.map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        id={`cc-tab-${tab.id}`}
                        onClick={() => setActiveTab(tab.id)}
                        className="flex items-center gap-2 transition-all duration-200"
                        style={{
                          padding: "8px 16px",
                          borderRadius: 9,
                          fontSize: 13,
                          fontWeight: 600,
                          color: active ? "#fff" : textSecondary,
                          background: active ? `linear-gradient(135deg, ${P.primary}, ${P.primaryDeep})` : "transparent",
                          boxShadow: active ? "0 4px 12px rgba(35,116,242,0.25)" : "none",
                        }}
                      >
                        <i className={`fa-solid ${tab.icon}`} style={{ fontSize: 12 }} />
                        {tab.label}
                        <span
                          className="rounded-full px-2"
                          style={{ fontSize: 11, background: active ? "rgba(255,255,255,0.22)" : isDark ? "rgba(255,255,255,0.08)" : "#fff", color: active ? "#fff" : textSecondary }}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* ── Tab: Sellers on this ASIN ── */}
                {activeTab === "sellers" && (
                  <>
                    {statusBanner()}

                    {rival && (
                      <Section
                        id="cc-seller-matrix"
                        isDark={isDark}
                        isMobile={isMobile}
                        title={rival.isBuyBoxWinner ? t("Our offer vs Buy Box winner") : t("Our offer vs lowest-priced seller")}
                        right={<span style={{ fontSize: 12, color: textMuted }}>{t("Delta = our price − theirs · red = we're more expensive")}</span>}
                      >
                        <MatrixTable rows={sellerRows} oursHeader={t("Our Offer")} rivalHeader={`${t("Competitor")} (${sellerLabel(rival)})`} />
                      </Section>
                    )}

                    <Section id="cc-offers" isDark={isDark} isMobile={isMobile} title={t("All Offers")} count={t("{{num}} Sellers", { num: allOffers.length })}>
                      <div className="data_table position-relative" style={{ padding: isMobile ? "0 12px 16px" : "0 24px 24px" }}>
                        <AgTable
                          tableId=""
                          rowData={allOffers}
                          columnDefs={offerColumns}
                          totalRecords={allOffers.length}
                          perPage={25}
                          currentPage={1}
                          showPagination={false}
                          enableCustomizeColumns={false}
                          rowHeight={52}
                          height={`${Math.min(Math.max(allOffers.length, 1) * 52 + 60, 640)}px`}
                          minHeight="140px"
                          autoSizeStrategy={GRID_AUTO_SIZE}
                          onGridSizeChanged={fitColumns}
                          onFirstDataRendered={fitColumns}
                          onNewColumnsLoaded={fitColumns}
                          defaultColDef={GRID_DEFAULT_COL_DEF}
                          getRowStyle={offerRowStyle}
                        />
                        <div style={{ fontSize: 11.5, color: textMuted, marginTop: 10 }}>
                          {t("Amazon returns up to 20 lowest-priced New offers per ASIN. Sellers are shown by seller ID.")}
                        </div>
                      </div>
                    </Section>
                  </>
                )}

                {/* ── Tab: Rival Brands ── */}
                {activeTab === "rivals" && (
                  <>
                    {sr ? (
                      <Section
                        id="cc-rival-compare"
                        isDark={isDark}
                        isMobile={isMobile}
                        title={t("Our product vs rival brand")}
                        right={<span style={{ fontSize: 12, color: textMuted }}>{t("Click Compare on any row below to switch rival")}</span>}
                      >
                        <MatrixTable
                          rows={rivalRows}
                          oursHeader={<ProductHeaderCell img={data.product?.image} title={data.product?.title || data.asin} sub={t("Our Product")} highlight />}
                          rivalHeader={<ProductHeaderCell img={sr.imageUrl} title={sr.name} sub={`${t("Rival")} · ${sr.asin}`} />}
                        />
                      </Section>
                    ) : null}

                    <Section
                      id="cc-rivals"
                      isDark={isDark}
                      isMobile={isMobile}
                      title={t("Rival Brand Products")}
                      count={t("{{num}} Products", { num: rivals.totalRecords })}
                      right={
                        <div style={{ minWidth: 200 }}>
                          <Select
                            value={rivalSort}
                            onValueChange={(v) => {
                              setRivalSort(v);
                              setRivalPage(1);
                            }}
                          >
                            <SelectTrigger className="h-[38px] text-[13px] font-medium bg-white dark:bg-transparent border-slate-300 dark:border-slate-700 rounded-md shadow-sm w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="price_asc">{t("Price: Low to High")}</SelectItem>
                              <SelectItem value="price_desc">{t("Price: High to Low")}</SelectItem>
                              <SelectItem value="bsr">{t("Best Seller Rank")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      }
                    >
                      <div className="data_table position-relative" style={{ padding: isMobile ? "0 12px 16px" : "0 24px 24px" }}>
                        {!rivalsLoading && rivals.totalRecords === 0 ? (
                          <div className="flex flex-col items-center justify-center text-center" style={{ padding: "40px 16px" }}>
                            <i className="fa-solid fa-magnifying-glass-chart mb-3" style={{ fontSize: 26, color: P.primary }} />
                            <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>{t("No rival brands collected for this product yet")}</div>
                            <div style={{ fontSize: 12.5, color: textSecondary, maxWidth: 520, marginTop: 4 }}>
                              {t("Rival products are discovered by the scheduled competitor sync (Cron Job “Fetch Competitors From Amazon”). Once it has run for this profile, similar products will appear here.")}
                            </div>
                          </div>
                        ) : (
                          <AgTable
                            tableId=""
                            rowData={rivals.lists}
                            columnDefs={rivalColumns}
                            totalRecords={rivals.totalRecords}
                            perPage={rivalPerPage}
                            currentPage={rivalPage}
                            onPageChange={(p) => setRivalPage(p)}
                            onPerPageChange={(pp) => {
                              setRivalPerPage(Number(pp));
                              setRivalPage(1);
                            }}
                            enableCustomizeColumns={false}
                            loading={rivalsLoading}
                            rowHeight={75}
                            height={`${Math.min(Math.max(rivals.lists.length, 3) * 75 + 60, 820)}px`}
                            defaultColDef={GRID_DEFAULT_COL_DEF}
                            autoSizeStrategy={GRID_AUTO_SIZE}
                            onGridSizeChanged={fitColumns}
                            onFirstDataRendered={fitColumns}
                            onNewColumnsLoaded={fitColumns}
                            onRowClicked={onRivalRowClicked}
                            getRowStyle={rivalRowStyle}
                          />
                        )}
                        <div style={{ fontSize: 11.5, color: textMuted, marginTop: 10 }}>
                          {t("Rival prices are Amazon's current competitive (Buy Box) price. Star ratings and review counts are not available through Amazon's Selling Partner API.")}
                        </div>
                      </div>
                    </Section>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
