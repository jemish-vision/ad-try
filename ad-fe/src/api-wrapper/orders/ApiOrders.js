import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/seller/order/`
const authToken = localStorage.getItem('sellerToken')
const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
};

const ApiGetAllOrders = (data) => {
    return axios.post(`${api}getAllOrders`, data, { headers: { ...headers, 'x-skip-loader': true } })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetOrderReport = (data) => {
    return axios.post(`${api}getOrderReport`, data, { headers: { ...headers, 'x-skip-loader': true } })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetStateWiseOrderCount = (data) => {
    return axios.post(`${api}getStateWiseOrderCount`, data, { headers: { ...headers, 'x-skip-loader': true } })
        .then(res => res.data).catch(res => res.data)
}

export { ApiGetAllOrders, ApiGetOrderReport, ApiGetStateWiseOrderCount }

