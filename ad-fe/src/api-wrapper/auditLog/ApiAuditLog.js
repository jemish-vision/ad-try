import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/auditLog/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiAditLogListing = (data) => {
  return axios.post(`${api}get`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then((res) => res.data)
    .catch((error) => error.response?.data || { isSuccess: false, message: "Unable to load audit logs. Please retry." });
};

const ApiAuditLogEvents = () => axios.get(`${api}events`, { headers, skipLoader: true })
  .then((res) => res.data)
  .catch(() => ({ isSuccess: false, data: [] }));

export {
  ApiAditLogListing,
  ApiAuditLogEvents,
};
