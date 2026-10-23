import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/amazon/`;
const apiConfig = `${process.env.REACT_APP_API_BASE}/api/config/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiCampainListing = (data, options = {}) => {
  return axios
    .post(`${api}getCampaigns`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCampaignChartListing = (data, options = {}) => {
  return axios
    .post(`${api}getCampaignChartData`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiTopCampaignChart = (data) => {
  return axios
    .post(`${api}topCampaign`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiViewCampaign = (profileId, data) => {
  return axios
    .post(`${api}getCampaignIdData/${profileId}`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetAdGroupsByCampaign = (campaignId, data) => {
  return axios
    .post(`${api}getAdGroupsByCampaign/${campaignId}`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetProductAdsByAdGroup = (adGroupId, data) => {
  return axios
    .post(`${api}getProductAdsByAdGroup/${adGroupId}`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiAmazonGetKeywordById = (data) => {
  return axios
    .post(`${api}getKeywordByAdId/${data.id}`, data.details, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCreateCampaign = (data) => {
  return axios
    .post(`${api}createCampaigns`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiAddCampaign = (data) => {
  return axios
    .post(`${api}addCampaigns`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCreateSPCampaign = (data) => {
  return axios
    .post(`${api}createSPCampaigns`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdateCampaign = (id, data) => {
  return axios
    .post(`${api}updateCampaigns/${id}`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetCampaignDataTable = (id, data) => {
  return axios
    .post(`${api}getCampaignDataTable/${id}`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiPlacementList = (data, options = {}) => {
  return axios.post(`${api}getPlacement`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
    .then(res => res.data).catch(res => res.data)
}

const ApiSaveCampaignNotifySetting = (data) => {
  return axios.post(`${api}saveCampaignNotifySetting`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiAIAnalysis = (data) => {
  return axios.post(`${api}AIAnalysis`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiHourlyCampaignTracking = (data, options = {}) => {
  return axios.post(`${api}hourlyCampaignTracking`, data, { headers, skipLoader: true, ...options })
    .then(res => res.data).catch(res => res.data)
}

const ApiHourlyPlacementTracking = (data) => {
  return axios.post(`${api}hourlyPlacementTracking`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiListCampaign = (data) => {
  return axios.post(`${api}listCampaignName`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then(res => res.data).catch(res => res.data)
}

const ApiSelectAccount = () => {
  return axios.get(`${apiConfig}listProfiles`, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiAddToFavorite = (data) => {
  return axios.post(`${apiConfig}addToFavoriteProfile`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiHistory = (data) => {
  return axios.post(`${api}getHistory`, data, { headers, skipLoader: true })
    .then(res => res.data).catch(res => res.data)
}

const ApiGetLatestCampaignHistory = (data) => {
  return axios.post(`${api}getLatestCampaignHistory`, data, { headers, skipLoader: true })
    .then(res => res.data).catch(res => res.data)
}


const ApiSaveCampaignBidThreshold = (data) => {
  return axios.post(`${api}saveCamapignBidThreshold`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then(res => res.data).catch(res => res.data)
}

const ApiGetCampaignBidThreshold = (data) => {
  return axios.post(`${api}getCampaignBidThreshold`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then(res => res.data).catch(res => res.data)
}

const ApiCalculateCampaignMaxBid = (data) => {
  return axios.post(`${api}calculateCampaignMaxBid`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then(res => res.data).catch(res => res.data)
}

const ApiGetPLHistory = (data) => {
  return axios.post(`${api}getPLHistory`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiSavePLHistory = (data) => {
  return axios.post(`${api}savePLHistory`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiRemovePLHistory = (data) => {
  return axios.post(`${api}removePLHistory`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiPreviewSDCreative = (data) => {
  return axios.post(`${api}previewSDCreative`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

export {
  ApiCreateCampaign,
  ApiCreateSPCampaign,
  ApiAddCampaign,
  ApiUpdateCampaign,
  ApiViewCampaign,
  ApiGetAdGroupsByCampaign,
  ApiGetProductAdsByAdGroup,
  ApiCampainListing,
  ApiCampaignChartListing,
  ApiAmazonGetKeywordById,
  ApiTopCampaignChart,
  ApiGetCampaignDataTable,
  ApiPlacementList,
  ApiSaveCampaignNotifySetting,
  ApiAIAnalysis,
  ApiHourlyCampaignTracking,
  ApiHourlyPlacementTracking,
  ApiListCampaign,
  ApiSelectAccount,
  ApiAddToFavorite,
  ApiHistory,
  ApiGetLatestCampaignHistory,
  ApiSaveCampaignBidThreshold,
  ApiGetCampaignBidThreshold,
  ApiCalculateCampaignMaxBid,
  ApiGetPLHistory,
  ApiSavePLHistory,
  ApiRemovePLHistory,
  ApiPreviewSDCreative
};
