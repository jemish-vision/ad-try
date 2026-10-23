import axios from "axios";

const apiCoupon = `${process.env.REACT_APP_API_BASE}/api/coupon/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiCouponList = (data) => {
  return axios.post(`${apiCoupon}getAll`, data, { headers, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

export {
  ApiCouponList,
};
