import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/recommendation/`
const authToken = localStorage.getItem('sellerToken')
const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
};

const ApiGetRules = (data) => {
    return axios.post(`${api}getRules`, data, { headers, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetRuleById = (id, data) => {
    return axios.post(`${api}getRuleById/${id}`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiUpdateRules = (id, data) => {
    return axios.post(`${api}updateRules/${id}`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiAddRules = (data) => {
    return axios.post(`${api}addRules`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiStatusChange = (data) => {
    return axios.post(`${api}statusChange`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiDeleteRule = (id) => {
    return axios.post(`${api}deleteRule/${id}`, {}, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetRecommendation = (data) => {
    return axios.post(`${api}getRecommendation`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetTotalRecommendationCount = (data) => {
    return axios.post(`${api}getTotalRecommendationCount`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetRecommendationData = (id, data) => {
    return axios.post(`${api}getRecommendationData/${id}`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiDeleteRecommendation = (id, data) => {
    return axios.post(`${api}deleteRecommendation/${id}`, data, { headers, timeout: 120000 })
        .then(res => res.data).catch(res => res.data)
}

const ApiApplyRuleRecommendation = (id, data, options = {}) => {
    return axios.post(`${api}applyRuleRecommendation/${id}`, data, {
        headers: { ...headers, ...(options.headers || {}) },
        timeout: 180000,
    })
        .then(res => res.data).catch(res => res.data)
}

const ApiExportRecommandationRule = (data) => {
    return axios.post(`${api}exportRecommandationRule`, data, { headers, responseType: "blob" })
    // .then(res => res.data).catch(res => res.data)
}

const ApiImportRecommandationRule = (data) => {
    return axios.post(`${api}importRecommandationRule`, data, { headers: { ...headers, "Content-Type": "multipart/form-data" } })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetRecommendationsHub = (data) => {
    const dashboardApi = `${process.env.REACT_APP_API_BASE}/api/dashboard/`;
    return axios.post(`${dashboardApi}recommendations-hub`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data);
};

export {
    ApiGetRules,
    ApiGetRuleById,
    ApiUpdateRules,
    ApiAddRules,
    ApiStatusChange,
    ApiDeleteRule,

    ApiGetRecommendation,
    ApiGetTotalRecommendationCount,
    ApiGetRecommendationData,
    ApiDeleteRecommendation,

    ApiApplyRuleRecommendation,

    ApiExportRecommandationRule,
    ApiImportRecommandationRule,
    ApiGetRecommendationsHub,
};

