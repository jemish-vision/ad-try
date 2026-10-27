import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/dashboard/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

export const ApiGetAssignedCampaignComparison = (data) => {
  return axios
    .post(`${api}getAssignedCampaignComparison`, data, {
      headers: { ...headers, "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((err) => err?.response?.data || { isSuccess: false });
};

export const ApiGetAdTypeBreakdown = (data) => {
  return axios
    .post(`${api}getAdTypeBreakdown`, data, {
      headers: { ...headers, "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((err) => err?.response?.data || { isSuccess: false });
};

export const ApiGetTimeBasedAnalytics = (data) => {
  const token = localStorage.getItem("sellerToken") || authToken;
  return axios
    .post(`${api}getTimeBasedAnalytics`, data, {
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
        "x-skip-loader": true,
      },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((err) => err?.response?.data || { isSuccess: false });
};

export const ApiGetWasteAndScalingAlerts = (data) => {
  const token = localStorage.getItem("sellerToken") || authToken;
  return axios
    .post(`${api}getWasteAndScalingAlerts`, data, {
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
        "x-skip-loader": true,
      },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((err) => err?.response?.data || { isSuccess: false });
};
