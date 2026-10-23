import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/columns/`
const authToken = localStorage.getItem('sellerToken')
const headers = { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' };

const ApiListGetColumns = (data, options = {}) => {
    return axios.post(`${api}getColumns`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
        .then(res => res.data).catch(res => res.data)
}

const ApiListUpdateColumns = (data, options = {}) => {
    return axios.post(`${api}updateColumns`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
        .then(res => res.data).catch(res => res.data)
}

export { ApiListGetColumns, ApiListUpdateColumns }
