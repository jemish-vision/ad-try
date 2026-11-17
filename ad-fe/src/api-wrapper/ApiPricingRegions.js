import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/pricing-regions/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const post = (path, data, skip = false) =>
  axios
    .post(`${api}${path}`, data, { headers: skip ? { ...headers, "x-skip-loader": true } : headers, skipLoader: skip })
    .then((res) => res.data)
    .catch((err) => err?.response?.data || err?.data);

export const ApiPricingRegionList = (params = {}, skip = false) => post("getAll", params, skip);
export const ApiCreatePricingRegion = (data) => post("create", data);
export const ApiUpdatePricingRegion = (data) => post("update", data);
export const ApiChangePricingRegionStatus = (data) => post("changeStatus", data);
export const ApiDeletePricingRegion = (data) => post("delete", data);
export const ApiPreviewPricingCountry = (data) => post("preview", data, true);
export const ApiOrganizationBillingList = (params = {}, skip = false) => post("organizations", params, skip);
export const ApiPlanRegionPrices = (data) => post("plan-prices", data, true);
export const ApiUpdatePlanRegionPrices = (data) => post("plan-prices/update", data);
export const ApiUpdateOrganizationBilling = (data) => post("organizations/update", data);
export const ApiDetectPricingCountry = () =>
  axios
    .get(`${api}detect`, { headers: { ...headers, "x-skip-loader": true }, skipLoader: true })
    .then((res) => res.data)
    .catch((err) => err?.response?.data || err?.data);
