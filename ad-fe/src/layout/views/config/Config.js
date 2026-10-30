import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { t } from "i18next";
import Toast from "../../../common/helper/toast/Toast";
import { ApiAmazonAuthConfig, ApiConfigList, ApiDisconnectAmazonConfig, ApiStartDataSync, ApiGetProfileSyncDetails, ApiUpdateProfileSyncSettings } from "../../../api-wrapper/ApiAdsConfig";
import Filter from "../../../helper/filter/Filter";
import { useContext, useEffect, useState, useRef, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import AgTable from "../../../common/grid/AgTable";
import AddAmazonAccountModal from "./AddAmazonAccountModal";
import moment from "moment";
import { Buffer } from "buffer";
import AmazonAdvertisingHero from "./AmazonAdvertisingHero";
import { useLocation } from "react-router-dom";
import SyncPermissionModal from "./SyncPermissionModal";
import ManageProfilesModal from "./ManageProfilesModal";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { Badge } from "../../../components/ui/badge";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { AppTooltip } from "../../../components/ui/AppTooltip";

import SynchronizationModal from "./SynchronizationModal";
import { useTour } from "../../../tour";

// Portal-based tooltip immune to AG-Grid CSS transform offsets

const formatDate = (date) => date ? moment(date).format("DD/MM/YYYY hh:mm:ss A") : "--";

const PROFILES_INLINE_LIMIT = 5;

const ProfileBadge = ({ profile, isDark }) => (
  <span
    className="badge mr-1 mb-1"
    style={{
      fontSize: "11px",
      fontWeight: 500,
      background: isDark ? "rgba(59, 130, 246, 0.15)" : "#F0F7FD",
      color: isDark ? "#60a5fa" : "#185FA5",
      border: isDark ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid #b5d4f4",
      borderRadius: "6px",
      padding: "4px 8px"
    }}
    title={`${profile.name} • ${profile.type}`}
  >
    <span className="mr-1">{profile.countryCode}</span>
    {profile.name}
  </span>
);

// ── Modal that lists ALL profiles for a config ────────────────────────────────
export const ProfilesModal = ({ show, onHide, profiles = [], companyName, configId, onOpenSyncModal, isDark, onRefreshList }) => {
  const { t } = useTranslation();
  const [profileSyncRecords, setProfileSyncRecords] = useState([]);
  const [loadingSync, setLoadingSync] = useState(false);
  const [updatingProfileId, setUpdatingProfileId] = useState(null);
  const [localProfileStates, setLocalProfileStates] = useState({});
  const [searchQuery, setSearchQuery] = useState("");

  const loadSyncDetails = useCallback(async () => {
    if (!configId) return;
    setLoadingSync(true);
    try {
      const res = await ApiGetProfileSyncDetails(configId);
      if (res?.isSuccess && Array.isArray(res?.data)) {
        setProfileSyncRecords(res.data);
      } else {
        setProfileSyncRecords([]);
      }
    } catch {
      setProfileSyncRecords([]);
    } finally {
      setLoadingSync(false);
    }
  }, [configId]);

  useEffect(() => {
    if (show) {
      setSearchQuery("");
      setLocalProfileStates({});
      if (configId) {
        loadSyncDetails();
      }
    }
  }, [show, configId, loadSyncDetails]);

  const handleToggleAdsSync = async (profile, newStatus) => {
    const targetProfileId = Number(profile.profileId || profile._id);
    setUpdatingProfileId(targetProfileId);
    try {
      const res = await ApiUpdateProfileSyncSettings({
        profileId: targetProfileId,
        configId,
        isAdsSyncEnabled: newStatus
      });
      if (res?.isSuccess) {
        Toast.success(newStatus ? "Data sync enabled for profile" : "Data sync paused for profile");
        setLocalProfileStates(prev => ({
          ...prev,
          [targetProfileId]: { ...prev[targetProfileId], isAdsSyncEnabled: newStatus }
        }));
        if (typeof onRefreshList === "function") onRefreshList();
        window.dispatchEvent(new CustomEvent("profileAvailabilityChanged"));
      } else {
        Toast.error(res?.message || "Failed to update sync settings");
      }
    } catch {
      Toast.error(t("Failed to update sync settings"));
    } finally {
      setUpdatingProfileId(null);
    }
  };

  return (
    <Dialog open={show} onOpenChange={(isOpen) => { if (!isOpen) onHide(); }}>
      <DialogContent
        className="sm:max-w-[750px] premium-modal modal-content p-0 flex flex-col max-h-[90vh] overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="modal-header border-b-0 p-4 pb-0 shrink-0">
          <DialogTitle className="modal-title text-base font-medium">
            {t("Profiles")} — {companyName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search bar */}
          {profiles.length > 0 && (
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
              <div className="relative">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                <input
                  type="text"
                  placeholder={t("Search profiles by name, country, or type...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] text-slate-900 dark:text-white transition-all placeholder:text-slate-400"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-450 hover:text-slate-650"
                  >
                    <i className="fa-solid fa-circle-xmark text-xs" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="modal-body overflow-y-auto p-4 flex-1">
            {profiles.length === 0 ? (
              <p className="text-gray-500 text-center mb-0" style={{ color: isDark ? "#94a3b8" : "inherit" }}>No profiles found.</p>
            ) : (() => {
              const q = searchQuery.toLowerCase();
              const filteredProfiles = profiles.filter((p) => {
                return (
                  (p.name || "").toLowerCase().includes(q) ||
                  (p.countryCode || "").toLowerCase().includes(q) ||
                  (p.type || "").toLowerCase().includes(q)
                );
              });

              if (filteredProfiles.length === 0) {
                return (
                  <p className="text-gray-500 text-center mb-0 py-6" style={{ color: isDark ? "#94a3b8" : "inherit" }}>
                    No profiles match your search criteria.
                  </p>
                );
              }

              return (
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300 border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Country</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-center">Sync Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredProfiles.map((p, idx) => {
                      const targetProfileId = Number(p.profileId || p._id);
                      const pRecords = profileSyncRecords.filter((r) => Number(r.profileId) === targetProfileId);

                      let statusType = "NONE"; // NOT_SYNCED
                      if (pRecords.length > 0) {
                        const hasInProgress = pRecords.some((r) => r.requestStatus === "IN_PROGRESS");
                        const allPending = pRecords.every((r) => r.requestStatus === "PENDING");
                        if (hasInProgress) {
                          statusType = "IN_PROGRESS"; // Sync actively executing -> locked
                        } else if (allPending) {
                          statusType = "PENDING"; // Sync queued -> editable
                        } else {
                          statusType = "COMPLETED"; // Sync complete -> toggleable
                        }
                      }

                      const isAdsSyncActive = localProfileStates[targetProfileId]?.isAdsSyncEnabled !== undefined
                        ? localProfileStates[targetProfileId].isAdsSyncEnabled
                        : (pRecords.find(r => typeof r.isAdsSyncEnabled === "boolean")?.isAdsSyncEnabled ?? p.isAdsSyncEnabled) !== false;

                      return (
                        <tr key={p._id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-medium">{idx + 1}</td>
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{p.name}</td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className="font-normal">{p.countryCode}</Badge>
                          </td>
                          <td className="px-4 py-3 capitalize text-slate-700 dark:text-slate-200">{p.type}</td>
                          <td className="px-4 py-3 text-center">
                            {loadingSync ? (
                              <i className="fa fa-spinner fa-spin text-slate-400 text-xs" />
                            ) : statusType === "IN_PROGRESS" ? (
                              <AppTooltip text={t("Synchronization is currently in progress. Settings cannot be modified until sync completes.")}>
                                <span className="inline-flex items-center px-2.5 py-1 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 opacity-80 cursor-not-allowed">
                                  <i className="fa fa-spinner fa-spin mr-1" />
                                  {t("In Progress")}
                                </span>
                              </AppTooltip>
                            ) : statusType === "PENDING" ? (
                              <div className="action_container flex items-center justify-center">
                                <AppTooltip text={t("Update Sync Configuration")}>
                                  <i
                                    className="fa fa-pencil cursor-pointer text-blue-600 hover:text-blue-700"
                                    onClick={() => onOpenSyncModal(p, loadSyncDetails)}
                                  />
                                </AppTooltip>
                              </div>
                            ) : statusType === "NONE" ? (
                              <label className="relative inline-flex items-center cursor-pointer mb-0">
                                <input
                                  type="checkbox"
                                  checked={false}
                                  onChange={() => onOpenSyncModal(p, loadSyncDetails)}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:after:border-slate-600 peer-checked:bg-sky-600"></div>
                              </label>
                            ) : (
                              <div className="flex items-center justify-center">
                                <AppTooltip text={isAdsSyncActive ? t("Sync Active (Click to Pause Sync)") : t("Sync Paused (Click to Resume Sync)")}>
                                  <label className="relative inline-flex items-center cursor-pointer mb-0">
                                    <input
                                      type="checkbox"
                                      checked={isAdsSyncActive}
                                      disabled={updatingProfileId === targetProfileId}
                                      onChange={(e) => handleToggleAdsSync(p, e.target.checked)}
                                      className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:after:border-slate-600 peer-checked:bg-emerald-500"></div>
                                  </label>
                                </AppTooltip>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
          </div>
          <div className="cm-footer p-4 flex justify-end shrink-0 border-t">
            <Button variant="outline" className="customize-button h-[36px] !bg-white !border !border-slate-300 !text-slate-700 hover:!bg-slate-50 dark:!bg-transparent dark:!border-slate-700 dark:!text-slate-300 dark:hover:!bg-slate-800 px-4 font-medium rounded-md shadow-sm flex items-center justify-center gap-1.5" onClick={onHide}>
              {t("Close")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Config = () => {
  const { loginUser, amazonConnectLimit, totalOrgConfigs } = useContext(ProfileContext);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const location = useLocation();
  const [configList, setConfigList] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isForcedFlow, setIsForcedFlow] = useState(false);
  const [appstoreSellerId, setAppstoreSellerId] = useState(null);

  const [showManageProfilesModal, setShowManageProfilesModal] = useState(false);
  const [manageConfigId, setManageConfigId] = useState(null);
  const [isOAuthFlow, setIsOAuthFlow] = useState(false);

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncConfigId, setSyncConfigId] = useState(null);

  const [disconnectConfirm, setDisconnectConfirm] = useState(null);

  const [profilesModal, setProfilesModal] = useState({ show: false, profiles: [], companyName: "", configId: null });
  const [syncSetupModal, setSyncSetupModal] = useState({ show: false, profile: null, configId: null });

  const gridRef = useRef(null);
  const oauthHandledRef = useRef(false);

  const { dispatch: tourDispatch } = useTour();

  useEffect(() => {
    if (showModal || showManageProfilesModal || showSyncModal || profilesModal.show || syncSetupModal.show) {
      tourDispatch({ type: 'END_TOUR' });
    }
  }, [showModal, showManageProfilesModal, showSyncModal, profilesModal.show, syncSetupModal.show, tourDispatch]);

  const [loadingGrid, setLoadingGrid] = useState(false);

  const ApiListing = async (skip = false) => {
    if (!skip) setLoading(true);
    setLoadingGrid(true);
    try {
      const res = await ApiConfigList(undefined, skip);
      if (res.isSuccess) {
        const data = res?.data || [];
        setConfigList(data);

        // Check if any config for this organization already has stored profiles in profile table
        const orgHasProfiles = data.some((c) => Array.isArray(c.profiles) && c.profiles.length > 0);

        // Check if returning from Amazon OAuth connection redirect (process ONLY ONCE)
        // Check if returning from Amazon OAuth connection redirect or arriving via Appstore Flow
        const params = new URLSearchParams(location.search);
        const status = params.get("status");
        const flow = params.get("flow");
        const sellerId = params.get("sellerId") || localStorage.getItem("appstore_seller_id") || sessionStorage.getItem("appstore_seller_id");
        const configId = params.get("configId");
        const isStoredAppstoreFlow = flow === "amazon_appstore_seller" || localStorage.getItem("amazon_appstore_flow") === "true" || sessionStorage.getItem("amazon_appstore_flow") === "true";

        if (status === "success" && configId && !oauthHandledRef.current) {
          oauthHandledRef.current = true;
          setIsOAuthFlow(true);
          const targetSellerId = sellerId || appstoreSellerId || localStorage.getItem("appstore_seller_id") || sessionStorage.getItem("appstore_seller_id");
          
          // Clear appstore flow flags when Ads account has been successfully connected
          localStorage.removeItem("amazon_appstore_flow");
          localStorage.removeItem("appstore_seller_id");
          sessionStorage.removeItem("amazon_appstore_flow");
          sessionStorage.removeItem("appstore_seller_id");
          setIsForcedFlow(false);
          setShowModal(false);
          if (window.location.search) {
            window.history.replaceState({}, "", window.location.pathname);
          }

          const targetConfig = data.find((c) => String(c._id) === String(configId));
          const targetProfiles = Array.isArray(targetConfig?.profiles) ? targetConfig.profiles : [];
          const targetHasProfiles = targetProfiles.length > 0;
          const hasMatchingProfile = Boolean(targetSellerId && targetProfiles.some((p) => {
            const advId = p?.advertiserId || p?.accountInfo?.id;
            return p?.isSellerMatch || (advId && String(advId).trim() === String(targetSellerId).trim());
          }));

          if (targetSellerId) {
            setAppstoreSellerId(targetSellerId);
          }

          if (!targetHasProfiles) {
            setManageConfigId(configId);
            setShowManageProfilesModal(true);
          } else if (hasMatchingProfile && targetSellerId) {
            window.location.href = `/settings?tab=seller-config&autoOpenSync=${encodeURIComponent(targetSellerId)}`;
          }
        } else if (isStoredAppstoreFlow && !oauthHandledRef.current) {
          oauthHandledRef.current = true;
          setIsOAuthFlow(true);
          localStorage.removeItem("amazon_appstore_flow");
          sessionStorage.removeItem("amazon_appstore_flow");
          setIsForcedFlow(true);
          if (sellerId) {
            setAppstoreSellerId(sellerId);
            localStorage.setItem("appstore_seller_id", sellerId);
          }
          setShowModal(true);
          if (window.location.search) {
            window.history.replaceState({}, "", window.location.pathname);
          }
        }
      } else {
        Toast.error(res.message);
      }
    } catch {
      Toast.error(t("Something went wrong"));
    } finally {
      if (!skip) setLoading(false);
      setLoadingGrid(false);
    }
  };

  useEffect(() => {
    ApiListing();
  }, []);

  const handleDisconnect = (row) => {
    setDisconnectConfirm(row);
  };

  const executeDisconnect = async () => {
    if (!disconnectConfirm) return;
    try {
      const res = await ApiDisconnectAmazonConfig({ configId: disconnectConfirm?._id });
      if (res.isSuccess) {
        Toast.success(t("Amazon account disconnected successfully"));
        ApiListing();
      } else {
        Toast.error(res.message || "Failed to disconnect");
      }
    } catch {
      Toast.error(t("Something went wrong while disconnecting"));
    } finally {
      setDisconnectConfirm(null);
    }
  };

  const handleConnect = async (row) => {
    try {
      const isReconnect = !!row?._id;

      const payload = {
        userId: loginUser?._id,
        configId: row?._id,
        companyName: row?.companyName,
        reconnect: isReconnect,
        type: "ADS",
      };

      const res = await ApiAmazonAuthConfig(payload);
      if (!res?.isSuccess) {
        Toast.error(res?.message || "Failed to generate auth URL");
        return;
      }

      const authUrl = res?.data?.authUrl;
      if (!authUrl) {
        Toast.error(t("Invalid auth URL"));
        return;
      }

      window.open(authUrl, "_blank");
    } catch {
      Toast.error(t("Something went wrong"));
    }
  };

  const handleConfirmSync = async () => {
    try {
      const res = await ApiStartDataSync({ configId: syncConfigId });

      if (res.isSuccess) {
        Toast.success(res.message || "Data sync started successfully.");
      } else {
        Toast.error(res.message || "Failed to start sync");
      }
    } catch {
      Toast.error(t("Something went wrong while starting sync"));
    } finally {
      setShowSyncModal(false);
      setSyncConfigId(null);
    }
  };

  const handleCancelSync = () => {
    setShowSyncModal(false);
    setSyncConfigId(null);
  };

  const openProfilesModal = (profiles, companyName, configId) => {
    setProfilesModal({ show: true, profiles, companyName, configId });
  };

  const closeProfilesModal = () => {
    setProfilesModal({ show: false, profiles: [], companyName: "", configId: null });
  };

  const openSyncSetupModal = (profile, onSaveCallback) => {
    setSyncSetupModal({
      show: true,
      profile,
      configId: profilesModal.configId,
      onSaveCallback,
    });
  };

  const closeSyncSetupModal = () => {
    setSyncSetupModal({ show: false, profile: null, configId: null, onSaveCallback: null });
  };

  const columns = useMemo(() => [
    ...(PermissionCheck(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.CREATE) ? [
      {
        headerName: t("Action"),
        field: "action",
        title: "Action",
        width: 100,
        sortable: false,
        resizable: false,
        cellRenderer: (params) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="action_container gap-2 flex items-center" style={{ height: "100%" }}>
              {row?.isActive ? (
                <>
                  <AppTooltip text={t("Click here to Disconnect")}>
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
                  <AppTooltip text={t("Manage Profiles")}>
                    <button
                      onClick={() => {
                        setManageConfigId(row._id);
                        setShowManageProfilesModal(true);
                      }}
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
                      <i className="fa fa-users" />
                    </button>
                  </AppTooltip>
                </>
              ) : (
                <AppTooltip text={t("Click here to Connect")}>
                  <button
                    onClick={() => handleConnect(row)}
                    style={{
                      background: isDark ? "rgba(16, 185, 129, 0.1)" : "#ecfdf5",
                      border: isDark ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid #d1fae5",
                      borderRadius: "6px",
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
            </div>
          );
        },
      },
    ] : []),
    {
      headerName: t("Company Name"),
      field: "companyName",
      title: "Company Name",
      minWidth: 200,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => <p className="fw-bolder">{params.value}</p>,
    },
    {
      headerName: t("Profiles"),
      field: "profiles",
      title: "Profiles",
      minWidth: 300,
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        const profiles = row?.profiles ?? [];

        if (profiles.length === 0) {
          return (
            <div className="flex items-center gap-2 py-1">
              <Button
                variant="outline"
                size="sm"
                className="h-[28px] text-xs px-2.5 bg-gradient-to-r from-sky-500 to-blue-600 !text-white hover:opacity-90 border-0 flex items-center gap-1.5 shadow-sm rounded-md"
                onClick={() => openProfilesModal(profiles, row?.companyName, row?._id)}
              >
                <i className="fa fa-user-circle-o text-xs" />
                {t("View Profiles")}
              </Button>
              {!row?.isActive && (
                <span className="text-xs text-amber-500 font-medium flex items-center gap-1">
                  <i className="fa fa-exclamation-triangle" />
                  {t("Not Connected")}
                </span>
              )}
            </div>
          );
        }

        const visible = profiles.slice(0, PROFILES_INLINE_LIMIT);
        const remaining = profiles.length - PROFILES_INLINE_LIMIT;

        return (
          <div className="flex flex-wrap items-center gap-1 py-1">
            {visible.map((p) => (
              <ProfileBadge key={p._id} profile={p} isDark={isDark} />
            ))}
            {remaining > 0 && (
              <button className="btn btn-link btn-sm p-0" style={{ fontSize: "11px", whiteSpace: "nowrap", color: isDark ? "#38bdf8" : "#109dd3" }} onClick={() => openProfilesModal(profiles, row?.companyName, row?._id)}>
                +{remaining} more
              </button>
            )}
            <button
              className="btn btn-link btn-sm p-0 ml-1"
              style={{ fontSize: "11px", whiteSpace: "nowrap", color: isDark ? "#94a3b8" : "#64748b" }}
              onClick={() => openProfilesModal(profiles, row?.companyName, row?._id)}
              title={t("View all profiles in modal")}
            >
              <i className="fa fa-list-ul mr-1" />
              {t("View List")}
            </button>
          </div>
        );
      },
    },
    {
      headerName: t("Token Updated At"),
      field: "updatedAt",
      title: "Token Updated At",
      minWidth: 200,
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => (
        <div className="flex flex-col gap-1">
          <span>{formatDate(params.value)}</span>
        </div>
      ),
    },
  ], [isDark]);

  const filteredConfigList = configList.filter((row) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase().trim();
    const companyMatch = (row?.companyName || "").toLowerCase().includes(query);
    const profileMatch = (row?.profiles ?? []).some((p) =>
      (p.name || "").toLowerCase().includes(query) || (p.countryCode || "").toLowerCase().includes(query)
    );
    return companyMatch || profileMatch;
  });

  return (
    <>
      <Filter
        name={"Amazon Config"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="middle_container">
        {
          loading ? (
            <div className="flex justify-center items-center" style={{ height: "60vh" }}>
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-sky-500 border-t-transparent" role="status">
                <span className="sr-only">Loading...</span>
              </div>
            </div>
          ) : configList?.length ? (
            <div className="glass-grid-container overflow-hidden" style={{ marginTop: "12px" }}>
              <div className="data_model_btn camapgin_btn flex justify-between items-center gap-4 flex-wrap" style={{ padding: "12px 24px", borderBottom: isDark ? "1px solid #334155" : "1px solid rgba(2, 70, 139, 0.08)", background: "transparent" }}>
                <div>
                  <h5 style={{ fontWeight: 700, color: isDark ? "#f8fafc" : "#0f172a", margin: 0 }}>{t("Amazon Config")}</h5>
                </div>

                <div className="flex items-center gap-3">
                  {/* Search Input */}
                  <div className="relative flex items-center" style={{ width: "280px" }}>
                    <i className="fa fa-search absolute text-slate-400" style={{ left: "12px", fontSize: "12px" }} />
                    <input
                      type="text"
                      placeholder={t("Search by company or profile...")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:outline-none focus:ring-1 focus:ring-sky-500"
                      style={{
                        padding: "8px 30px 8px 32px",
                        color: isDark ? "#cbd5e1" : "#1e293b",
                        background: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.01)"
                      }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border-0 bg-transparent cursor-pointer p-0"
                        style={{ right: "12px", top: "50%", transform: "translateY(-50%)" }}
                      >
                        <i className="fa fa-times text-xs" />
                      </button>
                    )}
                  </div>

                  {PermissionCheck(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.CREATE) && (
                    <div className="filTypeBox">
                      <div className="pb-1">
                        {totalOrgConfigs >= amazonConnectLimit ? (
                          <AppTooltip text={t("Your Plan based Connection Limit is Over Now Upgrade a Plan to Connect a More Config")}>
                            <div className="inline-block cursor-not-allowed">
                              <Button
                                id="ads-config-link-btn"
                                disabled
                                className="customize-button h-[36px] bg-gradient-to-br from-slate-400 to-slate-500 !text-white opacity-60 !border-0 whitespace-nowrap px-4 font-semibold shadow-sm flex items-center justify-center gap-1.5 m-0 gap-0 pointer-events-none"
                              >
                                {t("Link your account")}
                              </Button>
                            </div>
                          </AppTooltip>
                        ) : (
                          <Button
                            id="ads-config-link-btn"
                            onClick={() => setShowModal(true)}
                            className="customize-button h-[36px] bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] !text-white hover:opacity-90 !border-0 whitespace-nowrap px-4 font-semibold shadow-sm flex items-center justify-center gap-1.5 m-0 gap-0"
                          >
                            {t("Link your account")}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div >

              <div className="data_table position-relative" id="config-main-table" style={{ padding: "0 24px 24px 24px" }}>
                <AgTable
                  onRefresh={() => ApiListing(true)} ref={gridRef}
                  rowHeight={60}
                  tableId="config-main-table"
                  height={"60vh"}
                  loading={loadingGrid}
                  rowData={filteredConfigList}
                  columnDefs={columns}
                  totalRecords={filteredConfigList?.length ?? 0}
                  perPage={filteredConfigList?.length ?? 50}
                  currentPage={1}
                  onPageChange={() => { }}
                  onPerPageChange={() => { }}
                  onSortChanged={() => { }}
                  isCustomSaveColumns={true}
                  customSaveColumnName={"Amazon Config"}
                  handleSaveColumns={undefined}
                />
              </div>
            </div >
          ) : (
            <AmazonAdvertisingHero userId={loginUser?._id} onLinkAccount={() => setShowModal(true)} />
          )
        }

        <AddAmazonAccountModal
          show={showModal}
          onHide={() => {
            setShowModal(false);
            setIsForcedFlow(false);
            localStorage.removeItem("amazon_appstore_flow");
            sessionStorage.removeItem("amazon_appstore_flow");
          }}
          userId={loginUser?._id}
          forcedFlow={isForcedFlow}
          sellerId={appstoreSellerId}
          existingConfigs={configList}
          onSuccess={(linkedConfigId) => {
            ApiListing();
            if (linkedConfigId) {
              setManageConfigId(linkedConfigId);
              setIsOAuthFlow(true);
              setShowManageProfilesModal(true);
            }
          }}
        />

        <SyncPermissionModal
          show={showSyncModal}
          onConfirm={handleConfirmSync}
          onCancel={handleCancelSync}
        />

        <CustomModal
          show={!!disconnectConfirm}
          onHide={() => setDisconnectConfirm(null)}
          title={t("Disconnect Amazon Account")}
          subtitle={disconnectConfirm?.companyName || "Amazon Ads"}
          icon="link_off"
          iconVariant="danger"
          message={`You are about to <span class="cm-highlight">disconnect</span> the Amazon Ads account for <span class="cm-highlight">${disconnectConfirm?.companyName}</span>. Your campaigns will no longer sync until reconnected.`}
          alertText="Disconnecting will stop all data syncing for this account. You can reconnect at any time using the Link icon."
          alertVariant="danger"
          closeOnBackdrop={false}
          actions={[
            { label: t("Cancel"), cancel: true, icon: "close", onClick: () => setDisconnectConfirm(null), },
            { label: t("Disconnect"), variant: "danger", icon: "link_off", onClick: executeDisconnect, },
          ]}
        />

        <ProfilesModal
          show={profilesModal.show}
          onHide={closeProfilesModal}
          profiles={profilesModal.profiles}
          companyName={profilesModal.companyName}
          configId={profilesModal.configId}
          onOpenSyncModal={openSyncSetupModal}
          isDark={isDark}
        />

        <SynchronizationModal
          show={syncSetupModal.show}
          onHide={closeSyncSetupModal}
          profile={syncSetupModal.profile}
          configId={syncSetupModal.configId}
          type="ads"
          isDark={isDark}
          onSuccess={() => {
            if (typeof syncSetupModal.onSaveCallback === "function") {
              syncSetupModal.onSaveCallback();
            }
          }}
        />

        {
          showManageProfilesModal && (
            <ManageProfilesModal
              open={showManageProfilesModal}
              onClose={(matchedSellerId) => {
                setShowManageProfilesModal(false);
                const currentConfigId = manageConfigId;
                setManageConfigId(null);
                setIsOAuthFlow(false);
                ApiListing();

                localStorage.removeItem("appstore_seller_id");
                sessionStorage.removeItem("appstore_seller_id");
                if (matchedSellerId) {
                  window.location.href = `/settings?tab=seller-config&autoOpenSync=${encodeURIComponent(matchedSellerId)}`;
                }
              }}
              configId={manageConfigId}
              sellerId={appstoreSellerId}
              isOAuthFlow={isOAuthFlow}
            />
          )
        }
      </div >
    </>
  );
};

export default Config;
