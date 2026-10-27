import axios from "axios";

export const ApiUnansweredQuestions = (params, signal) => axios.get(`${process.env.REACT_APP_API_BASE}/api/superAdmin/unanswered-questions`, {
  params,
  signal,
  headers: {
    Authorization: `Bearer ${localStorage.getItem("sellerToken")}`,
    "x-skip-loader": true
  },
  skipLoader: true
}).then(({
  data
}) => data);

export const ApiUnansweredQuestionProfiles = (params, signal) => axios.get(`${process.env.REACT_APP_API_BASE}/api/superAdmin/unanswered-questions/profiles`, {
  params,
  signal,
  headers: {
    Authorization: `Bearer ${localStorage.getItem("sellerToken")}`,
    "x-skip-loader": true
  },
  skipLoader: true
}).then(({
  data
}) => data);
