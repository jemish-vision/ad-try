// Competitor Comparison — read-only, same ASIN: our offer vs other sellers / Buy Box.
import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowClockwise, CheckCircle, Crown, MagnifyingGlass, Package, WarningCircle, XCircle, Info } from "@phosphor-icons/react";

import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { getCurrencySymbol } from "../../../helper/currencyCode/CurrencyCode";
import { ApiGetProductComparison, ApiGetSPProduct } from "../../../api-wrapper/productList/ApiProductList";
import { cn } from "src/lib/utils";

const ASIN_REGEX = /^[A-Z0-9]{10}$/;

// Tone helpers — "good" means favourable to us.
const TONE = {
  good: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900",
  bad: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900",
  neutral: "text-muted-foreground bg-muted/40 border-border",
};

const isNum = (v) => v !== null && v !== undefined && !Number.isNaN(Number(v));

function Pill({ tone = "neutral", children }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONE[tone])}>{children}</span>;
}

function YesNo({ value, t }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return value ? <span className="font-medium">{t("Yes")}</span> : <span className="text-muted-foreground">{t("No")}</span>;
}

export default function CompetitorComparison() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { profileId, currencyCode } = useContext(ProfileContext);
  const pId = profileId?.value ?? profileId;

  const initialAsin = (new URLSearchParams(location.search).get("asin") || "").toUpperCase();
  const [asinInput, setAsinInput] = useState(initialAsin);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // Our-product suggestions for the ASIN box
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimer = useRef(null);
  const boxRef = useRef(null);

  const currency = getCurrencySymbol(data?.currency || currencyCode);
  const fmt = (v) => (isNum(v) ? `${currency}${Number(v).toFixed(2)}` : "—");

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
        if (new URLSearchParams(location.search).get("asin") !== clean) {
          navigate({ search: `?asin=${clean}` }, { replace: true });
        }
      } else {
        setData(null);
        setError(res?.message || t("Unable to load comparison"));
      }
    },
    [pId, t, navigate, location.search]
  );

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

  const ours = data?.ourOffer;
  const rival = data?.primaryRival;
  const cmp = data?.comparison;
  const delta = cmp?.vsPrimaryRival;

  // Price delta: ours - theirs. Positive = we're more expensive (bad).
  const priceDelta = (d) => {
    if (!isNum(d)) return <span className="text-muted-foreground">—</span>;
    if (d === 0) return <Pill>{t("Same")}</Pill>;
    const abs = `${currency}${Math.abs(d).toFixed(2)}`;
    return d > 0 ? <Pill tone="bad">+{abs} {t("higher")}</Pill> : <Pill tone="good">−{abs} {t("lower")}</Pill>;
  };

  const boolAdvantage = (ourVal, theirVal, label) => {
    if (ourVal === null || ourVal === undefined || theirVal === null || theirVal === undefined || ourVal === theirVal) return <Pill>{t("Even")}</Pill>;
    return ourVal ? <Pill tone="good">{t("Our")} {label} {t("advantage")}</Pill> : <Pill tone="bad">{t("Rival")} {label} {t("advantage")}</Pill>;
  };

  const ratingDelta = () => {
    if (!isNum(ours?.feedbackPercent) || !isNum(rival?.feedbackPercent)) return <span className="text-muted-foreground">—</span>;
    const d = ours.feedbackPercent - rival.feedbackPercent;
    if (d === 0) return <Pill>{t("Even")}</Pill>;
    return d > 0 ? <Pill tone="good">+{d}% {t("better")}</Pill> : <Pill tone="bad">{d}% {t("lower")}</Pill>;
  };

  const rating = (o) =>
    isNum(o?.feedbackPercent) ? (
      <span>
        {o.feedbackPercent}% <span className="text-muted-foreground">({Number(o.feedbackCount || 0).toLocaleString()} {t("ratings")})</span>
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  const sellerLabel = (o) => (o ? (o.isOurs ? t("You") : o.sellerId || t("Unknown seller")) : "—");

  const rows = [
    { key: "listing", label: t("Listing Price"), ours: fmt(ours?.listingPrice), rival: fmt(rival?.listingPrice), delta: priceDelta(delta?.listingPrice) },
    {
      key: "shipping",
      label: t("Shipping Cost"),
      ours: ours?.shipping === 0 ? `${t("Free")} (${fmt(0)})` : fmt(ours?.shipping),
      rival: rival?.shipping === 0 ? `${t("Free")} (${fmt(0)})` : fmt(rival?.shipping),
      delta: priceDelta(delta?.shipping),
    },
    { key: "landed", label: t("Landed Price (Total)"), ours: <b>{fmt(ours?.landedPrice)}</b>, rival: <b>{fmt(rival?.landedPrice)}</b>, delta: priceDelta(delta?.landedPrice), emphasis: true },
    {
      key: "bb",
      label: t("Buy Box Winner"),
      ours: <YesNo value={ours?.isBuyBoxWinner} t={t} />,
      rival: rival ? (rival.isBuyBoxWinner ? <span className="font-medium">{t("Yes")} ({sellerLabel(rival)})</span> : <YesNo value={false} t={t} />) : "—",
      delta: cmp?.weHaveBuyBox ? <Pill tone="good"><Crown size={12} weight="fill" /> {t("We own the Buy Box")}</Pill> : rival?.isBuyBoxWinner ? <Pill tone="bad"><Crown size={12} weight="fill" /> {t("Rival owns the Buy Box")}</Pill> : <Pill>{t("Not held by either")}</Pill>,
    },
    { key: "fulfillment", label: t("Fulfillment"), ours: ours?.fulfillment || "—", rival: rival?.fulfillment || "—", delta: boolAdvantage(ours?.fulfillment ? ours.fulfillment === "FBA" : null, rival?.fulfillment ? rival.fulfillment === "FBA" : null, "FBA") },
    { key: "prime", label: t("Prime Eligible"), ours: <YesNo value={ours?.isPrime} t={t} />, rival: <YesNo value={rival?.isPrime} t={t} />, delta: boolAdvantage(ours?.isPrime, rival?.isPrime, "Prime") },
    { key: "rating", label: t("Seller Rating"), ours: rating(ours), rival: rating(rival), delta: ratingDelta() },
  ];

  const statusBanner = () => {
    if (!cmp) return null;
    const map = {
      winning: { tone: "good", icon: <CheckCircle size={20} weight="fill" />, text: t("You are winning the Buy Box") },
      losing: { tone: "bad", icon: <XCircle size={20} weight="fill" />, text: data?.buyBoxOffer ? `${t("You are losing the Buy Box to")} ${sellerLabel(data.buyBoxOffer)}` : t("You don't hold the Buy Box") },
      only_seller: { tone: "good", icon: <CheckCircle size={20} weight="fill" />, text: t("You are the only seller on this ASIN") },
      no_offer: { tone: "neutral", icon: <Info size={20} weight="fill" />, text: t("You have no active offer on this ASIN — showing competitor offers only") },
    };
    const s = map[cmp.status] || map.no_offer;
    return (
      <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium", TONE[s.tone])}>
        {s.icon}
        <span>{s.text}</span>
        {cmp.buyBoxSuppressed && <Pill tone="bad"><WarningCircle size={12} /> {t("Buy Box suppressed")}</Pill>}
        {ours?.source === "listing" && <Pill><Info size={12} /> {t("Our price taken from Product List (offer not in Amazon's top offers)")}</Pill>}
      </div>
    );
  };

  const summary = data?.summary;
  const lowestFBA = summary?.lowestPrices?.find((x) => x.fulfillmentChannel === "FBA");
  const lowestFBM = summary?.lowestPrices?.find((x) => x.fulfillmentChannel === "FBM");

  const allOffers = data ? [...(ours && ours.source === "offers" ? [ours] : []), ...data.competitors].sort((a, b) => (a.landedPrice ?? Infinity) - (b.landedPrice ?? Infinity)) : [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t("Competitor Comparison")}</h1>
        <p className="text-sm text-muted-foreground">{t("Compare your offer against other sellers on the same ASIN — Buy Box, price, shipping, fulfillment and seller rating. Read-only.")}</p>
      </div>

      {/* ASIN picker */}
      <Card>
        <CardContent className="p-4">
          <form
            className="flex flex-col sm:flex-row gap-2 sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              runCompare(asinInput);
            }}
          >
            <div ref={boxRef} className="relative flex-1">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="competitor-compare-asin"
                className="pl-9"
                placeholder={t("Enter an ASIN or search your products by name / SKU")}
                value={asinInput}
                onChange={(e) => onAsinChange(e.target.value)}
                onFocus={() => suggestions.length && setShowSuggestions(true)}
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-80 overflow-auto">
                  {suggestions.map((p) => (
                    <button
                      type="button"
                      key={`${p.asin}-${p.sku}`}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted"
                      onClick={() => {
                        setAsinInput(p.asin);
                        runCompare(p.asin);
                      }}
                    >
                      {p.imageURL ? <img src={p.imageURL} alt="" className="h-8 w-8 rounded object-contain bg-white" /> : <Package size={28} className="text-muted-foreground" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{p.itemName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {p.asin} · {p.sku}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button type="submit" disabled={loading || !pId}>
              {t("Compare")}
            </Button>
            {data && (
              <Button type="button" variant="outline" disabled={loading} onClick={() => runCompare(data.asin, true)}>
                <ArrowClockwise size={16} className={cn(loading && "animate-spin")} /> {t("Refresh")}
              </Button>
            )}
          </form>
          {data?.fetchedAt && (
            <div className="mt-2 text-xs text-muted-foreground">
              {t("Last fetched from Amazon")}: {new Date(data.fetchedAt).toLocaleString()}
              {data.cached ? ` · ${t("cached")}` : ""}
            </div>
          )}
        </CardContent>
      </Card>

      {error && !loading && (
        <div className={cn("flex items-center gap-2 rounded-lg border px-4 py-3 text-sm", TONE.bad)}>
          <WarningCircle size={18} /> {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      )}

      {!loading && !data && !error && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t("Pick one of your products or enter an ASIN to see how your offer stacks up.")}</div>
      )}

      {!loading && data && (
        <>
          {/* Product header (same ASIN → one product) */}
          <Card>
            <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
              {data.product?.image ? (
                <img src={data.product.image} alt={data.product?.title || data.asin} className="h-28 w-28 shrink-0 rounded-md border bg-white object-contain" />
              ) : (
                <div className="h-28 w-28 shrink-0 rounded-md border flex items-center justify-center text-muted-foreground">
                  <Package size={36} />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="font-medium leading-snug">{data.product?.title || data.asin}</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Pill>ASIN {data.asin}</Pill>
                  {data.ourSku && <Pill>SKU {data.ourSku}</Pill>}
                  {data.product?.brand && <Pill>{data.product.brand}</Pill>}
                  {data.product?.salesRank && (
                    <Pill>
                      BSR #{Number(data.product.salesRank.rank).toLocaleString()} {data.product.salesRank.category ? `· ${data.product.salesRank.category}` : ""}
                    </Pill>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
                  {[
                    [t("Sellers (New)"), summary?.newOfferCount ?? summary?.totalOfferCount ?? "—"],
                    [t("Buy Box price"), fmt(summary?.buyBoxPrice?.landedPrice)],
                    [t("Lowest FBA"), fmt(lowestFBA?.landedPrice)],
                    [t("Lowest FBM"), fmt(lowestFBM?.landedPrice)],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-md border px-3 py-2">
                      <div className="text-xs text-muted-foreground">{k}</div>
                      <div className="text-sm font-semibold">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {statusBanner()}

          {/* Side-by-side matrix */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t("Our offer vs")} {rival ? (rival.isBuyBoxWinner ? t("Buy Box winner") : t("lowest-priced competitor")) : t("competitor")}
                {rival && <span className="ml-2 text-sm font-normal text-muted-foreground">({sellerLabel(rival)})</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {!rival ? (
                <div className="p-6 text-sm text-muted-foreground">{t("No competing offers on this ASIN right now.")}</div>
              ) : (
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 font-medium">{t("Metric")}</th>
                      <th className="px-4 py-2 font-medium">{t("Our Product")}</th>
                      <th className="px-4 py-2 font-medium">{t("Competitor")}</th>
                      <th className="px-4 py-2 font-medium">{t("Delta / Highlight")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className={cn("border-b last:border-b-0", r.emphasis && "bg-muted/20")}>
                        <td className="px-4 py-2.5 font-medium">{r.label}</td>
                        <td className="px-4 py-2.5">{ours ? r.ours : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-2.5">{r.rival}</td>
                        <td className="px-4 py-2.5">{ours ? r.delta : <span className="text-muted-foreground">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* All offers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t("All offers")} <span className="text-sm font-normal text-muted-foreground">({allOffers.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{t("Seller")}</th>
                    <th className="px-4 py-2 font-medium text-right">{t("Price")}</th>
                    <th className="px-4 py-2 font-medium text-right">{t("Shipping")}</th>
                    <th className="px-4 py-2 font-medium text-right">{t("Landed")}</th>
                    <th className="px-4 py-2 font-medium text-right">{t("vs Ours")}</th>
                    <th className="px-4 py-2 font-medium">{t("Fulfillment")}</th>
                    <th className="px-4 py-2 font-medium">{t("Prime")}</th>
                    <th className="px-4 py-2 font-medium">{t("Seller Rating")}</th>
                  </tr>
                </thead>
                <tbody>
                  {allOffers.map((o, i) => {
                    const vs = isNum(ours?.landedPrice) && isNum(o.landedPrice) && !o.isOurs ? Math.round((ours.landedPrice - o.landedPrice) * 100) / 100 : null;
                    return (
                      <tr key={`${o.sellerId}-${i}`} className={cn("border-b last:border-b-0", o.isOurs && "bg-primary/5")}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={cn(o.isOurs && "font-semibold")}>{sellerLabel(o)}</span>
                            {o.isBuyBoxWinner && (
                              <Pill tone={o.isOurs ? "good" : "bad"}>
                                <Crown size={12} weight="fill" /> {t("Buy Box")}
                              </Pill>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">{fmt(o.listingPrice)}</td>
                        <td className="px-4 py-2.5 text-right">{o.shipping === 0 ? t("Free") : fmt(o.shipping)}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{fmt(o.landedPrice)}</td>
                        <td className="px-4 py-2.5 text-right">{o.isOurs ? <span className="text-muted-foreground">—</span> : priceDelta(vs)}</td>
                        <td className="px-4 py-2.5">{o.fulfillment || "—"}</td>
                        <td className="px-4 py-2.5">{o.isPrime ? <Pill tone="good">Prime</Pill> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-2.5">{rating(o)}</td>
                      </tr>
                    );
                  })}
                  {allOffers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                        {t("Amazon returned no offers for this ASIN.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="px-4 py-2 text-xs text-muted-foreground border-t">
                {t("Amazon returns up to 20 lowest-priced New offers. Sellers are shown by seller ID. “vs Ours” = our landed price minus theirs (red = we're more expensive).")}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
