import React, { useState, useEffect, useContext, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "../../../../components/ui/input";
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { StyledCheckbox } from "../../../../common/grid/StyledCheckbox";
import { ApiGetSuggestedTargetingBid } from "../../../../api-wrapper/targeting/ApiTargeting";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import { FiArrowLeft, FiX } from "react-icons/fi";
import { getCurrencySymbol, getMarketplaceMinBid } from "../../../../helper/currencyCode/CurrencyCode";
import { Toast } from "../../../../helper/links/Link";

const AVG_CPC_OPTIONS = [
  { label: "Same As Avg CPC", value: "SAME" },
  { label: "Increase By %", value: "INC_PCT" },
  { label: "Increase By Amount", value: "INC_AMT" },
  { label: "Decrease By %", value: "DEC_PCT" },
  { label: "Decrease By Amount", value: "DEC_AMT" },
];

function calcAvgCpcBid(avgCPC, option, inputVal, minBid = 0.02) {
  const val = parseFloat(inputVal) || 0;
  let result = avgCPC;
  switch (option) {
    case "SAME": result = avgCPC; break;
    case "INC_PCT": result = +(avgCPC * (1 + val / 100)).toFixed(2); break;
    case "INC_AMT": result = +(avgCPC + val).toFixed(2); break;
    case "DEC_PCT": result = +(avgCPC * (1 - val / 100)).toFixed(2); break;
    case "DEC_AMT": result = +(Math.max(minBid, avgCPC - val)).toFixed(2); break;
    default: result = avgCPC; break;
  }
  return Math.max(minBid, result);
}

export default function AddKeywordStep3Modal({ show, onHide, onBack, payload, onSubmit }) {
  const { t } = useTranslation();
  const { profileId, currencyCode, countryCode } = useContext(ProfileContext);
  const currencySymbol = getCurrencySymbol(currencyCode);
  const minMarketplaceBid = getMarketplaceMinBid(currencyCode, countryCode);

  // ── Filter by match type ──────────────────────────────────────
  const [filterExact, setFilterExact] = useState(true);
  const [filterPhrase, setFilterPhrase] = useState(true);
  const [filterBroad, setFilterBroad] = useState(true);

  // ── Row data: payload rows enriched with bid + suggested bid ──
  const [rows, setRows] = useState([]);
  const [suggestedBids, setSuggestedBids] = useState({}); // key: `${keyword}__${campaignId}__${adGroupId}__${matchType}`
  const [loadingBids, setLoadingBids] = useState(false);

  // ── Set Bids mode ─────────────────────────────────────────────
  const [bidMode, setBidMode] = useState("AMAZON"); // AMAZON | CUSTOM | AVG_CPC
  const [fallbackBid, setFallbackBid] = useState(String(minMarketplaceBid.toFixed(2)));   // for AMAZON mode
  const [customBid, setCustomBid] = useState(String(minMarketplaceBid.toFixed(2)));        // for CUSTOM mode
  const [avgCpcOption, setAvgCpcOption] = useState("SAME");  // for AVG_CPC mode
  const [avgCpcInput, setAvgCpcInput] = useState("");         // for AVG_CPC mode

  // ── Init rows and fetch bids on open ─────────────────────────
  useEffect(() => {
    if (show && payload?.length > 0) {
      setBidMode("AMAZON");
      setFallbackBid(String(minMarketplaceBid.toFixed(2)));
      setCustomBid(String(minMarketplaceBid.toFixed(2)));
      setAvgCpcOption("SAME");
      setAvgCpcInput("");
      setFilterExact(true);
      setFilterPhrase(true);
      setFilterBroad(true);

      // Init rows — bid starts as minMarketplaceBid (will be set after API returns)
      setRows(payload.map((r) => ({ ...r, bid: minMarketplaceBid, checked: true })));

      fetchSuggestedBids(payload);
    }
  }, [show, payload, minMarketplaceBid]);

  const fetchSuggestedBids = async (items) => {
    setLoadingBids(true);
    try {
      // De-duplicate items for the API call (same keyword+campaign+adGroup may appear for multiple match types)
      const seen = new Set();
      const uniqueItems = [];
      items.forEach((r) => {
        const key = `${r.keyword}__${r.campaignId}__${r.adGroupId}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueItems.push({ searchTerm: r.keyword, campaignId: r.campaignId, adGroupId: r.adGroupId });
        }
      });

      const res = await ApiGetSuggestedTargetingBid({
        profileId: profileId?.value || profileId,
        items: uniqueItems,
      });

      if (res?.isSuccess && res.results?.length > 0) {
        const bidMap = {};
        res.results.forEach((result) => {
          result.recommendations?.forEach((rec) => {
            const key = `${result.searchTerm}__${result.campaignId}__${result.adGroupId}__${rec.targetingType}`;
            const bids = rec.bidValues || [];
            const middleBid = bids.length >= 2 ? bids[Math.floor(bids.length / 2)].suggestedBid : bids[0]?.suggestedBid;
            bidMap[key] = middleBid ?? null;
          });
        });
        setSuggestedBids(bidMap);

        // Apply amazon bids immediately after fetch
        setRows((prev) =>
          prev.map((r) => {
            const key = `${r.keyword}__${r.campaignId}__${r.adGroupId}__${r.matchType}`;
            const suggested = bidMap[key];
            return { ...r, bid: Math.max(minMarketplaceBid, suggested ?? minMarketplaceBid) };
          })
        );
      }
    } catch (e) {
      console.error("Failed to fetch suggested bids", e);
    }
    setLoadingBids(false);
  };

  const getSuggestedBidForRow = useCallback(
    (r) => {
      const key = `${r.keyword}__${r.campaignId}__${r.adGroupId}__${r.matchType}`;
      return suggestedBids[key] ?? null;
    },
    [suggestedBids]
  );

  // ── Apply bid mode ────────────────────────────────────────────
  const applyBids = () => {
    setRows((prev) =>
      prev.map((r) => {
        let newBid = r.bid;
        if (bidMode === "AMAZON") {
          const suggested = getSuggestedBidForRow(r);
          newBid = suggested !== null ? suggested : parseFloat(fallbackBid) || minMarketplaceBid;
        } else if (bidMode === "CUSTOM") {
          newBid = parseFloat(customBid) || minMarketplaceBid;
        } else if (bidMode === "AVG_CPC") {
          const avgCPC = r.avgCPC || 0;
          newBid = calcAvgCpcBid(avgCPC, avgCpcOption, avgCpcInput, minMarketplaceBid);
        }
        return { ...r, bid: +Math.max(minMarketplaceBid, newBid).toFixed(2) };
      })
    );
  };

  const toggleRow = (id) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, checked: !r.checked } : r));
  };

  const allChecked = rows.length > 0 && rows.every((r) => r.checked);
  const toggleAll = (checked) => setRows((prev) => prev.map((r) => ({ ...r, checked })));

  // ── Filtered rows (for display only) ─────────────────────────
  const visibleRows = rows.filter((r) => {
    if (r.matchType === "EXACT" && !filterExact) return false;
    if (r.matchType === "PHRASE" && !filterPhrase) return false;
    if (r.matchType === "BROAD" && !filterBroad) return false;
    return true;
  });

  const handleSubmit = () => {
    const selected = rows.filter((r) => r.checked);
    const invalidBid = selected.find(r => isNaN(parseFloat(r.bid)) || parseFloat(r.bid) < minMarketplaceBid);
    if (invalidBid) {
      Toast.error(`${t("All keyword bids must be at least")} ${currencySymbol}${minMarketplaceBid.toFixed(2)}`);
      return;
    }
    onSubmit(selected.map((r) => ({
      campaignId: r.campaignId,
      adGroupId: r.adGroupId,
      keyword: r.keyword,
      matchType: r.matchType,
      campaignType: r.campaignType,
      bid: +Math.max(minMarketplaceBid, parseFloat(r.bid) || minMarketplaceBid).toFixed(2),
    })));
  };

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
      <DialogContent
        className="max-w-[1100px] w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[90vh] font-sans"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Circuit top glow line indicator */}
        <div
          className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
            opacity: 0.8
          }}
        />

        {/* Top Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-white/10 shrink-0">
          <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
            {t("Add New Keyword(s) > Set Bids")}
          </DialogTitle>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6 max-h-[calc(90vh-140px)]">
          {/* Top controls row */}
          <div className="flex flex-col md:flex-row justify-between items-start gap-6 bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-100 dark:border-white/5">
            {/* Filter by */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("Filter by Match Type")}</span>
              <div className="flex items-center gap-4">
                {[
                  { label: "Exact", val: filterExact, set: setFilterExact },
                  { label: "Phrase", val: filterPhrase, set: setFilterPhrase },
                  { label: "Broad", val: filterBroad, set: setFilterBroad },
                ].map(({ label, val, set }) => (
                  <label key={label} className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                    <StyledCheckbox checked={val} onChange={() => set((v) => !v)} />
                    {t(label)}
                  </label>
                ))}
              </div>
            </div>

            {/* Set Bids panel */}
            <div className="flex-1 w-full md:w-auto flex flex-col gap-3 min-w-[320px]">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("Set Bids")}</span>

              <div className="flex flex-col gap-3">
                {/* Mode 1: Amazon Suggested Bids */}
                <div className="flex flex-col gap-1.5 pb-2 border-b border-slate-200/50 dark:border-white/5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <input
                        type="radio"
                        name="bidMode"
                        className="text-sky-500 focus:ring-sky-500"
                        checked={bidMode === "AMAZON"}
                        onChange={() => setBidMode("AMAZON")}
                      />
                      <span>{t("Use Amazon Suggested Bids")}</span>
                    </label>
                    {bidMode === "AMAZON" && (
                      <ShadcnButton
                        variant="link"
                        className="p-0 h-auto text-xs text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 font-bold"
                        onClick={applyBids}
                      >
                        {t("Apply to Selected")}
                      </ShadcnButton>
                    )}
                  </div>
                  {bidMode === "AMAZON" && (
                    <div className="pl-6 flex flex-col gap-1">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {t("Fallback bid when suggested bid is unavailable")}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-bold">{currencySymbol}</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={fallbackBid}
                          onChange={(e) => setFallbackBid(e.target.value)}
                          className="h-8 w-20 px-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Mode 2: Custom Bids */}
                <div className="flex flex-col gap-1.5 pb-2 border-b border-slate-200/50 dark:border-white/5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <input
                        type="radio"
                        name="bidMode"
                        className="text-sky-500 focus:ring-sky-500"
                        checked={bidMode === "CUSTOM"}
                        onChange={() => setBidMode("CUSTOM")}
                      />
                      <span>{t("Custom Bids")}</span>
                    </label>
                    {bidMode === "CUSTOM" && (
                      <ShadcnButton
                        variant="link"
                        className="p-0 h-auto text-xs text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 font-bold"
                        onClick={applyBids}
                      >
                        {t("Apply to Selected")}
                      </ShadcnButton>
                    )}
                  </div>
                  {bidMode === "CUSTOM" && (
                    <div className="pl-6 flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-bold">{currencySymbol}</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={customBid}
                        onChange={(e) => setCustomBid(e.target.value)}
                        className="h-8 w-20 px-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10"
                      />
                    </div>
                  )}
                </div>

                {/* Mode 3: Use Avg CPC */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <input
                        type="radio"
                        name="bidMode"
                        className="text-sky-500 focus:ring-sky-500"
                        checked={bidMode === "AVG_CPC"}
                        onChange={() => setBidMode("AVG_CPC")}
                      />
                      <span>{t("Use Avg CPC")}</span>
                    </label>
                    {bidMode === "AVG_CPC" && (
                      <ShadcnButton
                        variant="link"
                        className="p-0 h-auto text-xs text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 font-bold"
                        onClick={applyBids}
                      >
                        {t("Apply to Selected")}
                      </ShadcnButton>
                    )}
                  </div>
                  {bidMode === "AVG_CPC" && (
                    <div className="pl-6 flex items-center gap-2 flex-wrap">
                      <Select value={avgCpcOption} onValueChange={setAvgCpcOption}>
                        <SelectTrigger className="h-8 w-44 text-xs">
                          <SelectValue placeholder={t("Select Option")} />
                        </SelectTrigger>
                        <SelectContent className="z-[99999]">
                          {AVG_CPC_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value} className="text-xs">
                              {t(o.label)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {avgCpcOption !== "SAME" && (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={avgCpcInput}
                          onChange={(e) => setAvgCpcInput(e.target.value)}
                          className="h-8 w-20 px-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10"
                          placeholder={avgCpcOption.includes("PCT") ? "%" : currencySymbol}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="border border-slate-100 dark:border-white/5 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/10">
                    <th className="w-10 p-3">
                      <StyledCheckbox checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
                    </th>
                    {["Keyword", "Match Type", "Ad Group", "Campaign", "AVG CPC", "Amazon Suggested Bids", "Bids"].map((h) => (
                      <th key={h} className="p-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {loadingBids ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-xs text-slate-400 dark:text-slate-500">
                        <div className="flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-sky-500 border-t-transparent" />
                          <span>{t("Fetching Amazon Suggested Bids...")}</span>
                        </div>
                      </td>
                    </tr>
                  ) : visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-xs text-slate-400 dark:text-slate-500">
                        {t("No rows match the selected filters.")}
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((row) => {
                      const suggested = getSuggestedBidForRow(row);
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                          <td className="p-3">
                            <StyledCheckbox checked={row.checked} onChange={() => toggleRow(row.id)} />
                          </td>
                          <td className="p-3 text-xs font-semibold text-sky-600 dark:text-sky-400">{row.keyword}</td>
                          <td className="p-3 text-xs text-slate-600 dark:text-slate-300">
                            {t(row.matchType?.charAt(0) + row.matchType?.slice(1).toLowerCase())}
                          </td>
                          <td className="p-3 text-xs text-slate-600 dark:text-slate-300 max-w-[160px] truncate" title={row.adGroupName}>
                            {row.adGroupName}
                          </td>
                          <td className="p-3 text-xs text-slate-600 dark:text-slate-300 max-w-[160px] truncate" title={row.campaignName}>
                            {row.campaignName}
                          </td>
                          <td className="p-3 text-xs text-slate-600 dark:text-slate-300">
                            {row.avgCPC != null ? `${currencySymbol}${row.avgCPC.toFixed(2)}` : "—"}
                          </td>
                          <td className="p-3 text-xs text-slate-600 dark:text-slate-300">
                            {suggested != null ? `${currencySymbol}${suggested.toFixed(2)}` : <span className="text-slate-400/60">—</span>}
                          </td>
                          <td className="p-3 text-xs font-bold text-sky-600 dark:text-sky-400">
                            {currencySymbol}{(row.bid || 0).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 shrink-0">
          <ShadcnButton
            variant="ghost"
            className="h-[36px] px-4 rounded-lg flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
            onClick={onBack}
          >
            <FiArrowLeft size={14} />
            {t("Back")}
          </ShadcnButton>
          <div className="flex gap-2">
            <ShadcnButton
              variant="outline"
              className="h-[36px] px-4 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10"
              onClick={onHide}
            >
              {t("Cancel")}
            </ShadcnButton>
            <ShadcnButton
              className="h-[36px] px-4 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-90 transition-opacity"
              onClick={handleSubmit}
              disabled={loadingBids || rows.every((r) => !r.checked)}
            >
              {t("Submit")}
            </ShadcnButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
