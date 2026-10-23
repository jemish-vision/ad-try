import React from "react";
import { useTranslation } from "react-i18next";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { Button } from "../../../components/ui/button";
import { ApiSuperAdminLoginAsUser } from "../../../api-wrapper/ApiUsers";
import Toast from "../../../common/helper/toast/Toast";
import { handleLoader } from "../../../helper/links/Link";

const OrganizationUsersModal = ({ open, setOpen, organization }) => {
  const { t } = useTranslation();

  if (!organization) return null;
  const usersList = organization.usersList || [];

  const handleLoginAsUser = async (userObj) => {
    if (!organization?._id || !userObj?._id) return;
    handleLoader(true);
    try {
      const res = await ApiSuperAdminLoginAsUser({
        userId: userObj._id,
        organizationId: organization._id,
      });
      if (res?.isSuccess && res?.authToken) {
        if (!localStorage.getItem("superAdminToken")) {
          localStorage.setItem("superAdminToken", localStorage.getItem("sellerToken"));
          localStorage.setItem("superAdminRole", localStorage.getItem("role") || "SUPER_ADMIN");
        }
        localStorage.setItem("impersonatedUserName", userObj.fullName || userObj.email || "User");
        localStorage.setItem("sellerToken", res.authToken);
        if (res.role) localStorage.setItem("role", res.role);
        if (res.organization?._id) {
          localStorage.setItem("organizationId", res.organization._id);
          localStorage.setItem("organizationName", res.organization.organizationName || "");
          localStorage.removeItem("profile");
          window.dispatchEvent(new Event("organizationChanged"));
        }
        Toast.success(`Logged in as ${userObj.fullName} (${organization.organizationName})`);
        window.location.href = "/";
      } else {
        Toast.error(res?.message || "Failed to login as user.");
      }
    } catch (err) {
      Toast.error(t("An error occurred while logging in as this user."));
    } finally {
      handleLoader(false);
    }
  };

  return (
    <CustomModal
      show={open}
      onHide={() => setOpen(false)}
      title={`${t("Users of")} ${organization.organizationName}`}
      size="lg"
    >
      <div className="p-1 space-y-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-800">
          <span>{t("Total Users:")} {usersList.length}</span>
          <span className="text-blue-600 dark:text-blue-400 font-bold">
            <i className="fa fa-info-circle mr-1" />
            {t("Click 'Login as User' to access this organization as that user.")}
          </span>
        </div>

        {usersList.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-xs font-medium">
            {t("No users found assigned to this organization.")}
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
            {usersList.map((u, index) => (
              <div
                key={u._id}
                className="flex flex-wrap items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors gap-3"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                      {u.fullName || "Unnamed User"}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        u.isOwner || u.roleName === "SUPER_ADMIN" || u.roleName === "ADMIN"
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      }`}
                    >
                      {u.isOwner ? "Owner (Admin)" : u.roleName || "User"}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-3">
                    <span>
                      <i className="fa fa-envelope-o mr-1 text-slate-400" />
                      {u.email || "-"}
                    </span>
                    {u.companyName && (
                      <span>
                        <i className="fa fa-building-o mr-1 text-slate-400" />
                        {u.companyName}
                      </span>
                    )}
                    {u.phoneNumber && (
                      <span>
                        <i className="fa fa-phone mr-1 text-slate-400" />
                        {u.phoneNumber}
                      </span>
                    )}
                  </div>
                </div>

                <Button
                  id={index === 0 ? "orgs-users-login-btn" : undefined}
                  type="button"
                  onClick={() => handleLoginAsUser(u)}
                  className="h-8 px-3 rounded-md text-xs font-bold bg-blue-50 text-blue-600 border border-blue-600 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-500 dark:hover:bg-blue-900/50 shadow-sm flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
                >
                  <i className="fa fa-sign-in" />
                  <span>{t("Login as User")}</span>
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2.5 border-t border-slate-200 dark:border-slate-800 mt-3">
          <Button
            id="orgs-users-close"
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            className="h-9 px-4 text-xs font-semibold"
          >
            {t("Close")}
          </Button>
        </div>
      </div>
    </CustomModal>
  );
};

export default OrganizationUsersModal;
