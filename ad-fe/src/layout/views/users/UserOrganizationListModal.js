import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { ApiSuperAdminLoginAsUser } from "../../../api-wrapper/ApiUsers";
import Toast from "../../../common/helper/toast/Toast";
import { t } from "i18next";
import UserOrganizationPermissionModal from "./UserOrganizationPermissionModal";

export default function UserOrganizationListModal({
  open,
  onClose,
  user,
  roles = [],
  configList = [],
  onRefreshUsers,
}) {
  const { t } = useTranslation();
  const [selectedOrgForPerm, setSelectedOrgForPerm] = useState(null);
  const [loginLoadingOrgId, setLoginLoadingOrgId] = useState(null);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  const [viewMoreList, setViewMoreList] = useState(null);
  const [viewMoreType, setViewMoreType] = useState(null);
  const [viewMoreOrgName, setViewMoreOrgName] = useState("");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const handleLoginAsUser = async (org) => {
    if (!user?._id || !org?._id) return;
    setLoginLoadingOrgId(org._id);
    try {
      const res = await ApiSuperAdminLoginAsUser({
        userId: user._id,
        organizationId: org._id,
      });
      if (res?.isSuccess && res?.authToken) {
        if (!localStorage.getItem("superAdminToken")) {
          localStorage.setItem("superAdminToken", localStorage.getItem("sellerToken"));
          localStorage.setItem("superAdminRole", localStorage.getItem("role") || "SUPER_ADMIN");
        }
        localStorage.setItem("impersonatedUserName", user.fullName || user.email || "User");
        localStorage.setItem("sellerToken", res.authToken);
        if (res.role) localStorage.setItem("role", res.role);
        if (res.organization?._id) {
          localStorage.setItem("organizationId", res.organization._id);
          localStorage.setItem("organizationName", res.organization.organizationName || "");
          localStorage.removeItem("profile");
          window.dispatchEvent(new Event("organizationChanged"));
        }
        Toast.success(`Logged in as ${user.fullName} (${org.organizationName})`);
        window.location.href = "/";
      } else {
        Toast.error(res?.message || "Failed to log in as user");
      }
    } catch (e) {
      Toast.error(t("Something went wrong while logging in"));
    } finally {
      setLoginLoadingOrgId(null);
    }
  };

  if (!user) return null;

  const organizations = user?.organizations || [];

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
        <DialogContent
          className="sm:max-w-5xl p-0 flex flex-col max-h-[90vh] overflow-hidden border"
          style={{
            backgroundColor: isDark ? "#1e293b" : "#fff",
            borderColor: isDark ? "#334155" : "#e2e8f0",
          }}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="modal-header border-b p-4 pb-3" style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}>
            <DialogTitle className="modal-title font-bold text-base flex items-center gap-2" style={{ color: isDark ? "#f8fafc" : "#0f172a" }}>
              <span>{t("Organizations & Access: ")}</span>
              <span className="text-primary">{user?.fullName}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold dark:bg-blue-900/40 dark:text-blue-300">
                {organizations.length} {organizations.length === 1 ? t("Organization") : t("Organizations")}
              </span>
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-1">
              {t("View or edit roles, company access, and profile permissions for each organization, or log in as this user.")}
            </p>
          </DialogHeader>

          <div className="modal-body overflow-y-auto p-4 flex-1">
            {organizations.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                {t("This user is not assigned to any organizations.")}
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg" style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr
                      className="border-b font-bold uppercase tracking-wider text-slate-500"
                      style={{
                        backgroundColor: isDark ? "#0f172a" : "#f8fafc",
                        borderColor: isDark ? "#334155" : "#e2e8f0",
                      }}
                    >
                      <th className="p-3 whitespace-nowrap">{t("Organization")}</th>
                      <th className="p-3 whitespace-nowrap">{t("Role")}</th>
                      <th className="p-3">{t("Company Access")}</th>
                      <th className="p-3">{t("Profile Access")}</th>
                      <th className="p-3 text-right whitespace-nowrap">{t("Actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ divideColor: isDark ? "#334155" : "#e2e8f0" }}>
                    {organizations.map((org, idx) => (
                      <tr key={org._id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3 font-semibold whitespace-nowrap" style={{ color: isDark ? "#f8fafc" : "#0f172a" }}>
                          <div className="flex items-center gap-2">
                            <span>{org.organizationName}</span>
                            {org.isOwner && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px] font-bold">
                                {t("Owner")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-medium whitespace-nowrap inline-block">
                            {org.roleName || "USER"}
                          </span>
                        </td>
                        <td className="p-3 max-w-[180px]">
                          <div className="flex flex-wrap gap-1">
                            {(org.companyAccessList || []).length === 0 ? (
                              <span className="text-slate-400 italic">{t("None")}</span>
                            ) : (
                              <>
                                {(org.companyAccessList || []).slice(0, 3).map((c, i) => (
                                  <span
                                    key={i}
                                    className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px]"
                                  >
                                    {c.companyName}
                                  </span>
                                ))}
                                {(org.companyAccessList || []).length > 3 && (
                                  <button
                                    onClick={() => {
                                      setViewMoreList(org.companyAccessList);
                                      setViewMoreType("company");
                                      setViewMoreOrgName(org.organizationName);
                                    }}
                                    className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-700 text-[11px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors font-medium"
                                  >
                                    +{(org.companyAccessList || []).length - 3} {t("more Show")}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="p-3 max-w-[200px]">
                          <div className="flex flex-wrap gap-1">
                            {(org.profileAccessList || []).length === 0 ? (
                              <span className="text-slate-400 italic">{t("None")}</span>
                            ) : (
                              <>
                                {(org.profileAccessList || []).slice(0, 3).map((p, i) => (
                                  <span
                                    key={i}
                                    className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px]"
                                  >
                                    {p.countryCode ? `${p.countryCode} - ` : ""}
                                    {p.name}
                                  </span>
                                ))}
                                {(org.profileAccessList || []).length > 3 && (
                                  <button
                                    onClick={() => {
                                      setViewMoreList(org.profileAccessList);
                                      setViewMoreType("profile");
                                      setViewMoreOrgName(org.organizationName);
                                    }}
                                    className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-700 text-[11px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors font-medium"
                                  >
                                    +{(org.profileAccessList || []).length - 3} {t("more Show")}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {org.isOwner || org.roleName === "Organization Owner" || org.roleName === "SUPER_ADMIN" || org.roleName === "ADMIN" || org.role === "Organization Owner" || user._id === org.userId ? (
                              <span className="px-2.5 py-1 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-semibold text-[11px] italic">
                                {t("Owner (Full Access)")}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setSelectedOrgForPerm(org)}
                                title={t("Permission Edit")}
                                className="px-2.5 py-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 font-semibold transition-colors flex items-center gap-1.5"
                              >
                                <i className="fa fa-edit"></i>
                                <span>{t("Permission Edit")}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleLoginAsUser(org)}
                              title={t("Login as this User")}
                              className="px-2.5 py-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                              disabled={loginLoadingOrgId === org._id}
                            >
                              <i className="fa fa-sign-in"></i>
                              <span>{loginLoadingOrgId === org._id ? t("Logging...") : t("Login As User")}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="p-3 px-4 flex justify-end shrink-0 border-t" style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}>
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              style={{
                borderColor: isDark ? "#475569" : "#cbd5e1",
                color: isDark ? "#cbd5e1" : "#475569",
                backgroundColor: "transparent",
              }}
              className="h-9 px-4 rounded-md text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {t("Close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {Boolean(selectedOrgForPerm) && (
        <UserOrganizationPermissionModal
          open={Boolean(selectedOrgForPerm)}
          onClose={() => setSelectedOrgForPerm(null)}
          user={user}
          organization={selectedOrgForPerm}
          roles={roles}
          configList={configList}
          onUpdated={() => {
            if (onRefreshUsers) onRefreshUsers();
            onClose();
          }}
        />
      )}

      {/* View More Modal */}
      <Dialog open={Boolean(viewMoreList)} onOpenChange={(isOpen) => { if (!isOpen) setViewMoreList(null); }}>
        <DialogContent
          className="sm:max-w-[700px] p-0 flex flex-col max-h-[85vh] overflow-hidden border"
          style={{
            backgroundColor: isDark ? "#1e293b" : "#fff",
            borderColor: isDark ? "#334155" : "#e2e8f0",
          }}
        >
          <DialogHeader className="modal-header border-b p-4 pb-3" style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}>
            <DialogTitle className="modal-title font-bold text-base flex items-center gap-2" style={{ color: isDark ? "#f8fafc" : "#0f172a" }}>
              <span>{viewMoreType === 'company' ? t("Company Access") : t("Profile Access")}:</span>
              <span className="text-primary">{viewMoreOrgName}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold dark:bg-slate-800 dark:text-slate-300">
                {viewMoreList?.length || 0} {t("Total")}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="modal-body overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-900/50">
            {viewMoreList?.map((item, idx) => (
              <div 
                key={idx} 
                className="p-3 border rounded-lg flex items-center gap-3 bg-white dark:bg-slate-800 shadow-sm transition-all hover:shadow-md hover:border-primary/50"
                style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}
              >
                <div className="w-8 h-8 shrink-0 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1 flex flex-col">
                  {viewMoreType === 'profile' && item.countryCode && (
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.countryCode}</span>
                  )}
                  <span className="font-semibold text-sm text-slate-700 dark:text-slate-200 truncate" style={{ color: isDark ? "#f8fafc" : "#1e293b" }}>
                    {viewMoreType === 'company' ? item.companyName : item.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
          
          <div className="p-3 px-4 flex justify-end shrink-0 border-t bg-white dark:bg-slate-800" style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}>
            <Button
              variant="outline"
              type="button"
              onClick={() => setViewMoreList(null)}
              style={{
                borderColor: isDark ? "#475569" : "#cbd5e1",
                color: isDark ? "#cbd5e1" : "#475569",
                backgroundColor: "transparent",
              }}
              className="h-9 px-4 rounded-md text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {t("Close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
