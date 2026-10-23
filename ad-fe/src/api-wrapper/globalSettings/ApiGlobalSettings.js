import axios from "axios";

const authToken = localStorage.getItem("sellerToken");
const headers = {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
};

export const ApiGetGlobalSettings = () => {
    return axios
        .get(`${process.env.REACT_APP_API_BASE}/api/admin/global-settings`, { headers })
        .then((res) => res.data)
        .catch((res) => res.data);
};

export const ApiUpdateMaintenanceMode = (data) => {
    return axios
        .put(`${process.env.REACT_APP_API_BASE}/api/admin/global-settings/maintenance-mode`, data, { headers })
        .then((res) => res.data)
        .catch((res) => res.data);
};
