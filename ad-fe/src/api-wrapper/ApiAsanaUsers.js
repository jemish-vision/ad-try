import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/asana/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiAsanaFetchUsers = (data) => {
  return axios.post(`${api}fetchAllUsers`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiAsanaUserList = (data) => {
  return axios.post(`${api}getAllUsers`, data, { headers, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiAssignSupportUser = (data) => {
  return axios.post(`${api}assignSupportUser`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export {
  ApiAsanaFetchUsers,
  ApiAsanaUserList,
  ApiAssignSupportUser,
};
