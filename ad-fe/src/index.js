import React from "react";
import ReactDOM from "react-dom/client";
import { toast } from "react-toastify";
import "primereact/resources/themes/lara-light-cyan/theme.css";

import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { Provider } from "react-redux";
import axios from "axios";
import store from "./common/redux/store";
import { handleLoader } from "./common/redux/action";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "./i18n";
import { PrimeReactProvider } from 'primereact/api';
import { ROLES } from "./common/constants";

// Prevent ResizeObserver loop errors from throwing in development
const _ResizeObserver = window.ResizeObserver;
window.ResizeObserver = class ResizeObserver extends _ResizeObserver {
  constructor(callback) {
    super((entries, observer) => {
      window.requestAnimationFrame(() => {
        callback(entries, observer);
      });
    });
  }
};

// Preserve user's theme selection and language choice across localStorage.clear() calls (e.g. on logout)
const originalClear = localStorage.clear;
localStorage.clear = function () {
  const theme = localStorage.getItem("theme");
  const i18nextLng = localStorage.getItem("i18nextLng");
  originalClear.call(localStorage);
  if (theme) {
    localStorage.setItem("theme", theme);
  }
  if (i18nextLng) {
    localStorage.setItem("i18nextLng", i18nextLng);
  }
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute fresh data window to prevent redundant refetches
      cacheTime: 5 * 60 * 1000, // 5 minutes in cache
      refetchOnWindowFocus: false, // Prevents duplicate network bursts when switching tabs
      retry: 1,
    },
  },
});

const { dispatch } = store;


const checkArr = [
  "listProfiles",
  "addToFavoriteProfile",
  "checkASINFromDB",
  "productSearchOnAmazon",
  "changeStatusByProfile",
  "getCampaignAndAdGroupAutoSearch",
  "getadsNotification",
  "getTargetingChartData",
  "listProfiles",
  "AIAnalysis",
  "manuallyRunCronJob",
  "updateColumns",
  "chatbot",
  "createSupportTicket",
  "sendSupportTicketMessage",
  "getUserTickets",
  "siteTourCompleted",
  "getTargetingKeywordDetails",
  "getChangesByCampaign",
  "getChangesByProduct",
  "getChangesByKeyword",
  "getAssignedCampaignComparison",
  "getAdTypeBreakdown",
  "previewSDCreative",
  "getRecommendationData",
  "getTotalRecommendationCount",
  "getRecommendation",
  "deleteRecommendation",
  "hourlyCampaignTracking",
  "hourlyPlacementTracking",
  "analyzeListingWithAI",
  "applyListingOptimization",
  "getListofCompetitorsProduct",
  "competitors",
  "aplusContent",
  "fileUpload",
  "getProfitAnalysisSummary",
  "getProfitAnalysisMonthly",
  "getProfitAnalysisProducts",
  "getCampaigns",
  "getCampaignChartData",
  "getPlacement",
  "getAllPlacements",
  "getTargeting",
  "getTargetingChartListing",
  "getAllSearchTerms",
  "getSearchTermsProductView",
  "listProduct",
  "getProductList",
  "get-dashboard-cards",
  "get-dashboard-graph",
  "get-dashboard-grid",
  "get-inventory-cards",
  "get-inventory-graph",
  "get-inventory-grid",
  "get-aging-cards",
  "get-aging-grid",
  "get-aging-config",
  "save-aging-config",
  "get-inventory-forecast-cards",
  "get-inventory-forecast-graph",
  "get-inventory-forecast-grid",
  "get-global-inventory-settings",
  "save-global-inventory-settings",
  "get-ASIN-inventory-settings",
  "save-ASIN-inventory-settings",
  "delete-ASIN-inventory-settings",
  "product-performance-matrix",
  "smart-insights",
  "getColumns",
  "getProductTypes",
  "getAllMarketplaces",
  "getAllPerformanceScoreSetting",
  "getFilter",
  "getPageFilter",
  "savePageFilter",
  "getCampaignBidThreshold",
  "calculateCampaignMaxBid",
  "getPlacementRules",
  "getSearchTermRules",
  "getTargetingRule",
  "getBudgetRule",
  "ruleHistory",
  "getCampaignAndAdGroupAutoSearch",
  "getCampaignAndAdGroup",
  "getadsNotification",
  "getNotificationStatus",
  "updateNotificationStatus",
  "getShippingQueueDetails",
  "getAllShippingQueue",
  "getReimbursement",
  "reconciliation-reimbursement"
];

