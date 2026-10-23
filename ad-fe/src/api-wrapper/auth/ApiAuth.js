import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/customer/`
const otherApi = `${process.env.REACT_APP_API_BASE}/api/`
const authToken = localStorage.getItem('sellerToken')
const headers = { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' };

const ApiLogin = (data) => {
    return axios.post(`${api}login`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiVerify2FALogin = (data) => {
    return axios.post(`${api}verify2faLogin`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiSend2FAEmailOtp = (data) => {
    return axios.post(`${api}send2faEmailOtp`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiVerify2FAEmailOtp = (data) => {
    return axios.post(`${api}verify2faEmailOtp`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiLoginWithGoogle = () => {
    return axios.get(`${otherApi}google/loginWithGoogle`, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiGenerateToken = (data) => {
    return axios.post(`${otherApi}google/generateToken`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiChangePassword = (data) => {
    return axios.post(`${otherApi}user/changePassword`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiUpdateProfile = (data) => {
    return axios.post(`${otherApi}user/updateProfile`, data, { headers: { Authorization: `Bearer ${authToken}` } })
        .then(res => res.data).catch(err => err.response?.data || err)
}

const ApiGetPermission = () => {
    return axios.get(`${otherApi}permission/getAdminPermission`, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiConnectGoogle = () => {
    return axios.get(`${otherApi}google/login`, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiDisconnectGoogle = () => {
    return axios.get(`${otherApi}google/disconnect`, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetGoogleSheetLink = (data) => {
    return axios.post(`${otherApi}google/getSheetLink`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

export { ApiLogin, ApiVerify2FALogin, ApiSend2FAEmailOtp, ApiVerify2FAEmailOtp, ApiLoginWithGoogle, ApiGenerateToken, ApiChangePassword, ApiUpdateProfile, ApiGetPermission, ApiConnectGoogle, ApiDisconnectGoogle, ApiGetGoogleSheetLink }