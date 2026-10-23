import axios from "axios";

const apiCustomer = `${process.env.REACT_APP_API_BASE}/api/customer/`;
const apiConfig = `${process.env.REACT_APP_API_BASE}/api/config/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiConfigList = (data, skip = false) => {
  const reqHeaders = skip ? { ...headers, 'x-skip-loader': true } : headers;
  return axios.post(`${apiCustomer}get-all-config`, data, { headers: reqHeaders, skipLoader: skip })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiSellerConfigList = (data, skip = false) => {
  const reqHeaders = skip ? { ...headers, 'x-skip-loader': true } : headers;
  return axios.post(`${apiCustomer}get-all-sellerConfig`, data, { headers: reqHeaders, skipLoader: skip })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiAmazonAuthConfig = (data) => {
  return axios.post(`${apiConfig}amazonRedirect`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiDisconnectAmazonConfig = (data) => {
  return axios.post(`${apiConfig}amazonDisconnect`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiAmazonSPAuthConfig = (data) => {
  return axios.post(`${apiConfig}amazonSPRedirect`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiAmazonSPRefreshToken = (data) => {
  return axios.post(`${apiConfig}amazonSPRefreshToken`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiDisconnectSPAmazonConfig = (data) => {
  return axios.post(`${apiConfig}amazonSPDisconnect`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiManageSubscribeAMS = (data) => {
  return axios.post(`${apiConfig}manageSubscribeAMS`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiStartDataSync = (data) => {
  return axios.post(`${apiConfig}syncLast30Days`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetAllMarketplaces = (options = {}) => {
  return axios.get(`${apiConfig}getAllMarketplaces`, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetRuleSettings = (data) => {
  return axios.post(`${apiConfig}getRuleSettings`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiSaveRuleSettings = (data) => {
  return axios.post(`${apiConfig}saveRuleSettings`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiGetAmazonProfiles = (data) => {
  return axios.get(`${apiConfig}getAmazonProfiles?configId=${data.configId}`, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiSaveAmazonProfiles = (data) => {
  return axios.post(`${apiConfig}saveAmazonProfiles`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiGetReportDetails = () => {
  return axios.get(`${apiConfig}getReportDetails`, { headers })
    .then(res => res.data).catch(res => res.data);
};

const ApiGetCoreGroups = (params) => {
  return axios.get(`${apiConfig}getCoreGroups`, { headers, params })
    .then(res => res.data).catch(res => res.data);
};

const ApiSaveSynchronizationDetails = (data) => {
  return axios.post(`${apiConfig}saveSynchronizationDetails`, data, { headers })
    .then(res => res.data).catch(res => res.data);
};

const ApiGetRetentionDays = () => {
  return axios.get(`${apiConfig}getRetentionDays`, { headers })
    .then(res => res.data).catch(res => res.data);
};

const ApiGetSyncRequests = () => {
  return axios.get(`${apiConfig}getSyncRequests`, { headers })
    .then(res => res.data).catch(res => res.data);
};

const ApiExecuteSync = (data) => {
  return axios.post(`${apiConfig}executeSync`, data, { headers })
    .then(res => res.data).catch(res => res.data);
};

const ApiGetProfileSyncDetails = (configId) => {
  return axios.get(`${apiConfig}getProfileSyncDetails?configId=${configId}`, { headers })
    .then(res => res.data).catch(res => res.data);
};

const ApiUpdateProfileSyncSettings = (data) => {
  return axios.post(`${apiConfig}updateProfileSyncSettings`, data, { headers })
    .then(res => res.data).catch(res => res.data);
};

const ApiInitiateAmazonSellerAuth = (data) => {
  const token = localStorage.getItem("sellerToken");
  const reqHeaders = {
    ...headers,
    Authorization: `Bearer ${token}`
  };
  return axios.post(`${apiConfig}initiateAmazonSellerAuth`, data, { headers: reqHeaders })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiLinkExistingSellerConfig = (data) => {
  return axios.post(`${apiConfig}linkExistingSellerConfig`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiConfirmDeactivateProfile = (data) => {
  return axios.post(`${apiConfig}confirmDeactivateProfile`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export {
  ApiConfigList, ApiSellerConfigList, ApiAmazonAuthConfig,
  ApiDisconnectAmazonConfig, ApiAmazonSPAuthConfig, ApiAmazonSPRefreshToken,
  ApiDisconnectSPAmazonConfig, ApiManageSubscribeAMS, ApiStartDataSync,
  ApiGetAllMarketplaces,
  ApiGetRuleSettings,
  ApiSaveRuleSettings,
  ApiGetAmazonProfiles,
  ApiSaveAmazonProfiles,
  ApiGetReportDetails,
  ApiGetCoreGroups,
  ApiSaveSynchronizationDetails,
  ApiGetRetentionDays,
  ApiGetSyncRequests,
  ApiExecuteSync,
  ApiGetProfileSyncDetails,
  ApiUpdateProfileSyncSettings,
  ApiInitiateAmazonSellerAuth,
  ApiLinkExistingSellerConfig,
  ApiConfirmDeactivateProfile,
};



