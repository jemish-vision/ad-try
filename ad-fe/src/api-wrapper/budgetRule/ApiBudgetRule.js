import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/budgetRule/`
const authToken = localStorage.getItem('sellerToken')
const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
};

const ApicreateRule = (data) => {
    return axios.post(`${api}createRule`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApigetRule = (data) => {
    return axios.post(`${api}getBudgetRules`, data, { headers, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiRuleHistory = (data) => {
    return axios.post(`${api}ruleHistory`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiRevertRuleHistory = (data) => {
    return axios.post(`${api}ruleReverted`, data, { headers })
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

const ApiRuleConditions = (id) => {
    return axios.get(`${api}getRule/${id}`, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiupdateRule = (id, data) => {
    return axios.post(`${api}updateRule/${id}`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}


const ApigetCampaign = (data) => {
    return axios.post(`${api}getCampaignsName`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiRun = (id, data) => {
    return axios.post(`${api}manualRun/${id}`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiRuleEffectedBudgets = (id) => {
    return axios.get(`${api}ruleEffectedBudget/${id}`, { headers })
        .then((res) => res.data).catch((res) => res.data);
};

const ApiExportBudgetRule = (data) => {
    return axios.post(`${api}exportBudgetRule`, data, { headers, responseType: "blob" })
    // .then(res => res.data).catch(res => res.data)
}

const ApiImportBudgetRule = (data) => {
    return axios.post(`${api}importBudgetRule`, data, { headers: { ...headers, "Content-Type": "multipart/form-data" } })
        .then(res => res.data).catch(res => res.data)
}

export { ApiRun, ApicreateRule, ApigetRule, ApiRuleConditions, ApideleteRule, ApiupdateRule, ApigetCampaign, ApistatusChange, ApiRuleHistory, ApiRevertRuleHistory, ApiRuleEffectedBudgets, ApiExportBudgetRule, ApiImportBudgetRule };

