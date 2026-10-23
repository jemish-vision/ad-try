import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/cronJob/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const APIGetMasterCronList = (data, skip = false) => {
  const reqHeaders = skip ? { ...headers, 'x-skip-loader': true } : headers;
  return axios.post(`${api}getAllMarsterCronJob`, data, { headers: reqHeaders, skipLoader: skip })
    .then((res) => res.data)
    .catch((res) => res.data);
};


const ApiCreateMasterCronJob = (data) => {
  return axios.post(`${api}createMasterCronJob`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiUpdateMasterCronJob = (data) => {
  return axios.post(`${api}updateMasterCronJob`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

export { APIGetMasterCronList, ApiCreateMasterCronJob, ApiUpdateMasterCronJob };
