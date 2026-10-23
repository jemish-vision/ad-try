import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "../../../components/ui/form";
import Toast from "../../../common/helper/toast/Toast";
import { ApiAmazonAuthConfig, ApiLinkExistingSellerConfig, ApiGetAmazonProfiles } from "../../../api-wrapper/ApiAdsConfig";
import { ShieldCheck, Sparkles, CheckCircle2, Building2 } from "lucide-react";

const formSchema = z.object({
    companyName: z.string().optional(),
});

const AddAmazonAccountModal = ({ show, onHide, userId, forcedFlow = false, sellerId = null, existingConfigs = [], onSuccess }) => {
    const { t } = useTranslation();
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const activeSellerId = sellerId || localStorage.getItem("appstore_seller_id") || sessionStorage.getItem("appstore_seller_id");

    const hasAvailableConfigs = Array.isArray(existingConfigs) && existingConfigs.length > 0;
    const [hasExistingAdsAccount, setHasExistingAdsAccount] = useState("yes");
    const [selectedConfigId, setSelectedConfigId] = useState("");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            companyName: "",
        },
    });

    useEffect(() => {
        if (show) {
            form.reset({ companyName: "" });
            if (hasAvailableConfigs) {
                setHasExistingAdsAccount("yes");
                setSelectedConfigId(existingConfigs[0]?._id || "");
            } else {
                setHasExistingAdsAccount("no");
                setSelectedConfigId("");
            }
        }
    }, [show, form, hasAvailableConfigs, existingConfigs]);

    const handleLinkExisting = async () => {
        if (!selectedConfigId) {
            Toast.error(t("Please select an existing Ads account"));
            return;
        }

        try {
            setIsSubmitting(true);
            const targetConfig = existingConfigs.find((c) => String(c._id) === String(selectedConfigId));

            // Fetch all profiles from Amazon API for the selected Ads account
            let profiles = Array.isArray(targetConfig?.profiles) ? targetConfig.profiles : [];
            try {
                const profRes = await ApiGetAmazonProfiles({ configId: selectedConfigId });
                if (profRes?.isSuccess && Array.isArray(profRes?.data) && profRes.data.length > 0) {
                    profiles = profRes.data;
                }
            } catch (err) {
                console.error("Error fetching profiles:", err);
            }

            // Check if any profile's advertiserId strictly matches activeSellerId
            const matchingProfile = profiles.find((p) => {
                const advId = p?.advertiserId || p?.accountInfo?.id;
                return Boolean(activeSellerId && advId && String(advId).trim().toLowerCase() === String(activeSellerId).trim().toLowerCase());
            });
            console.log(matchingProfile)
            if (!matchingProfile) {
                Toast.error(t("This Ads account does not have access for this Seller account"));
                setIsSubmitting(false);
                return;
            }

            // Match found! Save configId & profileId link in sellerConfig
            const res = await ApiLinkExistingSellerConfig({
                configId: selectedConfigId,
                profileId: matchingProfile?.profileId
            });

            if (res?.isSuccess) {
                Toast.success(t("Seller account linked to existing Ads account successfully!"));
                localStorage.removeItem("amazon_appstore_flow");
                sessionStorage.removeItem("amazon_appstore_flow");
                if (onSuccess) onSuccess(selectedConfigId);
                if (onHide) onHide();
            } else {
                Toast.error(res?.message || t("Failed to link existing Ads account"));
            }
        } catch (error) {
            Toast.error(t("Something went wrong linking account"));
        } finally {
            setIsSubmitting(false);
        }
    };

    const onSubmit = async (values) => {
        if (hasExistingAdsAccount === "yes") {
            return handleLinkExisting();
        }

        if (!values.companyName || !values.companyName.trim()) {
            form.setError("companyName", { type: "manual", message: t("Company name is required") });
            return;
        }

        try {
            setIsSubmitting(true);
            const res = await ApiAmazonAuthConfig({ companyName: values.companyName.trim(), userId, type: "ADS" });
            if (!res?.isSuccess) {
                Toast.error(res?.message || t("Failed to generate auth URL"));
                return;
            }

            const authUrl = res?.data?.authUrl;
            if (!authUrl) {
                Toast.error(t("Invalid auth URL"));
                return;
            }

            localStorage.removeItem("amazon_appstore_flow");
            sessionStorage.removeItem("amazon_appstore_flow");
            if (onHide) onHide();

            window.location.href = authUrl;
        } catch (error) {
            Toast.error(t("Something went wrong"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={show} onOpenChange={(isOpen) => { if (!isOpen && !forcedFlow) onHide(); }}>
            <DialogContent
                className={`max-w-[500px] w-[95vw] p-8 rounded-[24px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/90 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] dark:text-white flex flex-col max-h-[90vh] ${forcedFlow ? "[&>button]:hidden" : "[&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-white/10 [&>button]:bg-slate-50 dark:[&>button]:bg-white/5 [&>button]:text-slate-500 dark:[&>button]:text-white/70 hover:[&>button]:text-slate-900 dark:hover:[&>button]:text-white [&>button]:rounded-full [&>button]:p-1.5 [&>button]:transition-all"
                    }`}
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

                <DialogHeader className="p-0 shrink-0 mb-5 text-left">
                    <DialogTitle className="w-full flex items-center gap-3">
                        <span className="bg-sky-500/10 border border-sky-500/20 text-[#1A9FD4] dark:text-[#5B9CF6] p-2.5 rounded-xl flex items-center justify-center flex-shrink-0 animate-pulse">
                            <Sparkles size={18} />
                        </span>
                        <div className="flex flex-col text-left">
                            <div className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                                {t("Link Amazon Account")}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-white/50 font-medium mt-0.5">
                                {t("Connect your Amazon Ads Account to enable Seller Account features.")}
                            </div>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                {forcedFlow && (
                    <div className="mb-4 p-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-semibold leading-relaxed flex items-start gap-2.5">
                        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                        <span>{t("You need to connect your Ads account to use the Seller Account.")}</span>
                    </div>
                )}

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full space-y-4">
                        {/* Question: Do you already have a Seller Ads account? (Render if 1 or more connected Ads accounts exist) */}
                        {hasAvailableConfigs && (
                            <div className="flex flex-col gap-2.5">
                                <label className="block text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                                    {t("Do you already have a Seller Ads account connected?")}
                                </label>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <button
                                        type="button"
                                        onClick={() => setHasExistingAdsAccount("yes")}
                                        className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${hasExistingAdsAccount === "yes"
                                                ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400 shadow-sm"
                                                : "border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20"
                                            }`}
                                    >
                                        <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${hasExistingAdsAccount === "yes" ? "text-sky-500" : "text-slate-400"}`} />
                                        <div>
                                            <div className="text-xs font-bold">{t("Yes, use connected Ads account")}</div>
                                            <div className="text-[11px] opacity-75 leading-tight mt-0.5">{t("Select from existing Ads accounts in this organization")}</div>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setHasExistingAdsAccount("no")}
                                        className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${hasExistingAdsAccount === "no"
                                                ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400 shadow-sm"
                                                : "border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20"
                                            }`}
                                    >
                                        <Building2 className={`w-4 h-4 mt-0.5 shrink-0 ${hasExistingAdsAccount === "no" ? "text-sky-500" : "text-slate-400"}`} />
                                        <div>
                                            <div className="text-xs font-bold">{t("No, link a new Ads account")}</div>
                                            <div className="text-[11px] opacity-75 leading-tight mt-0.5">{t("Authorize a new Ads account for this Seller account")}</div>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* CASE 2: Select Existing Connected Ads Account */}
                        {hasExistingAdsAccount === "yes" && hasAvailableConfigs && (
                            <div className="flex flex-col gap-1.5 pt-2">
                                <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-300">
                                    {t("Select Existing Ads Account")}
                                </label>
                                <select
                                    value={selectedConfigId}
                                    onChange={(e) => setSelectedConfigId(e.target.value)}
                                    className="h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 dark:bg-white/5 dark:border-white/10 dark:text-white focus:ring-2 focus:ring-sky-500 focus:outline-none text-xs font-medium"
                                >
                                    {existingConfigs.map((c) => (
                                        <option key={c._id} value={c._id} className="dark:bg-[#0c1222]">
                                            {c.companyName || c.name || t("Ads Account ({{id}})", { id: c._id })}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* CASE 1: Enter Company Name for New Ads Account */}
                        {hasExistingAdsAccount === "no" && (
                            <div className="pt-2">
                                <FormField
                                    control={form.control}
                                    name="companyName"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col gap-1.5">
                                            <FormLabel className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-300">{t("Company Name")}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder={t("e.g. Acme Corporation")}
                                                    className="h-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 dark:bg-white/5 dark:border-white/10 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-0 focus:ring-2 focus:ring-sky-500 focus:outline-none transition-all text-xs"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage className="text-red-500 text-xs font-semibold mt-0.5" />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        )}

                        {/* Fixed Footer */}
                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-white/10 shrink-0">
                            {!forcedFlow && (
                                <Button
                                    variant="outline"
                                    type="button"
                                    disabled={isSubmitting}
                                    className="h-[40px] px-6 rounded-xl flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white active:scale-[0.98]"
                                    onClick={onHide}
                                >
                                    {t("Cancel")}
                                </Button>
                            )}
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="auth-btn-primary h-[40px] px-6 flex items-center justify-center gap-1.5 !py-0 !leading-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] text-white hover:opacity-90 font-bold text-xs uppercase tracking-wider rounded-xl shadow-md"
                            >
                                {isSubmitting && <i className="fa fa-spinner fa-spin mr-1.5" />}
                                {isSubmitting
                                    ? (hasExistingAdsAccount === "yes" ? t("Linking...") : t("Redirecting..."))
                                    : (hasExistingAdsAccount === "yes" ? t("Link Selected Account") : t("Connect New Ads Account"))
                                }
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};

export default AddAmazonAccountModal;