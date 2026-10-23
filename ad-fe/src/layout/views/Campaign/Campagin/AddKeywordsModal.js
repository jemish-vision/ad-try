import React, { useState, useEffect, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment-timezone";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import { ApiCreateKeywords } from "../../../../api-wrapper/targeting/ApiTargeting";
import { ApiGetAdGroupsByCampaign } from "../../../../api-wrapper/campaign/ApiCampaign";
import { Toast } from "../../../../helper/links/Link";
import { Plus, Trash2, Layers, KeyRound, Sparkles, AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { getCurrencySymbol, getMarketplaceMinBid } from "../../../../helper/currencyCode/CurrencyCode";

const MATCH_TYPES = [
  { key: "EXACT", label: "Exact", bg: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" },
  { key: "PHRASE", label: "Phrase", bg: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800" },
  { key: "BROAD", label: "Broad", bg: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
];

const AddKeywordsModal = ({
  open,
  onClose,
  campaignDetails,
  date,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { profileId, currencyCode, countryCode, today } = useContext(ProfileContext);
  const minMarketplaceBid = getMarketplaceMinBid(currencyCode, countryCode);
  const currSymbol = getCurrencySymbol(currencyCode);

  const [adGroups, setAdGroups] = useState([]);
  const [selectedAdGroupId, setSelectedAdGroupId] = useState("");
  const [loadingAdGroups, setLoadingAdGroups] = useState(false);

  // Form Inputs
  const [keywordText, setKeywordText] = useState("");
  const [selectedMatchTypes, setSelectedMatchTypes] = useState(["EXACT", "PHRASE", "BROAD"]);
  const [defaultBid, setDefaultBid] = useState("10.00");

  // Staged keywords to add
  const [stagedKeywords, setStagedKeywords] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const campaignId = campaignDetails?.campaignId;
  const campaignName = campaignDetails?.campaignName || campaignDetails?.name || `Campaign #${campaignId}`;

  // Fetch Ad Groups when modal opens
  useEffect(() => {
    if (!open || !campaignId || !profileId?.value) return;

    let isMounted = true;
    const fetchAdGroups = async () => {
      setLoadingAdGroups(true);
      try {
        const fromDate = date?.[0] ? moment(date[0]).format("YYYY-MM-DD") : (today || moment().format("YYYY-MM-DD"));
        const toDate = date?.[1] ? moment(date[1]).format("YYYY-MM-DD") : (today || moment().format("YYYY-MM-DD"));

        const payload = {
          profileId: profileId.value,
          campaignId: Number(campaignId) || campaignId,
          fromDate,
          toDate,
          pageNo: 1,
          perPage: 100,
        };
        let res = await ApiGetAdGroupsByCampaign(campaignId, payload);
        let list = (res?.isSuccess && res.getAdGroupsData) ? res.getAdGroupsData : [];

        // Fallback without date filter if empty
        if (list.length === 0) {
          const fallbackRes = await ApiGetAdGroupsByCampaign(campaignId, {
            profileId: profileId.value,
            campaignId: Number(campaignId) || campaignId,
            pageNo: 1,
            perPage: 100,
          });
          if (fallbackRes?.isSuccess && fallbackRes.getAdGroupsData?.length > 0) {
            list = fallbackRes.getAdGroupsData;
          }
        }

        // Fallback from campaignDetails if adGroupId is already present
        if (list.length === 0 && campaignDetails?.adGroupId) {
          list = [{
            adGroupId: campaignDetails.adGroupId,
            name: campaignDetails.adGroupName || campaignDetails.name || `Ad Group #${campaignDetails.adGroupId}`
          }];
        }

        if (isMounted) {
          setAdGroups(list);
          if (list.length > 0) {
            const matching = list.find(ag => String(ag.adGroupId) === String(campaignDetails?.adGroupId));
            setSelectedAdGroupId(matching ? String(matching.adGroupId) : String(list[0].adGroupId));
          }
        }
      } catch (err) {
        console.error("Error fetching ad groups:", err);
      } finally {
        if (isMounted) setLoadingAdGroups(false);
      }
    };

    fetchAdGroups();
    return () => {
      isMounted = false;
    };
  }, [open, campaignId, profileId?.value, campaignDetails?.adGroupId, date, today]);

  // Reset form on open/close
  useEffect(() => {
    if (open) {
      setKeywordText("");
      setStagedKeywords([]);
      setErrorMsg("");
      setSelectedMatchTypes(["EXACT", "PHRASE", "BROAD"]);
    }
  }, [open]);

  // Toggle match type selection
  const toggleMatchType = (typeKey) => {
    setSelectedMatchTypes(prev => {
      if (prev.includes(typeKey)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        return prev.filter(t => t !== typeKey);
      }
      return [...prev, typeKey];
    });
  };

  // Add keywords to staged list
  const handleAddToList = () => {
    setErrorMsg("");
    if (!keywordText.trim()) {
      setErrorMsg(t("Please enter at least one keyword."));
      return;
    }
    if (selectedMatchTypes.length === 0) {
      setErrorMsg(t("Please select at least one match type."));
      return;
    }
    const numBid = parseFloat(defaultBid);
    if (isNaN(numBid) || numBid < minMarketplaceBid) {
      setErrorMsg(`${t("Bid must be at least")} ${currSymbol}${minMarketplaceBid.toFixed(2)}.`);
      return;
    }

    // Split input by newlines and commas
    const rawKeywords = keywordText
      .split(/[\n,]+/)
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (rawKeywords.length === 0) {
      setErrorMsg(t("No valid keywords found."));
      return;
    }

    const newEntries = [];
    const currentList = [...stagedKeywords];

    rawKeywords.forEach(kw => {
      selectedMatchTypes.forEach(mType => {
        const alreadyExists = currentList.some(
          item => item.keyword.toLowerCase() === kw.toLowerCase() && item.matchType === mType
        );
        if (!alreadyExists) {
          const entry = {
            id: `${kw}_${mType}_${Date.now()}_${Math.random()}`,
            keyword: kw,
            matchType: mType,
            bid: numBid.toFixed(2),
          };
          currentList.push(entry);
          newEntries.push(entry);
        }
      });
    });

    if (newEntries.length === 0) {
      Toast.info(t("All entered keywords with selected match types are already in the list."));
    } else {
      setStagedKeywords(currentList);
      setKeywordText("");
      Toast.success(t("Added {{count}} keyword variations to list", { count: newEntries.length }));
    }
  };

  // Remove individual keyword from staged list
  const handleRemoveStagedKeyword = (id) => {
    setStagedKeywords(prev => prev.filter(item => item.id !== id));
  };

  // Update individual keyword bid
  const handleUpdateBid = (id, newBid) => {
    setStagedKeywords(prev =>
      prev.map(item => (item.id === id ? { ...item, bid: newBid } : item))
    );
  };

  // Clear all staged keywords
  const handleClearAll = () => {
    setStagedKeywords([]);
  };

  // Submit to API
  const handleSubmit = async () => {
    setErrorMsg("");

    if (!selectedAdGroupId) {
      setErrorMsg(t("Please select an Ad Group."));
      return;
    }

    if (stagedKeywords.length === 0) {
      setErrorMsg(t("Please add keywords to the list before saving."));
      return;
    }

    // Validate all bids
    const invalidBid = stagedKeywords.find(
      k => isNaN(parseFloat(k.bid)) || parseFloat(k.bid) < minMarketplaceBid
    );
    if (invalidBid) {
      setErrorMsg(`${t("Please ensure all keywords have a valid bid of at least")} ${currSymbol}${minMarketplaceBid.toFixed(2)}.`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        profileId: profileId?.value,
        campaignId: Number(campaignId) || campaignId,
        adGroupId: Number(selectedAdGroupId) || selectedAdGroupId,
        keywords: stagedKeywords.map(k => ({
          keywordText: k.keyword,
          matchType: k.matchType,
          bid: parseFloat(k.bid),
          state: "ENABLED",
        })),
      };

      const res = await ApiCreateKeywords(payload);
      if (res?.isSuccess) {
        Toast.success(res.message || t("Keywords added successfully!"));
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setErrorMsg(res?.message || t("Failed to add keywords. Please try again."));
        Toast.error(res?.message || t("Failed to add keywords."));
      }
    } catch (err) {
      console.error("Error creating keywords:", err);
      setErrorMsg(err?.message || t("Something went wrong while adding keywords."));
      Toast.error(t("Error submitting keywords."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !submitting && onClose(val)}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden bg-white dark:bg-[#131d36] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl">
        
        {/* Header */}
        <DialogHeader className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
                  {t("Add Keywords")}
                </DialogTitle>
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{campaignName}</span>
                </div>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[70vh] overflow-y-auto">

          {/* Ad Group Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              {t("Select Ad Group")} <span className="text-rose-500">*</span>
            </label>
            {loadingAdGroups ? (
              <div className="h-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center px-3 text-xs text-slate-400 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> {t("Loading ad groups...")}
              </div>
            ) : adGroups.length > 0 ? (
              <Select value={selectedAdGroupId} onValueChange={setSelectedAdGroupId}>
                <SelectTrigger className="h-10 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm">
                  <SelectValue placeholder={t("Select an Ad Group")} />
                </SelectTrigger>
                <SelectContent>
                  {adGroups.map(ag => (
                    <SelectItem key={ag.adGroupId} value={String(ag.adGroupId)}>
                      {ag.name || ag.adGroupName || `Ad Group #${ag.adGroupId}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="p-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-lg">
                {t("No ad groups found for this campaign.")}
              </div>
            )}
          </div>

          {/* Match Types & Default Bid Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Match Types Filter Pills */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                {t("Match Types")} <span className="text-rose-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {MATCH_TYPES.map(m => {
                  const isSelected = selectedMatchTypes.includes(m.key);
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => toggleMatchType(m.key)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? `${m.bg} shadow-sm ring-1 ring-blue-500/20 font-extrabold`
                          : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-50 opacity-60"
                      }`}
                    >
                      {isSelected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-600" />}
                      {t(m.label)}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {t("Keywords will be created for each selected match type.")}
              </span>
            </div>

            {/* Default Bid Input */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                {t("Default Bid")} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                  {getCurrencySymbol(currencyCode)}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.02"
                  value={defaultBid}
                  onChange={(e) => setDefaultBid(e.target.value)}
                  placeholder="10.00"
                  className="w-full h-10 pl-8 pr-3 text-xs sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {t("You can also customize the bid per keyword below.")}
              </span>
            </div>
          </div>

          {/* Keywords Textarea Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                {t("Enter Keywords")} <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">
                {t("Enter one keyword per line")}
              </span>
            </div>
            <textarea
              rows={4}
              value={keywordText}
              onChange={(e) => setKeywordText(e.target.value)}
              placeholder={t("e.g.\nspirulina powder\norganic spirulina\nspirulina capsules 500mg")}
              className="w-full p-3 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
            />
            
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-400">
                {keywordText.trim() ? `${keywordText.split(/[\n,]+/).filter(k => k.trim().length > 0).length} keyword(s) entered` : ""}
              </span>
              <button
                type="button"
                onClick={handleAddToList}
                disabled={!keywordText.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("Add to List")}
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Staged Keywords Review Table */}
          {stagedKeywords.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  <span>{t("Keywords Ready to Add")} ({stagedKeywords.length})</span>
                </div>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {t("Clear all")}
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-inner">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-300 dark:border-slate-700 shadow-sm">
                    <tr>
                      <th className="py-2.5 px-3 font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200">{t("Keyword")}</th>
                      <th className="py-2.5 px-3 font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200">{t("Match Type")}</th>
                      <th className="py-2.5 px-3 font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 w-28">{t("Bid")}</th>
                      <th className="py-2.5 px-3 font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-right w-12">{t("Action")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                    {stagedKeywords.map((item) => {
                      const matchConfig = MATCH_TYPES.find(m => m.key === item.matchType) || MATCH_TYPES[0];
                      return (
                        <tr key={item.id} className="hover:bg-white dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                            {item.keyword}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${matchConfig.bg}`}>
                              {item.matchType}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <div className="relative w-24">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                                {getCurrencySymbol(currencyCode)}
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                min="0.02"
                                value={item.bid}
                                onChange={(e) => handleUpdateBid(item.id, e.target.value)}
                                className="w-full h-7 pl-6 pr-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveStagedKeyword(item.id)}
                              className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                              title={t("Remove")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl text-xs h-10 px-4"
          >
            {t("Cancel")}
          </Button>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || stagedKeywords.length === 0 || !selectedAdGroupId}
            className="rounded-xl text-xs h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/20 disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("Adding Keywords...")}
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                {t("Add {{count}} Keywords", { count: stagedKeywords.length })}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddKeywordsModal;
