import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/placement/`
const authToken = localStorage.getItem('sellerToken')
const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
};

const ApicreateRule = (data) => {
    return axios.post(`${api}createRule`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiupdateRule = (id, data) => {
    return axios.post(`${api}updateRule/${id}`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApideleteRule = (id) => {
    return axios.delete(`${api}deleteRule/${id}`, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApistatusChange = (data) => {
    return axios.post(`${api}changeStatus`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApigetRule = (data, options = {}) => {
    return axios.post(`${api}getPlacementRules`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
        .then(res => res.data).catch(res => res.data)
}

const ApiRuleConditions = (id) => {
    return axios.get(`${api}getRule/${id}`, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiManualRun = (id, data) => {
    return axios.post(`${api}manualRunPlacementRule/${id}`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiRuleEffectedPlacements = (id) => {
    return axios.get(`${api}ruleEffectedPlacement/${id}`, { headers })
        .then((res) => res.data).catch((res) => res.data);
};

const ApiRuleHistory = (data) => {
    return axios.post(`${api}ruleHistory`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiRevertRuleHistory = (data) => {
    return axios.post(`${api}ruleReverted`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiExportBidPlacementRule = (data) => {
    return axios.post(`${api}exportBidPlacementRule`, data, { headers, responseType: "blob" })
    // .then(res => res.data).catch(res => res.data)
}

const ApiImportBidPlacementRule = (data) => {
    return axios.post(`${api}importBidPlacementRule`, data, { headers: { ...headers, "Content-Type": "multipart/form-data" } })
        .then(res => res.data).catch(res => res.data)
}

export { ApicreateRule, ApigetRule, ApiRuleConditions, ApideleteRule, ApiupdateRule, ApistatusChange, ApiManualRun, ApiRuleEffectedPlacements, ApiRuleHistory, ApiRevertRuleHistory, ApiExportBidPlacementRule, ApiImportBidPlacementRule };