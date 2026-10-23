import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Combobox } from "../../../components/ui/combobox";
import { MultiSelect } from "../../../components/ui/popover-multi-select";
import { ApiUpdateUser, ApiUpdateUserProfileAccess, ApiSuperAdminLoginAsUser } from "../../../api-wrapper/ApiUsers";
import { ApiGetAllRoles } from "../../../api-wrapper/ApiRoles";
import { ApiConfigList } from "../../../api-wrapper/ApiAdsConfig";
import Toast from "../../../common/helper/toast/Toast";
import { t } from "i18next";

export default function UserOrganizationPermissionModal({
  open,
  onClose,
  user,
  organization,
  roles = [],
  configList = [],
  onUpdated,
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState(organization?.roleId || null);
  const [selectedProfiles, setSelectedProfiles] = useState([]);
  const [localRoles, setLocalRoles] = useState([]);
  const [localConfigs, setLocalConfigs] = useState([]);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (organization) {
      setSelectedRoleId(organization?.roleId || null);
      const initialPA = (organization?.profileAccessList || []).map(
        (p) => `${p?.configId} || ${p?.profileId}`
      );
      setSelectedProfiles(initialPA);

      const orgIdStr = organization?._id?.toString();
      const filteredRoles = (roles || [])
        .filter((r) => r.organizationId && (r.organizationId?._id || r.organizationId).toString() === orgIdStr)
        .map((r) => (r.label ? r : { label: r.roleName, value: r._id }));
      setLocalRoles(filteredRoles);

      const filteredConfigs = (configList || []).filter((config) => {
        const cfgOrgId = config?.organizationId?._id || config?.organizationId || null;
        return cfgOrgId && cfgOrgId.toString() === orgIdStr;
      });
      setLocalConfigs(filteredConfigs);

      const fetchOrgSpecificData = async () => {
        if (!organization?._id) return;
        try {
          const [rolesRes, configsRes] = await Promise.all([
            ApiGetAllRoles({ organizationId: organization._id }),
            ApiConfigList({ organizationId: organization._id }),
          ]);

          if (rolesRes?.isSuccess && Array.isArray(rolesRes.data)) {
            const orgRoles = rolesRes.data
              .filter((r) => r.organizationId && (r.organizationId?._id || r.organizationId).toString() === orgIdStr)
              .map((r) => ({ label: r.roleName, value: r._id }));
            setLocalRoles(orgRoles);
          }

          if (configsRes?.isSuccess && Array.isArray(configsRes.data)) {
            const orgConfigs = configsRes.data.filter((config) => {
              const cfgOrgId = config?.organizationId?._id || config?.organizationId || null;
              return cfgOrgId && cfgOrgId.toString() === orgIdStr;
            });
            if (orgConfigs.length > 0) setLocalConfigs(orgConfigs);
          }
        } catch (err) {
          console.error("Error fetching org specific permissions:", err);
        }
      };
      fetchOrgSpecificData();
    }
  }, [organization, roles, configList]);

  const getAvailableProfiles = () => {
    const map = new Map();
    const orgIdStr = organization?._id?.toString();
    const configsToUse = localConfigs.length > 0 ? localConfigs : configList;

    configsToUse?.forEach((config) => {
      const cfgOrgId = config?.organizationId?._id || config?.organizationId || null;
      if (!cfgOrgId || cfgOrgId.toString() !== orgIdStr) {
        return;
      }
      config?.profiles?.forEach((profile) => {
        if (!map.has(profile._id)) {
          map.set(profile._id, {
            value: `${config._id} || ${profile?.profileId}`,
            label: `${config?.companyName} | ${profile?.countryCode} - ${profile.name}`,
            configId: config._id,
            companyName: config.companyName,
            countryCode: profile?.countryCode,
            profileName: profile?.name,
            profileId: profile?.profileId,
          });
        }
      });
    });
    return Array.from(map.values());
  };

  const handleSave = async () => {
    if (!user?._id || !organization?._id) return;
    setLoading(true);
    try {
      const userRes = await ApiUpdateUser({
        userId: user._id,
        roleId: selectedRoleId,
        organizationId: organization._id,
      });

      const profileData = {
        userId: user._id,
        organizationId: organization._id,
        profileAccess: selectedProfiles.map((p) => ({
          configId: p.split(" || ")[0],
          profileId: p.split(" || ")[1],
        })),
      };
      const profileRes = await ApiUpdateUserProfileAccess(profileData);

      if (userRes?.isSuccess || profileRes?.isSuccess) {
        Toast.success(t("Roles & Permissions updated successfully for this organization."));
        if (onUpdated) onUpdated();
        onClose();
      } else {
        Toast.error(userRes?.message || profileRes?.message || t("Failed to update permissions"));
      }
    } catch (e) {
      Toast.error(t("Something went wrong"));
    } finally {
      setLoading(false);
    }
  };

  const handleLoginAsUser = async () => {
    if (!user?._id || !organization?._id) return;
    setLoginLoading(true);
    try {
      const res = await ApiSuperAdminLoginAsUser({
        userId: user._id,
        organizationId: organization._id,
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
        Toast.success(`Logged in as ${user.fullName} (${organization.organizationName})`);
        window.location.href = "/";
      } else {
        Toast.error(res?.message || "Failed to log in as user");
      }
    } catch (e) {
      Toast.error(t("Something went wrong while logging in"));
    } finally {
      setLoginLoading(false);
    }
  };

  if (!organization || !user) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent
        className="sm:max-w-[600px] p-0 flex flex-col max-h-[90vh] overflow-hidden border"
        style={{
          backgroundColor: isDark ? "#1e293b" : "#fff",
          borderColor: isDark ? "#334155" : "#e2e8f0",
        }}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="modal-header border-b p-6 pb-4" style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}>
          <DialogTitle className="modal-title font-bold text-lg" style={{ color: isDark ? "#f8fafc" : "#0f172a" }}>
            {t("Permissions: ")} <span className="text-primary">{organization?.organizationName}</span>
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            {t("Managing roles & profile access for")} <span className="font-semibold">{user?.fullName}</span> ({user?.email})
          </p>
        </DialogHeader>

        <div className="modal-body overflow-y-auto p-6 flex-1 space-y-6">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">
              {t("Role in this Organization")}
            </label>
            <Combobox
              className="w-full bg-transparent"
              placeholder={t("Select Role")}
              value={selectedRoleId}
              onChange={(value) => setSelectedRoleId(value)}
              options={localRoles}
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">
              {t("Profile Access in this Organization")}
            </label>
            <MultiSelect
              options={getAvailableProfiles()}
              value={selectedProfiles}
              className="w-full bg-transparent"
              placeholder={t("Select Profile Access")}
              onChange={(value) => setSelectedProfiles(value)}
            />
          </div>
        </div>

        <div className="p-6 flex items-center justify-between shrink-0 border-t" style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}>
          <button
            type="button"
            disabled={loginLoading || loading}
            onClick={handleLoginAsUser}
            className="h-9 px-4 rounded-md font-semibold bg-blue-50 text-blue-600 border border-blue-600 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-700 dark:bg-blue-900/30 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-all flex items-center gap-2 text-xs shadow-sm disabled:opacity-50"
          >
            {loginLoading ? <i className="fa fa-spinner fa-spin mr-1" /> : <i className="fa fa-sign-in mr-1" />}
            {loginLoading ? t("Logging in...") : t("Login As User")}
          </button>

          <div className="flex gap-3">
            <Button
              variant="outline"
              type="button"
              disabled={loading || loginLoading}
              onClick={onClose}
              style={{
                borderColor: isDark ? "#475569" : "#cbd5e1",
                color: isDark ? "#cbd5e1" : "#475569",
                backgroundColor: "transparent",
              }}
              className="h-9 px-4 rounded-md text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              disabled={loading || loginLoading}
              onClick={handleSave}
              className="h-9 px-4 rounded-md font-semibold text-white transition-all hover:opacity-90 flex items-center gap-2 text-xs disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #2374F2, #1A9FD4)",
              }}
            >
              {loading && <i className="fa fa-spinner fa-spin mr-1.5" />}
              {loading ? t("Saving...") : t("Save Permissions")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
