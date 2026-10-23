import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { useEffect, useState } from "react";
import { Formik } from "formik";
import * as Yup from "yup";
import { Toast } from "../../../helper/links/Link";
import { ApiAmazonSPAuthConfig, ApiAmazonSPRefreshToken } from "../../../api-wrapper/ApiAdsConfig";
import { FiLink } from "react-icons/fi";
import { useTranslation } from "react-i18next";

const AddSellerAccountModal = ({ show, onHide, rowData, refreshGrid, onSuccessConnect }) => {
    const { t } = useTranslation();
    const [authMode] = useState("refresh"); // oauth | refresh
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const validationSchema = Yup.object({
        clientId: Yup.string().optional(),
        clientSecret: Yup.string().optional(),
    });

    const haveARefreshToken = async (values) => {
        try {
            const res = await ApiAmazonSPRefreshToken(values);
            if (res?.isSuccess) {
                Toast.success(res?.message ?? t("Refresh token saved successfully"));
                refreshGrid();
                onHide();
                if (onSuccessConnect) onSuccessConnect(rowData);
            } else {
                Toast.error(res?.message || t("Failed to save refresh token"));
            }
        } catch (err) {
            Toast.error(t("Something went wrong"));
        }
    }



    return (
        <Dialog open={show} onOpenChange={(isOpen) => { if (!isOpen) onHide(); }}>
            <DialogContent
                className="max-w-[540px] w-[95vw] p-8 rounded-[24px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/90 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[90vh] [&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-white/10 [&>button]:bg-slate-50 dark:[&>button]:bg-white/5 [&>button]:text-slate-500 dark:[&>button]:text-white/70 hover:[&>button]:text-slate-900 dark:hover:[&>button]:text-white [&>button]:rounded-full [&>button]:p-1.5 [&>button]:transition-all"
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                {/* Circuit top glow line indicator */}
                <div
                    className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                    style={{
                        background: "linear-gradient(90deg, transparent 0%, #2374F2 25%, #3ECFA8 60%, #7c64ff 80%, transparent 100%)",
                        opacity: 0.8
                    }}
                />

                <DialogHeader className="p-0 shrink-0 mb-6 text-left">
                    <DialogTitle className="w-full flex items-center gap-3">
                        <span className="bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 p-2.5 rounded-xl flex items-center justify-center flex-shrink-0">
                            <FiLink size={18} />
                        </span>
                        <div className="flex flex-col text-left">
                            <div className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                                {t("Link your account")}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-white/50 font-medium mt-0.5">
                                {t("Connect your Amazon Seller Partner (SP) account using Login with Amazon (LWA)")}
                            </div>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <Formik
                    initialValues={{
                        sellerId: rowData?.sellerConfig?.sellerId || "",
                        clientId: rowData?.sellerConfig?.spClientId || "",
                        clientSecret: rowData?.sellerConfig?.spClientSecret || "",
                        refreshToken: rowData?.sellerConfig?.spRefreshToken || "",
                    }}
                    validationSchema={validationSchema}
                    onSubmit={async (values, { setSubmitting }) => {
                        try {
                            const payload = {
                                sellerConfigId: rowData?.sellerConfig?._id,
                                profileId: rowData?.profileId,
                                reconnect: !!rowData?.sellerConfig,
                                type: "SP",
                            };

                            if (authMode === "refresh") {
                                await haveARefreshToken({ ...payload, refreshToken: values.refreshToken });
                                return;
                            }

                            const res = await ApiAmazonSPAuthConfig(payload);
                            if (!res?.isSuccess) {
                                Toast.error(res?.message || t("Failed to generate auth URL"));
                                return;
                            }

                            const authUrl = res?.data?.authUrl;
                            if (!authUrl) {
                                Toast.error(t("Invalid auth URL"));
                                return;
                            }

                            onHide();
                            setTimeout(() => { window.open(authUrl, "_blank") }, 200);

                        } catch {
                            Toast.error(t("Something went wrong"));
                        } finally {
                            setSubmitting(false);
                        }
                    }}
                >
                    {({
                        values,
                        errors,
                        touched,
                        handleChange,
                        handleSubmit,
                        isSubmitting,
                    }) => {


                        return (
                            <>
                                {/* Scrollable inputs area */}
                                <div className="flex-1 overflow-y-auto px-1.5 pt-1 pb-2 flex flex-col gap-5">


                                    {authMode === "refresh" && (
                                        <div className="flex flex-col gap-1.5">
                                            <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-300">
                                                {t("Login with Amazon (LWA) Refresh Token")}
                                            </label>
                                            <Input
                                                type="text"
                                                name="refreshToken"
                                                value={values.refreshToken || ""}
                                                onChange={handleChange}
                                                placeholder={t("Enter Amazon Refresh Token")}
                                                className="h-[40px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 dark:bg-white/5 dark:border-white/10 dark:text-white focus:ring-2 focus:ring-[#2374F2] transition-all"
                                            />
                                        </div>
                                    )}


                                </div>

                                {/* Fixed footer placed outside overflow container */}
                                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-white/10 shrink-0">
                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        className="h-[40px] px-6 rounded-xl flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white active:scale-[0.98]"
                                        onClick={onHide}
                                    >
                                        {t("Cancel")}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="auth-btn-primary h-[40px] px-6 flex items-center justify-center gap-1.5 !py-0 !leading-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{
                                            width: "auto",
                                            marginBottom: 0
                                        }}
                                        onClick={handleSubmit}
                                    >
                                        {isSubmitting && <i className="fa fa-spinner fa-spin mr-1.5" />}
                                        {isSubmitting ? t("Connecting...") : (authMode === "oauth" ? t("Login with Amazon Seller") : t("Connect with LWA Token"))}
                                    </button >
                                </div >
                            </>
                        );
                    }}
                </Formik >
            </DialogContent >
        </Dialog >
    );
};

export default AddSellerAccountModal;
