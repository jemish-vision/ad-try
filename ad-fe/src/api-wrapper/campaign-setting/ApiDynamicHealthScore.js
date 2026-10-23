import axios from "axios";

const apiRuleBlockedTime = `${process.env.REACT_APP_API_BASE}/api/health-score/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiGetAllHealthScoreSetting = (data, options = {}) => {
  return axios.post(`${apiRuleBlockedTime}getAllHealthScoreSetting`, data, { headers, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCreateHealthScoreSetting = (data) => {
  return axios.post(`${apiRuleBlockedTime}createHealthScoreSetting`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdateHealthScoreSetting = (data) => {
  return axios.post(`${apiRuleBlockedTime}updateHealthScoreSetting`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiDeleteHealthScoreSetting = (data) => {
  return axios.post(`${apiRuleBlockedTime}deleteHealthScoreSetting`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export {
  ApiGetAllHealthScoreSetting,
  ApiCreateHealthScoreSetting,
  ApiUpdateHealthScoreSetting,
  ApiDeleteHealthScoreSetting,
};