// In-Flight Request Deduplicator for read queries (prevents duplicate simultaneous network bursts)
const inFlightRequests = new Map();

const getDedupeKey = (config) => {
  const method = (config.method || "get").toLowerCase();
  const isReadQuery = method === "get" || (
    method === "post" && (
      config.url?.includes("get") ||
      config.url?.includes("list") ||
      config.url?.includes("Search") ||
      config.url?.includes("Filter") ||
      config.url?.includes("cards") ||
      config.url?.includes("graph") ||
      config.url?.includes("grid")
    )
  );

  const isMutating =
    config.url?.includes("save") ||
    config.url?.includes("update") ||
    config.url?.includes("delete") ||
    config.url?.includes("create") ||
    config.url?.includes("add") ||
    config.url?.includes("upload") ||
    config.url?.includes("export") ||
    config.url?.includes("import") ||
    config.url?.includes("run") ||
    config.url?.includes("statusChange");

  if (!isReadQuery || isMutating || config.bypassDedupe) {
    return null;
  }

  const dataStr = typeof config.data === "string" ? config.data : JSON.stringify(config.data || {});
  const paramsStr = typeof config.params === "string" ? config.params : JSON.stringify(config.params || {});
  const configId = config.headers?.["x-config-id"] || "";
  const orgId = config.headers?.["x-organization-id"] || "";

  return `${method}:${config.url}:${configId}:${orgId}:${paramsStr}:${dataStr}`;
};

const rawAdapter = axios.defaults.adapter;
if (rawAdapter) {
  axios.defaults.adapter = async (config) => {
    const key = getDedupeKey(config);
    if (!key) {
      const adapterFn = typeof rawAdapter === "function" ? rawAdapter : (Array.isArray(rawAdapter) && axios.getAdapter ? axios.getAdapter(rawAdapter) : rawAdapter);
      return adapterFn(config);
    }

    if (inFlightRequests.has(key)) {
      return inFlightRequests.get(key);
    }

    const adapterFn = typeof rawAdapter === "function" ? rawAdapter : (Array.isArray(rawAdapter) && axios.getAdapter ? axios.getAdapter(rawAdapter) : rawAdapter);
    const requestPromise = adapterFn(config)
      .finally(() => {
        inFlightRequests.delete(key);
      });

    inFlightRequests.set(key, requestPromise);
    return requestPromise;
  };
}

let activeRequests = new Set();

