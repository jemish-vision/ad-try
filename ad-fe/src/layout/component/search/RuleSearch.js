import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { handleLoader } from '../../../common/redux/action'
import { useTranslation } from "react-i18next";
import { Checkbox } from '../../../components/ui/checkbox';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Button } from '../../../components/ui/button';
import { AlertTriangle, Info } from 'lucide-react';

function extractRuleCampaignIds(rule) {
    if (!rule) return [];
    const raw = rule.campaignIds || rule.campaigns || rule.campaignId;
    const ids = [];

    const processItem = (item) => {
        if (item === undefined || item === null || item === '') return;
        if (typeof item === 'object') {
            const id = item.campaignId || item.id || item._id;
            if (id !== undefined && id !== null && id !== '') ids.push(id);
        } else {
            ids.push(item);
        }
    };

    if (Array.isArray(raw)) {
        raw.forEach(processItem);
    } else if (raw && typeof raw === 'object') {
        Object.values(raw).forEach((val) => {
            if (Array.isArray(val)) {
                val.forEach(processItem);
            } else if (val !== undefined && val !== null && val !== '') {
                processItem(val);
            }
        });
    } else if (typeof raw === 'string' || typeof raw === 'number') {
        ids.push(raw);
    }

    if (ids.length === 0 && Array.isArray(rule.conditions)) {
        rule.conditions.forEach((cond) => {
            if (Array.isArray(cond?.campaigns)) {
                cond.campaigns.forEach(processItem);
            }
        });
    }

    return [...new Set(ids)];
}

function getRuleActionCategory(rule) {
    if (!rule) return 'unknown';

    const stratType = (rule.strategyType || rule.hourlyConfig?.targetingType || '').toString().toUpperCase();

    // 1. Placement Rule & Placement Dayparting Check
    const isPlacement = stratType === 'PLACEMENTS' || Array.isArray(rule.actionType) || rule.actionType?.placement || rule.ruleType === 'PLACEMENT' || rule.ruleType === 'BID_PLACEMENT';
    if (isPlacement) {
        if (rule.isHourlyBid || rule.hourlyConfig || (rule.slots && rule.slots.length > 0)) return 'placement_hourly';
        if (Array.isArray(rule.actionType)) {
            const hasInc = rule.actionType.some(a => (a.actionName || '').toLowerCase().includes('increase') || (a.actionName || '').toLowerCase().includes('top'));
            const hasDec = rule.actionType.some(a => (a.actionName || '').toLowerCase().includes('decrease'));
            if (hasInc && hasDec) return 'placement_mixed';
            if (hasInc) return 'placement_increase';
            if (hasDec) return 'placement_decrease';
            return 'placement_general';
        }
    }

    // 2. Budget Rule & Budget Dayparting Check
    const isBudget = stratType === 'BUDGETS' || rule.budgetThreshold !== undefined || rule.isHourlyBudget || (rule.actionType?.actionName && rule.actionType.actionName.toLowerCase().includes('budget')) || rule.ruleType === 'BUDGET';
    if (isBudget) {
        if (rule.isHourlyBudget || (stratType === 'BUDGETS' && (rule.hourlyConfig || rule.slots))) return 'budget_hourly';
        const actionName = (rule.actionType?.actionName || rule.actionName || '').toString().toLowerCase();
        if (actionName === 'paused' || actionName.includes('pause')) return 'state_pause';
        if (actionName === 'enabled' || actionName.includes('enable')) return 'state_enable';
        if (actionName === 'setbudget' || actionName.includes('set')) return 'budget_set';
        if (actionName.includes('decrease') || actionName === 'dec') return 'budget_decrease';
        if (actionName.includes('increase') || actionName === 'inc' || actionName.includes('top')) return 'budget_increase';
        return 'budget_general';
    }

    // 3. Search Term Rule Check
    const actionName = (rule.actionType?.actionName || rule.actionName || rule.type || '').toString().toLowerCase();
    if (actionName.includes('negative')) return 'search_negative';
    if (actionName.includes('targeting') || actionName === 'addastargeting') return 'search_positive';

    // 4. Hourly Bid Dayparting (Targeting / Keyword Dayparting)
    if (stratType === 'TARGETS' || stratType === 'KEYWORDS' || rule.isHourlyBid || rule.hourlyConfig || (rule.slots && rule.slots.length > 0)) {
        return 'bid_hourly';
    }

    // 5. State Actions
    if (actionName.includes('pause')) return 'state_pause';
    if (actionName.includes('enable')) return 'state_enable';

    // 6. Targeting Bid Actions
    if (actionName.includes('increase') || actionName.includes('top') || actionName === 'inc') return 'bid_increase';
    if (actionName.includes('decrease') || actionName === 'dec') return 'bid_decrease';
    if (actionName.includes('setbid') || actionName.includes('set_bid') || actionName === 'set') return 'bid_set';

    return 'general';
}

