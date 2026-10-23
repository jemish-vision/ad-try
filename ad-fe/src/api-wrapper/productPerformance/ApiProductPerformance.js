import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/seller/product-performance/`;

const getHeaders = () => {
  const authToken = localStorage.getItem("sellerToken");
  return {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
  };
};

export const ApiGetProductTrend = (data) => {
  return axios
    .post(`${api}get-product-trend`, data, {
      headers: { ...getHeaders(), "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((res) => res.data);
};
