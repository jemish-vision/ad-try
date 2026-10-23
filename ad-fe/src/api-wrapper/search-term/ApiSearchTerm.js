import axios from "axios";

const searchTermapi = `${process.env.REACT_APP_API_BASE}/api/search-term/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiSearchTermCampaign = (profileId, data) => {
  return axios
    .post(`${searchTermapi}getSearchTermIdData/${profileId}`, data, { headers: { ...headers, "x-skip-loader": true }, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetAllSearchTerms = (data) => {
  return axios
    .post(`${searchTermapi}getAllSearchTerms`, data, { headers, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetSearchTermsProductView = (data) => {
  return axios
    .post(`${searchTermapi}getSearchTermsProductView`, data, { headers, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiAddToNegative = (data) => {
  return axios
    .post(`${searchTermapi}addToNegative`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiAddToNegativeProduct = (data) => {
  return axios
    .post(`${searchTermapi}addToNegativeProduct`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiAddNegativeToCampaign = (data) => {
  return axios
    .post(`${searchTermapi}addNegativeToCampaign`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiRuleHistory = (data) => {
  return axios.post(`${searchTermapi}ruleHistory`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then(res => res.data).catch(res => res.data)
}

const ApiCreateSearchTermRule = (data) => {
  return axios.post(`${searchTermapi}createSearchTermRule`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiUpdateSearchTermRule = (id, data) => {
  return axios.post(`${searchTermapi}updateSearchTermRule/${id}`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiGetSearchTermRule = (data) => {
  return axios.post(`${searchTermapi}getSearchTermRule`, data, { headers, skipLoader: true })
    .then(res => res.data).catch(res => res.data)
}

const ApiDeleteSearchTermRule = (id) => {
  return axios.delete(`${searchTermapi}deleteSearchTermRule/${id}`, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiChangeSearchTermRuleStatus = (data) => {
  return axios.post(`${searchTermapi}changeSearchTermRuleStatus`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiGetSearchTermRuleById = (id) => {
  return axios.get(`${searchTermapi}getSearchTermRule/${id}`, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiRuleEffectedSearchTerms = (id) => {
  return axios.get(`${searchTermapi}ruleEffectedSearchTerm/${id}`, { headers })
    .then((res) => res.data).catch((res) => res.data);
};

const ApiManualRunSearchTermRule = (data) => {
  return axios.post(`${searchTermapi}manualRunSearchTermRule`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiKeywordAnalysis = (data) => {
  return axios.post(`${searchTermapi}keywordAnalysis`, data, { headers, skipLoader: true })
    .then(res => res.data).catch(res => res.data)
}

const ApiExportSearchTermRule = (data) => {
  return axios.post(`${searchTermapi}exportSearchTermRule`, data, { headers, responseType: "blob" })
}

const ApiImportSearchTermRule = (data) => {
  return axios.post(`${searchTermapi}importSearchTermRule`, data, { headers: { ...headers, "Content-Type": "multipart/form-data" } })
    .then(res => res.data).catch(res => res.data)
}

export { ApiSearchTermCampaign, ApiGetAllSearchTerms, ApiGetSearchTermsProductView, ApiAddToNegative, ApiAddToNegativeProduct, ApiAddNegativeToCampaign, ApiRuleHistory, ApiCreateSearchTermRule, ApiUpdateSearchTermRule, ApiGetSearchTermRule, ApiDeleteSearchTermRule, ApiChangeSearchTermRuleStatus, ApiGetSearchTermRuleById, ApiRuleEffectedSearchTerms, ApiManualRunSearchTermRule, ApiKeywordAnalysis, ApiExportSearchTermRule, ApiImportSearchTermRule };
