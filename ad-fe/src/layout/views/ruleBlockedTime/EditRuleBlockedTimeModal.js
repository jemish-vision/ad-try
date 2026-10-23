import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { t } from "i18next";
import { Formik } from "formik";
import * as Yup from "yup";
import { useEffect, useState } from "react";
import { Input } from "../../../components/ui/input";
import Toast from "../../../common/helper/toast/Toast";
import { ApiCreateRuleBlockedTime, ApiUpdateRuleBlockedTime } from "../../../api-wrapper/ApiRuleBlockedTime";

const TIME_FORMAT = "HH:mm";

export default function EditRuleBlockedTimeModal({
    open,
    onClose,
    ruleBlockedTime,
}) {
  const { t } = useTranslation();
    const isEdit = Boolean(ruleBlockedTime?._id);
    const [loading, setLoading] = useState(false);

    /* --------------------------------- SCHEMA -------------------------------- */

    const validationSchema = Yup.object().shape({
        startTime: Yup.string().required(t("Start time is required")),
        endTime: Yup.string().required(t("End time is required")),
    });

    /* --------------------------------- VALUES -------------------------------- */

    const initialValues = {
        startTime: ruleBlockedTime?.startTime || "",
        endTime: ruleBlockedTime?.endTime || "",
    };

    /* --------------------------------- SUBMIT -------------------------------- */

    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            let res;
            if (isEdit) {
                res = await ApiUpdateRuleBlockedTime({ ...values, ruleBlockedTimeId: ruleBlockedTime._id });
            } else {
                res = await ApiCreateRuleBlockedTime(values);
            }

            if (res?.isSuccess) {
                Toast.success(res.message);
                onClose();
            } else {
                Toast.error(res.message);
            }
        } catch {
            Toast.error(t("Something went wrong"));
        } finally {
            setLoading(false);
        }
    };

    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        window.addEventListener("themeChanged", handle);
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => {
            window.removeEventListener("themeChanged", handle);
            observer.disconnect();
        };
    }, []);

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
            <DialogContent
                className="sm:max-w-[600px] premium-modal modal-content p-0 flex flex-col max-h-[90vh] overflow-hidden"
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader className="modal-header border-b-0 p-4 pb-0">
                    <DialogTitle className="modal-title">
                        {isEdit ? t("Edit Rule Blocked Time") : t("Add Rule Blocked Time")}
                    </DialogTitle>
                </DialogHeader>

                <Formik
                    initialValues={initialValues}
                    validationSchema={validationSchema}
                    enableReinitialize
                    onSubmit={handleSubmit}
                >
                    {({ values, errors, touched, setFieldValue, handleSubmit }) => (
                        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col h-full overflow-hidden">
                            <div className="overflow-y-auto flex-1 p-6" id="ruleBlockedTime">
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">{t("Time Range")} *</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">{t("Start Time")}</label>
                                                <Input
                                                    type="time"
                                                    className="w-full h-[42px] cursor-pointer"
                                                    style={{
                                                        colorScheme: isDark ? "dark" : "light",
                                                        backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "#ffffff",
                                                        borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "#cbd5e1",
                                                        color: isDark ? "#f1f5f9" : "#0f172a"
                                                    }}
                                                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) { } }}
                                                    value={values.startTime || ""}
                                                    onChange={(e) => setFieldValue("startTime", e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">{t("End Time")}</label>
                                                <Input
                                                    type="time"
                                                    className="w-full h-[42px] cursor-pointer"
                                                    style={{
                                                        colorScheme: isDark ? "dark" : "light",
                                                        backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "#ffffff",
                                                        borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "#cbd5e1",
                                                        color: isDark ? "#f1f5f9" : "#0f172a"
                                                    }}
                                                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) { } }}
                                                    value={values.endTime || ""}
                                                    onChange={(e) => setFieldValue("endTime", e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        {((touched.startTime && errors.startTime) || (touched.endTime && errors.endTime)) && (
                                            <div className="text-red-500 text-sm mt-1">
                                                {errors.startTime || errors.endTime}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <style>{`
                                /* Style native time input fields in dark theme */
                                ${isDark ? `
                                    input[type="time"]::-webkit-datetime-edit,
                                    input[type="time"]::-webkit-datetime-edit-fields-wrapper,
                                    input[type="time"]::-webkit-datetime-edit-text,
                                    input[type="time"]::-webkit-datetime-edit-hour,
                                    input[type="time"]::-webkit-datetime-edit-minute,
                                    input[type="time"]::-webkit-datetime-edit-second,
                                    input[type="time"]::-webkit-datetime-edit-ampm-field {
                                        color: #f1f5f9 !important;
                                    }
                                    
                                    input[type="time"]::-webkit-calendar-picker-indicator {
                                        filter: invert(1) brightness(0.9) !important;
                                        cursor: pointer;
                                    }
                                ` : ''}
                            `}</style>

                            <div className="cm-footer border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 flex justify-end gap-2 shrink-0">
                                <Button variant="outline" type="button" className="btn-premium-secondary" onClick={onClose} disabled={loading}>
                                    {t("Cancel")}
                                </Button>
                                <Button type="submit" className="btn-premium-primary flex items-center gap-1.5" disabled={loading}>
                                    {loading && <i className="fa-solid fa-spinner fa-spin mr-1.5" />}
                                    {loading ? t("Saving...") : isEdit ? t("Update") : t("Create")}
                                </Button>
                            </div>
                        </form>
                    )}
                </Formik>
            </DialogContent>
        </Dialog>
    );
}