function evaluateRuleConflict(currentRule, otherRule) {
    if (!otherRule) return { isConflict: false, isShared: false };

    // Inactive rules do not actively execute, so they do not cause live conflicts
    const isOtherInactive = otherRule.isActive === false || otherRule.status === 'PAUSED' || otherRule.status === 'INACTIVE';
    if (isOtherInactive) {
        return { isConflict: false, isShared: true, isInactive: true, reason: 'Inactive Rule' };
    }

    const currentCat = getRuleActionCategory(currentRule);
    const otherCat = getRuleActionCategory(otherRule);

    // If current rule has no known category, flag as shared informational
    if (currentCat === 'unknown') {
        return { isConflict: false, isShared: true, isInactive: false, reason: 'Used in other rule' };
    }

    // Global State Conflict across all rules (Pause vs Enable fighting on campaign state)
    if (
        (currentCat === 'state_pause' && otherCat === 'state_enable') ||
        (currentCat === 'state_enable' && otherCat === 'state_pause')
    ) {
        return { isConflict: true, isShared: false, reason: 'Opposing State (Pause vs Enable)' };
    }

    // 1. Targeting Bid Rules — ANY multiple active rules modifying targeting bids on the same campaign conflict!
    // (Due to compounding multiplier, double bid-inflation/deflation, opposing changes, or schedule overrides)
    const isCurrentTargetBid = ['bid_increase', 'bid_decrease', 'bid_set', 'bid_hourly'].includes(currentCat);
    const isOtherTargetBid = ['bid_increase', 'bid_decrease', 'bid_set', 'bid_hourly'].includes(otherCat);
    if (isCurrentTargetBid && isOtherTargetBid) {
        if (
            (currentCat === 'bid_increase' && otherCat === 'bid_decrease') ||
            (currentCat === 'bid_decrease' && otherCat === 'bid_increase')
        ) {
            return { isConflict: true, isShared: false, reason: 'Opposing Bid Adjustments (Increase vs Decrease)' };
        }
        if (currentCat === 'bid_increase' && otherCat === 'bid_increase') {
            return { isConflict: true, isShared: false, reason: 'Compounding Bid Stacking (Multiple Increase Rules)' };
        }
        if (currentCat === 'bid_decrease' && otherCat === 'bid_decrease') {
            return { isConflict: true, isShared: false, reason: 'Compounding Bid Deflation (Multiple Decrease Rules)' };
        }
        if (currentCat === 'bid_set' || otherCat === 'bid_set') {
            return { isConflict: true, isShared: false, reason: 'Conflicting Bid Overwrite (Set Bid vs Other Rules)' };
        }
        if (currentCat === 'bid_hourly' && otherCat === 'bid_hourly') {
            return { isConflict: true, isShared: false, reason: 'Multiple Dayparting Schedules Overlap (Time Slot Overwrite)' };
        }
        if (currentCat === 'bid_hourly' || otherCat === 'bid_hourly') {
            return { isConflict: true, isShared: false, reason: 'Hourly Dayparting vs Target Optimization Overlap' };
        }
        return { isConflict: true, isShared: false, reason: 'Targeting Bid Collision' };
    }

    // 2. Placement Bid Rules — ANY multiple active placement rules on the same campaign conflict!
    const isCurrentPlacement = ['placement_increase', 'placement_decrease', 'placement_mixed', 'placement_hourly', 'placement_general'].includes(currentCat);
    const isOtherPlacement = ['placement_increase', 'placement_decrease', 'placement_mixed', 'placement_hourly', 'placement_general'].includes(otherCat);
    if (isCurrentPlacement && isOtherPlacement) {
        if (
            (currentCat === 'placement_increase' && otherCat === 'placement_decrease') ||
            (currentCat === 'placement_decrease' && otherCat === 'placement_increase')
        ) {
            return { isConflict: true, isShared: false, reason: 'Opposing Placement Modifier Adjustments' };
        }
        if (currentCat === 'placement_hourly' && otherCat === 'placement_hourly') {
            return { isConflict: true, isShared: false, reason: 'Multiple Placement Dayparting Overlap (Time Slot Overwrite)' };
        }
        return { isConflict: true, isShared: false, reason: 'Multiple Placement Rules Overlap' };
    }

    // 3. Budget Rules — ANY multiple active budget rules on the same campaign conflict!
    const isCurrentBudget = ['budget_increase', 'budget_decrease', 'budget_set', 'budget_hourly', 'budget_general'].includes(currentCat);
    const isOtherBudget = ['budget_increase', 'budget_decrease', 'budget_set', 'budget_hourly', 'budget_general'].includes(otherCat);
    if (isCurrentBudget && isOtherBudget) {
        if (
            (currentCat === 'budget_increase' && otherCat === 'budget_decrease') ||
            (currentCat === 'budget_decrease' && otherCat === 'budget_increase')
        ) {
            return { isConflict: true, isShared: false, reason: 'Opposing Budget Adjustments (Increase vs Decrease)' };
        }
        if (currentCat === 'budget_increase' && otherCat === 'budget_increase') {
            return { isConflict: true, isShared: false, reason: 'Compounding Budget Stacking (Multiple Increase Rules)' };
        }
        if (currentCat === 'budget_decrease' && otherCat === 'budget_decrease') {
            return { isConflict: true, isShared: false, reason: 'Compounding Budget Deflation (Multiple Decrease Rules)' };
        }
        if (currentCat === 'budget_set' || otherCat === 'budget_set') {
            return { isConflict: true, isShared: false, reason: 'Conflicting Budget Overwrite (Set Budget vs Other Rules)' };
        }
        if (currentCat === 'budget_hourly' && otherCat === 'budget_hourly') {
            return { isConflict: true, isShared: false, reason: 'Multiple Budget Dayparting Overlap (Time Slot Overwrite)' };
        }
        if (currentCat === 'budget_hourly' || otherCat === 'budget_hourly') {
            return { isConflict: true, isShared: false, reason: 'Hourly Budget vs Daily Budget Overlap' };
        }
        return { isConflict: true, isShared: false, reason: 'Multiple Budget Rules Overlap' };
    }

    // 4. Search Term Rules
    const isCurrentSearch = ['search_positive', 'search_negative'].includes(currentCat);
    const isOtherSearch = ['search_positive', 'search_negative'].includes(otherCat);
    if (isCurrentSearch && isOtherSearch) {
        if (
            (currentCat === 'search_positive' && otherCat === 'search_negative') ||
            (currentCat === 'search_negative' && otherCat === 'search_positive')
        ) {
            return { isConflict: true, isShared: false, reason: 'Opposing Search Term Action (Targeting vs Negative)' };
        }
        return { isConflict: false, isShared: true, reason: 'Compatible Search Term Rules' };
    }

    // 5. Cross-Domain Rules (e.g. Budget Rule + Targeting Rule) -> Safe / Independent
    return { isConflict: false, isShared: true, reason: 'Shared across non-conflicting domains' };
}

