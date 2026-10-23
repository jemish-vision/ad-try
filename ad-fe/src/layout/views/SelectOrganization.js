import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import LanguageSelector from "../../components/LanguageSelector";
import {
  ApiGetOrganizationList,
  ApiCreateOrganization,
  ApiSelectOrganization,
  ApiToggleFavoriteOrganization,
  ApiUpdateOrganization
} from "../../api-wrapper/ApiOrganization";
import { AppTooltip } from "../../components/ui/AppTooltip";
import { ApiAcceptInvitation, ApiRejectInvitation } from "../../api-wrapper/ApiUsers";
import { Toast } from "../../helper/links/Link";
import Spinner from "../../common/helper/loader/Loader";
import { ROLES } from "../../common/constants";
import Logo from "../../common/logo/logo.png";


const SelectOrganization = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectingId, setSelectingId] = useState(null);
  const [selectedOrgId, setSelectedOrgId] = useState(localStorage.getItem("organizationId") || null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [inviteActionId, setInviteActionId] = useState(null);

  // Edit Organization logic
  const [editOrgModalShow, setEditOrgModalShow] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [editOrgName, setEditOrgName] = useState("");
  const [editingOrgSubmit, setEditingOrgSubmit] = useState(false);

  // Add the ApiUpdateOrganization to imports


  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const res = await ApiGetOrganizationList();
      if (res?.isSuccess) {
        setOrganizations(res.organizations || []);
        setPendingInvitations(res.pendingInvitations || []);
        if (res.userEmail) setUserEmail(res.userEmail);
        if (res.userName) setUserName(res.userName);
        if (!res.userEmail) {
          const storedEmail = localStorage.getItem("userEmail") || localStorage.getItem("email") || "";
          setUserEmail(storedEmail);
        }
      } else {
        Toast.error(res?.message || "Failed to load organizations");
      }
    } catch (err) {
      Toast.error(t("Error connecting to server"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Preserve Amazon Seller flow parameters in localStorage if arriving from auth callback
    const params = new URLSearchParams(location.search);
    const flowParam = params.get("flow");
    const sellerIdParam = params.get("sellerId");
    if (flowParam === "amazon_appstore_seller" || sellerIdParam) {
      localStorage.setItem("amazon_appstore_flow", "true");
      if (sellerIdParam) localStorage.setItem("appstore_seller_id", sellerIdParam);
      // Immediately clean URL so query parameters are hidden
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      // Normal login / selection: clear any stale OAuth flow flags
      localStorage.removeItem("amazon_appstore_flow");
      localStorage.removeItem("appstore_seller_id");
      sessionStorage.removeItem("amazon_appstore_flow");
      sessionStorage.removeItem("appstore_seller_id");
    }

    // Clear any stale org from storage so the user always picks fresh
    localStorage.removeItem("organizationId");
    localStorage.removeItem("organizationName");
    localStorage.removeItem("profile");
    localStorage.removeItem("permissions");
    localStorage.removeItem("permission");
    localStorage.removeItem("isGoogleConnected");
    localStorage.removeItem("isPlanActive");
    localStorage.removeItem("role");
    setSelectedOrgId(null);
    fetchOrganizations();
  }, [location.search]);

  const hasOwnedOrg = organizations.some((org) => Boolean(org.isOwner));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!orgName || !orgName.trim()) {
      Toast.error(t("Please enter an organization name"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await ApiCreateOrganization({ organizationName: orgName.trim() });
      if (res?.isSuccess) {
        Toast.success(t("Organization created successfully!"));
        setShowCreateModal(false);
        setOrgName("");
        fetchOrganizations();
      } else {
        Toast.error(res?.message || "Could not create organization");
      }
    } catch (err) {
      Toast.error(t("Error creating organization"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelect = async (org) => {
    setSelectingId(org._id);
    try {
      const res = await ApiSelectOrganization({ organizationId: org._id });
      if (res?.isSuccess) {
        if (res.authToken) localStorage.setItem("sellerToken", res.authToken);
        if (res.role) localStorage.setItem("role", res.role);
        if (res.organization?._id) {
          localStorage.setItem("organizationId", res.organization._id);
          localStorage.setItem("organizationName", res.organization.organizationName || org.organizationName || "");
          localStorage.removeItem("profile");
          setSelectedOrgId(res.organization._id);
          window.dispatchEvent(new Event("organizationChanged"));
        }

        // Compute and store plan status so RequireAuth in App.js doesn't falsely redirect
        const selectedOrg = res.organization || org;
        const hasFutureEndDate = Boolean(selectedOrg?.endDate && new Date(selectedOrg.endDate) > new Date());
        const isOrgTrialActive = Boolean(selectedOrg?.isTrialActive) || hasFutureEndDate;
        const hasUsedTrialOrg = Boolean(selectedOrg?.hasUsedTrial);
        const hasActivePlan = Boolean(selectedOrg?.planId) || isOrgTrialActive || hasFutureEndDate;
        const trialExpired = hasUsedTrialOrg && !hasFutureEndDate && !selectedOrg?.planId;
        localStorage.setItem("isPlanActive", hasActivePlan ? "true" : "false");
        localStorage.setItem("isTrialActive", isOrgTrialActive ? "true" : "false");
        localStorage.setItem("hasUsedTrial", trialExpired ? "true" : "false");
        window.dispatchEvent(new Event("planStatusChanged"));

        const currentRole = res.role || localStorage.getItem("role");

        const params = new URLSearchParams(location.search);
        const flowParam = params.get("flow");
        const sellerIdParam = params.get("sellerId");
        const storedSellerId = localStorage.getItem("appstore_seller_id") || sessionStorage.getItem("appstore_seller_id");
        const storedFlow = localStorage.getItem("amazon_appstore_flow") || sessionStorage.getItem("amazon_appstore_flow");
        const targetSellerId = sellerIdParam || storedSellerId;
        const isAppstoreFlow = flowParam === "amazon_appstore_seller" || storedFlow === "true" || Boolean(targetSellerId);

        if (isAppstoreFlow) {
          localStorage.setItem("amazon_appstore_flow", "true");
          if (targetSellerId) localStorage.setItem("appstore_seller_id", targetSellerId);

          if ((res.requiresPlan && !hasFutureEndDate) || !hasActivePlan) {
            navigate("/select-plan");
          } else {
            navigate("/settings");
          }
        } else if ((res.requiresPlan && !hasFutureEndDate) || !hasActivePlan) {
          navigate("/select-plan");
        } else {
          navigate(currentRole === ROLES.SUPER_ADMIN ? "/admin-dashboard" : "/");
        }
      } else {
        Toast.error(res?.message || "Could not select organization");
      }
    } catch (err) {
      Toast.error(t("Error selecting organization"));
    } finally {
      setSelectingId(null);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editOrgName || !editOrgName.trim()) {
      Toast.error(t("Please enter an organization name"));
      return;
    }
    setEditingOrgSubmit(true);
    try {
      const res = await ApiUpdateOrganization({ organizationId: editingOrg._id, organizationName: editOrgName.trim() });
      if (res?.isSuccess) {
        Toast.success(res.message || "Organization updated successfully!");
        setEditOrgModalShow(false);
        setEditingOrg(null);
        fetchOrganizations();
      } else {
        Toast.error(res?.message || "Could not update organization");
      }
    } catch (err) {
      Toast.error(t("Error updating organization"));
    } finally {
      setEditingOrgSubmit(false);
    }
  };

  const handleToggleFavorite = async (e, org) => {
    e.stopPropagation();
    const newFavoriteStatus = !org.isFavorite;
    setOrganizations((prev) =>
      prev.map((item) => (item._id === org._id ? { ...item, isFavorite: newFavoriteStatus } : item))
    );
    try {
      const res = await ApiToggleFavoriteOrganization({
        organizationId: org._id,
        isFavorite: newFavoriteStatus,
      });
      if (!res?.isSuccess) {
        Toast.error(res?.message || "Could not update favorite status");
        fetchOrganizations();
      }
    } catch (err) {
      Toast.error(t("Error updating favorite status"));
      fetchOrganizations();
    }
  };

  const handleAcceptInvite = async (token) => {
    setInviteActionId(token);
    try {
      const res = await ApiAcceptInvitation({ token });
      if (res?.isSuccess) {
        Toast.success(t("Invitation accepted! Welcome to the organization."));
        fetchOrganizations();
      } else {
        Toast.error(res?.message || "Could not accept invitation");
      }
    } catch (err) {
      Toast.error(t("Error accepting invitation"));
    } finally {
      setInviteActionId(null);
    }
  };

  const handleRejectInvite = async (token) => {
    setInviteActionId(token);
    try {
      const res = await ApiRejectInvitation({ token });
      if (res?.isSuccess) {
        Toast.success(t("Invitation declined"));
        fetchOrganizations();
      } else {
        Toast.error(res?.message || "Could not reject invitation");
      }
    } catch (err) {
      Toast.error(t("Error rejecting invitation"));
    } finally {
      setInviteActionId(null);
    }
  };

  const handleSignOut = () => {
    localStorage.clear();
    window.location.href = "/login";
  };

  if (loading) {
    return <Spinner />;
  }

  // Filter organizations based on tab & search query
  const filteredOrganizations = organizations.filter((org) => {
    const matchesSearch = org.organizationName?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (activeTab === "Owned") return org.isOwner;
    if (activeTab === "Shared") return !org.isOwner;
    if (activeTab === "Favorites") return org.isFavorite;
    return true;
  });

  const continueOrg = organizations.find((org) => org._id === selectedOrgId) || organizations.find((org) => org.isFavorite) || organizations[0];

  const getAvatarContent = (org, isPinned = false) => {
    const colorClass = "bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] text-white";
    const initial = org.organizationName?.charAt(0)?.toUpperCase() || "O";
    const sizeClass = isPinned ? "w-11 h-11 text-lg rounded-[14px]" : "w-10 h-10 text-base rounded-[14px]";
    return (
      <div className={`${sizeClass} ${colorClass} font-bold flex items-center justify-center shadow-sm shrink-0`}>
        {initial}
      </div>
    );
  };

  const getRoleBadge = (org) => {
    if (org.isOwner) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800">
          <i className="fa fa-shield-alt text-[10px]" /> Owner
        </span>
      );
    }
    if (org.userRole === "ADMIN" || org.userRole === "Admin" || org.userRole === "Editor") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800">
          <i className="fa fa-user-cog text-[10px]" /> Admin
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800">
        <i className="fa fa-user text-[10px]" /> {org.userRole || "Member"}
      </span>
    );
  };

  return (
    <main className="auth-page select-org-page h-screen max-h-screen p-3 md:p-5 relative overflow-hidden flex flex-col justify-between text-gray-800 dark:text-gray-100">
      <div className="absolute top-4 right-4 z-50">
        <LanguageSelector />
      </div>
      {/* 3D Animated Background from Login/Registration */}
      <div className="auth-3d-bg">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />

        {/* 3D Wireframe Cubes */}
        <div className="cube-3d-container cube-pos-1">
          <div className="cube-3d-box">
            <div className="cube-face face-front"></div>
            <div className="cube-face face-back"></div>
            <div className="cube-face face-left"></div>
            <div className="cube-face face-right"></div>
            <div className="cube-face face-top"></div>
            <div className="cube-face face-bottom"></div>
          </div>
        </div>
        <div className="cube-3d-container cube-pos-2">
          <div className="cube-3d-box">
            <div className="cube-face face-front"></div>
            <div className="cube-face face-back"></div>
            <div className="cube-face face-left"></div>
            <div className="cube-face face-right"></div>
            <div className="cube-face face-top"></div>
            <div className="cube-face face-bottom"></div>
          </div>
        </div>

        {/* Concentric Tech Rings */}
        <div className="tech-rings-container">
          <div className="tech-ring ring-1"></div>
          <div className="tech-ring ring-2"></div>
        </div>

        {/* Premium Background Visual */}
        <svg
          className="auth-bg-visual"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="lgMain" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2374F2" stopOpacity="0" />
              <stop offset="25%" stopColor="#2374F2" stopOpacity="0.45" />
              <stop offset="65%" stopColor="#FF9900" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#FF9900" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M -100 750 C 300 450, 700 850, 1540 350"
            stroke="url(#lgMain)"
            strokeWidth="2.5"
            fill="none"
            opacity="0.6"
          />
        </svg>
      </div>

      {/* Top Header with Logo */}
      <div className="text-center relative z-10 mx-auto max-w-2xl mt-1 md:mt-2 shrink-0">
        <div className="auth-brand-logo-wrap mx-auto mb-2 md:mb-3">
          <img src={Logo} alt="Advertise IQ" className="auth-brand-logo h-8 md:h-10 w-auto mx-auto object-contain drop-shadow-md" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          {new URLSearchParams(window.location.search).get('mode') === 'switch' ? (
            <span className="inline-flex items-center gap-2">
              Switch <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500 dark:from-blue-400 dark:to-cyan-300">Organization</span>
              <i className="fa fa-exchange-alt text-blue-500 opacity-80 text-xl md:text-2xl ml-1 animate-pulse" />
            </span>
          ) : (
            <>Welcome back, <span className="text-blue-600 dark:text-blue-400">{userName || userEmail?.split("@")[0] || "User"}</span> 👋</>
          )}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-xs md:text-sm font-medium mt-1">
          {new URLSearchParams(window.location.search).get('mode') === 'switch' ? (
            "Select an organization to switch your current context."
          ) : (
            "Select a workspace to continue managing your Amazon Advertising."
          )}
        </p>
      </div>

      {/* Main Glass Rounded Card */}
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-[28px] md:rounded-[32px] shadow-[0_25px_70px_rgba(0,0,0,0.08)] border border-gray-200/80 dark:border-slate-800/80 max-w-6xl w-full mx-auto p-4 md:p-6 my-2 md:my-3 relative z-10 text-gray-800 dark:text-gray-100 flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* Top Filter Bar: Search + Tabs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 mb-4 border-b border-gray-100 dark:border-slate-800 shrink-0">
          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <i className="fa fa-search text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 text-sm pointer-events-none" />
            <input
              type="text"
              placeholder={t("Search workspaces...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-800/80 text-gray-800 dark:text-gray-100 text-sm focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder-gray-400 font-medium"
            />
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {[
              { id: "All", label: "All" },
              { id: "Owned", label: "Owned" },
              { id: "Shared", label: "Shared" },
              { id: "Favorites", label: "Favorites", icon: "fa-star text-amber-400" },
              {
                id: "Pending Invite",
                label: `Pending Invite${pendingInvitations.length > 0 ? ` (${pendingInvitations.length})` : ""}`,
                badge: pendingInvitations.length > 0,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs md:text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "bg-gray-100/80 dark:bg-slate-800/80 text-gray-600 dark:text-gray-400 hover:bg-gray-200/80 dark:hover:bg-slate-700"
                  }`}
              >
                {tab.icon && <i className={`fa ${tab.icon}`} />}
                <span>{tab.label}</span>
                {tab.badge && activeTab !== tab.id && (
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block ml-0.5 animate-pulse" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Main Grid: Left Column (Workspaces) & Right Column (Create Box if no owned org) */}
        <div className={`grid grid-cols-1 ${!hasOwnedOrg ? "lg:grid-cols-3" : "lg:grid-cols-1"} gap-6 lg:gap-8 items-start flex-1 min-h-0 overflow-hidden h-full`}>

          {/* Left / Workspaces Area */}
          <div className={`${!hasOwnedOrg ? "lg:col-span-2" : "w-full"} h-full flex flex-col min-h-0 overflow-hidden`}>

            {/* 1. Pending Invitations Tab Content */}
            {activeTab === "Pending Invite" ? (
              <div className="h-full flex flex-col min-h-0">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2 shrink-0">
                  <i className="fa fa-envelope-open-text text-blue-500" /> Pending Invitations
                </h3>
                {pendingInvitations.length === 0 ? (
                  <div className="border border-dashed border-gray-200 dark:border-slate-800 rounded-2xl p-8 text-center bg-gray-50/50 dark:bg-slate-800/40">
                    <i className="fa fa-inbox text-gray-300 dark:text-slate-600 text-4xl mb-3 block" />
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">No pending invitations</p>
                    <p className="text-xs text-gray-400 mt-1">
                      When someone invites you to join an organization workspace, it will appear right here.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1 md:pr-2 space-y-2.5 custom-scrollbar">
                    {pendingInvitations.map((inv) => {
                      const isActing = inviteActionId === inv.token;
                      return (
                        <div
                          key={inv._id}
                          className="p-3 rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-gradient-to-r from-blue-50/50 to-indigo-50/30 dark:from-blue-950/20 dark:to-indigo-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
                              <i className="fa fa-envelope text-base" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-base text-gray-900 dark:text-white">
                                  {inv.organizationName}
                                </h4>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800">
                                  Role: {inv.roleName}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Invited by <strong className="text-gray-700 dark:text-gray-300">{inv.invitedByEmail}</strong>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <button
                              onClick={() => handleRejectInvite(inv.token)}
                              disabled={isActing}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 border border-red-200/60 dark:border-red-800/60 transition-all disabled:opacity-50"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handleAcceptInvite(inv.token)}
                              disabled={isActing}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] hover:opacity-90 shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
                            >
                              {isActing ? (
                                <>
                                  <i className="fa fa-spinner fa-spin" /> Processing...
                                </>
                              ) : (
                                <>
                                  <i className="fa fa-check" /> Accept & Join
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* 2. All / Owned / Shared / Favorites Tab Content */
              <div className="h-full flex flex-col min-h-0">
                {/* Continue Where You Left Off (Only when in All tab and orgs available) */}
                {activeTab === "All" && continueOrg && !searchQuery && (
                  <div className="shrink-0 mb-3.5">
                    <h3 className="text-xs font-bold tracking-wide text-gray-500 dark:text-gray-400 mb-2 uppercase flex items-center gap-2">
                      Continue where you left off
                    </h3>
                    <div
                      onClick={() => handleSelect(continueOrg)}
                      className="p-3 rounded-xl border-2 border-blue-500/80 dark:border-blue-500/60 bg-gradient-to-r from-blue-50/40 to-indigo-50/20 dark:from-blue-950/20 dark:to-indigo-950/10 flex items-center justify-between gap-3 shadow-sm cursor-pointer hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={(e) => handleToggleFavorite(e, continueOrg)}
                          className="text-lg focus:outline-none transition-transform hover:scale-110"
                          title={t("Toggle Favorite")}
                        >
                          <i
                            className={`fa-star ${continueOrg.isFavorite
                              ? "fa text-amber-400 fill-amber-400 drop-shadow-sm"
                              : "far text-gray-300 dark:text-gray-600 hover:text-amber-400"
                              }`}
                          />
                        </button>
                        {getAvatarContent(continueOrg, true)}
                        <div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h4 className="font-extrabold text-base text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {continueOrg.organizationName}
                            </h4>
                            {getRoleBadge(continueOrg)}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{continueOrg.memberCount || "1"} Members</span>
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(continueOrg);
                        }}
                        disabled={selectingId === continueOrg._id}
                        className="px-4 py-2 rounded-xl font-bold text-xs text-white bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] hover:opacity-90 shadow-md shadow-blue-500/20 flex items-center gap-2 shrink-0 transition-all transform group-hover:translate-x-1"
                      >
                        {selectingId === continueOrg._id ? (
                          <>
                            <i className="fa fa-spinner fa-spin" /> Loading...
                          </>
                        ) : (
                          <>
                            Continue <i className="fa fa-arrow-right text-xs" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* All / Filtered Organizations List Header */}
                <h3 className="text-xs font-bold tracking-wide text-gray-500 dark:text-gray-400 mb-2.5 uppercase shrink-0">
                  {activeTab === "All" ? "All Organizations" : `${activeTab} Organizations`} ({filteredOrganizations.length})
                </h3>

                {filteredOrganizations.length === 0 ? (
                  <div className="border border-dashed border-gray-200 dark:border-slate-800 rounded-2xl p-8 text-center bg-gray-50/50 dark:bg-slate-800/40">
                    <i className="fa fa-folder-open text-gray-300 dark:text-slate-600 text-4xl mb-3 block" />
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">No workspaces found</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Try adjusting your search query or switching tabs.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1 md:pr-2 space-y-2.5 custom-scrollbar">
                    {filteredOrganizations.map((org) => {
                      const isSelecting = selectingId === org._id;
                      return (
                        <div
                          key={org._id}
                          onClick={() => handleSelect(org)}
                          className="p-2.5 rounded-xl border border-gray-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/70 hover:border-gray-300 dark:hover:border-slate-700 hover:shadow-sm transition-all flex items-center justify-between gap-3 cursor-pointer group"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            {/* Star Favorite Icon */}
                            <button
                              type="button"
                              onClick={(e) => handleToggleFavorite(e, org)}
                              className="text-base focus:outline-none transition-transform hover:scale-110 shrink-0 py-1 px-0.5"
                              title={org.isFavorite ? "Remove Favorite" : "Add Favorite"}
                            >
                              <i
                                className={`fa-star ${org.isFavorite
                                  ? "fa text-amber-400 fill-amber-400 drop-shadow-sm"
                                  : "far text-gray-300 dark:text-gray-600 hover:text-amber-400"
                                  }`}
                              />
                            </button>

                            {getAvatarContent(org, false)}

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-sm md:text-base text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                  {org.organizationName}
                                </h4>
                                {getRoleBadge(org)}
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                                <span>{org.memberCount || "1"} Members</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Continue Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelect(org);
                              }}
                              disabled={isSelecting}
                              className="px-3.5 py-1.5 rounded-xl font-semibold text-xs md:text-sm text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:text-white hover:border-transparent hover:bg-gradient-to-br hover:from-[#1A9FD4] hover:to-[#2374F2] shadow-sm flex items-center gap-2 transition-all"
                            >
                              {isSelecting ? (
                                <>
                                  <i className="fa fa-spinner fa-spin" /> ...
                                </>
                              ) : (
                                <>
                                  Continue <i className="fa fa-arrow-right text-[11px]" />
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Create New Organization Box (Only shown if !hasOwnedOrg) */}
          {!hasOwnedOrg && (
            <div className="bg-gradient-to-br from-blue-50/60 via-indigo-50/30 to-purple-50/20 dark:from-slate-800/80 dark:via-slate-800/60 dark:to-slate-900/60 rounded-3xl border border-blue-100/80 dark:border-slate-800 p-5 md:p-6 text-center flex flex-col justify-between max-h-full overflow-y-auto shadow-sm custom-scrollbar">
              <div>
                <div className="w-12 h-12 rounded-full bg-blue-100/80 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl font-bold mx-auto mb-3 shadow-sm">
                  <i className="fa fa-plus" />
                </div>
                <h3 className="text-lg font-extrabold text-gray-900 dark:text-white tracking-tight mb-1.5">
                  Create New Organization
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">
                  Start your first workspace and invite your team.
                </p>

                {showCreateModal ? (
                  <form onSubmit={handleCreate} className="space-y-3.5 text-left">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Organization Name
                      </label>
                      <input
                        type="text"
                        placeholder={t("e.g. Acme Corp Marketplace")}
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                        required
                        autoFocus
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCreateModal(false)}
                        className="w-1/2 py-2 px-3 rounded-xl font-semibold text-xs text-gray-600 dark:text-gray-400 bg-gray-200/60 dark:bg-slate-700 hover:bg-gray-300/80 dark:hover:bg-slate-600 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-1/2 py-2 px-3 rounded-xl font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
                      >
                        {submitting ? <i className="fa fa-spinner fa-spin" /> : "Create"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="w-full py-3 px-5 rounded-xl font-extrabold text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    Create Organization
                  </button>
                )}

                <div className="mt-6 space-y-2.5 text-left border-t border-gray-200/60 dark:border-slate-800 pt-5">
                  {[
                    "Centralize your Amazon campaigns",
                    "Invite team members",
                    "Manage permissions",
                    "Track performance",
                  ].map((benefit, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 text-xs text-gray-600 dark:text-gray-400 font-medium">
                      <div className="w-4 h-4 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[9px] shrink-0 border border-blue-100 dark:border-blue-800">
                        <i className="fa fa-check" />
                      </div>
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between max-w-6xl w-full mx-auto py-1 px-2 text-xs text-gray-500 dark:text-gray-400 gap-2 relative z-10 font-medium shrink-0">
        <div className="flex items-center gap-4">
        </div>

        <div className="flex items-center gap-3">
          <span>
            Logged in as <strong className="text-gray-800 dark:text-gray-200 font-semibold">{userEmail || "user"}</strong>
          </span>
          <button
            onClick={handleSignOut}
            className="bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 px-3.5 py-1 rounded-lg font-semibold transition-all shadow-sm flex items-center gap-1.5"
          >
            <i className="fa fa-sign-out-alt" /> Sign Out
          </button>
        </div>
      </div>

      {/* Edit Organization Modal */}
      {editOrgModalShow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1e1e1e] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-800 relative">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-gray-50 to-white dark:from-[#1e1e1e] dark:to-slate-900/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-sm">
                  <i className="fa fa-building text-sm" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">Edit Organization</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Rename your organization</p>
                </div>
              </div>
              <button
                onClick={() => setEditOrgModalShow(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
              >
                <i className="fa fa-times" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleEditSubmit}>
              <div className="p-6">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Organization Name <span className="text-red-500">*</span>
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <i className="fa fa-building" />
                  </div>
                  <input
                    type="text"
                    value={editOrgName}
                    onChange={(e) => setEditOrgName(e.target.value)}
                    placeholder={t("Enter new organization name")}
                    autoFocus
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900/50 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-gray-50/50 dark:bg-[#1a1a1a] border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditOrgModalShow(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editingOrgSubmit || !editOrgName.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-500/30 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingOrgSubmit ? (
                    <>
                      <i className="fa fa-spinner fa-spin" /> Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </main>
  );
};

export default SelectOrganization;
