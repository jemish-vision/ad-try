import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/device`
const authToken = localStorage.getItem('sellerToken')
const headers = { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' };

const ApiCreateDeviceToken = (data) => {
    return axios.post(`${api}/createToken`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiDeleteDeviceToken = (data) => {
    return axios.post(`${api}/deleteToken`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

export { ApiCreateDeviceToken, ApiDeleteDeviceToken }

