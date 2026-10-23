import axios from "axios";

const apiCustomer = `${process.env.REACT_APP_API_BASE}/api/customer/`;
const apiUser = `${process.env.REACT_APP_API_BASE}/api/user/`;
const apiPermission = `${process.env.REACT_APP_API_BASE}/api/permission/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiUserList = (data) => {
  return axios.post(`${apiCustomer}get-all-users`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCreateUser = (data) => {
  return axios.post(`${apiUser}createUser`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdateUser = (data) => {
  return axios.post(`${apiUser}updateUser`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiDeleteUser = (data) => {
  return axios.post(`${apiUser}deleteUser`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiRegistration = (data) => {
  return axios.post(`${apiUser}registortUser`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiSendOtp = (data) => {
  return axios.post(`${apiUser}sendOtp`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiVerifyOtp = (data) => {
  return axios.post(`${apiUser}verifyOtp`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiForgotPassword = (data) => {
  return axios.post(`${apiUser}forgotPassword`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiResetPassword = (data) => {
  return axios.post(`${apiUser}resetPassword`, data, { headers })
    .then(res => res.data).catch(res => res.data)
}

const ApiUserPermission = (data) => {
  return axios.post(`${apiPermission}getCustomerPermissions`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdateUserPermission = (data) => {
  return axios.post(`${apiPermission}updateCustomerPermissions`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiUpdateUserProfileAccess = (data) => {
  return axios.post(`${apiUser}updateProfileAccess`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiSaveTrialSubscription = (data) => {
  return axios.post(`${apiUser}saveTrialSubscription`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCreateSubscription = (data) => {
  return axios.post(`${apiUser}createSubscription`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCancelSubscription = (data) => {
  return axios.post(`${apiUser}cancelSubscription`, data, { headers })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiVerifyPaymentSession = (data) => {
  return axios.post(`${apiUser}verifyPaymentSession`, data, { 
    headers: { ...getHeaders(), 'x-skip-loader': true },
    skipLoader: true
  })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

const getHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("sellerToken")}`,
  "Content-Type": "application/json",
});

const ApiInviteUser = (data) => {
  return axios.post(`${apiUser}inviteUser`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

const ApiGetInvitationList = (data) => {
  return axios.post(`${apiUser}getInvitationList`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

const ApiCancelInvitation = (data) => {
  return axios.post(`${apiUser}cancelInvitation`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

const ApiResendInvitation = (data) => {
  return axios.post(`${apiUser}resendInvitation`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

const ApiCheckInvitation = (token) => {
  return axios.get(`${apiUser}checkInvitation/${token}`)
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

const ApiAcceptInvitation = (data) => {
  return axios.post(`${apiUser}acceptInvitation`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

const ApiRejectInvitation = (data) => {
  return axios.post(`${apiUser}rejectInvitation`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

const ApiSuperAdminLoginAsUser = (data) => {
  return axios.post(`${apiUser}superAdminLoginAsUser`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

const ApiGenerate2FA = () => {
  return axios.post(`${apiUser}generate2fa`, {}, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

const ApiVerifyAndEnable2FA = (data) => {
  return axios.post(`${apiUser}verifyAndEnable2fa`, data, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

const ApiDisable2FA = () => {
  return axios.post(`${apiUser}disable2fa`, {}, { headers: getHeaders() })
    .then((res) => res.data)
    .catch((res) => res?.response?.data || res.data);
};

export {
  ApiUserList,
  ApiUserPermission,
  ApiUpdateUserPermission,
  ApiUpdateUser,
  ApiCreateUser,
  ApiDeleteUser,
  ApiUpdateUserProfileAccess,
  ApiRegistration,
  ApiSendOtp,
  ApiVerifyOtp,
  ApiForgotPassword,
  ApiResetPassword,
  ApiSaveTrialSubscription,
  ApiCreateSubscription,
  ApiVerifyPaymentSession,
  ApiCancelSubscription,
  ApiInviteUser,
  ApiGetInvitationList,
  ApiCancelInvitation,
  ApiResendInvitation,
  ApiCheckInvitation,
  ApiAcceptInvitation,
  ApiRejectInvitation,
  ApiSuperAdminLoginAsUser,
  ApiGenerate2FA,
  ApiVerifyAndEnable2FA,
  ApiDisable2FA,
};
