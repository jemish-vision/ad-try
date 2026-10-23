import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/support/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiSupportTicketList = (data, skip = false) => {
  const reqHeaders = skip ? { ...headers, 'x-skip-loader': true } : headers;
  return axios.post(`${api}supportTicketList`, data, { headers: reqHeaders, skipLoader: skip })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCloseSupportTicket = (data) => {
  return axios.post(`${api}closeSupportTicket`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};


export {
  ApiSupportTicketList,
  ApiCloseSupportTicket,
};
