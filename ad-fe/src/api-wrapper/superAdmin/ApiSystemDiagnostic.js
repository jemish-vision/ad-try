import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE || ""}/api/superAdmin/`;

const getHeaders = () => {
  const authToken = localStorage.getItem("sellerToken");
  return {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
  };
};

export const ApiGetSystemDiagnostic = (params = {}) => {
  return axios
    .get(`${api}system-diagnostic`, {
      headers: getHeaders(),
      params,
    })
    .then((res) => res.data)
    .catch((err) => err.response?.data || { isSuccess: false, message: err.message });
};

export const ApiDrainStagedBatches = () => {
  return axios
    .post(`${api}system-diagnostic/drain-staged`, {}, {
      headers: getHeaders(),
    })
    .then((res) => res.data)
    .catch((err) => err.response?.data || { isSuccess: false, message: err.message });
};

export const ApiGet15DayReconciliation = (params = {}) => {
  return axios
    .get(`${api}system-diagnostic/reconciliation-15days`, {
      headers: getHeaders(),
      params,
    })
    .then((res) => res.data)
    .catch((err) => err.response?.data || { isSuccess: false, message: err.message });
};