axios.interceptors.request.use(
  (config) => {
    let find = checkArr.some((x) => config.url?.includes(x)) || config.skipLoader || config.headers?.["x-skip-loader"];

    if (!find) {
      activeRequests.add(config.url);
      dispatch(handleLoader(true));
    }

    let parsedProfile = null;
    try {
      parsedProfile = JSON.parse(localStorage.getItem("profile"));
    } catch (e) { }

    const configId =
      config.headers?.["x-config-id"] ||
      parsedProfile?.config?.configId ||
      parsedProfile?.configId ||
      localStorage.getItem("configId");

    if (configId) {
      config.headers["x-config-id"] = configId;
    }

    const authToken = localStorage.getItem("sellerToken");
    if (authToken && authToken !== "null" && authToken !== "undefined") {
      config.headers["Authorization"] = `Bearer ${authToken}`;
    }

    const adType = localStorage.getItem("adType");
    if (adType) config.headers["adType"] = adType;

    const organizationId = localStorage.getItem("organizationId");
    if (organizationId && organizationId !== "null" && organizationId !== "undefined") {
      config.headers["x-organization-id"] = organizationId;
      config.headers["organizationid"] = organizationId;
    }

    const currentLanguage = localStorage.getItem("i18nextLng") || i18n.language || "en";
    config.headers["Accept-Language"] = currentLanguage;

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

axios.interceptors.response.use(
  (response) => {
    activeRequests.delete(response.config.url);
    if (activeRequests.size === 0) dispatch(handleLoader(false));

    const data = response.data;

    if (data?.isNotPagePermission === true) {
      if (window.location.pathname !== "/no-page-permission") {
        window.location.href = "/no-page-permission";
      }
      return response;
    }

    // Maintenance mode redirect (non-Owner users only)
    if (data?.isMaintenanceMode === true) {
      const role = localStorage.getItem("role");
      if (role !== ROLES.SUPER_ADMIN && window.location.pathname !== "/maintenance-mode") {
        window.location.href = "/maintenance-mode";
      }
      return response;
    }

    // Token expired / invalid / account inactive or disabled
    if (
      data?.isSuccess === false &&
      (data?.message === "Invalid token" ||
        data?.message === "Token Expired" ||
        data?.message === "Token is required" ||
        data?.message === "User account is inactive or disabled")
    ) {
      localStorage.clear();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      return response;
    }

    // Access denied — user does not have permission for this org/resource
    // Redirect to org selection so they can switch to an accessible org
    if (data?.isSuccess === false && data?.message === "Access denied. You do not have permission to access this resource." && window.location.pathname !== "/select-organization") {
      window.location.href = "/select-organization";
    }

    return response;
  },
  (error) => {
    if (error?.config?.url) activeRequests.delete(error.config.url);
    if (activeRequests.size === 0) dispatch(handleLoader(false));

    // Display Toast notification for Amazon Rate Limit errors globally
    if (error?.response?.status === 429) {
      toast.error(error.response.data?.message || "Amazon is currently busy processing data. Please try again in a few seconds.");
    }

    const role = localStorage.getItem("role");
    const isOwner = role === ROLES.SUPER_ADMIN;
    const alreadyOnMaintenance = window.location.pathname === "/maintenance-mode";

    // Unauthorized or disabled account in error response
    if (
      error?.response?.status === 401 ||
      (error?.response?.data?.isSuccess === false &&
        (error?.response?.data?.message === "Invalid token" ||
          error?.response?.data?.message === "Token Expired" ||
          error?.response?.data?.message === "Token is required" ||
          error?.response?.data?.message === "User account is inactive or disabled"))
    ) {
      localStorage.clear();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    const isConnectionRefused = !error.response && (error.code === "ERR_NETWORK" || error.code === "ERR_CONNECTION_REFUSED" || error.message === "Network Error");
    const isServerDown = [502, 503, 504].includes(error?.response?.status);
    const isMaintenanceFlagged = error?.response?.data?.isMaintenanceMode === true;

    const isChatRequest = /\/api\/customer\/(?:chatbot|chatbot-reporting)(?:[/?]|$)/.test(error?.config?.url || "");
    // A reporting/AI outage belongs in chat; explicit maintenance still redirects.
    const requiresMaintenance = isMaintenanceFlagged || (!isChatRequest && (isConnectionRefused || isServerDown));

    if (requiresMaintenance && !isOwner && !alreadyOnMaintenance) {
      window.location.href = "/maintenance-mode";
    }

    return Promise.reject(error);
  }
);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <QueryClientProvider client={queryClient}>
    <Provider store={store}>
      <PrimeReactProvider>
        <App />
      </PrimeReactProvider>
    </Provider>
  </QueryClientProvider>
);

// Unregister the service worker so browsers always fetch the latest live build
serviceWorkerRegistration.unregister();

// Automatically clear any old service workers & caches from users' browsers
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}
if ('caches' in window) {
  caches.keys().then((names) => {
    for (const name of names) {
      caches.delete(name);
    }
  });
}

reportWebVitals();
