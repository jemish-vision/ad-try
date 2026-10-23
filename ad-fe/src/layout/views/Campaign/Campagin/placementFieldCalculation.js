function clamp(value, min, max) {
    if (typeof value !== "number" || isNaN(value)) return 0;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

const findAcos = (records, givenValue) => {
    if (!Array.isArray(records)) return 0;
    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (record.from <= givenValue && givenValue <= record.to) {
            return record.Acos;
        }
    }
    return 0;
};

const toNumber = (val, fallback = 0) => {
    const num = Number(val);
    return Number.isFinite(num) ? num : fallback;
};

const getTargetCPC = ({
    totalSales = 0,
    totalUnits = 0,
    totalClicks = 0,
    cvr = 0,
    oldCPC = 0,
    targetAcos = 0,
    aov = 0,
    minTargetCPC = 0,
    maxTargetCPC = 1000,
}) => {
    let finalVal = 0;

    // Step 2 – Conditional Logic
    if (totalUnits === 0 && totalClicks >= 4) {
        // No orders, but enough clicks
        finalVal = (1 / (totalClicks + 1)) * aov * (targetAcos / 100);
    } else if (totalSales === 0 && totalClicks < 4) {
        // Very few clicks, no sales
        finalVal = (aov / (totalClicks + 1)) * (targetAcos / 100);
    } else if (totalUnits <= 3 && cvr >= 50) {
        // Few orders but strong CVR
        finalVal = oldCPC + oldCPC * 0.5;
    } else {
        // Default condition
        finalVal = totalClicks > 0 ? (totalSales / totalClicks) * (targetAcos / 100) : 0;
    }

    // Step 3 – Apply range limits
    const targetCPC = Math.min(Math.max(finalVal, minTargetCPC), maxTargetCPC);
    return Number(targetCPC.toFixed(2));
};

const getBestCPC = ({
    targetCPC,
    bestCVRCPC,
    targetCVRCPC,
    isBest,
}) => {
    let bestCPC;
    if (isBest) {
        bestCPC = targetCVRCPC === 1 ? targetCPC : bestCVRCPC;
    } else {
        bestCPC = targetCPC;
    }

    return {
        bestCPC: Number(bestCPC.toFixed(2)),
    };
};

const calculateLimitedCPC = ({
    targetCPCAmazon,
    targetCPC,
    increaseBid = 0,
    decreaseBid = 0,
    minTargetCPC,
    maxTargetCPC,
}) => {
    let limitedCPC;

    if (targetCPCAmazon <= targetCPC) {
        limitedCPC = Math.min(targetCPCAmazon * (1 + increaseBid / 100), targetCPC);
    } else {
        limitedCPC = Math.max(targetCPCAmazon * (1 - decreaseBid / 100), targetCPC);
    }

    limitedCPC = Math.min(Math.max(limitedCPC, minTargetCPC), maxTargetCPC);
    return Number(limitedCPC.toFixed(2));
};

