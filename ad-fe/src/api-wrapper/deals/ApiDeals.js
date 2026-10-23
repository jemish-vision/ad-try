import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/deals/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
};

export const ApiGetDealsStats = (data) => {
    return axios.get(`${api}stats`, { params: data, headers })
        .then((res) => res.data)
        .catch((res) => res.data);
};

export const ApiGetDealsList = (data) => {
    return axios.get(`${api}list`, { params: data, headers, skipLoader: true })
        .then((res) => res.data)
        .catch((res) => res.data);
};

