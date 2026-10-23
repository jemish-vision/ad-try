import axios from "axios";

const apiRuleBlockedTime = `${process.env.REACT_APP_API_BASE}/api/rule-blocked-time/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiRuleBlockedTimeList = (data, skip = false) => {
  const reqHeaders = skip ? { ...headers, 'x-skip-loader': true } : headers;
  return axios.post(`${apiRuleBlockedTime}get-all-rule-blocked-times`, data, { headers: reqHeaders, skipLoader: skip })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCreateRuleBlockedTime = (data) => {
  return axios.post(`${apiRuleBlockedTime}createRuleBlockedTime`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdateRuleBlockedTime = (data) => {
  return axios.post(`${apiRuleBlockedTime}updateRuleBlockedTime`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiDeleteRuleBlockedTime = (data) => {
  return axios.post(`${apiRuleBlockedTime}deleteRuleBlockedTime`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export {
  ApiRuleBlockedTimeList,
  ApiCreateRuleBlockedTime,
  ApiUpdateRuleBlockedTime,
  ApiDeleteRuleBlockedTime,
};