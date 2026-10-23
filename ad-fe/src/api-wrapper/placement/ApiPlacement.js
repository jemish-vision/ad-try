import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/placement/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiUpdatePlacementBid = (data) => {
  return axios
    .post(`${api}updatePlacementBid`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdatePlacementBidInDB = (data) => {
  return axios
    .post(`${api}saveInDB`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdatePlacementBidApplyInAmazon = (data) => {
  return axios
    .post(`${api}applyInAmazon`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetAllPlacements = (data, options = {}) => {
  const mergedHeaders = options.headers ? { ...headers, ...options.headers } : { ...headers };
  if (options.skipLoader) {
    mergedHeaders['x-skip-loader'] = true;
  }
  const mergedOptions = {
    ...options,
    headers: mergedHeaders
  };
  return axios
    .post(`${api}getAllPlacements`, data, mergedOptions)
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiRuleBlockCampaign = (data) => {
  return axios.post(`${api}checkRuleBlockCampaign`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export {
  ApiUpdatePlacementBid,
  ApiUpdatePlacementBidInDB,
  ApiUpdatePlacementBidApplyInAmazon,
  ApiGetAllPlacements,
  ApiRuleBlockCampaign,
};
