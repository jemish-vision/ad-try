import axios from "axios";

const apiRoles = `${process.env.REACT_APP_API_BASE}/api/role/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiGetAllRoles = (data) => {
  return axios.post(`${apiRoles}getAllRoles`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCreateRole = (data) => {
  return axios.post(`${apiRoles}createRole`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdateRole = (data) => {
  return axios.post(`${apiRoles}updateRole`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiDeleteRole = (data) => {
  return axios.post(`${apiRoles}deleteRole`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdateRolePermission = (data) => {
  return axios.post(`${apiRoles}updatePermission`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};


export { ApiGetAllRoles, ApiUpdateRole, ApiCreateRole, ApiDeleteRole, ApiUpdateRolePermission };
