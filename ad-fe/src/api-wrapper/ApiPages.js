import axios from "axios";

const apiPages = `${process.env.REACT_APP_API_BASE}/api/pages/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiGetAllPages = (data, skip = false) => {
  const reqHeaders = skip ? { ...headers, 'x-skip-loader': true } : headers;
  return axios.post(`${apiPages}getAll`, data, { headers: reqHeaders, skipLoader: skip })
    .then((res) => res?.data).catch((res) => res.data);
};

const ApiCreatePages = (data) => {
  return axios.post(`${apiPages}create`, data, { headers })
    .then((res) => res?.data).catch((res) => res.data);
};

const ApiUpdatePages = (data) => {
  return axios.post(`${apiPages}update`, data, { headers })
    .then((res) => res?.data).catch((res) => res.data);
};

const ApiRemovePages = (data) => {
  return axios.post(`${apiPages}remove`, data, { headers })
    .then((res) => res?.data).catch((res) => res.data);
};

const ApiStatusChangePages = (data) => {
  return axios.post(`${apiPages}statusChange`, data, { headers })
    .then((res) => res?.data).catch((res) => res.data);
};

const ApiCreatePageAction = (data) => {
  return axios.post(`${apiPages}createPageAction`, data, { headers })
    .then((res) => res?.data).catch((res) => res.data);
};

const ApiUpdatePageAction = (data) => {
  return axios.post(`${apiPages}updatePageAction`, data, { headers })
    .then((res) => res?.data).catch((res) => res.data);
};

const ApiRemovePageAction = (data) => {
  return axios.post(`${apiPages}removePageAction`, data, { headers })
    .then((res) => res?.data).catch((res) => res.data);
};

export {
  ApiGetAllPages,
  ApiCreatePages,
  ApiUpdatePages,
  ApiRemovePages,
  ApiStatusChangePages,
  ApiCreatePageAction,
  ApiUpdatePageAction,
  ApiRemovePageAction,
};
