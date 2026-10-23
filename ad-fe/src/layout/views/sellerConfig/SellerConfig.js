import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { useTranslation } from "react-i18next";
import { Toast } from "../../../helper/links/Link";
import { ApiDisconnectSPAmazonConfig, ApiSellerConfigList, ApiUpdateProfileSyncSettings, ApiGetProfileSyncDetails } from "../../../api-wrapper/ApiAdsConfig";
import Filter from "../../../helper/filter/Filter";
import { useEffect, useState, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import AgTable from "../../../common/grid/AgTable";
import moment from "moment";
import axios from "axios";
import SubscriptionModal from "./SubscriptionModal";
import RequestSyncModal from "./RequestSyncModal";
import SynchronizationModal from "../config/SynchronizationModal";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { AppTooltip } from "../../../components/ui/AppTooltip";

// Portal-based tooltip immune to AG-Grid CSS transform offsets

const formatDate = (date) => date ? moment(date).format("DD/MM/YYYY hh:mm:ss A") : "--";

const SellerConfig = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const handledQueryRef = useRef(false);
  const [configList, setConfigList] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get("status");
    const connected = params.get("connected");
    const message = params.get("message");

    if (!handledQueryRef.current) {
      if (status === "success" && (connected === "amazon_seller" || params.has("sellerId"))) {
        handledQueryRef.current = true;
        Toast.success(t("Amazon Account Connected Successfully!"));
        window.history.replaceState({}, "", window.location.pathname);
      } else if (status === "error" && message) {
        handledQueryRef.current = true;
        Toast.error(decodeURIComponent(message));
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [location.search]);


  const [subscriptionModal, setSubscriptionModal] = useState(null);
  const [requestSyncModal, setRequestSyncModal] = useState(null);
  const [syncSetupModal, setSyncSetupModal] = useState(null);
  const [connectingProfileId, setConnectingProfileId] = useState(null);
  const [updatingSellerId, setUpdatingSellerId] = useState(null);
  const [syncDetailsMap, setSyncDetailsMap] = useState({});

  const [disconnectConfirm, setDisconnectConfirm] = useState(null);

  const handleToggleSpSync = async (row, newStatus) => {
    const profileId = row?.profileId;
    const configId = row?.configId?._id || row?.configId || row?.sellerConfig?.configId;
    if (!profileId) return;

    setUpdatingSellerId(profileId);
    try {
      const res = await ApiUpdateProfileSyncSettings({
        profileId: Number(profileId),
        configId,
        isSpSyncEnabled: newStatus
      });
      if (res?.isSuccess) {
        Toast.success(newStatus ? "Seller SP data sync enabled" : "Seller SP data sync paused");
        ApiListing();
      } else {
        Toast.error(res?.message ? t(res.message) : t("Failed to update sync settings"));
      }
    } catch {
      Toast.error(t("Failed to update sync settings"));
    } finally {
      setUpdatingSellerId(null);
    }
  };

  const gridRef = useRef(null);
  const [loadingGrid, setLoadingGrid] = useState(false);

  const ApiListing = async (skip = false) => {
    setLoadingGrid(true);
    try {
      const res = await ApiSellerConfigList(undefined, skip);
      if (res?.isSuccess) {
        const listData = res?.data || [];
        // Sort config-wise (by store companyName, then profile name)
        listData.sort((a, b) => {
          const nameA = (a?.configId?.companyName || a?.sellerConfig?.sellerId || "").toLowerCase();
          const nameB = (b?.configId?.companyName || b?.sellerConfig?.sellerId || "").toLowerCase();
          if (nameA !== nameB) {
            return nameA.localeCompare(nameB);
          }
          const profA = (a?.name || "").toLowerCase();
          const profB = (b?.name || "").toLowerCase();
          return profA.localeCompare(profB);
        });
        setConfigList(listData);

        const configIds = [...new Set(listData.map(r => r.configId?._id || r.configId || r.sellerConfig?.configId).filter(Boolean))];
        if (configIds.length > 0) {
          const syncResults = await Promise.all(configIds.map(id => ApiGetProfileSyncDetails(id).catch(() => null)));
          const statusMap = {};
          syncResults.forEach(syncRes => {
            if (syncRes?.isSuccess && Array.isArray(syncRes?.data)) {
              syncRes.data.forEach(r => {
                if (r.type === "seller") {
                  const pIdKey = String(r.profileId);
                  if (!statusMap[pIdKey]) statusMap[pIdKey] = [];
                  statusMap[pIdKey].push(r);
                }
              });
            }
          });

          const finalMap = {};
          Object.keys(statusMap).forEach(pIdKey => {
            const records = statusMap[pIdKey];
            let status = "NONE";
            if (records.some(r => r.requestStatus === "IN_PROGRESS")) {
              status = "IN_PROGRESS";
            } else if (records.some(r => r.requestStatus === "COMPLETED")) {
              status = "COMPLETED";
            } else if (records.some(r => r.requestStatus === "PENDING")) {
              status = "PENDING";
            }
            finalMap[pIdKey] = status;
            finalMap[Number(pIdKey)] = status;
          });
          setSyncDetailsMap(finalMap);
        }
      } else {
        Toast.error(res?.message ? t(res.message) : t("Failed to fetch seller config"));
      }
    } catch {
      Toast.error(t("Something went wrong"));
    } finally {
      setLoadingGrid(false);
    }
  };

  const autoOpenSyncRef = useRef(false);

  useEffect(() => {
    ApiListing();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const targetSeller = params.get("autoOpenSync");

    if (targetSeller && targetSeller !== "latest" && targetSeller !== "true" && configList.length > 0 && !autoOpenSyncRef.current) {
      const matchRow = configList.find((r) =>
        String(r.sellerId) === String(targetSeller) ||
        String(r.sellerConfig?.sellerId) === String(targetSeller) ||
        String(r.profileId) === String(targetSeller) ||
        String(r.configId) === String(targetSeller) ||
        String(r.sellerConfig?._id) === String(targetSeller) ||
        String(r._id) === String(targetSeller)
      );

      if (matchRow) {
        autoOpenSyncRef.current = true;
        setSyncSetupModal(matchRow);
        localStorage.removeItem("appstore_seller_id");
        sessionStorage.removeItem("appstore_seller_id");
        localStorage.removeItem("amazon_appstore_flow");
        sessionStorage.removeItem("amazon_appstore_flow");
        window.history.replaceState({}, "", window.location.pathname + "?tab=seller-config");
      }
    }
  }, [location.search, configList]);

  const handleDisconnect = (row) => {
    setDisconnectConfirm(row);
  };

  const executeDisconnect = async () => {
    if (!disconnectConfirm) return;
    try {
      const res = await ApiDisconnectSPAmazonConfig({ sellerConfigId: disconnectConfirm?.sellerConfig?._id });
      if (res.isSuccess) {
        Toast.success(t("Amazon account disconnected successfully"));
        ApiListing();
      } else {
        Toast.error(res.message || t("Failed to disconnect"));
      }
    } catch {
      Toast.error(t("Something went wrong while disconnecting"));
    } finally {
      setDisconnectConfirm(null);
    }
  };

  const handleConnectSeller = async (profileId) => {
    // Pre-open new tab synchronously (inside click context) to avoid popup blockers
    const newTab = window.open("", "_blank");
    // Show a clean loading page so the tab doesn't appear blank
    if (newTab) {
      newTab.document.write(`<!DOCTYPE html><html><head><title>Redirecting…</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
          .ring{width:36px;height:36px;border:3px solid #e5e7eb;border-top-color:#2563eb;border-radius:50%;animation:spin .7s linear infinite;margin-bottom:24px}
          @keyframes spin{to{transform:rotate(360deg)}}
          p{color:#111827;font-size:15px;font-weight:500;margin-bottom:6px}
          span{color:#9ca3af;font-size:13px}
        </style></head>
        <body><div class="ring"></div><p>${t("Connecting to Amazon Seller Central")}</p><span>${t("You'll be redirected automatically")}</span></body></html>`);
      newTab.document.close();
    }
    setConnectingProfileId(profileId);
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_BASE}/api/config/amazonSPRedirect`, {
        profileId: profileId,
        reconnect: false
      });

      if (response.data && response.data.isSuccess && response.data.data.authUrl) {
        newTab.location.href = response.data.data.authUrl;
      } else {
        if (newTab) newTab.close();
        Toast.error(t("Failed to initiate connection:") + " " + (response.data.message || t("Unknown error")));
      }
    } catch (error) {
      if (newTab) newTab.close();
      console.error("Error connecting seller central:", error);
      Toast.error(t("An error occurred while connecting."));
    } finally {
      setConnectingProfileId(null);
    }
  };

  const getProfileSyncStatus = (row) => {
    if (!row) return "NONE";
    const pIdStr = String(row?.profileId);
    const pIdNum = Number(row?.profileId);
    return syncDetailsMap[pIdStr] || syncDetailsMap[pIdNum] || "NONE";
  };

  const columns = useMemo(() => [
    ...(PermissionCheck(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.CREATE) ? [
      {
        headerName: t("Action"),
        field: "action",
        title: "Action",
        minWidth: 180,
        sortable: false,
        resizable: false,
        cellRenderer: (params) => {
          const row = params.data;
          if (!row) return null;
          const syncStatus = getProfileSyncStatus(row);
          const isComplete = syncStatus === "COMPLETED";
          const isInProgress = syncStatus === "IN_PROGRESS";

          return (
            <div className="action_container gap-2 flex items-center pr-3" style={{ height: "100%", paddingTop: "6px" }}>
              {row?.sellerConfig?.isActive ? (
                <AppTooltip text={t("Disconnect Account")}>
                  <button
                    onClick={() => handleDisconnect(row)}
                    style={{
                      background: isDark ? "rgba(239, 68, 68, 0.1)" : "#fef2f2",
                      border: isDark ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid #fee2e2",
                      borderRadius: "100px",
                      color: isDark ? "#f87171" : "#ef4444",
                      width: "32px",
                      height: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "rgba(239, 68, 68, 0.2)" : "#fee2e2"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? "rgba(239, 68, 68, 0.1)" : "#fef2f2"; }}
                  >
                    <i className="fa fa-unlink" />
                  </button>
                </AppTooltip>
              ) : connectingProfileId === row?.profileId ? (
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: isDark ? "#34d399" : "#10b981"
                  }}
                >
                  <i className="fa fa-spinner fa-spin" />
                </div>
              ) : (
                <AppTooltip text={row?.sellerConfig?.disconnectedAt ? t("Reconnect Seller Account") : t("Click here to Connect")}>
                  <button
                    onClick={() => handleConnectSeller(row?.profileId)}
                    style={{
                      background: isDark ? "rgba(16, 185, 129, 0.1)" : "#ecfdf5",
                      border: isDark ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid #d1fae5",
                      borderRadius: "100px",
                      color: isDark ? "#34d399" : "#10b981",
                      width: "32px",
                      height: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "rgba(16, 185, 129, 0.2)" : "#d1fae5"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? "rgba(16, 185, 129, 0.1)" : "#ecfdf5"; }}
                  >
                    <i className="fa fa-link" />
                  </button>
                </AppTooltip>
              )}
              <div style={{ position: "relative", overflow: "visible" }}>
                <AppTooltip text={t("Manage Subscriptions")}>
                  <button
                    onClick={() => setSubscriptionModal(row)}
                    style={{
                      background: isDark ? "rgba(37, 99, 235, 0.1)" : "#eff6ff",
                      border: isDark ? "1px solid rgba(37, 99, 235, 0.2)" : "1px solid #dbeafe",
                      borderRadius: "100px",
                      color: isDark ? "#60a5fa" : "#2563eb",
                      width: "32px",
                      height: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "rgba(37, 99, 235, 0.2)" : "#dbeafe"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? "rgba(37, 99, 235, 0.1)" : "#eff6ff"; }}
                  >
                    <i className="fa fa-bell" />
                  </button>
                </AppTooltip>
                {row?.amsSubscription?.length > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-6px",
                      right: "-6px",
                      fontSize: "10px",
                      fontWeight: 600,
                      padding: "2px 6px",
                      pointerEvents: "none",
                      background: isDark ? "rgba(239, 68, 68, 0.15)" : "#fef2f2",
                      border: isDark ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid #fecaca",
                      borderRadius: "100px",
                      color: isDark ? "#f87171" : "#ef4444",
                      lineHeight: 1,
                      zIndex: 2
                    }}
                  >
                    {row.amsSubscription?.length}
                  </span>
                )}
              </div>

              {/* Request Sync Details Button */}
              {/* <AppTooltip text={t("Request Sync Details")}>
                <button
                  onClick={() => setRequestSyncModal(row)}
                  style={{
                    background: isDark ? "rgba(99, 102, 241, 0.1)" : "#e0e7ff",
                    border: isDark ? "1px solid rgba(99, 102, 241, 0.2)" : "1px solid #c7d2fe",
                    borderRadius: "100px",
                    color: isDark ? "#818cf8" : "#4f46e5",
                    width: "32px",
                    height: "32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "rgba(99, 102, 241, 0.2)" : "#c7d2fe"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? "rgba(99, 102, 241, 0.1)" : "#e0e7ff"; }}
                >
                  <i className="fa fa-refresh" />
                </button>
              </AppTooltip> */}

              {/* Edit Sync Settings Button (Placed on far right hand side; HIDE once status is COMPLETED) */}
              {row.sellerConfig?.isActive && !isComplete && (
                <AppTooltip text={isInProgress ? t("Synchronization in progress") : t("Sync Settings")}>
                  <button
                    disabled={isInProgress}
                    onClick={() => setSyncSetupModal(row)}
                    style={{
                      background: isInProgress ? (isDark ? "rgba(245, 158, 11, 0.1)" : "#fffbeb") : (isDark ? "rgba(148, 163, 184, 0.1)" : "#f1f5f9"),
                      border: isInProgress ? (isDark ? "1px solid rgba(245, 158, 11, 0.2)" : "1px solid #fde68a") : (isDark ? "1px solid rgba(148, 163, 184, 0.2)" : "1px solid #e2e8f0"),
                      borderRadius: "100px",
                      color: isInProgress ? (isDark ? "#fbbf24" : "#d97706") : (isDark ? "#94a3b8" : "#475569"),
                      width: "32px",
                      height: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: isInProgress ? "not-allowed" : "pointer",
                      opacity: isInProgress ? 0.7 : 1,
                      transition: "all 0.15s ease"
                    }}
                    onMouseEnter={(e) => {
                      if (!isInProgress) {
                        e.currentTarget.style.background = isDark ? "rgba(148, 163, 184, 0.2)" : "#e2e8f0";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isInProgress) {
                        e.currentTarget.style.background = isDark ? "rgba(148, 163, 184, 0.1)" : "#f1f5f9";
                      }
                    }}
                  >
                    <i className={`fa ${isInProgress ? "fa-spinner fa-spin" : "fa-cog"}`} />
                  </button>
                </AppTooltip>
              )}
            </div>
          );
        },
      },
    ] : []),
    {
      headerName: t("Active"),
      field: "isSpSyncEnabled",
      title: "Active",
      width: 90,
      minWidth: 90,
      sortable: false,
      resizable: false,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;

        const hasSellerId = Boolean(row.sellerConfig?.sellerId || row.sellerId);
        const isConnected = Boolean(row.sellerConfig?.isActive);
        const syncStatus = getProfileSyncStatus(row);
        const isComplete = syncStatus === "COMPLETED";
        const isSpSyncActive = hasSellerId && row.isSpSyncEnabled === true;
        const isSwitchDisabled = !hasSellerId || !isConnected || !isComplete || updatingSellerId === row.profileId;

        let tooltipText = "";
        if (!hasSellerId) {
          tooltipText = t("No seller account connected");
        } else if (!isConnected) {
          tooltipText = t("Account is not connected");
        } else if (!isComplete) {
          tooltipText = t("Synchronization is not completed");
        } else if (isSpSyncActive) {
          tooltipText = t("Seller SP Sync Active (Click to Pause)");
        } else {
          tooltipText = t("Seller SP Sync Paused (Click to Resume)");
        }

        return (
          <div className="flex items-center" style={{ height: "100%" }}>
            <AppTooltip text={tooltipText}>
              <label className={`relative inline-flex items-center ${isSwitchDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} mb-0`}>
                <input
                  type="checkbox"
                  checked={isSpSyncActive}
                  disabled={isSwitchDisabled}
                  onChange={(e) => handleToggleSpSync(row, e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:after:border-slate-600 peer-checked:bg-emerald-500"></div>
              </label>
            </AppTooltip>
          </div>
        );
      }
    },
    {
      headerName: t("Name"),
      field: "name",
      title: "Name",
      minWidth: 180,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return <p className="fw-bolder">{row?.countryCode} | {row?.name}</p>;
      },
    },
    {
      headerName: t("Marketplace ID"),
      field: "marketplaceStringId",
      title: "Marketplace ID",
      minWidth: 160,
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => <p>{params.value}</p>,
    },
    {
      headerName: t("Seller ID"),
      field: "sellerConfig.sellerId",
      title: "Seller ID",
      width: 130,
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return <p>{row?.sellerConfig?.sellerId}</p>;
      },
    },
    {
      headerName: t("Token Updated At"),
      field: "sellerConfig.updatedAt",
      title: "Token Updated At",
      minWidth: 200,
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex flex-col gap-1">
            <span>{formatDate(row?.sellerConfig?.updatedAt)}</span>
          </div>
        );
      },
    },
    {
      headerName: t("Sync Status"),
      field: "syncStatus",
      title: "Sync Status",
      minWidth: 140,
      sortable: false,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        if (!row.sellerConfig?.isActive) {
          if (row.sellerConfig?.disconnectedAt) {
            return (
              <div className="flex items-center" style={{ height: "100%" }}>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800" title={`Disconnected: ${formatDate(row.sellerConfig.disconnectedAt)}`}>
                  <i className="fa fa-exclamation-triangle mr-1" /> {t("Disconnected")}
                </span>
              </div>
            );
          }
          return (
            <div className="flex items-center" style={{ height: "100%" }}>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                {t("Not Connected")}
              </span>
            </div>
          );
        }

        const syncStatus = getProfileSyncStatus(row);
        const isComplete = syncStatus === "COMPLETED";
        const isInProgress = syncStatus === "IN_PROGRESS";

        if (isInProgress) {
          return (
            <div className="flex items-center" style={{ height: "100%" }}>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                <i className="fa fa-spinner fa-spin mr-1" /> {t("In Progress")}
              </span>
            </div>
          );
        }
        if (syncStatus === "PENDING") {
          return (
            <div className="flex items-center" style={{ height: "100%" }}>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                {t("Pending")}
              </span>
            </div>
          );
        }
        return (
          <div className="flex items-center" style={{ height: "100%" }}>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
              {t("Not Configured")}
            </span>
          </div>
        );
      }
    }
  ], [isDark, syncDetailsMap, updatingSellerId]);

  const [selectedConfigId, setSelectedConfigId] = useState("all");

  const groupedConfigs = useMemo(() => {
    const groups = {};
    configList.forEach(row => {
      const configIdVal = row?.configId?._id || row?.sellerConfig?.configId || "unconfigured";
      const companyName = row?.configId?.companyName || "Unconfigured";
      if (!groups[configIdVal]) {
        groups[configIdVal] = {
          configId: configIdVal,
          companyName,
          sellerConfig: row?.sellerConfig,
          profiles: []
        };
      }
      groups[configIdVal].profiles.push(row);
    });
    return Object.values(groups).sort((a, b) => a.companyName.localeCompare(b.companyName));
  }, [configList]);

  // Filter groups by search
  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groupedConfigs;
    const query = searchQuery.toLowerCase().trim();
    return groupedConfigs.map(group => {
      const matchesCompany = group.companyName.toLowerCase().includes(query);
      const matchedProfiles = group.profiles.filter(p =>
        (p?.name || "").toLowerCase().includes(query) ||
        (p?.sellerConfig?.sellerId || "").toLowerCase().includes(query)
      );
      if (matchesCompany) return group; // show all profiles if company name matches
      if (matchedProfiles.length > 0) return { ...group, profiles: matchedProfiles };
      return null;
    }).filter(Boolean);
  }, [groupedConfigs, searchQuery]);

  const activeGroup = useMemo(() => {
    if (selectedConfigId === "all") {
      return {
        configId: "all",
        companyName: t("All Seller Accounts"),
        profiles: filteredGroups.reduce((acc, curr) => [...acc, ...curr.profiles], []),
        sellerConfig: null
      };
    }
    return filteredGroups.find(g => g.configId === selectedConfigId) || {
      configId: "all",
      companyName: t("All Seller Accounts"),
      profiles: filteredGroups.reduce((acc, curr) => [...acc, ...curr.profiles], []),
      sellerConfig: null
    };
  }, [filteredGroups, selectedConfigId, t]);

  return (
    <>
      <style>{`
        .seller-config-container {
          padding-bottom: 0px !important;
        }
      `}</style>
      <Filter
        name={"Seller Config"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="middle_container seller-config-container" style={{ padding: "0 24px 24px 24px" }}>
        <div style={{ display: "flex", gap: "24px", marginTop: "16px", height: "calc(100vh - 220px)", minHeight: "450px" }}>
          {/* Left Sidebar: List of Accounts/Companies */}
          <div style={{
            width: "320px",
            background: isDark ? "rgba(15, 23, 42, 0.4)" : "#ffffff",
            border: isDark ? "1px solid rgba(148, 163, 184, 0.1)" : "1px solid #e9ecef",
            borderRadius: "12px",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            height: "100%",
            flexShrink: 0
          }}>
            {/* Header / Title */}
            <div>
              <h5 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 10px 0", color: isDark ? "#f1f5f9" : "#0f172a" }}>
                {t("Seller Accounts")}
              </h5>
              {/* Search Input */}
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: "10px", color: isDark ? "#64748b" : "#94a3b8", fontSize: "11px" }} />
                <input
                  type="text"
                  placeholder={t("Search accounts...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    fontSize: "12px",
                    padding: "8px 12px 8px 30px",
                    borderRadius: "8px",
                    border: isDark ? "1px solid rgba(148, 163, 184, 0.15)" : "1px solid #cbd5e1",
                    background: isDark ? "rgba(30, 41, 59, 0.4)" : "#f8fafc",
                    color: isDark ? "#cbd5e1" : "#1e293b",
                    outline: "none"
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    style={{
                      position: "absolute",
                      right: "10px",
                      background: "transparent",
                      border: "none",
                      color: isDark ? "#64748b" : "#94a3b8",
                      cursor: "pointer",
                      padding: 0
                    }}
                  >
                    <i className="fa-solid fa-xmark" style={{ fontSize: "11px" }} />
                  </button>
                )}
              </div>
            </div>

            {/* List Container */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingRight: "4px" }}>
              {/* Option: All Accounts */}
              <div
                onClick={() => setSelectedConfigId("all")}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  background: selectedConfigId === "all"
                    ? (isDark ? "rgba(14, 165, 233, 0.1)" : "#f0f9ff")
                    : "transparent",
                  border: selectedConfigId === "all"
                    ? (isDark ? "1px solid rgba(14, 165, 233, 0.2)" : "1px solid #b3e0ff")
                    : "1px solid transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <i className="fa-solid fa-globe" style={{
                    fontSize: "13px",
                    color: selectedConfigId === "all" ? (isDark ? "#38bdf8" : "#0284c7") : (isDark ? "#64748b" : "#94a3b8")
                  }} />
                  <span style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: selectedConfigId === "all" ? (isDark ? "#f1f5f9" : "#0f172a") : (isDark ? "#cbd5e1" : "#475569")
                  }}>
                    {t("All Accounts")}
                  </span>
                </div>
                <span style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: "100px",
                  background: selectedConfigId === "all" ? (isDark ? "rgba(14, 165, 233, 0.2)" : "#e0f2fe") : (isDark ? "rgba(148, 163, 184, 0.1)" : "#f1f5f9"),
                  color: selectedConfigId === "all" ? (isDark ? "#38bdf8" : "#0284c7") : (isDark ? "#64748b" : "#475569")
                }}>
                  {configList.length}
                </span>
              </div>

              {/* Company list options */}
              {filteredGroups.map(group => {
                const isSelected = selectedConfigId === group.configId;
                const isConnected = Boolean(group.sellerConfig?.isActive);
                const isDisconnected = Boolean(!group.sellerConfig?.isActive && group.sellerConfig?.disconnectedAt);

                return (
                  <div
                    key={group.configId}
                    onClick={() => setSelectedConfigId(group.configId)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      background: isSelected
                        ? (isDark ? "rgba(14, 165, 233, 0.1)" : "#f0f9ff")
                        : "transparent",
                      border: isSelected
                        ? (isDark ? "1px solid rgba(14, 165, 233, 0.2)" : "1px solid #b3e0ff")
                        : "1px solid transparent",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: isSelected ? (isDark ? "#f1f5f9" : "#0f172a") : (isDark ? "#cbd5e1" : "#334155"),
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "180px"
                      }}>
                        {group.companyName}
                      </span>
                      <span style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        padding: "1px 6px",
                        borderRadius: "100px",
                        background: isSelected ? (isDark ? "rgba(14, 165, 233, 0.2)" : "#e0f2fe") : (isDark ? "rgba(148, 163, 184, 0.1)" : "#f1f5f9"),
                        color: isSelected ? (isDark ? "#38bdf8" : "#0284c7") : (isDark ? "#64748b" : "#475569")
                      }}>
                        {group.profiles.length}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                      {group.sellerConfig?.sellerId && (
                        <span style={{ fontSize: "10px", color: isDark ? "#64748b" : "#94a3b8", fontFamily: "monospace" }}>
                          {group.sellerConfig.sellerId}
                        </span>
                      )}
                      <span style={{
                        fontSize: "9px",
                        fontWeight: 500,
                        color: isConnected
                          ? (isDark ? "#34d399" : "#059669")
                          : isDisconnected
                            ? (isDark ? "#f87171" : "#ef4444")
                            : (isDark ? "#64748b" : "#94a3b8"),
                        display: "flex",
                        alignItems: "center",
                        gap: "3px"
                      }}>
                        <span style={{
                          width: "5px",
                          height: "5px",
                          borderRadius: "50%",
                          background: isConnected ? "#10b981" : isDisconnected ? "#ef4444" : "#cbd5e1",
                          display: "inline-block"
                        }} />
                        {isConnected ? t("Connected") : isDisconnected ? t("Disconnected") : t("Not Connected")}
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredGroups.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px 10px", color: isDark ? "#64748b" : "#94a3b8", fontSize: "11px" }}>
                  {t("No accounts found")}
                </div>
              )}
            </div>
          </div>

          {/* Right Pane: Marketplace Profiles Table */}
          <div style={{
            flex: 1,
            background: isDark ? "rgba(15, 23, 42, 0.4)" : "#ffffff",
            border: isDark ? "1px solid rgba(148, 163, 184, 0.1)" : "1px solid #e9ecef",
            borderRadius: "12px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflow: "hidden"
          }}>
            {/* Header Details */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              borderBottom: isDark ? "1px solid rgba(148, 163, 184, 0.1)" : "1px solid #f1f5f9",
              paddingBottom: "16px",
              marginBottom: "16px"
            }}>
              <div>
                <h4 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 4px 0", color: isDark ? "#f1f5f9" : "#0f172a" }}>
                  {activeGroup.companyName}
                </h4>
                {activeGroup.sellerConfig?.sellerId && (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11px", color: isDark ? "#64748b" : "#94a3b8" }}>
                    <span><strong>{t("Seller ID")}:</strong> {activeGroup.sellerConfig.sellerId}</span>
                    {activeGroup.sellerConfig.updatedAt && (
                      <span><strong>{t("Token Updated")}:</strong> {formatDate(activeGroup.sellerConfig.updatedAt)}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Group-level Disconnect Button */}
              {activeGroup.sellerConfig?.isActive && (
                <button
                  onClick={() => handleDisconnect(activeGroup.profiles[0])}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 600,
                    background: isDark ? "rgba(239, 68, 68, 0.1)" : "#fef2f2",
                    color: isDark ? "#f87171" : "#ef4444",
                    border: isDark ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid #fecaca",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = isDark ? "rgba(239, 68, 68, 0.2)" : "#fee2e2"}
                  onMouseLeave={(e) => e.currentTarget.style.background = isDark ? "rgba(239, 68, 68, 0.1)" : "#fef2f2"}
                >
                  <i className="fa-solid fa-link-slash" style={{ marginRight: "6px" }} />
                  {t("Disconnect Account")}
                </button>
              )}
            </div>

            {/* Table Area */}
            <div className="data_table position-relative overflow-hidden" style={{ flex: 1, minHeight: "0px", height: "100%" }}>
              <AgTable
                ref={gridRef}
                tableId={`sellerConfig-${selectedConfigId}`}
                onRefresh={() => ApiListing(true)}
                loading={loadingGrid}
                rowData={activeGroup.profiles}
                columnDefs={columns}
                totalRecords={activeGroup.profiles.length}
                perPage={activeGroup.profiles.length}
                rowHeight={60}
                currentPage={1}
                onPageChange={() => { }}
                onPerPageChange={() => { }}
                onSortChanged={() => { }}
                showPagination={false}
                height="100%"
                minHeight="270px"
              />
            </div>
          </div>
        </div>
      </div>

      <SubscriptionModal
        show={subscriptionModal}
        onHide={() => setSubscriptionModal(null)}
        rowData={subscriptionModal}
        refreshGrid={ApiListing}
      />

      <SynchronizationModal
        show={Boolean(syncSetupModal)}
        onHide={() => setSyncSetupModal(null)}
        profile={syncSetupModal}
        configId={syncSetupModal?.configId?._id || syncSetupModal?.configId || syncSetupModal?.sellerConfig?.configId}
        type="seller"
        isDark={isDark}
        onSuccess={ApiListing}
      />

      <RequestSyncModal
        show={Boolean(requestSyncModal)}
        onHide={() => setRequestSyncModal(null)}
        rowData={requestSyncModal}
      />

      <CustomModal
        show={!!disconnectConfirm}
        onHide={() => setDisconnectConfirm(null)}
        title={t("Disconnect Seller Account")}
        subtitle={disconnectConfirm?.countryCode && disconnectConfirm?.name ? `${disconnectConfirm?.countryCode} | ${disconnectConfirm?.name}` : "Seller Account"}
        icon="link_off"
        iconVariant="danger"
        message={`You are about to <span class="cm-highlight">disconnect</span> the seller account <span class="cm-highlight">${disconnectConfirm?.countryCode} | ${disconnectConfirm?.name}</span>. Data syncing for this marketplace will stop immediately.`}
        alertText="Disconnecting will stop all seller data syncing for this marketplace. You can reconnect at any time using the Link icon."
        alertVariant="danger"
        closeOnBackdrop={false}
        actions={[
          { label: t("Cancel"), cancel: true, icon: "close", onClick: () => setDisconnectConfirm(null), },
          { label: t("Disconnect"), variant: "danger", icon: "link_off", onClick: executeDisconnect, },
        ]}
      />
    </>
  );
};

export default SellerConfig;

