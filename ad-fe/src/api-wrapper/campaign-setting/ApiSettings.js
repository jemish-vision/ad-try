import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/setting/`
const authToken = localStorage.getItem('sellerToken')

const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
};

const ApiSaveAcos = (data) => {
    return axios.post(`${api}defaultTargetAcos/saveAcos`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}
const ApiSaveOtherAcos = (data) => {
    return axios.post(`${api}defaultTargetAcos/saveAcosSBSD`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiSaveCampaginTargetAcos = (data) => {
    return axios.post(`${api}defaultTargetAcos/saveAcosCampagin`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetAcos = (data) => {
    return axios.post(`${api}defaultTargetAcos/getAcos`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

export { ApiSaveOtherAcos, ApiGetAcos, ApiSaveAcos, ApiSaveCampaginTargetAcos }
