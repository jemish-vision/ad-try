

import { ROLES } from "../../common/constants";

const isViewAbleOnly = ["View Only", "Details View Only"]

function PermissionCheck(page, type) {
    let pagePermission = [];
    try {
        const cached = localStorage.getItem("permission");
        if (cached) {
            pagePermission = JSON.parse(cached);
        }
    } catch (e) { }

    const role = localStorage.getItem("role");
    const loginUser = localStorage.getItem("loginUser") === "true";
    const isPlanActive = localStorage.getItem("isPlanActive") === "true";

    const campaignsPage = pagePermission?.find(item => item.pageName === page)?.allocatedActions;
    const subCondition = campaignsPage?.find(action => action.actionType === type)?.status;

    if (role === ROLES.SUPER_ADMIN) return true;
    if (loginUser && !isPlanActive) return isViewAbleOnly?.includes(type);

    return subCondition;
}

export { PermissionCheck }