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

import { Combobox } from "../../../components/ui/combobox";
import { MultiSelect } from "../../../components/ui/popover-multi-select";

import { ApiGetAllRoles } from "../../../api-wrapper/ApiRoles";
import Toast from "../../../common/helper/toast/Toast";
import { ApiCreateUser, ApiUpdateUser, ApiUpdateUserProfileAccess } from "../../../api-wrapper/ApiUsers";
import { ROLES } from "src/common/constants";

export default function UserModal({
    open,
    onClose,
    user,
    configList,
}) {
  const { t } = useTranslation();
    const isEdit = Boolean(user?._id);

    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);


    const [activeTab, setActiveTab] = useState(0);
    const [roles, setRoles] = useState([]);
    const [createdUserId, setCreatedUserId] = useState(user?._id || null);
    const [loading, setLoading] = useState(false);
    const role = localStorage.getItem("role");
    const isSuperAdmin = role === ROLES.SUPER_ADMIN;
    const isSingleTabView = isEdit && !isSuperAdmin;

    /* ---------------------------------- DATA --------------------------------- */

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


    /* --------------------------------- SCHEMA -------------------------------- */

    const validationSchema = Yup.object().shape({
        fullName: Yup.string().trim().required(t("Full name is required")),
        email: Yup.string().trim().email(t("Invalid email")).required(t("Email is required")),
        password: isEdit ? Yup.string() : Yup.string().trim().matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, t("Password must contain at least 1 letter and 1 number")).required(t("Password is required")),
        phoneNumber: Yup.string().trim().matches(/^[0-9]{7,15}$/, t("Invalid phone number")).required(t("Phone number is required")),
        companyName: Yup.string().trim().required(t("Company name is required")),
        roleId: isSuperAdmin ? Yup.string().nullable() : Yup.string().required(t("Role is required")),
    });


    const profileSchema = Yup.object({
        profileAccess: Yup.array(),
    });

    /* --------------------------------- VALUES -------------------------------- */

    const initialValues = {
        fullName: user?.fullName || "",
        email: user?.email || "",
        password: "",
        phoneNumber: user?.phoneNumber || "",
        companyName: user?.companyName || "",
        roleId: user?.roleId ?? null,
    };

    const profileInitialValues = {
        profileAccess: user?.profileAccess?.map((profile) => `${profile?.configId} || ${profile?.profileId}`) || [],
    };

    /* ---------------------------------- APIs --------------------------------- */

    const ApiListing = async () => {
        await ApiGetAllRoles()
            .then((res) => {
                if (res.isSuccess && res.data) {
                    if (role === ROLES.SUPER_ADMIN) {
                        setRoles(res?.data?.filter(role => ![ROLES.SUPER_ADMIN].includes(role?.roleName))?.map((role) => ({ label: role?.roleName, value: role?._id })))
                    } else if (role === ROLES.ADMIN) {
                        setRoles(res?.data?.filter(role => ![ROLES.SUPER_ADMIN, ROLES.ADMIN].includes(role?.roleName))?.map((role) => ({ label: role?.roleName, value: role?._id })))
                    } else {
                        setRoles(res?.data?.map((role) => ({ label: role?.roleName, value: role?._id })))
                    }
                }
                else Toast.error(res.message);
            })
            .catch(() => Toast.error(t("Something went wrong")));
    };

    useEffect(() => {
        ApiListing();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setActiveTab(0);
        setCreatedUserId(user?._id || null);
    }, [user]);

    /* -------------------------- TAB 1 : USER SAVE ----------------------------- */

    const handleUserSubmit = async (values) => {
        setLoading(true);

        try {
            let res;

            if (isEdit || createdUserId) {
                res = await ApiUpdateUser({ ...values, userId: createdUserId || user._id });
            } else {
                res = await ApiCreateUser(values);
            }

            if (res?.isSuccess) {
                Toast.success(res.message);

                if (isSuperAdmin) {
                    onClose();
                } else {
                    const userId = res?.newUser?._id || user?._id;
                    setCreatedUserId(userId);
                    setActiveTab(1);
                }
            } else {
                Toast.error(res.message);
            }
        } catch {
            Toast.error(t("Something went wrong"));
        } finally {
            setLoading(false);
        }
    };

    /* ----------------------- TAB 2 : PROFILE ACCESS ---------------------------- */

    const handleProfileSubmit = async (values) => {
        setLoading(true);

        try {
            const data = {
                userId: createdUserId,
                profileAccess: values?.profileAccess?.map(profile => ({ configId: profile.split(' || ')[0], profileId: profile.split(' || ')[1] }))
            }
            const res = await ApiUpdateUserProfileAccess(data);

            if (res?.isSuccess) {
                Toast.success(res.message);
                onClose();
            } else Toast.error(res.message);
        } catch {
            Toast.error(t("Something went wrong"));
        } finally {
            setLoading(false);
        }
    };

    /* ---------------------------------- UI ----------------------------------- */

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
            <DialogContent
                className="sm:max-w-[700px] p-0 flex flex-col max-h-[90vh] overflow-hidden border"
                style={{
                    backgroundColor: isDark ? "#1e293b" : "#fff",
                    borderColor: isDark ? "#334155" : "#e2e8f0",
                }}
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader className="modal-header border-b-0 p-6 pb-2">
                    <DialogTitle className="modal-title font-bold text-lg" style={{ color: isDark ? "#f8fafc" : "#0f172a" }}>
                        {isEdit ? t("Edit User") : t("Add User")}
                    </DialogTitle>
                </DialogHeader>

                {!isSingleTabView && !isSuperAdmin && (
                    <div className="px-6 shrink-0">
                        <div className="flex border-b" style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}>
                            <button
                                type="button"
                                onClick={() => setActiveTab(0)}
                                className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all"
                                style={{
                                    borderBottomColor: activeTab === 0 ? "#2374F2" : "transparent",
                                    color: activeTab === 0 ? "#2374F2" : (isDark ? "#94a3b8" : "#64748b"),
                                }}
                            >
                                {t("User Details")}
                            </button>
                            <button
                                type="button"
                                disabled={!createdUserId}
                                onClick={() => setActiveTab(1)}
                                className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{
                                    borderBottomColor: activeTab === 1 ? "#2374F2" : "transparent",
                                    color: activeTab === 1 ? "#2374F2" : (isDark ? "#94a3b8" : "#64748b"),
                                }}
                            >
                                {t("Profile Access")}
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-hidden flex flex-col">
                    {isSingleTabView ? (
                        <Formik
                            initialValues={{
                                roleId: user?.roleId ?? null,
                                profileAccess: user?.profileAccess?.map((profile) => `${profile?.configId} || ${profile?.profileId}`) || [],
                            }}
                            validationSchema={Yup.object().shape({
                                roleId: Yup.string().required(t("Role is required")),
                                profileAccess: Yup.array(),
                            })}
                            enableReinitialize
                            onSubmit={async (values) => {
                                setLoading(true);
                                try {
                                    const userRes = await ApiUpdateUser({ roleId: values.roleId, userId: user._id });
                                    const data = {
                                        userId: user._id,
                                        profileAccess: values?.profileAccess?.map(profile => ({ configId: profile.split(' || ')[0], profileId: profile.split(' || ')[1] }))
                                    };
                                    const profileRes = await ApiUpdateUserProfileAccess(data);

                                    if (userRes?.isSuccess || profileRes?.isSuccess) {
                                        Toast.success(t("Role and Profile Access updated successfully."));
                                        onClose();
                                    } else {
                                        Toast.error(userRes?.message || profileRes?.message || t("Failed to update"));
                                    }
                                } catch {
                                    Toast.error(t("Something went wrong"));
                                } finally {
                                    setLoading(false);
                                }
                            }}
                        >
                            {({ values, handleChange, handleSubmit, errors, touched, setFieldValue }) => (
                                <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col h-full overflow-hidden">
                                    <div className="modal-body overflow-y-auto p-6 flex-1 space-y-5">
                                        <div id="user-role-field">
                                            <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">{t("Role")} *</label>
                                            <Combobox
                                                className="w-full bg-transparent"
                                                placeholder={t("Select Role")}
                                                value={values.roleId}
                                                onChange={(value) => handleChange({ target: { name: "roleId", value } })}
                                                options={roles}
                                            />
                                            {touched.roleId && errors.roleId && (
                                                <div className="text-red-500 text-xs mt-1 font-medium">{errors.roleId}</div>
                                            )}
                                        </div>

                                        <div id="user-profile-access-field">
                                            <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">{t("Profile Access")}</label>
                                            <MultiSelect
                                                options={getAllProfiles()}
                                                value={values.profileAccess}
                                                className="w-full bg-transparent"
                                                placeholder={t("Select Profile Access")}
                                                onChange={(value) => handleChange({ target: { name: "profileAccess", value } })}
                                            />
                                            {touched.profileAccess && errors.profileAccess && (
                                                <div className="text-red-500 text-xs mt-2 font-medium">{errors.profileAccess}</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-6 flex justify-end gap-3 shrink-0 border-t" style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}>
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
                                            {t("Cancel")}
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={loading}
                                            className="h-9 px-4 rounded-md font-semibold text-white transition-all hover:opacity-90 flex items-center gap-2"
                                            style={{
                                                background: "linear-gradient(135deg, #2374F2, #1A9FD4)",
                                                fontSize: "12px",
                                            }}
                                        >
                                            {t("Update")}
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </Formik>
                    ) : isSuperAdmin ? (
                        <Formik
                            initialValues={initialValues}
                            validationSchema={validationSchema}
                            enableReinitialize
                            onSubmit={handleUserSubmit}
                        >
                            {({ values, errors, touched, handleChange, handleSubmit }) => (
                                <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col h-full overflow-hidden">
                                    <div className="modal-body overflow-y-auto p-6 flex-1">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div id="user-company-field">
                                                <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">{t("Company Name")} *</label>
                                                <Input
                                                    name="companyName"
                                                    value={values.companyName}
                                                    onChange={handleChange}
                                                    className={`shadcn-input ${touched.companyName && !!errors.companyName ? "border-red-500" : ""}`}
                                                />
                                                {touched.companyName && !!errors.companyName && (
                                                    <div className="text-red-500 text-xs mt-1 font-medium">{errors.companyName}</div>
                                                )}
                                            </div>

                                            <div id="user-fullname-field">
                                                <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">{t("Full Name")} *</label>
                                                <Input
                                                    name="fullName"
                                                    value={values.fullName}
                                                    onChange={handleChange}
                                                    className={`shadcn-input ${touched.fullName && !!errors.fullName ? "border-red-500" : ""}`}
                                                />
                                                {touched.fullName && !!errors.fullName && (
                                                    <div className="text-red-500 text-xs mt-1 font-medium">{errors.fullName}</div>
                                                )}
                                            </div>

                                            <div id="user-email-field">
                                                <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">{t("Email")}</label>
                                                <Input
                                                    id="user-email-input"
                                                    name="email"
                                                    type="text"
                                                    value={values.email}
                                                    disabled={true}
                                                    className="shadcn-input opacity-70 cursor-not-allowed bg-slate-100 dark:bg-slate-800"
                                                />
                                            </div>

                                            <div id="user-phone-field">
                                                <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">{t("Phone Number")} *</label>
                                                <Input
                                                    name="phoneNumber"
                                                    value={values.phoneNumber}
                                                    onChange={handleChange}
                                                    className={`shadcn-input ${touched.phoneNumber && !!errors.phoneNumber ? "border-red-500" : ""}`}
                                                />
                                                {touched.phoneNumber && !!errors.phoneNumber && (
                                                    <div className="text-red-500 text-xs mt-1 font-medium">{errors.phoneNumber}</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-6 flex justify-end gap-3 shrink-0 border-t" style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}>
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
                                            {t("Cancel")}
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={loading}
                                            className="h-9 px-4 rounded-md font-semibold text-white transition-all hover:opacity-90 flex items-center gap-2"
                                            style={{
                                                background: "linear-gradient(135deg, #2374F2, #1A9FD4)",
                                                fontSize: "12px",
                                            }}
                                        >
                                            {isEdit ? t("Update") : t("Create")}
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </Formik>
                    ) : (
                        <>
                            {/* --------------------------- USER DETAILS --------------------------- */}
                            {activeTab === 0 && (
                                <Formik
                                    initialValues={initialValues}
                                    validationSchema={validationSchema}
                                    enableReinitialize
                                    onSubmit={handleUserSubmit}
                                >
                                    {({ values, errors, touched, handleChange, handleSubmit, setFieldValue }) => (
                                        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col h-full overflow-hidden">
                                            <div className="modal-body overflow-y-auto p-6 flex-1">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                    <div id="user-company-field">
                                                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">{t("Company Name")} *</label>
                                                        <Input
                                                            name="companyName"
                                                            value={values.companyName}
                                                            onChange={handleChange}
                                                            className={`shadcn-input ${touched.companyName && !!errors.companyName ? "border-red-500" : ""}`}
                                                        />
                                                        {touched.companyName && !!errors.companyName && (
                                                            <div className="text-red-500 text-xs mt-1 font-medium">{errors.companyName}</div>
                                                        )}
                                                    </div>

                                                    <div id="user-fullname-field">
                                                        <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">{t("Full Name")} *</label>
                                                        <Input
                                                            name="fullName"
                                                            value={values.fullName}
                                                            onChange={handleChange}
                                                            className={`shadcn-input ${touched.fullName && !!errors.fullName ? "border-red-500" : ""}`}
                                                        />
                                                        {touched.fullName && !!errors.fullName && (
                                                            <div className="text-red-500 text-xs mt-1 font-medium">{errors.fullName}</div>
                                                        )}
                                                    </div>

                                                    <div id="user-email-field">
                                                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">{t("Email")} *</label>
                                                        <Input
                                                            id="user-email-input"
                                                            name="email"
                                                            type="text"
                                                            autoComplete="off"
                                                            value={values.email}
                                                            onChange={handleChange}
                                                            className={`shadcn-input ${touched.email && !!errors.email ? "border-red-500" : ""}`}
                                                            disabled={isEdit}
                                                        />
                                                        {touched.email && !!errors.email && (
                                                            <div className="text-red-500 text-xs mt-1 font-medium">{errors.email}</div>
                                                        )}
                                                    </div>

                                                    {!isEdit && (
                                                        <div id="user-password-field">
                                                            <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">{t("Password")} *</label>
                                                            <Input
                                                                name="password"
                                                                type="password"
                                                                value={values.password}
                                                                onChange={handleChange}
                                                                className={`shadcn-input ${touched.password && !!errors.password ? "border-red-500" : ""}`}
                                                            />
                                                            {touched.password && !!errors.password && (
                                                                <div className="text-red-500 text-xs mt-1 font-medium">{errors.password}</div>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div id="user-phone-field">
                                                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">{t("Phone Number")} *</label>
                                                        <Input
                                                            name="phoneNumber"
                                                            value={values.phoneNumber}
                                                            onChange={handleChange}
                                                            className={`shadcn-input ${touched.phoneNumber && !!errors.phoneNumber ? "border-red-500" : ""}`}
                                                        />
                                                        {touched.phoneNumber && !!errors.phoneNumber && (
                                                            <div className="text-red-500 text-xs mt-1 font-medium">{errors.phoneNumber}</div>
                                                        )}
                                                    </div>

                                                    <div id="user-role-field">
                                                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block">{t("Role")}</label>
                                                        <Combobox
                                                            className="w-full bg-transparent"
                                                            placeholder={t("Select Role")}
                                                            value={values.roleId}
                                                            onChange={(value) => handleChange({ target: { name: "roleId", value } })}
                                                            options={roles}
                                                        />

                                                        {touched.roleId && errors.roleId && (
                                                            <div className="text-red-500 text-xs mt-1 font-medium">
                                                                {errors.roleId}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-6 flex justify-end gap-3 shrink-0 border-t" style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}>
                                                <Button
                                                    id="users-cancel-btn"
                                                    variant="outline"
                                                    type="button"
                                                    onClick={onClose}
                                                    disabled={loading}
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
                                                    id="users-create-btn"
                                                    type="submit"
                                                    disabled={loading}
                                                    className="h-9 px-4 rounded-md font-semibold text-white transition-all hover:opacity-90 flex items-center gap-2"
                                                    style={{
                                                        background: "linear-gradient(135deg, #2374F2, #1A9FD4)",
                                                        fontSize: "12px",
                                                    }}
                                                >
                                                    {loading && <i className="fa fa-spinner fa-spin mr-1" />}
                                                    {isEdit ? t("Update") : t("Create")}
                                                </Button>
                                            </div>
                                        </form>
                                    )}
                                </Formik>
                            )}

                            {/* ------------------------ PROFILE ACCESS ---------------------------- */}
                            {activeTab === 1 && (
                                <Formik
                                    initialValues={profileInitialValues}
                                    validationSchema={profileSchema}
                                    enableReinitialize
                                    onSubmit={handleProfileSubmit}
                                >
                                    {({ values, handleChange, handleSubmit, errors, touched, setFieldValue }) => (
                                        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col h-full overflow-hidden">
                                            <div className="modal-body overflow-y-auto p-6 flex-1">
                                                <MultiSelect
                                                    options={getAllProfiles()}
                                                    value={values.profileAccess}
                                                    className="w-full bg-transparent"
                                                    placeholder={t("Select Profile Access")}
                                                    onChange={(value) => handleChange({ target: { name: "profileAccess", value } })}
                                                />

                                                {touched.profileAccess && errors.profileAccess && (
                                                    <div className="text-red-500 text-xs mt-2 font-medium">{errors.profileAccess}</div>
                                                )}
                                            </div>

                                            <div className="p-6 flex justify-end gap-3 shrink-0 border-t" style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}>
                                                <Button
                                                    variant="outline"
                                                    type="button"
                                                    onClick={onClose}
                                                    disabled={loading}
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
                                                    type="submit"
                                                    disabled={loading}
                                                    className="h-9 px-4 rounded-md font-semibold text-white transition-all hover:opacity-90 flex items-center gap-2"
                                                    style={{
                                                        background: "linear-gradient(135deg, #2374F2, #1A9FD4)",
                                                        fontSize: "12px",
                                                    }}
                                                >
                                                    {loading && <i className="fa fa-spinner fa-spin mr-1" />}
                                                    {t("Save")}
                                                </Button>
                                            </div>
                                        </form>
                                    )}
                                </Formik>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
