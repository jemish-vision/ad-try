import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/customer/`;
const authToken = localStorage.getItem("sellerToken");
const headers = {
  Authorization: `Bearer ${authToken}`,
  "Content-Type": "application/json",
};

const ApiFilterListing = (data, options = {}) => {
  return axios
    .post(`${api}getFilter`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiSaveFilter = (data, options = {}) => {
  return axios
    .post(`${api}saveFilter`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiDeleteFilter = (data, options = {}) => {
  return axios
    .post(`${api}deleteFilter`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetCampaignAndAdGroupAutoSearch = (data, options = {}) => {
  return axios
    .post(`${api}getCampaignAndAdGroupAutoSearch`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetadsNotification = (data, options = {}) => {
  return axios
    .post(`${api}getadsNotification`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetProfile = (options = {}) => {
  return axios.get(`${api}getProfile`, { 
    headers: { ...headers, ...(options?.headers || {}) },
    ...options
  })
    .then(res => res.data).catch(res => res.data)
}

const ApiSiteTourCompleted = (data) => {
  return axios.post(`${api}siteTourCompleted`, data, { headers: { ...headers } })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiCustomChatBot = (data) => {
  return axios.post(`${api}chatbot`, data, { headers: { ...headers } })
    .then((res) => res.data)
    .catch((error) => ({
      ...(error.response?.data || {}),
      replyMessage: error.response?.data?.replyMessage || "I could not load this report right now. Please try again in a moment.",
      stopConversion: false,
    }));
};

const ApiCustomChatBotStream = async ({ data, signal, onStatus, onReport, onToken, onDone, onError }) => {
  try {
    const token = localStorage.getItem("sellerToken");
    const response = await fetch(`${api}chatbot`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...data, stream: true }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream") || !response.body) {
      const fallback = await response.json();
      onDone?.(fallback);
      return fallback;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let isDoneDispatched = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const block of parts) {
        if (!block.trim()) continue;
        let eventType = "message";
        let dataPayload = "";

        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataPayload = line.slice(6);
          }
        }

        if (!dataPayload) continue;

        try {
          const parsed = JSON.parse(dataPayload);
          if (eventType === "status") {
            onStatus?.(parsed.message);
          } else if (eventType === "report") {
            onReport?.(parsed.report);
          } else if (eventType === "token") {
            onToken?.(parsed.delta);
          } else if (eventType === "done") {
            isDoneDispatched = true;
            onDone?.(parsed);
          } else if (eventType === "error") {
            isDoneDispatched = true;
            onError?.(parsed);
          }
        } catch (_) {}
      }
    }

    if (!isDoneDispatched) {
      if (buffer.trim()) {
        try {
          let eventType = "message";
          let dataPayload = "";
          for (const line of buffer.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataPayload = line.slice(6);
          }
          if (dataPayload) {
            const parsed = JSON.parse(dataPayload);
            if (eventType === "done") { isDoneDispatched = true; onDone?.(parsed); }
            else if (eventType === "error") { isDoneDispatched = true; onError?.(parsed); }
          }
        } catch (_) {}
      }
      if (!isDoneDispatched) {
        onDone?.({ replyMessage: "Response complete." });
      }
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      return;
    }
    try {
      const fallback = await ApiCustomChatBot(data);
      onDone?.(fallback);
      return fallback;
    } catch (fallbackErr) {
      onError?.(fallbackErr);
    }
  }
};

const ApiCreateSupportTicket = (data) => {
  return axios.post(`${api}createSupportTicket`, data, { headers: { ...headers } })
    .then((res) => res.data)
    .catch((res) => res.data);
}

const ApiGetSupportChat = (data) => {
  return axios.post(`${api}getSupportTicket`, data, { headers: { ...headers } })
    .then((res) => res.data)
    .catch((res) => res.data);
}

const ApiSendSupportMessage = (data) => {
  return axios.post(`${api}sendSupportTicketMessage`, data, { headers: { ...headers } })
    .then((res) => res.data)
    .catch((res) => res.data);
}

const ApiGetUserTickets = (data) => {
  return axios.post(`${api}getUserTickets`, data, { headers: { ...headers } })
    .then((res) => res.data)
    .catch((res) => res.data);
}

const ApiFileUpload = (data) => {
  return axios.post(`${api}fileUpload`, data, { headers: { ...headers, action: "Create", "Content-Type": undefined, } })
    .then(res => res.data).catch(res => res.data)
}

const ApiGetCampaignAndAdGroup = (data, options = {}) => {
  return axios.post(`${api}getCampaignAndAdGroup`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiSavePageFilter = (data, options = {}) => {
  return axios.post(`${api}savePageFilter`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

const ApiGetPageFilter = (data, options = {}) => {
  return axios.post(`${api}getPageFilter`, data, { headers: { ...headers, 'x-skip-loader': true }, skipLoader: true, ...options })
    .then((res) => res.data)
    .catch((res) => res.data);
};

// AI Assistant Chat Sessions Backend Management
const ApiGetChatSessions = (data) => {
  const token = localStorage.getItem("sellerToken");
  return axios
    .post(`${api}getChatSessions`, data, {
      headers: { ...headers, Authorization: `Bearer ${token}`, "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((err) => ({ isSuccess: false, message: err?.message, data: [] }));
};

const ApiSaveChatSession = (data) => {
  const token = localStorage.getItem("sellerToken");
  return axios
    .post(`${api}saveChatSession`, data, {
      headers: { ...headers, Authorization: `Bearer ${token}`, "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((err) => ({ isSuccess: false, message: err?.message }));
};

const ApiDeleteChatSession = (data) => {
  const token = localStorage.getItem("sellerToken");
  return axios
    .post(`${api}deleteChatSession`, data, {
      headers: { ...headers, Authorization: `Bearer ${token}`, "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((err) => ({ isSuccess: false, message: err?.message }));
};

const ApiClearChatSessions = (data) => {
  const token = localStorage.getItem("sellerToken");
  return axios
    .post(`${api}clearChatSessions`, data, {
      headers: { ...headers, Authorization: `Bearer ${token}`, "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((err) => ({ isSuccess: false, message: err?.message }));
};

const ApiRenameChatSession = (data) => {
  const token = localStorage.getItem("sellerToken");
  return axios
    .post(`${api}renameChatSession`, data, {
      headers: { ...headers, Authorization: `Bearer ${token}`, "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((err) => ({ isSuccess: false, message: err?.message }));
};

const ApiMigrateChatSessions = (data) => {
  const token = localStorage.getItem("sellerToken");
  return axios
    .post(`${api}migrateChatSessions`, data, {
      headers: { ...headers, Authorization: `Bearer ${token}`, "x-skip-loader": true },
      skipLoader: true,
    })
    .then((res) => res.data)
    .catch((err) => ({ isSuccess: false, message: err?.message }));
};

export {
  ApiGetPageFilter,
  ApiSavePageFilter,
  ApiFilterListing,
  ApiSaveFilter,
  ApiDeleteFilter,
  ApiGetCampaignAndAdGroupAutoSearch,
  ApiGetadsNotification,
  ApiGetProfile,
  ApiSiteTourCompleted,
  ApiCustomChatBot,
  ApiCustomChatBotStream,
  ApiCreateSupportTicket,
  ApiGetSupportChat,
  ApiSendSupportMessage,
  ApiGetUserTickets,
  ApiFileUpload,
  ApiGetCampaignAndAdGroup,
  ApiGetChatSessions,
  ApiSaveChatSession,
  ApiDeleteChatSession,
  ApiClearChatSessions,
  ApiRenameChatSession,
  ApiMigrateChatSessions,
};
