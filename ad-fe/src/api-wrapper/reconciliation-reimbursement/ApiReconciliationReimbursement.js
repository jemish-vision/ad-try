import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/reconciliation-reimbursement/`;

const getHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("sellerToken")}`,
    "Content-Type": "application/json",
    "x-skip-loader": "true",
});

export const ApiGetAllShippingQueue = (data) => {
    return axios.post(`${api}getAllShippingQueue`, data, { headers: getHeaders(), skipLoader: true })
        .then((res) => res.data)
        .catch((res) => res.data);
};

export const ApiGetShippingQueueDetails = (id, data) => {
    return axios.post(`${api}getShippingQueueDetails/${id}`, data, { headers: getHeaders(), skipLoader: true })
        .then((res) => res.data)
        .catch((res) => res.data);
};

export const ApiGetReimbursement = (data) => {
    return axios.post(`${api}getReimbursement`, data, { headers: getHeaders(), skipLoader: true })
        .then((res) => res.data)
        .catch((res) => res.data);
};

export const ApiGetNotificationStatus = (data) => {
    return axios.post(`${api}getNotificationStatus`, data, { headers: getHeaders(), skipLoader: true })
        .then((res) => res.data)
        .catch((res) => res.data);
};

export const ApiUpdateNotificationStatus = (data) => {
    return axios.post(`${api}updateNotificationStatus`, data, { headers: getHeaders(), skipLoader: true })
        .then((res) => res.data)
        .catch((res) => res.data);
};