const placementFieldCalculation = ({ data, placementData, bestArr }) => {
    if (!Array.isArray(data) || data.length === 0) return [];

    const defaultTargetAcosList = placementData?.defaultTargetAcos || [];
    const fallbackTargetRecord = defaultTargetAcosList.find((item) => item.type === "All other") || null;
    const aovDataList = placementData?.getAOVData || [];
    const fallbackAOV = aovDataList.find((item) => item.campaignName === "All")?.value ?? 0;
    const bestSet = new Set(Array.isArray(bestArr) ? bestArr : []);
    const limitedCPCConditions = placementData?.limitedCPCValue?.conditions || [];
    const minTargetCPC = placementData?.minTargetCPC ?? 0;
    const maxTargetCPC = placementData?.maxTargetCPC ?? 1000;
    const campaginTargetAcos = placementData?.campaginTargetAcos;

    const result = new Array(data.length);

    for (let i = 0; i < data.length; i++) {
        const cam = data[i];
        const camName = cam?.name || "";
        const isBestCampaign = bestSet.has(cam?.campaignId);

        // Find default target record for campaign
        let findRecord = null;
        for (let j = 0; j < defaultTargetAcosList.length; j++) {
            if (defaultTargetAcosList[j]?.type && camName.includes(defaultTargetAcosList[j].type)) {
                findRecord = defaultTargetAcosList[j];
                break;
            }
        }
        if (!findRecord) {
            findRecord = fallbackTargetRecord;
        }

        // Find campaign specific AOV
        let specificAOV = null;
        for (let j = 0; j < aovDataList.length; j++) {
            if (aovDataList[j]?.campaignName && camName.includes(aovDataList[j].campaignName)) {
                specificAOV = aovDataList[j].value;
                break;
            }
        }
        const campaignAOV = cam?.orders === 0 ? (specificAOV ?? fallbackAOV) : (cam?.orders ? cam.sales / cam.orders : 0);

        const placementsRaw = cam?.placements || [];
        const rawLen = placementsRaw.length;
        const placementsStage1 = new Array(rawLen);

        for (let pIdx = 0; pIdx < rawLen; pIdx++) {
            const dataP = placementsRaw[pIdx];
            const placementType = dataP?.placement;

            let defaultRecord = null;
            let dynamicTarget = false;
            let targetAcos = 0;

            if (placementType === "Top of Search") {
                defaultRecord = findRecord?.dynamicTOStargetAcos;
                dynamicTarget = findRecord?.dynamicTOSTarget;
            } else if (placementType === "Rest of Search") {
                defaultRecord = findRecord?.dynamicROStargetAcos;
                dynamicTarget = findRecord?.dynamicROSTarget;
            } else {
                defaultRecord = findRecord?.dynamicPPtargetAcos;
                dynamicTarget = findRecord?.dynamicPPTarget;
            }

            if (dynamicTarget) {
                targetAcos = findAcos(defaultRecord, dataP?.cvr);
            } else {
                if (pIdx === 0) {
                    targetAcos = findRecord?.TOStargetAcos ?? 0;
                } else if (pIdx === 1) {
                    targetAcos = findRecord?.ROStargetAcos ?? 0;
                } else if (pIdx === 2) {
                    targetAcos = findRecord?.PPtargetAcos ?? 0;
                }
            }

            const pOrders = dataP?.orders || 0;
            const pSales = dataP?.sales || 0;
            const pClicks = dataP?.clicks || 0;
            const pCvr = dataP?.cvr || 0;
            const pAcos = dataP?.acos || 0;
            const pCpc = dataP?.cpc || 0;

            const aov = pOrders === 0 ? (specificAOV ?? fallbackAOV) : (pSales / pOrders);
            const targetCVRCPC = (targetAcos * aov * pCvr) / 100;
            const bestCVRCPC = (pAcos * aov * pCvr) / 100;

            const kwBid = cam?.keywordBid || 0;
            const targetCPCAmazon = kwBid + (kwBid * toNumber(dataP?.placementModifier)) / 100;

            const targetCPC = getTargetCPC({
                totalSales: pSales,
                totalUnits: pOrders,
                totalClicks: pClicks,
                cvr: pCvr,
                oldCPC: pCpc,
                targetAcos: targetAcos || 0,
                aov,
                minTargetCPC,
                maxTargetCPC,
            });

            const { bestCPC } = getBestCPC({
                targetCPC,
                bestCVRCPC: bestCVRCPC || 0,
                targetCVRCPC: targetCVRCPC || 0,
                isBest: isBestCampaign,
            });

            let incBid = 0;
            let decBid = 0;
            for (let cIdx = 0; cIdx < limitedCPCConditions.length; cIdx++) {
                const cond = limitedCPCConditions[cIdx];
                if (pAcos >= cond.from && pAcos <= cond.to) {
                    incBid = cond.increaseBid || 0;
                    decBid = cond.decreaseBid || 0;
                    break;
                }
            }

            const limitedCPC = calculateLimitedCPC({
                targetCPCAmazon,
                targetCPC,
                increaseBid: incBid,
                decreaseBid: decBid,
                minTargetCPC,
                maxTargetCPC,
            });

            placementsStage1[pIdx] = {
                ...dataP,
                targetACOS: targetAcos,
                targetCPCAmazon,
                targetCPC,
                bestCPC,
                limitedCPC,
                bidAdjustment: dataP?.keywordBid,
                defaultRecord,
                dynamicTarget,
            };
        }

        // Finalize placement calculations (stage 2 combined inline)
        const toptargetCPC = Number(placementsStage1[0]?.limitedCPC) || 0;
        const rostargetCPC = Number(placementsStage1[1]?.limitedCPC) || 0;
        const pptargetCPC = Number(placementsStage1[2]?.limitedCPC) || 0;

        let getLowestValue = Math.min(toptargetCPC, pptargetCPC, rostargetCPC);

        const finalPlacements = new Array(rawLen);
        for (let pIdx = 0; pIdx < rawLen; pIdx++) {
            const dataP = placementsStage1[pIdx];
            let effectiveLowest = getLowestValue;
            if (effectiveLowest === 0) {
                effectiveLowest = dataP?.keywordBid;
            }
            const limitedCPC = toNumber(dataP?.limitedCPC);
            const lowestValue = toNumber(effectiveLowest, 1);

            finalPlacements[pIdx] = {
                ...dataP,
                deltaACOS: Number((dataP?.acos ?? 0) - (dataP?.targetACOS ?? 0)).toFixed(2) ?? "0.00",
                newbidAdjustment: toNumber(clamp(((limitedCPC / lowestValue - 1) * 100), 0, 900))
            };
        }

        const resolvedTargetACOS = cam?.targetAcos ?? campaginTargetAcos;
        const minLimitedCPC = rawLen === 0 ? 0 : Math.min(...finalPlacements.map((p) => Number(p?.limitedCPC) || 0));

        result[i] = {
            ...cam,
            targetACOS: resolvedTargetACOS,
            deltaACOS: Number((cam?.acos ?? 0) - (resolvedTargetACOS ?? 0)).toFixed(2) ?? "0.00",
            newbidAdjustment: minLimitedCPC ?? 0,
            placements: finalPlacements,
        };
    }

    return result;
};

export default placementFieldCalculation;