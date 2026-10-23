import axios from "axios";

const apiRetention = `${process.env.REACT_APP_API_BASE}/api/retention/`;

const getHeaders = (actionType = "View Only") => {
  const authToken = localStorage.getItem("sellerToken");
  const permissionToken = localStorage.getItem("permissionToken");
  return {
    pagename: "Retention",
    Authorization: `Bearer ${authToken}`,
    permissionToken,
    action: actionType,
    "Content-Type": "application/json",
  };
};

const ApiGetAllRetention = (data, skip = false) => {
  const baseHeaders = getHeaders("View Only");
  const reqHeaders = skip ? { ...baseHeaders, 'x-skip-loader': true } : baseHeaders;
  return axios
    .post(`${apiRetention}getAllRetention`, data, { headers: reqHeaders, skipLoader: skip })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCreateRetention = (data) => {
  return axios
    .post(`${apiRetention}createRetention`, data, { headers: getHeaders("Create") })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdateRetention = (data) => {
  return axios
    .post(`${apiRetention}updateRetention`, data, { headers: getHeaders("Update") })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiDeleteRetention = (data) => {
  return axios
    .post(`${apiRetention}deleteRetention`, data, { headers: getHeaders("Remove") })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiChangeStatusRetention = (data) => {
  return axios
    .post(`${apiRetention}changeStatusRetention`, data, { headers: getHeaders("Update") })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export {
  ApiGetAllRetention,
  ApiCreateRetention,
  ApiUpdateRetention,
  ApiDeleteRetention,
  ApiChangeStatusRetention,
};
