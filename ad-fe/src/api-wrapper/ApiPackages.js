import axios from "axios";

const apiPackage = `${process.env.REACT_APP_API_BASE}/api/packages/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiPackageList = (data, skip = false) => {
  const reqHeaders = skip ? { ...headers, 'x-skip-loader': true } : headers;
  return axios.post(`${apiPackage}getAll`, data, { headers: reqHeaders, skipLoader: skip })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCreatePackage = (data) => {
  return axios.post(`${apiPackage}create`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiChangeStatusPackage = (data) => {
  return axios.post(`${apiPackage}changeStatus`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdatePackage = (data) => {
  return axios.post(`${apiPackage}update`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiDeletePackage = (data) => {
  return axios.post(`${apiPackage}delete`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiSubscriptionHistory = (data, skip = false) => {
  const reqHeaders = skip ? { ...headers, "x-skip-loader": true } : headers;
  return axios.post(`${apiPackage}getSubscriptionHistory`, data, { headers: reqHeaders, skipLoader: skip })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiPackagePermissions = (data) => {
  return axios.post(`${apiPackage}getPackagePermissions`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdatePackagePermissions = (data) => {
  return axios.post(`${apiPackage}updatePackagePermissions`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export {
  ApiPackageList,
  ApiCreatePackage,
  ApiChangeStatusPackage,
  ApiUpdatePackage,
  ApiDeletePackage,
  ApiSubscriptionHistory,
  ApiPackagePermissions,
  ApiUpdatePackagePermissions,
};
