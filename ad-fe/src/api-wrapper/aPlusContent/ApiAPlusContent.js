import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/aplusContent/`
const getHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('sellerToken')}`,
    'Content-Type': 'application/json'
});

const ApiCreateAPlusContent = (data) => {
    return axios.post(`${api}create`, data, { headers: getHeaders(), timeout: 600000 })
        .then(res => res.data).catch(res => res?.response?.data || res.data || { isSuccess: false, message: "Request failed" })
}

const ApiUpdateAPlusContent = (data) => {
    return axios.post(`${api}edit`, data, { headers: getHeaders(), timeout: 600000 })
        .then(res => res.data).catch(res => res?.response?.data || res.data || { isSuccess: false, message: "Request failed" })
}

const ApiGetAPlusContent = (data) => {
    return axios.post(`${api}get`, data, { headers: getHeaders(), timeout: 300000 })
        .then(res => res.data).catch(res => res?.response?.data || res.data || { isSuccess: false, message: "Request failed" })
}

const ApiSubmitForApproveAPlusContent = (data) => {
    return axios.post(`${api}submitForApproval`, data, { headers: getHeaders(), timeout: 300000 })
        .then(res => res.data).catch(res => res?.response?.data || res.data || { isSuccess: false, message: "Request failed" })
}

const ApiGetPendingAPlusBatchJobs = (data) => {
    return axios.post(`${api}pendingBatchJobs`, data, { headers: getHeaders(), timeout: 60000 })
        .then(res => res.data).catch(res => res?.response?.data || res.data || { isSuccess: false, message: "Request failed" })
}

const ApiPublishAPlusBatchJob = (data) => {
    return axios.post(`${api}publishBatchJob`, data, { headers: getHeaders(), timeout: 300000 })
        .then(res => res.data).catch(res => res?.response?.data || res.data || { isSuccess: false, message: "Request failed" })
}

export { ApiCreateAPlusContent, ApiUpdateAPlusContent, ApiGetAPlusContent, ApiSubmitForApproveAPlusContent, ApiGetPendingAPlusBatchJobs, ApiPublishAPlusBatchJob }


