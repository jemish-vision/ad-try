import { useTranslation } from "react-i18next";
import { t } from "i18next";
import Toast from "../../../common/helper/toast/Toast";
import Filter from "../../../helper/filter/Filter";
import { Input } from "../../../components/ui/input";
import { useEffect, useState } from "react";
import EditRoleModal from "./EditRoleModal";
import { ApiDeleteRole, ApiGetAllRoles, ApiUpdateRole, ApiUpdateRolePermission } from "../../../api-wrapper/ApiRoles";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { MdOutlineClose } from "react-icons/md";
import { ROLES, SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";

const Roles = () => {
  const { t } = useTranslation();
  const [roleList, setRoleList] = useState([]);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleThemeChange = () => {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    };
    const observer = new MutationObserver(handleThemeChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const [openEditModal, setOpenEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);

  const ApiListing = async (extraArgs = {}) => {
    const payload = {
      pageNo: 1,
      perPage: 100,
      searchName: searchName,
      fieldName: "createdAt",
      sortType: "ASC",
      ...extraArgs
    };

    await ApiGetAllRoles(payload)
      .then((res) => {
        if (res.isSuccess) {
          setRoleList(res.data || []);
        } else {
          Toast.error(res.message);
        }
      })
      .catch(() => {
        Toast.error(t("Something went wrong"));
      });
  };

  useEffect(() => {
    ApiListing();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  useEffect(() => {
    if (debouncedSearchName !== undefined) {
      ApiListing({ searchName: debouncedSearchName });
    }
  }, [debouncedSearchName]);

  const savePermission = async (updatedData) => {
    if (!updatedData) return;
    await ApiUpdateRolePermission(updatedData)
      .then((res) => {
        if (!res.isSuccess) Toast.error(res?.message);
      })
      .catch(() => Toast.error(t("Something went wrong")));
  };

  const saveEditProfile = async (data) => {
    if (data.roleId) {
      await ApiUpdateRole(data)
        .then(async (res) => {
          if (res?.isSuccess) {
            await savePermission(data);
            setOpenEditModal(false);
            Toast.success(res?.message);
            ApiListing();
          } else Toast.error(res?.message);
        })
        .catch(() => Toast.error(t("Something went wrong")));
    }
  };

  const deleteHandler = async () => {
    await ApiDeleteRole({ id: showDeleteModal?._id })
      .then((res) => {
        if (res?.isSuccess) {
          Toast.success(res?.message);
          ApiListing();
        } else Toast.error(res?.message);
      })
      .catch(() => Toast.error(t("Something went wrong")));
  };

  const getRoleCardInfo = (roleName = "") => {
    const name = roleName.toUpperCase().trim();
    if (name.includes(ROLES.SUPER_ADMIN)) {
      return {
        badge: t("System Role"),
        badgeBg: "rgba(59, 130, 246, 0.15)",
        badgeColor: "#3b82f6",
        icon: "fa-solid fa-shield-halved",
        iconBg: "rgba(59, 130, 246, 0.12)",
        iconColor: "#3b82f6",
        description: t("Full administrative authority over the entire Advertise IQ account. Includes billing management, global security settings, and user provisioning. This role cannot be deleted and represents the highest tier of access."),
        accessText: t("ACCESS: FULL CONTROL")
      };
    }
    if (name.includes(ROLES.ADMIN)) {
      return {
        badge: t("Management"),
        badgeBg: "rgba(100, 116, 139, 0.15)",
        badgeColor: isDark ? "#94a3b8" : "#64748b",
        icon: "fa-solid fa-lock",
        iconBg: "rgba(100, 116, 139, 0.12)",
        iconColor: isDark ? "#94a3b8" : "#64748b",
        description: t("Comprehensive access to campaign tools, analytics, and member roles. Admins can manage all operational aspects but are restricted from account-level billing and core security configurations reserved for Owners."),
        accessText: t("ACCESS: OPERATIONAL")
      };
    }
    return {
      badge: t("Custom Role"),
      badgeBg: "rgba(139, 92, 246, 0.15)",
      badgeColor: "#8b5cf6",
      icon: "fa-solid fa-id-badge",
      iconBg: "rgba(139, 92, 246, 0.12)",
      iconColor: "#8b5cf6",
      description: t("Tailored access permissions configured for your organization. Users with this role have specific capabilities defined by system administrators."),
      accessText: t("ACCESS: CUSTOM")
    };
  };

  // Point 6: Order roles based on (Super Admin, Admin)
  const getRolePriority = (roleName = "") => {
    const name = roleName.toUpperCase().trim();
    if (name.includes(ROLES.SUPER_ADMIN)) return 1;
    if (name.includes(ROLES.ADMIN)) return 2;
    return 3;
  };

  const filteredRoles = roleList
    .filter((r) => !searchName || (r?.roleName || "").toLowerCase().includes(searchName.toLowerCase()))
    .sort((a, b) => {
      const prioA = getRolePriority(a?.roleName || "");
      const prioB = getRolePriority(b?.roleName || "");
      if (prioA !== prioB) return prioA - prioB;
      return (a?.roleName || "").localeCompare(b?.roleName || "");
    });

  return (
    <>
      <Filter
        name={"Roles"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      {/* Point 1: Remove overflowY and maxHeight to fix double scrollbar */}
      <div className="middle_container" style={{
        paddingBottom: "120px",
        backgroundColor: isDark ? "#0f172a" : "#f8fafc",
        minHeight: "calc(100vh - 70px)"
      }}>
        <div className="px-3 md:px-4" style={{ maxWidth: "1400px", margin: "0 auto", paddingBottom: "100px" }}>
          {/* Point 4: Fixed / Sticky Header Title & Subtitle + Search matching Pages.js */}
          <div className="data_model_btn camapgin_btn sticky top-0" style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 24px",
            gap: "12px",
            borderBottom: isDark ? "1px solid #1e293b" : "1px solid rgba(148, 163, 184, 0.15)",
            backgroundColor: isDark ? "#0f172a" : "#f8fafc",
            zIndex: 20,
            margin: "-16px -16px 24px -16px",
            borderRadius: "10px"
          }}>
            <div className="flex items-center">
              <div>
                <h4 className="font-bold mb-1" style={{ color: isDark ? "#f8fafc" : "#0f172a", fontSize: "20px" }}>
                  {t("Roles & Permissions")}
                </h4>
                <p className="mb-0" style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "13.5px" }}>
                  {t("Define and manage access levels for your organization's console.")}
                </p>
              </div>
            </div>

            <div className={`flex ${isMobile ? "flex-col w-full" : "flex-row items-center"} gap-2`}>
              <div id="roles-search" className="search_option m-0" style={{
                display: "flex",
                alignItems: "center",
                position: "relative",
                width: isMobile ? "100%" : "auto",
                minWidth: isMobile ? "100%" : "280px",
                flexGrow: 1,
                backgroundColor: isDark ? "#1e293b" : "#fff",
                border: isDark ? "1px solid #334155" : "1px solid #cbd5e1",
                borderRadius: "8px"
              }}>
                <Input type="text"
                  placeholder={t("Search roles or users...")}
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  style={{
                    width: "100%",
                    height: "40px",
                    backgroundColor: "transparent",
                    color: isDark ? "#f8fafc" : "#1e293b",
                    border: "none",
                    paddingLeft: "36px",
                    paddingRight: searchName ? "30px" : "12px",
                    fontSize: "13px"
                  }}
                />
                {searchName && (
                  <MdOutlineClose
                    onClick={() => setSearchName("")}
                    style={{
                      position: "absolute",
                      right: "10px",
                      cursor: "pointer",
                      color: isDark ? "#94a3b8" : "#64748b",
                      fontSize: "18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: 0.7,
                      transition: "opacity 0.2s"
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = 1}
                    onMouseLeave={(e) => e.target.style.opacity = 0.7}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Cards Grid */}
          <div id="roles-main-table" className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            {filteredRoles.length === 0 ? (
              <div className="w-full lg:col-span-2">
                <div className="text-center py-5" style={{
                  backgroundColor: isDark ? "#162032" : "#ffffff",
                  borderRadius: "12px",
                  border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
                  color: isDark ? "#94a3b8" : "#64748b"
                }}>
                  <i className="fa-solid fa-shield-halved mb-2" style={{ fontSize: "32px", opacity: 0.5 }} />
                  <div>{t("No roles found matching your search.")}</div>
                </div>
              </div>
            ) : (
              filteredRoles.map((role) => {
                const info = getRoleCardInfo(role?.roleName || "");
                return (
                  <div key={role._id}>
                    <div id={`role-card-${(role.roleName || "").toLowerCase().replace(/\s+/g, "-")}`} className="flex flex-col justify-between h-full p-4 shadow-sm" style={{
                      backgroundColor: isDark ? "#1e293b" : "#ffffff",
                      border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
                      borderRadius: "12px",
                      transition: "transform 0.2s, box-shadow 0.2s"
                    }}>
                      <div>
                        {/* Card Top: Icon & Badge */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center justify-center" style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "10px",
                            backgroundColor: info.iconBg,
                            color: info.iconColor,
                            fontSize: "18px"
                          }}>
                            <i className={info.icon} />
                          </div>

                          <span className="badge font-medium" style={{
                            backgroundColor: info.badgeBg,
                            color: info.badgeColor,
                            fontSize: "12px",
                            padding: "6px 12px",
                            borderRadius: "20px"
                          }}>
                            {info.badge}
                          </span>
                        </div>

                        {/* Card Middle: Title & Description */}
                        <h5 className="font-bold mb-2 flex items-center flex-wrap gap-2" style={{ color: isDark ? "#f8fafc" : "#0f172a", fontSize: "18px" }}>
                          {role.roleName}
                          {role?.organizationId?.organizationName && (
                            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500 border border-blue-500/20">
                              {role.organizationId.organizationName}
                            </span>
                          )}
                        </h5>
                        <p className="mb-4" style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "13.5px", lineHeight: "1.6" }}>
                          {info.description}
                        </p>
                      </div>

                      {/* Card Bottom: Divider & Access Footer */}
                      <div>
                        <div className="mb-3" style={{ borderBottom: isDark ? "1px solid #334155" : "1px solid #f1f5f9" }} />
                        <div className="flex items-center justify-between">
                          <span className="font-semibold" style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "12px", letterSpacing: "0.5px" }}>
                            {info.accessText}
                          </span>

                          {PermissionCheck(SYSTEM_PAGES.ROLE, PAGE_ACTIONS.UPDATE) && (
                            <button
                              type="button"
                              id={`role-edit-${(role.roleName || "").toLowerCase().replace(/\s+/g, "-")}`}
                              onClick={() => { setSelectedRole(role); setOpenEditModal(true); }}
                              className="btn btn-link p-0 no-underline font-semibold flex items-center gap-1"
                              style={{ color: "#3b82f6", fontSize: "13.5px" }}
                            >
                              {t("Edit Permissions")} <i className="fa-solid fa-chevron-right" style={{ fontSize: "11px" }} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Banner Card (Role Hierarchy & Security) */}
          <div className="p-4 mb-3" style={{
            backgroundColor: isDark ? "#162032" : "#ffffff",
            border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
            borderRadius: "12px"
          }}>
            <h6 className="font-bold mb-1" style={{ color: isDark ? "#f8fafc" : "#0f172a", fontSize: "15px" }}>
              {t("Role Hierarchy & Security")}
            </h6>
            <p className="mb-0" style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "13.5px" }}>
              {t("Ensure your team has precisely the access they need. Use roles to maintain a secure and efficient operational environment.")}
            </p>
          </div>
        </div>

        <EditRoleModal
          open={openEditModal}
          onClose={() => setOpenEditModal(false)}
          role={selectedRole}
          onSave={saveEditProfile}
        />

        <CustomModal
          show={!!showDeleteModal}
          onHide={() => setShowDeleteModal(null)}
          title={t("Delete Role")}
          subtitle={t("Permanent action")}
          icon="delete"
          variant="danger"
          message={`You are about to <span class="cm-highlight">permanently delete</span> <span class="cm-highlight">${showDeleteModal?.roleName}</span>.`}
          alertText={t("This action cannot be undone. All data associated with this role will be permanently removed.")}
          alertVariant="danger"
          actions={[
            { label: t("Cancel"), onClick: () => setShowDeleteModal(null), cancel: true },
            { label: t("Delete"), onClick: deleteHandler, variant: "danger", icon: "delete" }
          ]}
        />
      </div>
    </>
  );
};

export default Roles;
