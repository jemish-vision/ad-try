import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/dayparting-stretegy/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiGetAllStretegy = (data) => {
  return axios
    .post(`${api}getAll`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCreateStretegy = (data) => {
  return axios
    .post(`${api}create`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdateStretegy = (data) => {
  return axios
    .post(`${api}update`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiStatusChangeStretegy = (data) => {
  return axios
    .post(`${api}statusChange`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiDeleteStretegy = (data) => {
  return axios
    .post(`${api}delete`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiRuleHistory = (data) => {
  return axios
    .post(`${api}ruleHistory`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiExportDaypartingRule = (data) => {
  return axios.post(`${api}exportDaypartingRule`, data, { headers, responseType: "blob" })
}

const ApiImportDaypartingRule = (data) => {
  return axios.post(`${api}importDaypartingRule`, data, { headers: { ...headers, "Content-Type": "multipart/form-data" } })
    .then(res => res.data).catch(res => res.data)
}

export {
  ApiGetAllStretegy,
  ApiCreateStretegy,
  ApiUpdateStretegy,
  ApiStatusChangeStretegy,
  ApiDeleteStretegy,
  ApiRuleHistory,
  ApiExportDaypartingRule,
  ApiImportDaypartingRule,
};
