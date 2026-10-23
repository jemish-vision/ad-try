import { useTranslation } from "react-i18next";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { t } from "i18next";
import { Formik } from "formik";
import * as Yup from "yup";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Combobox } from "../../../components/ui/combobox";
import { MultiSelect } from "../../../components/ui/popover-multi-select";
import { ApiGetAllRoles } from "../../../api-wrapper/ApiRoles";
import Toast from "../../../common/helper/toast/Toast";
import { ApiInviteUser } from "../../../api-wrapper/ApiUsers";
import { ROLES } from "../../../common/constants";

export default function InviteUserModal({
  open,
  onClose,
  onSuccess,
  configList,
}) {
  const { t } = useTranslation();
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const role = localStorage.getItem("role");
  const navigate = useNavigate();
  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const getAllProfiles = () => {
    const map = new Map();
    configList?.forEach((config) => {
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

  const ApiListing = async () => {
    await ApiGetAllRoles()
      .then((res) => {
        if (res.isSuccess && res.data) {
          let parsedRoles = [];
          if (role === ROLES.SUPER_ADMIN) {
            parsedRoles = res?.data
              ?.filter((r) => ![ROLES.SUPER_ADMIN].includes(r?.roleName))
              ?.map((r) => ({ label: r?.roleName, value: r?._id }));
          } else if (role === ROLES.ADMIN) {
            parsedRoles = res?.data
              ?.filter((r) => ![ROLES.SUPER_ADMIN, ROLES.ADMIN].includes(r?.roleName))
              ?.map((r) => ({ label: r?.roleName, value: r?._id }));
          } else {
            parsedRoles = res?.data?.map((r) => ({ label: r?.roleName, value: r?._id }));
          }
          if (!parsedRoles || parsedRoles.length === 0) {
            parsedRoles = [{ label: "+ Add a Role", value: "ADD_ROLE" }];
          }
          setRoles(parsedRoles);
        } else {
          Toast.error(res.message);
        }
      })
      .catch(() => Toast.error(t("Something went wrong")));
  };

  useEffect(() => {
    if (open) {
      ApiListing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const validationSchema = Yup.object().shape({
    email: Yup.string().trim().email(t("Invalid email")).required(t("Email is required")),
    roleId: Yup.string().required(t("Role is required")),
  });

  const initialValues = {
    email: "",
    roleId: null,
    profileAccess: [],
  };

  const handleInviteSubmit = async (values) => {
    setLoading(true);
    try {
      const organizationId = localStorage.getItem("organizationId");
      const payload = {
        email: values.email,
        roleId: values.roleId,
        organizationId,
        profileAccess: values.profileAccess.map((profile) => ({
          configId: profile.split(" || ")[0],
          profileId: profile.split(" || ")[1],
        })),
      };

      const res = await ApiInviteUser(payload);
      if (res?.isSuccess) {
        Toast.success(res.message || "Invitation sent successfully");
        if (onSuccess) onSuccess();
        onClose();
      } else {
        Toast.error(res?.message || "Failed to send invitation");
      }
    } catch (error) {
      Toast.error(t("Something went wrong"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden rounded-xl border shadow-2xl transition-all"
        style={{
          backgroundColor: isDark ? "#1e293b" : "#ffffff",
          borderColor: isDark ? "#334155" : "#e2e8f0",
          color: isDark ? "#f8fafc" : "#0f172a",
        }}
      >
        <DialogHeader
          className="px-6 py-4 border-b shrink-0 flex flex-row items-center justify-between"
          style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
            <DialogTitle className="text-base font-bold tracking-wide">
              {t("Invite New User")}
            </DialogTitle>
          </div>
        </DialogHeader>

        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleInviteSubmit}
        >
          {({ values, errors, touched, handleChange, handleSubmit, setFieldValue }) => (
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col">
              <div className="p-6 space-y-5">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">
                    {t("User Email")} *
                  </label>
                  <Input
                    id="invite-email-field"
                    name="email"
                    type="email"
                    placeholder={t("user@example.com")}
                    value={values.email}
                    onChange={handleChange}
                    className={`shadcn-input ${touched.email && errors.email ? "border-red-500" : ""}`}
                  />
                  {touched.email && errors.email && (
                    <div className="text-red-500 text-xs mt-1 font-medium">{errors.email}</div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">
                    {t("Role")} *
                  </label>
                  <div id="invite-role-field">
                    <Combobox
                      className="w-full bg-transparent"
                      placeholder={t("Select Role")}
                    value={values.roleId}
                    onChange={(value) => {
                      if (value === "ADD_ROLE") {
                        navigate("/role");
                        onClose();
                      } else {
                        setFieldValue("roleId", value);
                      }
                    }}
                      options={roles}
                    />
                  </div>
                  {touched.roleId && errors.roleId && (
                    <div className="text-red-500 text-xs mt-1 font-medium">{errors.roleId}</div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">
                    {t("Profile Access")}
                  </label>
                  <div id="invite-profile-field">
                    <MultiSelect
                      options={getAllProfiles()}
                      value={values.profileAccess}
                    className="w-full bg-transparent"
                    placeholder={t("Select Profile Access")}
                      onChange={(value) => setFieldValue("profileAccess", value)}
                    />
                  </div>
                  {touched.profileAccess && errors.profileAccess && (
                    <div className="text-red-500 text-xs mt-1 font-medium">{errors.profileAccess}</div>
                  )}
                </div>
              </div>

              <div
                className="p-6 flex justify-end gap-3 shrink-0 border-t"
                style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}
              >
                <Button
                  id="invite-cancel-btn"
                  variant="outline"
                  type="button"
                  disabled={loading}
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
                  id="invite-submit-btn"
                  type="submit"
                  disabled={loading}
                  className="h-9 px-4 rounded-md font-semibold text-white transition-all hover:opacity-90 flex items-center gap-2"
                  style={{
                    background: "linear-gradient(135deg, #2374F2, #1A9FD4)",
                    fontSize: "12px",
                  }}
                >
                  {loading && <i className="fa fa-spinner fa-spin mr-1.5" />}
                  {loading ? t("Sending...") : t("Send Invitation")}
                </Button>
              </div>
            </form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  );
}
