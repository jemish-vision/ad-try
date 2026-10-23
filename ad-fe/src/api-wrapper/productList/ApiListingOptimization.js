import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/seller/order/`;
const getHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('sellerToken')}`,
  'Content-Type': 'application/json',
});

export const ApiAnalyzeListingWithAI = (data) => {
  return axios
    .post(`${api}analyzeListingWithAI`, data, {
      headers: getHeaders(),
      timeout: 300000, // 5 min — AI can be slow
    })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || { isSuccess: false, message: "Request failed" });
};

export const ApiApplyListingOptimization = (data) => {
  return axios
    .post(`${api}applyListingOptimization`, data, {
      headers: getHeaders(),
      timeout: 60000,
    })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || { isSuccess: false, message: "Request failed" });
};
