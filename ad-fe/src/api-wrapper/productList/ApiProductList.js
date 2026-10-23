import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/seller/order/`
const apiProducts = `${process.env.REACT_APP_API_BASE}/api/products/`
const authToken = localStorage.getItem('sellerToken')
const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
};

const ApiCreateProduct = (data) => {
    return axios.post(`${api}createProduct`, data, { headers: { ...headers, "Content-Type": undefined, } })
        .then(res => res.data).catch(res => res.data)
}

const ApiGenerateProductData = (data) => {
    return axios.post(`${api}generateProduct`, data, { headers, timeout: 300000 })
        .then(res => res.data).catch(res => res.data)
}

const ApiAddProduct = (data) => {
    return axios.post(`${api}AddProduct`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetSPProduct = (data) => {
    return axios.post(`${api}getSPProduct`, data, { headers, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiChangeProductSetting = (data, id) => {
    return axios.post(`${api}changeProductSetting/${id}`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiFileUpload = (data) => {
    return axios.post(`${api}fileUpload`, data, { headers: { ...headers, "Content-Type": undefined, } })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetProductTypes = (data, options = {}) => {
    return axios.post(`${api}getProductTypes`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetProductDefinition = (data) => {
    return axios.post(`${api}getProductDefinition`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiCheckASIN = (data) => {
    return axios.post(`${api}checkASIN`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiCheckASINFromDB = (data) => {
    return axios.post(`${api}checkASINFromDB`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiProductSearchOnAmazon = (data) => {
    return axios.post(`${api}productSearchOnAmazon`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiParseFields = (data) => {
    return axios.post(`${api}parseFields`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiUpdateProductPrice = (data) => {
    const params = new URLSearchParams();
    Object.keys(data).forEach(key => params.append(key, data[key]));
    return axios.post(`${api}updateProductPrice`, params, {
        headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }).then(res => res.data).catch(res => res.data)
}

const ApiBulkUpdateProductPrice = (data) => {
    return axios.post(`${api}bulkUpdateProductPrice`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiToggleProductFavorite = (data) => {
    return axios.post(`${api}toggleProductFavorite`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetListofCompetitorsProduct = (data) => {
    return axios.post(`${api}getListofCompetitorsProduct`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetCompetitorsBrands = (data) => {
    return axios.post(`${apiProducts}/competitors/brands`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetCompetitorsLists = (data) => {
    return axios.post(`${apiProducts}/competitors/list`, data, { headers })
        .then(res => res.data).catch(res => res.data)
}

export { ApiCreateProduct, ApiGenerateProductData, ApiAddProduct, ApiGetSPProduct, ApiChangeProductSetting, ApiFileUpload, ApiGetProductTypes, ApiGetProductDefinition, ApiCheckASIN, ApiCheckASINFromDB, ApiProductSearchOnAmazon, ApiParseFields, ApiUpdateProductPrice, ApiBulkUpdateProductPrice, ApiToggleProductFavorite, ApiGetListofCompetitorsProduct, ApiGetCompetitorsBrands, ApiGetCompetitorsLists }

