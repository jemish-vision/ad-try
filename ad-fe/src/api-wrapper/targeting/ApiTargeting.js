import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/targeting/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};


const ApiTargetingListing = (data, options = {}) => {
  return axios
    .post(`${api}getTargeting`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetTargetingByCampaigns = (data) => {
  return axios
    .post(`${api}getTargetingByCampaigns`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCreateKeywords = (data) => {
  return axios
    .post(`${api}createKeywords`, data, { headers: { ...headers, Authorization: `Bearer ${localStorage.getItem("sellerToken")}` } })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

const ApiAdjustBids = (data) => {
  return axios
    .post(`${api}adjustBid`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiRuleHistory = (data) => {
  return axios.post(`${api}ruleHistory`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then(res => res.data).catch(res => res.data)
}

const ApiRevertRuleHistory = (data) => {
  return axios.post(`${api}ruleReverted`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiCreateTargetingRule = (data) => {
  return axios.post(`${api}createTargetingRule`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiUpdateTargetingRule = (id, data) => {
  return axios.post(`${api}updateTargetingRule/${id}`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiGetTargetingRule = (data, options = {}) => {
  return axios.post(`${api}getTargetingRule`, data, { headers, ...options })
    .then(res => res.data).catch(res => res.data)
}

const ApiDeleteTargetingRule = (id) => {
  return axios.delete(`${api}deleteTargetingRule/${id}`, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiChangeTargetingRuleStatus = (data) => {
  return axios.post(`${api}changeTargetingRuleStatus`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiGetTargetingRuleById = (id) => {
  return axios.get(`${api}getTargetingRule/${id}`, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiManualRunTargetingRule = (id, data) => {
  return axios.post(`${api}manualRunTargetingRule/${id}`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiRuleEffectedTargeting = (id) => {
  return axios.get(`${api}ruleEffectedTargeting/${id}`, { headers })
    .then((res) => res.data).catch((res) => res.data);
};

const ApiStatusChange = (data) => {
  return axios
    .post(`${api}/changeStatus`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiTargetingChartListing = (data) => {
  return axios
    .post(`${api}getTargetingChartData`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiLifeTimeMatrixListing = (data) => {
  return axios.post(`${api}getLifeTimeTargetingMatrix`, data, { headers, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiTargetingKeywordDetails = (data) => {
  return axios.post(`${api}getTargetingKeywordDetails`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiExportTargetingRule = (data) => {
  return axios.post(`${api}exportTargetingRule`, data, { headers, responseType: "blob" })
}

const ApiImportTargetingRule = (data) => {
  return axios.post(`${api}importTargetingRule`, data, { headers: { ...headers, "Content-Type": "multipart/form-data" } })
    .then(res => res.data).catch(res => res.data)
}

const ApiGetKeywordSuggestions = (data, options = {}) => {
  return axios.post(`${api}getKeywordSuggestions`, data, { headers, skipLoader: true, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetKeywordUniqueFilterValues = (data) => {
  return axios.post(`${api}getKeywordUniqueFilterValues`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetSuggestedTargetingBid = (data) => {
  const searchTermApi = `${process.env.REACT_APP_API_BASE}/api/search-term/suggestedTargetingBid`;
  return axios.post(searchTermApi, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiAddTargetings = (data) => {
  const amazonApi = `${process.env.REACT_APP_API_BASE}/api/amazon/addTargetings`;
  return axios.post(amazonApi, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiAddNegativeTargetings = (data) => {
  const amazonApi = `${process.env.REACT_APP_API_BASE}/api/amazon/addNegativeTargetings`;
  return axios.post(amazonApi, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiRemoveSearchTerm = (data) => {
  const searchTermApi = `${process.env.REACT_APP_API_BASE}/api/search-term/removeSearchTerm`;
  return axios.post(searchTermApi, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetTargetingHistory = (data) => {
  return axios
    .post(`${api}getTargetingHistory`, data, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("sellerToken")}`,
        "Content-Type": "application/json",
      },
    })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export {
  ApiTargetingListing,
  ApiAdjustBids,
  ApiStatusChange,
  ApiRuleHistory,
  ApiRevertRuleHistory,
  ApiCreateTargetingRule,
  ApiUpdateTargetingRule,
  ApiGetTargetingRule,
  ApiGetTargetingRuleById,
  ApiDeleteTargetingRule,
  ApiChangeTargetingRuleStatus,
  ApiManualRunTargetingRule,
  ApiRuleEffectedTargeting,
  ApiTargetingChartListing,
  ApiLifeTimeMatrixListing,
  ApiTargetingKeywordDetails,
  ApiExportTargetingRule,
  ApiImportTargetingRule,
  ApiGetKeywordSuggestions,
  ApiGetKeywordUniqueFilterValues,
  ApiGetSuggestedTargetingBid,
  ApiAddTargetings,
  ApiAddNegativeTargetings,
  ApiRemoveSearchTerm,
  ApiGetTargetingByCampaigns,
  ApiCreateKeywords,
  ApiGetTargetingHistory
};
