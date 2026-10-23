import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFormik } from "formik";
import * as Yup from "yup";
import { ApiCreateSupportTicket, ApiFileUpload } from "../../api-wrapper/customer/ApiCustomer";
import { Toast } from "../links/Link";
import { Paperclip, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

const validationSchema = Yup.object({
    problemType: Yup.string().required("Problem type is required"),
    message: Yup.string().min(10, "At least 10 characters").required("Message is required"),
    campaignName: Yup.string().max(100, "Too long"),
});

const RaiseSupportTicket = ({ user, onSuccess }) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const formik = useFormik({
        initialValues: { problemType: "", campaignName: "", message: "", fileUrl: "", fileName: "" },
        validationSchema,
        onSubmit: async (values) => {
            try {
                setLoading(true);
                const additionalMessage = [
                    `Problem Type: ${values.problemType}`,
                    values.campaignName ? `Campaign Name: ${values.campaignName}` : null,
                    `Message: ${values.message}`,
                ].filter(Boolean).join("\n");

                const res = await ApiCreateSupportTicket({
                    userName: user?.name,
                    userEmail: user?.email,
                    needCC: false,
                    ccEmail: "",
                    needAdditionalMessage: true,
                    additionalMessage,
                    fileUrl: values.fileUrl,
                });
                if (!res?.isSuccess) throw new Error(res?.message);
                Toast.success(t("Ticket created successfully"));
                onSuccess?.();
            } catch (err) {
                Toast.error(err.message || t("Failed to create ticket"));
            } finally {
                setLoading(false);
            }
        },
    });

    const handleFileUpload = async (file) => {
        try {
            setUploading(true);
            const formData = new FormData();
            formData.append("image", file);
            const res = await ApiFileUpload(formData);
            if (!res?.isSuccess || !res?.data?.image) throw new Error("File upload failed");
            formik.setFieldValue("fileUrl", res.data.image);
            formik.setFieldValue("fileName", file.name);
            Toast.success(t("File uploaded"));
        } catch (err) {
            Toast.error(err.message || t("Invalid file type! Only Images or Excel files allowed."));
        } finally {
            setUploading(false);
        }
    };

    return (
        <div 
            className="flex-1 flex flex-col overflow-hidden"
            style={{
                background: isDark ? "rgba(255,255,255,0.02)" : "rgba(35,116,242,0.04)"
            }}
        >
            <form
                onSubmit={formik.handleSubmit}
                className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 custom-scrollbar"
            >
                {/* Problem Type */}
                <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
                        {t("Problem Type")} <span className="text-red-500">*</span>
                    </label>
                    <Select
                        name="problemType"
                        value={formik.values.problemType}
                        onValueChange={(val) => formik.setFieldValue("problemType", val)}
                    >
                        <SelectTrigger className={`w-full h-10 ${
                            formik.touched.problemType && formik.errors.problemType 
                                ? "border-red-500" 
                                : ""
                        }`}>
                            <SelectValue placeholder={t("Select a problem type")} />
                        </SelectTrigger>
                        <SelectContent className="z-[99999]">
                            <SelectItem value="Campaign Issue">{t("Campaign Issue")}</SelectItem>
                            <SelectItem value="Automation Issue">{t("Automation Issue")}</SelectItem>
                            <SelectItem value="Billing Issue">{t("Billing Issue")}</SelectItem>
                            <SelectItem value="Sync Issue">{t("Sync Issue")}</SelectItem>
                            <SelectItem value="Other">{t("Other")}</SelectItem>
                        </SelectContent>
                    </Select>
                    {formik.touched.problemType && formik.errors.problemType && (
                        <div className="text-red-500 text-xs mt-1 font-semibold">{t(formik.errors.problemType)}</div>
                    )}
                </div>

                {/* Campaign Name */}
                <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
                        {t("Campaign Name")}
                    </label>
                    <input
                        type="text"
                        name="campaignName"
                        placeholder={t("Optional — helps us identify the issue faster")}
                        value={formik.values.campaignName}
                        onChange={formik.handleChange}
                        className="h-10 w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 text-sm focus:outline-none focus:border-[#1A9FD4] bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 transition-colors placeholder:text-slate-400"
                    />
                </div>

                {/* File Upload */}
                <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
                        {t("Screenshot")}
                    </label>
                    {!formik.values.fileUrl ? (
                        <label
                            className={`flex items-center gap-2 h-10 w-full rounded-lg border border-dashed px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors select-none ${
                                uploading ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                        >
                            <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                            <span>{uploading ? t("Uploading…") : t("Upload screenshot (optional)")}</span>
                            <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                disabled={uploading}
                                onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }} 
                            />
                        </label>
                    ) : (
                        <div className="flex items-center justify-between px-3 py-2 border border-[#2374F2]/30 dark:border-[#2374F2]/20 rounded-lg bg-[#2374F2]/5 text-slate-700 dark:text-slate-200">
                            <div className="flex items-center gap-2 min-w-0">
                                <Paperclip className="h-4 w-4 shrink-0 text-[#2374F2]" />
                                <span className="text-xs font-semibold truncate max-w-[200px]">
                                    {formik.values.fileName}
                                </span>
                            </div>
                            <button 
                                type="button" 
                                onClick={() => { formik.setFieldValue("fileUrl", ""); formik.setFieldValue("fileName", ""); }} 
                                className="p-1 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all focus:outline-none"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Message */}
                <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 block">
                        {t("Describe your issue")} <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        name="message"
                        rows={4}
                        placeholder={t("Please describe the issue in detail…")}
                        value={formik.values.message}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        className={`w-full rounded-lg border p-3 text-sm focus:outline-none focus:border-[#1A9FD4] bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 transition-colors placeholder:text-slate-400 ${
                            formik.touched.message && formik.errors.message 
                                ? "border-red-500" 
                                : "border-slate-200 dark:border-slate-800"
                        }`}
                    />
                    {formik.touched.message && formik.errors.message && (
                        <div className="text-red-500 text-xs mt-1 font-semibold">{t(formik.errors.message)}</div>
                    )}
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={loading || !formik.isValid || !formik.dirty}
                    className="w-full h-10 rounded-lg text-white font-semibold text-sm shadow-md bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:hover:opacity-40 disabled:cursor-not-allowed focus:outline-none mt-2"
                >
                    {loading ? t("Submitting…") : t("Submit Ticket")}
                </button>
            </form>
        </div>
    );
};

export default RaiseSupportTicket;