function RuleSearch({
    campaignList,
    allIds,
    setAllIds,
    campaignIds,
    selectAllCheck,
    setselectAllCheck,
    allRules = [],
    currentRuleId = null,
    currentRule = null,
}) {
    const { t } = useTranslation();
    const [searchData, setSearchData] = useState();
    const [type, setType] = useState('ENABLED');
    const [filterValue, setfilterValue] = useState('All');
    const [searchString, setsearchString] = useState("");
    let dispatch = useDispatch()
    const normalizedAllIds = allIds?.map(String) || [];

    // Map of campaignId -> { conflicts: [{ ruleId, ruleName, reason }], shared: [{ ruleId, ruleName, isInactive, reason }] }
    const campaignRuleAnalysisMap = useMemo(() => {
        const map = {};
        if (!Array.isArray(allRules) || allRules.length === 0) return map;

        const resolvedCurrentRule = currentRule || (currentRuleId ? allRules.find((r) => String(r._id) === String(currentRuleId)) : null);

        allRules.forEach((rule) => {
            if (!rule) return;
            const ruleId = rule._id ? String(rule._id) : null;
            // Ignore the rule currently being configured
            if (currentRuleId && ruleId === String(currentRuleId)) {
                return;
            }

            const cIds = extractRuleCampaignIds(rule);
            const rName = rule.ruleName || rule.name || t("Unnamed Rule");
            const conflictResult = evaluateRuleConflict(resolvedCurrentRule, rule);

            cIds.forEach((cId) => {
                const strId = String(cId);
                if (!map[strId]) {
                    map[strId] = { conflicts: [], shared: [] };
                }

                if (conflictResult.isConflict) {
                    if (!map[strId].conflicts.some((c) => c.ruleId === ruleId || c.ruleName === rName)) {
                        map[strId].conflicts.push({
                            ruleId,
                            ruleName: rName,
                            reason: conflictResult.reason,
                        });
                    }
                } else if (conflictResult.isShared) {
                    if (!map[strId].shared.some((s) => s.ruleId === ruleId || s.ruleName === rName)) {
                        map[strId].shared.push({
                            ruleId,
                            ruleName: rName,
                            isInactive: conflictResult.isInactive,
                            reason: conflictResult.reason,
                        });
                    }
                }
            });
        });
        return map;
    }, [allRules, currentRuleId, currentRule, t]);

    // Visible campaigns that have actual conflicts
    const visibleConflictedCampaigns = useMemo(() => {
        if (!searchData || searchData.length === 0) return [];
        return searchData.filter((campaign) => {
            const analysis = campaignRuleAnalysisMap[String(campaign.campaignId)];
            return Boolean(analysis && analysis.conflicts && analysis.conflicts.length > 0);
        });
    }, [searchData, campaignRuleAnalysisMap]);

    // Check if all visible conflicted campaigns are currently selected
    const isAllConflictedSelected = useMemo(() => {
        if (visibleConflictedCampaigns.length === 0) return false;
        const normalized = allIds?.map(String) || [];
        return visibleConflictedCampaigns.every((c) => normalized.includes(String(c.campaignId)));
    }, [visibleConflictedCampaigns, allIds]);

    // Toggle select / unselect all conflicted campaigns in current filtered view
    const handleToggleConflicted = (checked) => {
        let current = [...(allIds || [])];
        const conflictedIds = visibleConflictedCampaigns.map((c) => c.campaignId);

        if (checked) {
            const merged = [...new Set([...current, ...conflictedIds])];
            setAllIds(merged);
            if (searchData && searchData.length > 0) {
                const allSearchSelected = searchData.every((c) => merged.map(String).includes(String(c.campaignId)));
                setselectAllCheck(allSearchSelected);
            }
        } else {
            const conflictedStrIds = conflictedIds.map(String);
            const filtered = current.filter((id) => !conflictedStrIds.includes(String(id)));
            setAllIds(filtered);
            setselectAllCheck(false);
        }
    };

    //select all //

    const selectAllHandler = (e) => {

        dispatch(handleLoader(true));
        let arr = allIds || [];
        if (e.target.checked) {
            setselectAllCheck(true);

            searchData.forEach((el) => {
                arr.push(el.campaignId);
            });

            const uniqueArray = [...new Set(arr)];
            setAllIds(uniqueArray);
        } else {
            setselectAllCheck(false);
            setAllIds((prevIds) =>
                prevIds?.filter((id) => !searchData.map((el) => el.campaignId).includes(id))
            );
        }
        dispatch(handleLoader(false));
    };



    const campaignHandler = (e, id, index) => {

        let arr = [...allIds] || [];

        if (e.target.checked) {
            arr.push(id);

            const selectedCampaignIds = arr?.filter((id) =>
                searchData.some((campaign) => campaign.campaignId === id)
            );
            if (searchData.length !== 0) {
                setselectAllCheck(selectedCampaignIds?.length === searchData?.length);
            }
        } else {
            arr = allIds.filter((x) => x !== id);
            const selectedCampaignIds = arr?.filter((id) =>
                searchData?.some((campaign) => campaign.campaignId === id)
            );
            if (searchData.length !== 0) {
                setselectAllCheck(selectedCampaignIds?.length === searchData?.length);
            }
        }
        setAllIds(arr);
    };


    const handleChange = (e) => {
        setsearchString(e.target.value.trimStart());
    };

    useEffect(() => {
        setAllIds(campaignIds);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [campaignIds]);

    // Exclude archived campaigns entirely so they never appear in list or assignments
    const activeCampaignList = useMemo(() => {
        if (!Array.isArray(campaignList)) return [];
        return campaignList.filter(item => String(item?.status).toUpperCase() !== 'ARCHIVED');
    }, [campaignList]);

    useEffect(() => {
        dispatch(handleLoader(true));
        setSearchData(activeCampaignList);
        dispatch(handleLoader(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCampaignList]);



    const filterHandler = (val) => {

        setfilterValue(val)

    }


    const statusHandler = (e) => {


        setType(e.target.value)

    }


    useEffect(() => {

        let data = activeCampaignList;
        let finalData = []
        if (filterValue === 'All' && searchString.trim() === '' && type === 'All') {
            finalData = data
        }
        else if (filterValue === 'All' && searchString.trim() === '') {
            let findData = data.filter(item => item.status === type)
            finalData = findData

        }
        else {

            if (filterValue !== 'All' && searchString.trim() !== '') {
                let filteredData;
                let arr;
                filteredData = data.filter(x => x.type === filterValue)
                arr = filteredData?.filter((l) =>
                    l.name.toLowerCase().includes(searchString.trim().toLowerCase())
                );

                if (type === 'All') {

                    finalData = arr
                }
                else {
                    let findData = arr?.filter(item => item.status === type)
                    finalData = findData

                }

            }
            if (filterValue === 'All' && searchString.trim() !== '') {
                let arr = data?.filter((l) =>
                    l.name.toLowerCase().includes(searchString.trim().toLowerCase())
                );


                if (type === 'All') {
                    finalData = arr

                }
                else {
                    let findData = arr?.filter(item => item.status === type)
                    finalData = findData

                }

            }
            if (filterValue !== 'All' && searchString.trim() === '') {
                let filteredData = [];
                filteredData = data.filter(x => x.type === filterValue)
                if (type === 'All') {
                    finalData = filteredData

                }
                else {
                    let findData = filteredData?.filter(item => item.status === type)
                    finalData = findData

                }

            }



        }

        if (finalData?.length === allIds?.length) {
            setselectAllCheck(true)
        }
        else if (allIds?.length === data.length) {
            setselectAllCheck(true)
        }
        else {
            setselectAllCheck(false)
        }

        setSearchData(finalData)

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type, filterValue, searchString, activeCampaignList]);

    return (
        <>
            <div className='assign_campaign_detail'>
                <div>
                    <h6>{t("filterCampaignType")}: </h6>

                    <div className='filter_type'>
                        <Button variant="outline" onClick={() => filterHandler('All')} className={`${filterValue === 'All' ? 'active' : ''} filter_name mr-1 h-8`}  >{t("all")}</Button>
                        <Button variant="outline" onClick={() => filterHandler('Sponsored Products')} className={`${filterValue === 'Sponsored Products' ? 'active' : ''} filter_name mr-1 h-8`} >{t("products")}</Button>
                        <Button variant="outline" onClick={() => filterHandler('Sponsored Brands')} className={`${filterValue === 'Sponsored Brands' ? 'active' : ''} filter_name mr-1 h-8`} >{t("brands")}</Button>
                        <Button variant="outline" onClick={() => filterHandler('Sponsored Display')} className={`${filterValue === 'Sponsored Display' ? 'active' : ''} filter_name h-8`}>{t("display")}</Button>
                    </div>

                </div>

                <div className='mt-2 search_section'>
                    <h6>{t("searchCampaign")}: </h6>
                    <Input
                        type="text"
                        className='serach_text h-9'
                        value={searchString}
                        onChange={(e) => handleChange(e)}
                        placeholder={t("searchHere")}
                    />
                </div>

                <div className='campaign_list'>
                    {/* Information Note: Archived campaigns cannot be modified by Amazon Advertising */}
                    <div className="flex items-center gap-2 p-2.5 mb-2.5 rounded-lg border border-blue-300/40 bg-blue-50/80 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200 text-xs">
                        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>{t("Note: Archived campaigns cannot be modified by Amazon Advertising and are excluded from rule assignments.")}</span>
                    </div>

                    <div className='select_campaign'>
                        <div className="flex items-center">
                            <Checkbox
                                className="mr-2"
                                value={selectAllCheck}
                                checked={searchData?.length === 0 ? false : selectAllCheck}
                                onCheckedChange={(checked) => selectAllHandler({ target: { checked } })}
                            />
                            <label className="mb-0 text-[13px] font-semibold">{t("selectAllCampaign")}</label>
                        </div>
                        <div className='inner_filter flex items-center gap-2'>
                            <label className="mb-0 text-[13px] font-semibold">{t("Status")}: </label>
                            <Select onValueChange={(val) => statusHandler({ target: { value: val } })} value={type}>
                                <SelectTrigger className="w-[180px] h-9">
                                    <SelectValue placeholder={t("allCampaignStatus")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">{t("allCampaignStatus")}</SelectItem>
                                    <SelectItem value="ENABLED">{t("enabled")}</SelectItem>
                                    <SelectItem value="PAUSED">{t("paused")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="mb-0 text-[13px] font-semibold">{t("selectedCampaign")} : <b>{allIds?.length || 0} </b> </label>
                        </div>
                    </div>

                    {/* Conflict Warning Banner & Batch Select — shown only when true conflicting rules exist */}
                    {visibleConflictedCampaigns.length > 0 && (
                        <div className='flex items-center justify-between p-2.5 mb-2 rounded-lg border border-rose-300/50 bg-rose-50/80 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300'>
                            <div className="flex items-center gap-2 text-xs font-medium leading-tight">
                                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                                <span>{t("Multiple active rules with opposing actions (e.g., bid increase vs decrease) are assigned to the same campaigns.")}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-3 pl-3 border-l border-rose-300/60">
                                <Checkbox
                                    id="select-conflicted-checkbox"
                                    checked={isAllConflictedSelected}
                                    onCheckedChange={(checked) => handleToggleConflicted(Boolean(checked))}
                                />
                                <label
                                    htmlFor="select-conflicted-checkbox"
                                    className="mb-0 text-xs font-semibold cursor-pointer select-none text-rose-900 dark:text-rose-200"
                                >
                                    {t("Select Conflicted")} ({visibleConflictedCampaigns.length})
                                </label>
                            </div>
                        </div>
                    )}

                    <div className='list'>
                        {
                            searchData?.length === 0 ?
                                <h6 className='text-center pt-2'>{t("dateNotFound")}</h6>
                                :
                                <div className='search_list'>
                                    {

                                        searchData
                                            ?.sort((a, b) => {

                                                const aChecked = normalizedAllIds.includes(String(a.campaignId));
                                                const bChecked = normalizedAllIds.includes(String(b.campaignId));
                                                // Move checked items to the top
                                                if (aChecked && !bChecked) {
                                                    return -1;
                                                } else if (!aChecked && bChecked) {
                                                    return 1;
                                                }
                                                return 0;
                                            })
                                            .map((el, index) => {
                                                const campaignId = el.campaignId;
                                                const isChecked = allIds?.includes(campaignId);
                                                const analysis = campaignRuleAnalysisMap[String(campaignId)] || { conflicts: [], shared: [] };
                                                const isConflicted = analysis.conflicts && analysis.conflicts.length > 0;
                                                const hasShared = analysis.shared && analysis.shared.length > 0;

                                                const typeShort = el.type === "Sponsored Products" ? "SP" : el.type === "Sponsored Brands" ? "SB" : el.type === "Sponsored Display" ? "SD" : "Other";
                                                const typeColor = el.type === "Sponsored Products" ? "#0d6efd" : el.type === "Sponsored Brands" ? "#198754" : el.type === "Sponsored Display" ? "#fd7e14" : "#6c757d";

                                                return (
                                                    <div
                                                        className={`inner_list ${isConflicted ? 'conflicted_item' : ''}`}
                                                        key={campaignId}
                                                        onClick={(e) => {
                                                            if (e.target.type !== 'checkbox') {
                                                                const checkEvent = { target: { checked: !isChecked } };
                                                                campaignHandler(checkEvent, campaignId, index);
                                                            }
                                                        }}
                                                    >
                                                        <Checkbox
                                                            value={isChecked}
                                                            checked={isChecked}
                                                            onCheckedChange={(checked) => campaignHandler({ target: { checked } }, campaignId, index)}
                                                        />
                                                        <div className='flex items-center justify-between w-full pl-2 pr-1'>
                                                            <div className='flex flex-col min-w-0 pr-2'>
                                                                <p className='m-0 pl-2 truncate font-medium'>{el.name}</p>
                                                                {(isConflicted || hasShared) && (
                                                                    <div className='pl-2 flex items-center flex-wrap gap-1.5 mt-1'>
                                                                        {isConflicted && (
                                                                            <>
                                                                                <span className='text-[11px] font-semibold text-rose-600 dark:text-rose-400 shrink-0 flex items-center gap-1'>
                                                                                    <AlertTriangle className="w-3 h-3 text-rose-500" />
                                                                                    {t("Conflict with")}:
                                                                                </span>
                                                                                {analysis.conflicts.map((conf, cIdx) => (
                                                                                    <span
                                                                                        key={cIdx}
                                                                                        title={conf.reason}
                                                                                        className='inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25'
                                                                                    >
                                                                                        {conf.ruleName}
                                                                                    </span>
                                                                                ))}
                                                                            </>
                                                                        )}
                                                                        {hasShared && !isConflicted && (
                                                                            <>
                                                                                <span className='text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0'>
                                                                                    {t("Used in")}:
                                                                                </span>
                                                                                {analysis.shared.map((sh, sIdx) => (
                                                                                    <span
                                                                                        key={sIdx}
                                                                                        title={sh.reason}
                                                                                        className='inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20'
                                                                                    >
                                                                                        {sh.ruleName}{sh.isInactive ? ` (${t("Inactive")})` : ''}
                                                                                    </span>
                                                                                ))}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span style={{
                                                                fontSize: '10px',
                                                                fontWeight: '700',
                                                                color: typeColor,
                                                                background: `${typeColor}15`,
                                                                border: `1px solid ${typeColor}30`,
                                                                borderRadius: '4px',
                                                                padding: '1px 6px',
                                                                textTransform: 'uppercase',
                                                                letterSpacing: '0.4px',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                {typeShort}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                    }

                                </div>
                        }
                    </div>
                </div>
            </div>
        </>
    )
}

export default RuleSearch