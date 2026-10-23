import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/seller/inventory/`
const authToken = localStorage.getItem('sellerToken')
const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
};

const ApiGetAllInventory = (data) => {
    return axios.post(`${api}getAll`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetDashboardCards = (data) => {
    return axios.post(`${api}get-dashboard-cards`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetDashboardGraph = (data) => {
    return axios.post(`${api}get-dashboard-graph`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetDashboardGrid = (data) => {
    return axios.post(`${api}get-dashboard-grid`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
}

const ApiGetPerformanceMatrix = (data) => {
    return axios.post(`${api}product-performance-matrix`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetSmartInsights = (data) => {
    return axios.post(`${api}smart-insights`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetInventoryCards = (data) => {
    return axios.post(`${api}get-inventory-cards`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetInventoryGraph = (data) => {
    return axios.post(`${api}get-inventory-graph`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetInventoryGrid = (data) => {
    return axios.post(`${api}get-inventory-grid`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

// Aging Inventory Tracker
const ApiGetAgingCards = (data) => {
    return axios.post(`${api}get-aging-cards`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetAgingGrid = (data) => {
    return axios.post(`${api}get-aging-grid`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetAgingConfig = (data) => {
    return axios.post(`${api}get-aging-config`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiSaveAgingConfig = (data) => {
    return axios.post(`${api}save-aging-config`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

// FBA Planning
const ApiGetFbaPlanningCards = (data) => {
    return axios.post(`${api}get-inventory-forecast-cards`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetFbaPlanningGraph = (data) => {
    return axios.post(`${api}get-inventory-forecast-graph`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetFbaPlanningGrid = (data) => {
    return axios.post(`${api}get-inventory-forecast-grid`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiGetFbaPlanningConfig = (data) => {
    return axios.post(`${api}get-global-inventory-settings`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiSaveFbaPlanningConfig = (data) => {
    const params = new URLSearchParams();
    Object.keys(data).forEach(key => params.append(key, data[key]));

    return axios.post(`${api}save-global-inventory-settings`, params, {
        headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-skip-loader': true
        },
        skipLoader: true
    }).then(res => res.data).catch(res => res.data)
}

const ApiGetAsinInventorySettings = (data) => {
    return axios.post(`${api}get-ASIN-inventory-settings`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
        .then(res => res.data).catch(res => res.data)
}

const ApiSaveAsinInventorySettings = (data) => {
    const params = new URLSearchParams();
    Object.keys(data).forEach(key => params.append(key, data[key]));

    return axios.post(`${api}save-ASIN-inventory-settings`, params, {
        headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-skip-loader': true
        },
        skipLoader: true
    }).then(res => res.data).catch(res => res.data)
}

const ApiDeleteAsinInventorySettings = (data) => {
    return axios.post(`${api}delete-ASIN-inventory-settings`, data, {
        headers: {
            ...headers,
            'x-skip-loader': true
        },
        skipLoader: true
    }).then(res => res.data).catch(res => res.data)
}

const ApiGetWarehouseInventorySummary = (data) => {
    return axios.post(`${api}get-warehouse-inventory-summary`, data, {
        headers: {
            ...headers,
            'x-skip-loader': true
        },
        skipLoader: true
    }).then(res => res.data).catch(res => res.data);
};

const ApiGetWarehouseInventoryLedger = (data) => {
    return axios.post(`${api}get-warehouse-inventory-ledger`, data, {
        headers: {
            ...headers,
            'x-skip-loader': true
        },
        skipLoader: true
    }).then(res => res.data).catch(res => res.data);
};

const ApiSyncWarehouseInventory = (data) => {
    return axios.post(`${api}sync-warehouse-inventory`, data, {
        headers: {
            ...headers,
            'x-skip-loader': true
        },
        skipLoader: true
    }).then(res => res.data).catch(res => res.data);
};

// Warehouse-wise Planning
const ApiGetWarehousePlanning = (data) => {
    return axios.post(`${api}get-warehouse-planning`, data, {
        headers: {
            ...headers,
            'x-skip-loader': true
        },
        skipLoader: true
    }).then(res => res.data).catch(res => res.data);
};

const ApiSaveWarehousePlanning = (data) => {
    return axios.post(`${api}save-warehouse-planning`, data, {
        headers: {
            ...headers,
            'x-skip-loader': true
        },
        skipLoader: true
    }).then(res => res.data).catch(res => res.data);
};

export {
    ApiGetAllInventory,
    ApiGetDashboardCards,
    ApiGetDashboardGraph,
    ApiGetDashboardGrid,
    ApiGetPerformanceMatrix,
    ApiGetSmartInsights,
    ApiGetInventoryCards,
    ApiGetInventoryGraph,
    ApiGetInventoryGrid,
    //  Aging Tracker
    ApiGetAgingCards,
    ApiGetAgingGrid,
    ApiGetAgingConfig,
    ApiSaveAgingConfig,
    // FBA Planning
    ApiGetFbaPlanningCards,
    ApiGetFbaPlanningGraph,
    ApiGetFbaPlanningGrid,
    ApiGetFbaPlanningConfig,
    ApiSaveFbaPlanningConfig,
    ApiGetAsinInventorySettings,
    ApiSaveAsinInventorySettings,
    ApiDeleteAsinInventorySettings,
    // Warehouse Inventory Ledger
    ApiGetWarehouseInventorySummary,
    ApiGetWarehouseInventoryLedger,
    ApiSyncWarehouseInventory,
    // Warehouse-wise Planning
    ApiGetWarehousePlanning,
    ApiSaveWarehousePlanning,
}
