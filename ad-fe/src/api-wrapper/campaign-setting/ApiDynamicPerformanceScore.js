import axios from "axios";

const apiRuleBlockedTime = `${process.env.REACT_APP_API_BASE}/api/performance-score/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiGetAllPerformanceScoreSetting = (data, options = {}) => {
  return axios.post(`${apiRuleBlockedTime}getAllPerformanceScoreSetting`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCreatePerformanceScoreSetting = (data) => {
  return axios.post(`${apiRuleBlockedTime}createPerformanceScoreSetting`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdatePerformanceScoreSetting = (data) => {
  return axios.post(`${apiRuleBlockedTime}updatePerformanceScoreSetting`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiDeletePerformanceScoreSetting = (data) => {
  return axios.post(`${apiRuleBlockedTime}deletePerformanceScoreSetting`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export {
  ApiGetAllPerformanceScoreSetting,
  ApiCreatePerformanceScoreSetting,
  ApiUpdatePerformanceScoreSetting,
  ApiDeletePerformanceScoreSetting,
};