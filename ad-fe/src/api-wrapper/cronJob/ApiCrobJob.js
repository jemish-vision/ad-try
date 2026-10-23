import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/cronJob/`
const authToken = localStorage.getItem('sellerToken')
const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
};

const ApiCronJobSchedularList = (data) => {
    return axios.post(`${api}getAllCronJobByProfile`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiCronJobHistoryList = (data) => {
    return axios.post(`${api}getAllCronJobHistory`, data, { headers, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiCronJobActive = (data) => {
    return axios.post(`${api}changeStatusByProfile`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiCreateCronJob = (data) => {
    return axios.post(`${api}createCronJob`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiUpdateCronJob = (data) => {
    return axios.post(`${api}updateCronJob`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiManuallyRunCronJob = (data) => {
    return axios.post(`${api}manuallyRunCronJob`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}


export {
    ApiCronJobSchedularList,
    ApiCronJobHistoryList,
    ApiCronJobActive,
    ApiCreateCronJob,
    ApiUpdateCronJob,
    ApiManuallyRunCronJob,
}

