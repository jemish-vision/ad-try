import axios from "axios";

const apiOrg = `${process.env.REACT_APP_API_BASE}/api/organization/`;
const getHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("sellerToken")}`,
  "Content-Type": "application/json",
});

export const ApiGetOrganizationList = () => {
  return axios
    .get(`${apiOrg}list`, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((err) => err.response?.data || { isSuccess: false, message: "Network error" });
};

export const ApiCreateOrganization = (data) => {
  return axios
    .post(`${apiOrg}create`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((err) => err.response?.data || { isSuccess: false, message: "Network error" });
};

export const ApiSelectOrganization = (data) => {
  return axios
    .post(`${apiOrg}select`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((err) => err.response?.data || { isSuccess: false, message: "Network error" });
};

export const ApiToggleFavoriteOrganization = (data) => {
  return axios
    .post(`${apiOrg}toggleFavorite`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((err) => err.response?.data || { isSuccess: false, message: "Network error" });
};

export const ApiGetSuperAdminOrganizations = (skip = false) => {
  const reqHeaders = skip ? { ...getHeaders(), "x-skip-loader": true } : getHeaders();
  return axios
    .post(`${apiOrg}superAdmin/getAll`, {}, { headers: reqHeaders, skipLoader: skip })
    .then((res) => res.data)
    .catch((err) => err.response?.data || { isSuccess: false, message: "Network error" });
};

export const ApiUpdateSuperAdminOrganization = (data) => {
  return axios
    .post(`${apiOrg}superAdmin/update`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((err) => err.response?.data || { isSuccess: false, message: "Network error" });
};

export const ApiUpdateOrganization = (data) => {
  return axios
    .post(`${apiOrg}update`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((err) => err.response?.data || { isSuccess: false, message: "Network error" });
};

export const ApiExecuteProfileSyncCron = (data) => {
  return axios
    .post(`${apiOrg}superAdmin/executeProfileSyncCron`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((err) => err.response?.data || { isSuccess: false, message: "Network error" });
};

