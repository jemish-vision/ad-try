import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/columns/`;

const getHeaders = () => {
    const authToken = localStorage.getItem("sellerToken");
    return {
        Authorization: authToken ? `Bearer ${authToken}` : "",
        "Content-Type": "application/json",
    };
};

const ApiListGetColumns = (data, options = {}) => {
    return axios
        .post(`${api}getColumns`, data, {
            headers: { ...getHeaders(), "x-skip-loader": true },
            skipLoader: true,
            ...options,
        })
        .then((res) => res.data)
        .catch((res) => res.data);
};

const ApiListUpdateColumns = (data, options = {}) => {
    return axios
        .post(`${api}updateColumns`, data, {
            headers: { ...getHeaders(), "x-skip-loader": true },
            skipLoader: true,
            ...options,
        })
        .then((res) => res.data)
        .catch((res) => res.data);
};

const ApiGetChartSettings = (data, options = {}) => {
    return axios
        .post(`${api}getChartSettings`, data, {
            skipLoader: true,
            ...options,
            headers: { ...getHeaders(), "x-skip-loader": true, ...options?.headers },
        })
        .then((res) => res.data)
        .catch((err) => err?.response?.data || { isSuccess: false, message: err?.message });
};

const ApiUpdateChartSettings = (data, options = {}) => {
    return axios
        .post(`${api}updateChartSettings`, data, {
            skipLoader: true,
            ...options,
            headers: { ...getHeaders(), "x-skip-loader": true, ...options?.headers },
        })
        .then((res) => res.data)
        .catch((err) => err?.response?.data || { isSuccess: false, message: err?.message });
};

export {
    ApiListGetColumns,
    ApiListUpdateColumns,
    ApiGetChartSettings,
    ApiUpdateChartSettings,
};
