import { useTranslation } from "react-i18next";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { t } from "i18next";
import Toast from "../../../common/helper/toast/Toast";
import { ApiCreateUser, ApiDeleteUser, ApiUpdateUser, ApiUserList, ApiGetInvitationList, ApiCancelInvitation, ApiResendInvitation } from "../../../api-wrapper/ApiUsers";
import { ApiConfigList } from "../../../api-wrapper/ApiAdsConfig"
import Filter from "../../../helper/filter/Filter";
import { useEffect, useState, useRef, useContext } from "react";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import AgTable from "../../../common/grid/AgTable";
import EditUserModal from "./EditUserModal";
import InviteUserModal from "./InviteUserModal";
import UserOrganizationListModal from "./UserOrganizationListModal";
import { ApiGetAllRoles } from "../../../api-wrapper/ApiRoles";

import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { MdOutlineClose } from "react-icons/md";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { ROLES } from "src/common/constants";
import { CardTitle } from "src/components/ui/card";
import { AppTooltip } from "../../../components/ui/AppTooltip";

const Users = () => {
  const { t } = useTranslation();
  const role = localStorage.getItem("role");
  const isSuperAdmin = role === ROLES.SUPER_ADMIN;
  const { numberOfInvites, totalOrgUsers, totalPendingInvites, setRefreshSideBar } = useContext(ProfileContext);

  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [perPage, setPerPage] = useState(firstPageRows);

  const [userList, setUserList] = useState([]);
  const [configList, setConfigList] = useState([]);
  const [packageList, setPackageList] = useState([]);
  const [groupsData, setGroupsData] = useState([]);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [openEditModal, setOpenEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(null);

  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserForOrgModal, setSelectedUserForOrgModal] = useState(null);
  const [openOrgListModal, setOpenOrgListModal] = useState(false);
  const [rolesList, setRolesList] = useState([]);

  const [showHistory, setShowHistory] = useState(false);
  const [inviteList, setInviteList] = useState([]);
  const [openInviteModal, setOpenInviteModal] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");

  const activeUserCount = totalOrgUsers || 0;
  const pendingInviteCount = totalPendingInvites || 0;
  const isInviteDisabled = activeUserCount + pendingInviteCount >= numberOfInvites;
  let inviteTooltipText = "";
  if (isInviteDisabled) {
    if (activeUserCount >= numberOfInvites) {
      inviteTooltipText = t("Limit Over and Upgrade Plan");
    } else {
      inviteTooltipText = t(`You have ${activeUserCount} members and you already sent ${pendingInviteCount} member invites.\nWait for that member reply.\nIf they cancel or expire you are able to send more invites,\nand if you need more invites then Upgrade a Plan.`);
    }
  }

  const gridRef = useRef(null);
  const inviteGridRef = useRef(null);
  const isFirstRender = useRef(true);
  const [loadingGrid, setLoadingGrid] = useState(false);

  const ApiListing = async (extraArgs = {}) => {
    setLoadingGrid(true);
    const payload = {
      pageNo: arg.pageNo,
      perPage: arg.perPage,
      searchName: searchName,
      fieldName: "createdAt",
      sortType: "DESC",
      ...extraArgs
    };

    await ApiUserList(payload)
      .then((res) => {
        if (res.isSuccess) {
          setUserList(res.data);
          setGroupsData(res);
        } else {
          Toast.error(res.message);
        }
      })
      .catch(() => {
        Toast.error(t("Something went wrong"));
      })
      .finally(() => setLoadingGrid(false));
  };

  useEffect(() => {
    const fetchStaticData = async () => {
      await ApiConfigList()
        .then((res) => {
          if (res.isSuccess) {
            setConfigList(res?.data);
            setPackageList(res?.packages);
          } else Toast.error(res.message);
        })
        .catch(() => Toast.error(t("Something went wrong")));

      await ApiGetAllRoles()
        .then((res) => {
          if (res.isSuccess && res.data) {
            setRolesList(res.data.map(r => ({ label: r.roleName, value: r._id, organizationId: r.organizationId?._id || r.organizationId || null })));
          }
        })
        .catch(() => { });
    };

    fetchStaticData();
    ApiListing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (debouncedSearchName !== undefined) {
      ApiListing({ searchName: debouncedSearchName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchName]);

  const handlePageChange = (page) => {
    setArg((prev) => ({ ...prev, pageNo: page }));
    ApiListing({ pageNo: page });
  };

  const handlePerRowsChange = (newPerPage) => {
    setPerPage(newPerPage);
    setArg({ pageNo: 1, perPage: newPerPage });
    ApiListing({ pageNo: 1, perPage: newPerPage });
  };

  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    ApiListing({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), ...arg });
  };

  const saveEditProfile = async (data) => {
    if (data.userId) {
      await ApiUpdateUser(data)
        .then(async (res) => {
          if (res?.isSuccess) {
            setOpenEditModal(false);
            Toast.success(res?.message);
            ApiListing();
          } else Toast.error(res?.message);
        })
        .catch(() => Toast.error(t("Something went wrong")));
    }
    else {
      await ApiCreateUser(data)
        .then(async (res) => {
          if (res?.isSuccess) {
            setOpenEditModal(false);
            Toast.success(res?.message);
            ApiListing();
          } else Toast.error(res?.message);
        })
        .catch(() => Toast.error(t("Something went wrong")));
    }
  };

  const deleteHandler = async () => {
    const organizationId = localStorage.getItem("organizationId");
    await ApiDeleteUser({ id: showDeleteModal?._id, organizationId })
      .then((res) => {
        if (res?.isSuccess) {
          Toast.success(res?.message);
          ApiListing();
          setRefreshSideBar(prev => prev + 1);
        } else Toast.error(res?.message);
      })
      .catch(() => Toast.error(t("Something went wrong")));
  }

  const fetchInvitations = async () => {
    const organizationId = localStorage.getItem("organizationId");
    const res = await ApiGetInvitationList({ organizationId });
    if (res?.isSuccess) {
      setInviteList(res.data || []);
    } else {
      Toast.error(res?.message || "Failed to fetch invitations");
    }
  };

  useEffect(() => {
    if (!isSuperAdmin) {
      fetchInvitations();
    }
  }, [isSuperAdmin, showHistory]);

  const handleResendInvite = async (id) => {
    const res = await ApiResendInvitation({ id });
    if (res?.isSuccess) {
      Toast.success(res.message);
      fetchInvitations();
    } else {
      Toast.error(res?.message || "Failed to resend invitation");
    }
  };

  const handleCancelInvite = async (id) => {
    const res = await ApiCancelInvitation({ id });
    if (res?.isSuccess) {
      Toast.success(res.message);
      fetchInvitations();
      setRefreshSideBar(prev => prev + 1);
    } else {
      Toast.error(res?.message || "Failed to cancel invitation");
    }
  };

  const ProfilesAccessChipsRenderer = (params) => {
    const list = params.data?.profileAccess || [];
    if (!list.length) return <span className="text-xs opacity-50">-</span>;
    return (
      <div className="flex flex-wrap items-center gap-1.5 py-1.5">
        {list.map((item, idx) => (
          <span
            key={idx}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-sm"
          >
            {item.countryCode ? `${item.countryCode} - ` : ""}
            {item.name || `Profile ${item.profileId}`}
          </span>
        ))}
      </div>
    );
  };

  const inviteColumns = [
    ...(PermissionCheck(SYSTEM_PAGES.USERS, PAGE_ACTIONS.UPDATE) || PermissionCheck(SYSTEM_PAGES.USERS, PAGE_ACTIONS.REMOVE) ? [
      {
        headerName: t("Action"),
        field: "action",
        title: "Action",
        width: 130,
        sortable: false,
        resizable: false,
        cellRenderer: (params) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="action_container flex items-center justify-center gap-2 py-1.5">
              {row.status === "PENDING" && (
                <>
                  {PermissionCheck(SYSTEM_PAGES.USERS, PAGE_ACTIONS.UPDATE) && (
                    <AppTooltip
                      text={
                        new Date(row.expiresAt) >= new Date()
                          ? t("Invitation is still active. Please wait 3 days to resend.")
                          : isInviteDisabled
                          ? inviteTooltipText
                          : t("Resend Invitation")
                      }
                    >
                      <button
                        type="button"
                        disabled={new Date(row.expiresAt) >= new Date() || isInviteDisabled}
                        onClick={() => handleResendInvite(row._id)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors shadow-sm ${
                          new Date(row.expiresAt) >= new Date() || isInviteDisabled
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500"
                            : "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-400 dark:hover:bg-blue-900/60"
                        }`}
                      >
                        <i className="fa fa-refresh text-xs" />
                      </button>
                    </AppTooltip>
                  )}
                  {PermissionCheck(SYSTEM_PAGES.USERS, PAGE_ACTIONS.REMOVE) && (
                    <AppTooltip text={t("Cancel Invitation")}>
                      <button
                        type="button"
                        onClick={() => handleCancelInvite(row._id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/60 transition-colors shadow-sm"
                      >
                        <i className="fa fa-times text-xs" />
                      </button>
                    </AppTooltip>
                  )}
                </>
              )}
              {row.status !== "PENDING" && <span className="text-xs opacity-50">-</span>}
            </div>
          );
        },
      },
    ] : []),
    {
      headerName: t("Email"),
      field: "email",
      title: "Email",
      minWidth: 200,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: t("Role"),
      field: "roleId.roleName",
      title: "Role",
      minWidth: 140,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => params.data?.roleId?.roleName || "-",
    },
    {
      headerName: t("Profiles Access"),
      field: "profileAccess",
      title: "Profiles Access",
      minWidth: 260,
      flex: 1.5,
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: ProfilesAccessChipsRenderer,
    },
    {
      headerName: t("Status"),
      field: "status",
      title: "Status",
      minWidth: 130,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        let status = params.value;
        if (status === "PENDING" && params.data?.expiresAt && new Date(params.data.expiresAt) < new Date()) {
          status = "EXPIRED";
        }
        const colors = {
          ACCEPTED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-300 dark:border-green-800",
          PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-800",
          CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-800",
          EXPIRED: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700",
        };
        return (
          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${colors[status] || ""}`}>
            {t(status) || status}
          </span>
        );
      },
    },
    {
      headerName: t("Invited By"),
      field: "invitedBy.fullName",
      title: "Invited By",
      minWidth: 160,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => params.data?.invitedBy?.fullName || params.data?.invitedBy?.email || "-",
    },
    {
      headerName: t("Invited On"),
      field: "createdAt",
      title: "Invited On",
      minWidth: 140,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => (params.value ? new Date(params.value).toLocaleDateString() : "-"),
    },
  ];

  const columns = [
    ...(PermissionCheck(SYSTEM_PAGES.USERS, PAGE_ACTIONS.UPDATE) || PermissionCheck(SYSTEM_PAGES.USERS, PAGE_ACTIONS.REMOVE) ? [
      {
        headerName: t("Action"),
        field: "action",
        title: "Action",
        width: 120,
        sortable: false,
        resizable: false,
        cellRenderer: (params) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="action_container gap-2">
              {PermissionCheck(SYSTEM_PAGES.USERS, PAGE_ACTIONS.UPDATE) && (
                <AppTooltip text={t("Edit Profile")}>
                  <i
                    id={`user-edit-btn-${params.node?.rowIndex}`}
                    className="fa fa-pencil cursor-pointer"
                    onClick={() => { setSelectedUser(row); setOpenEditModal(true); }}
                  />
                </AppTooltip>
              )}
              {PermissionCheck(SYSTEM_PAGES.USERS, PAGE_ACTIONS.REMOVE) && (
                <AppTooltip text={t("Delete User")}>
                  <i id={`user-delete-btn-${params.node?.rowIndex}`} className="fa fa-trash cursor-pointer" onClick={() => setShowDeleteModal(row)} />
                </AppTooltip>
              )}
            </div>
          );
        },
      },
    ] : []),
    {
      headerName: t("Name"),
      field: "fullName",
      title: "Name",
      minWidth: 160,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: t("Email"),
      field: "email",
      title: "Email",
      minWidth: 200,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    },
    ...(isSuperAdmin ? [
      {
        headerName: t("Company"),
        field: "companyName",
        title: "Company",
        minWidth: 160,
        sortable: true,
        resizable: true,
        wrapText: true,
        autoHeight: true,
      }
    ] : []),
    {
      headerName: t("Role"),
      field: "roles.roleName",
      title: "Role",
      minWidth: 140,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => params.data?.roles?.roleName || params.data?.roleId?.roleName || "-",
    },
    {
      headerName: t("Profiles Access"),
      field: "profileAccess",
      title: "Profiles Access",
      minWidth: 260,
      flex: 1.5,
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: ProfilesAccessChipsRenderer,
    },
    ...(isSuperAdmin ? [
      {
        headerName: "Phone",
        field: "companyPhoneNumber",
        title: "Phone",
        minWidth: 150,
        sortable: true,
        resizable: true,
        wrapText: true,
        autoHeight: true,
      },
      {
        headerName: "Country",
        field: "country.countryName",
        title: "Country",
        minWidth: 140,
        sortable: true,
        resizable: true,
        wrapText: true,
        autoHeight: true,
        cellRenderer: (params) => params.value || "-",
      },
      {
        headerName: "Website",
        field: "companyWebsite",
        title: "Website",
        minWidth: 180,
        sortable: true,
        resizable: true,
        wrapText: true,
        autoHeight: true,
        cellRenderer: (params) => {
          if (!params.value) return null;
          return (
            <a href={params.value} target="_blank" rel="noopener noreferrer" className="text-primary text-decoration-underline" onClick={(e) => e.stopPropagation()}>
              {params.value}
            </a>
          );
        },
      },
    ] : []),
  ];

  const superAdminColumns = [
    ...(PermissionCheck(SYSTEM_PAGES.USERS, PAGE_ACTIONS.UPDATE) || PermissionCheck(SYSTEM_PAGES.USERS, PAGE_ACTIONS.REMOVE) ? [
      {
        headerName: t("Action"),
        field: "action",
        title: "Action",
        width: 110,
        sortable: false,
        resizable: false,
        cellRenderer: (params) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="action_container gap-2 flex items-center justify-center py-1.5">
              {PermissionCheck(SYSTEM_PAGES.USERS, PAGE_ACTIONS.UPDATE) && (
                <AppTooltip text={t("Edit User")}>
                  <i
                    id={`user-edit-btn-${params.node?.rowIndex}`}
                    className="fa fa-pencil cursor-pointer"
                    onClick={() => { setSelectedUser(row); setOpenEditModal(true); }}
                  />
                </AppTooltip>
              )}
              {PermissionCheck(SYSTEM_PAGES.USERS, PAGE_ACTIONS.UPDATE) && (
                <AppTooltip text={t("Permission Edit")}>
                  <i
                    id={`user-permission-edit-btn-${params.node?.rowIndex}`}
                    className="fa fa-lock cursor-pointer"
                    onClick={() => { setSelectedUserForOrgModal(row); setOpenOrgListModal(true); }}
                  />
                </AppTooltip>
              )}
            </div>
          );
        },
      },
    ] : []),
    {
      headerName: "Name",
      field: "fullName",
      title: "Name",
      minWidth: 160,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: "Email",
      field: "email",
      title: "Email",
      minWidth: 200,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: "Company Name",
      field: "companyName",
      title: "Company Name",
      minWidth: 160,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: "Phone Number",
      field: "phoneNumber",
      title: "Phone Number",
      minWidth: 150,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => params.data?.phoneNumber || params.data?.companyPhoneNumber || "-",
    },
    {
      headerName: "List of Organization",
      field: "organizationsCount",
      title: "List of Organization",
      minWidth: 180,
      sortable: false,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const count = row.organizationsCount ?? (row.organizations?.length || 0);
        return (
          <button
            type="button"
            onClick={() => { setSelectedUserForOrgModal(row); setOpenOrgListModal(true); }}
            className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60 font-semibold transition-all flex items-center gap-1.5 shadow-sm text-[11px]"
          >
            <i className="fa fa-building-o"></i>
            <span>{count} {count === 1 ? "Organization" : "Organizations"}</span>
          </button>
        );
      },
    },
  ];

  const finalColumnsDefs = isSuperAdmin ? superAdminColumns : columns;

  return (
    <>
      <Filter
        name={"Users"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="middle_container">
        {showHistory && !isSuperAdmin && (
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold">
            <span
              className="cursor-pointer text-slate-500 hover:text-primary transition-colors flex items-center gap-1.5"
              onClick={() => setShowHistory(false)}
            >
              <i className="fa fa-users" />
              <span>{t("Users")}</span>
            </span>
            <i className="fa fa-angle-right text-slate-400 dark:text-slate-600" />
            <span className="text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <i className="fa fa-history text-primary" />
              <span>{t("Invited Users")}</span>
            </span>
          </div>
        )}

        <div className="data_content data_content_btn glass-grid-container h-maxContent" style={{ marginTop: showHistory && !isSuperAdmin ? "4px" : "12px" }}>
          <div className="camapgin_btn flex flex-wrap justify-between items-center gap-3 pt-4 pb-2 px-6 border-b dark:border-slate-800 border-slate-200">
            <div className="flex items-center gap-3">
              {showHistory && !isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300"
                  title={t("Back to Organization Users")}
                >
                  <i className="fa fa-arrow-left text-xs" />
                </button>
              )}
              <CardTitle className="m-0 flex items-center cron-title-bar" style={{ fontSize: 14, color: isDark ? "#cbd5e1e0" : "#0F172A" }}>
                {isSuperAdmin
                  ? t("Users")
                  : showHistory
                    ? t("Invited Users")
                    : t("Users")}
              </CardTitle>
            </div>

            <div className="flex items-center gap-3">
              {!showHistory ? (
                <>
                  {
                    !isSuperAdmin && (
                      <div id="users-history-btn" className="flex items-center">
                        <Button
                          onClick={() => setShowHistory(true)}
                          variant="outline"
                          className="h-9 px-3.5 rounded-md font-semibold transition-all flex items-center gap-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 shadow-sm"
                          style={{ fontSize: "12px" }}
                        >
                          <i className="fa fa-history text-primary" />
                          {t("Invited Users")}
                          {inviteList.length > 0 && (
                            <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 text-[10px] font-bold">
                              {inviteList.length}
                            </span>
                          )}
                        </Button>
                      </div>
                    )
                  }
                  <div id="users-search" className="relative flex items-center" style={{ width: isMobile ? "100%" : "220px" }}>
                    <Input
                      type="text"
                      placeholder={t("searchHere")}
                      value={searchName}
                      onChange={(e) => setSearchName(e.target.value)}
                      className="shadcn-search-input pr-8 text-xs h-9"
                    />
                    {searchName && (
                      <MdOutlineClose
                        onClick={() => setSearchName("")}
                        className="absolute right-2.5 cursor-pointer opacity-70 hover:opacity-100 dark:text-slate-300"
                        style={{ fontSize: "16px" }}
                      />
                    )}
                  </div>

                  {!isSuperAdmin && PermissionCheck(SYSTEM_PAGES.USERS, PAGE_ACTIONS.CREATE) && (
                    <>
                      <div id="users-invite-btn" className="flex items-center">
                        {isInviteDisabled ? (
                          <AppTooltip text={inviteTooltipText}>
                            <div className="inline-block cursor-not-allowed">
                              <Button
                                disabled
                                className="h-9 px-4 rounded-md font-semibold text-white transition-all flex items-center gap-2 shadow-sm opacity-60 pointer-events-none"
                                style={{
                                  background: "linear-gradient(135deg, #94a3b8, #64748b)",
                                  fontSize: "12px",
                                }}
                              >
                                <i className="fa fa-user-plus" />
                                {t("Invite User")}
                              </Button>
                            </div>
                          </AppTooltip>
                        ) : (
                          <Button
                            onClick={() => setOpenInviteModal(true)}
                            className="h-9 px-4 rounded-md font-semibold text-white transition-all hover:opacity-90 flex items-center gap-2 shadow-sm"
                            style={{
                              background: "linear-gradient(135deg, #2374F2, #1A9FD4)",
                              fontSize: "12px",
                            }}
                          >
                            <i className="fa fa-user-plus" />
                            {t("Invite User")}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div id="invites-search" className="relative flex items-center" style={{ width: isMobile ? "100%" : "220px" }}>
                    <Input
                      type="text"
                      placeholder={t("searchHere")}
                      value={inviteSearch}
                      onChange={(e) => setInviteSearch(e.target.value)}
                      className="shadcn-search-input pr-8 text-xs h-9"
                    />
                    {inviteSearch && (
                      <MdOutlineClose
                        onClick={() => setInviteSearch("")}
                        className="absolute right-2.5 cursor-pointer opacity-70 hover:opacity-100 dark:text-slate-300"
                        style={{ fontSize: "16px" }}
                      />
                    )}
                  </div>

                  {
                    PermissionCheck(SYSTEM_PAGES.USERS, PAGE_ACTIONS.CREATE) && (
                      <>
                        <div id="users-invite-btn" className="flex items-center">
                          {isInviteDisabled ? (
                            <AppTooltip text={inviteTooltipText}>
                              <div className="inline-block cursor-not-allowed">
                                <Button
                                  disabled
                                  className="h-9 px-4 rounded-md font-semibold text-white transition-all flex items-center gap-2 shadow-sm opacity-60 pointer-events-none"
                                  style={{
                                    background: "linear-gradient(135deg, #94a3b8, #64748b)",
                                    fontSize: "12px",
                                  }}
                                >
                                  <i className="fa fa-user-plus" />
                                  {t("Invite User")}
                                </Button>
                              </div>
                            </AppTooltip>
                          ) : (
                            <Button
                              onClick={() => setOpenInviteModal(true)}
                              className="h-9 px-4 rounded-md font-semibold text-white transition-all hover:opacity-90 flex items-center gap-2 shadow-sm"
                              style={{
                                background: "linear-gradient(135deg, #2374F2, #1A9FD4)",
                                fontSize: "12px",
                              }}
                            >
                              <i className="fa fa-user-plus" />
                              {t("Invite User")}
                            </Button>
                          )}
                        </div>
                      </>
                    )
                  }
                </>
              )}
            </div>
          </div>

          <div id="users-main-table" className="data_table position-relative w-full max-w-full">
            {!showHistory ? (
              <AgTable
                onRefresh={ApiListing} ref={gridRef}
                rowHeight={60}
                tableId="users-main-table"
                height={"55vh"}
                loading={loadingGrid}
                rowData={userList}
                columnDefs={finalColumnsDefs}
                totalRecords={groupsData?.totalRecords ?? 0}
                perPage={perPage}
                currentPage={arg.pageNo}
                onPageChange={handlePageChange}
                onPerPageChange={handlePerRowsChange}
                onSortChanged={handleSortChanged}
                paginationOptions={paginationRowsPerPageOptions}
                isCustomSaveColumns={true}
                customSaveColumnName={"Users"}
                handleSaveColumns={undefined}
              />
            ) : (
              <AgTable
                ref={inviteGridRef}
                rowHeight={60}
                tableId="invites-main-table"
                height={"55vh"}
                rowData={inviteList.filter(
                  (item) =>
                    !inviteSearch ||
                    item.email?.toLowerCase().includes(inviteSearch.toLowerCase()) ||
                    item.roleId?.roleName?.toLowerCase().includes(inviteSearch.toLowerCase())
                )}
                columnDefs={inviteColumns}
                totalRecords={inviteList.length}
                perPage={perPage}
                currentPage={1}
                onPageChange={() => { }}
                onPerPageChange={() => { }}
                onSortChanged={() => { }}
                paginationOptions={paginationRowsPerPageOptions}
                isCustomSaveColumns={false}
              />
            )}
          </div>
        </div>

        <EditUserModal
          open={openEditModal}
          onClose={() => { setOpenEditModal(false); ApiListing(); }}
          user={selectedUser}
          onSave={saveEditProfile}
          configList={configList}
          packageList={packageList}
          countryList={groupsData?.countries}
        />

        <InviteUserModal
          open={openInviteModal}
          onClose={() => setOpenInviteModal(false)}
          onSuccess={() => { fetchInvitations(); setRefreshSideBar(prev => prev + 1); setShowHistory(true); }}
          configList={configList}
        />

        <UserOrganizationListModal
          open={openOrgListModal}
          onClose={() => { setOpenOrgListModal(false); setSelectedUserForOrgModal(null); }}
          user={selectedUserForOrgModal}
          roles={rolesList}
          configList={configList}
          onRefreshUsers={ApiListing}
        />

        <CustomModal
          show={!!showDeleteModal?._id}
          onHide={() => setShowDeleteModal(null)}
          title={t("Remove User from Organization")}
          subtitle={t("Organization Access Removal")}
          icon="delete"
          iconVariant="danger"
          message={`You are about to remove <span class="cm-highlight">${showDeleteModal?.fullName}</span> from this organization.`}
          alertText="This action will remove the user's role and profile permissions from the current organization."
          alertVariant="danger"
          closeOnBackdrop={false}
          actions={[
            { label: t("Cancel"), cancel: true, icon: "close", onClick: () => setShowDeleteModal(null) },
            { label: t("Remove"), variant: "danger", icon: "delete", onClick: () => { deleteHandler(); setShowDeleteModal(null); } },
          ]}
        />
      </div>
    </>
  );
};

export default Users;
