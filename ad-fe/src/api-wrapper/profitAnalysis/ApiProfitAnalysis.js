import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/profit-analysis/`;

const getHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("sellerToken")}`,
  "Content-Type": "application/json",
});

const ApiGetProfitAnalysisSummary = (data) => {
  return axios.post(`${api}getProfitAnalysisSummary`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

const ApiGetProfitAnalysisProducts = (data) => {
  return axios.post(`${api}getProfitAnalysisProducts`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

const ApiGetProfitAnalysisMonthly = (data) => {
  return axios.post(`${api}getProfitAnalysisMonthly`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

export { ApiGetProfitAnalysisSummary, ApiGetProfitAnalysisMonthly, ApiGetProfitAnalysisProducts };
