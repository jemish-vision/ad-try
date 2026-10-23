import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/seller/warehouse/`;

const getHeaders = () => {
  const authToken = localStorage.getItem("sellerToken");
  return {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
  };
};

export const ApiGetFcCards = (data) => {
  return axios
    .post(`${api}get-fc-cards`, data, {
      headers: { ...getHeaders(), "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export const ApiGetFcGeoDistribution = (data) => {
  return axios
    .post(`${api}get-fc-geo-distribution`, data, {
      headers: { ...getHeaders(), "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export const ApiGetFcInventoryGrid = (data) => {
  return axios
    .post(`${api}get-fc-grid`, data, {
      headers: { ...getHeaders(), "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export const ApiGetFcStorageFees = (data) => {
  return axios
    .post(`${api}get-fc-storage-fees`, data, {
      headers: { ...getHeaders(), "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export const ApiSyncFcStorageFees = (data) => {
  return axios
    .post(`${api}sync-fc-storage-fees`, data, {
      headers: { ...getHeaders(), "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export const ApiGetFcList = (data) => {
  return axios
    .post(`${api}get-fc-list`, data, {
      headers: { ...getHeaders(), "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export const ApiGetWarehouseMasterList = (data) => {
  return axios
    .post(`${api}warehouse-master-list`, data, {
      headers: { ...getHeaders(), "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export const ApiSaveWarehouseLocation = (data) => {
  return axios
    .post(`${api}save-warehouse-location`, data, {
      headers: { ...getHeaders(), "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export const ApiGetFcSkuMatrix = (data) => {
  return axios
    .post(`${api}get-sku-fc-matrix`, data, {
      headers: { ...getHeaders(), "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export const ApiGetMfnToFbaRecommendations = (data) => {
  return axios
    .post(`${api}get-mfn-fba-recommendations`, data, {
      headers: { ...getHeaders(), "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((res) => res.data);
};

