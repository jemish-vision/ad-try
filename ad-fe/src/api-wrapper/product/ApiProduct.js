import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/product/`
const authToken = localStorage.getItem('sellerToken')
const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
};

const ApiProductListing = (data) => {
    return axios.post(`${api}listProduct`, data, { headers, skipLoader: true })
        .then((res) => res.data).catch((res) => res.data)
}

export { ApiProductListing }

