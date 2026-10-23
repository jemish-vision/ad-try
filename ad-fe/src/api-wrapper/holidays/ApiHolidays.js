import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/holiday/`
const authToken = localStorage.getItem('sellerToken')
const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
};

const ApiHolidayListing = (data) => {
    return axios.post(`${api}getAll`, data, { headers })
        .then(res => res.data)
        .catch(res => res.data)
}

const ApiCreateHoliday = (data) => {
    return axios.post(`${api}create`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiUpdateHoliday = (data) => {
    return axios.post(`${api}update`, data, { headers })
        .then((res) => res.data).catch((res) => res.data)
};

const ApiDeleteHoliday = (data) => {
    return axios.post(`${api}delete`, data, { headers })
        .then((res) => res.data).catch((res) => res.data)
};

const ApiSaveSpecialDaysReminder = (data) => {
    return axios.post(`${api}saveSpecialDaysReminder`, data, { headers })
        .then((res) => res.data).catch((res) => res.data)
};

export { ApiHolidayListing, ApiCreateHoliday, ApiUpdateHoliday, ApiDeleteHoliday, ApiSaveSpecialDaysReminder }
