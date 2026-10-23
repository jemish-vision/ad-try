import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/customer/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiNotification = (data) => {
  return axios.post(`${api}getadsNotification`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiReadNotification = (data) => {
  return axios.post(`${api}readAdsNotification`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiReadAllNotification = (data) => {
  return axios.post(`${api}reaAllAdsNotification`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

export {
  ApiNotification,
  ApiReadNotification,
  ApiReadAllNotification,
};
