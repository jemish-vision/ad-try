import axios from "axios";

// The organization's own AI provider API keys (owner manages; everyone sees the masked status)
const api = `${process.env.REACT_APP_API_BASE}/api/ai-keys/`;
const post = (path, data = {}, { loader = false } = {}) =>
  axios
    .post(`${api}${path}`, data, loader ? {} : { headers: { "x-skip-loader": true }, skipLoader: true })
    .then((res) => res.data)
    .catch((err) => err?.response?.data || { isSuccess: false, message: "Request failed" });

export const ApiGetAiKeys = () => post("");
export const ApiSaveAiKey = (data) => post("save", data, { loader: true });
export const ApiValidateAiKey = (data) => post("validate", data, { loader: true });
export const ApiRemoveAiKey = (data) => post("remove", data, { loader: true });
export const ApiUpdateAiKeySettings = (data) => post("settings", data, { loader: true });
