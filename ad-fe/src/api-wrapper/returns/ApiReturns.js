import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/seller/order/`
const authToken = localStorage.getItem('sellerToken')
const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
};

const ApiRefundGraph = (data) => {
    return axios.post(`${api}refund-graph`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiRefundFilterDropdowns = (data) => {
    return axios.post(`${api}refund-filter-dropdowns`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiRefundGrid = (data) => {
    return axios.post(`${api}refund-grid`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

export {
    ApiRefundGraph,
    ApiRefundFilterDropdowns,
    ApiRefundGrid
}
