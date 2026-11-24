export function getProposedBid(current, action) {
    if (!action || !Number.isFinite(current)) return null;
    const amount = Number(action.actionValue);
    if (!Number.isFinite(amount)) return null;
    const change = action.actionValueType === "Percentage" ? current * amount / 100 : amount;
    if (action.actionName === "IncreaseBid") return current + change;
    if (action.actionName === "DecreaseBid") return Math.max(0, current - change);
    return amount;
}

export function isBelowMarketplaceBid(item, actions, minimumBid) {
    if (minimumBid == null) return false;
    const current = parseFloat(item.targetingBid ?? item.keywordBid ?? item.bid);
    const action = actions.find(({ actionName }) => ["IncreaseBid", "DecreaseBid", "SetBid"].includes(actionName));
    const proposed = getProposedBid(current, action);
    return proposed != null && Number(proposed.toFixed(2)) < minimumBid;
}
