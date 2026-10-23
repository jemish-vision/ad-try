import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/brandAnalytics/`
const authToken = localStorage.getItem('sellerToken')
const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
};

const ApiGetBrandAnalyticsFilters = (data) => {
    return axios.post(`${api}getBrandAnalyticsFilters`, data, { headers })
        .then(res => res.data)
        .catch(res => res.data)
}

const ApiGetAllBrandAnalytics = (data) => {
    return axios.post(`${api}getAllBrandAnalytics`, data, { headers, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

export { ApiGetBrandAnalyticsFilters, ApiGetAllBrandAnalytics }
