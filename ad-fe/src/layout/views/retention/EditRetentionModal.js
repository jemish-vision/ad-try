import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { t } from "i18next";
import { Formik } from "formik";
import * as Yup from "yup";
import { useEffect, useState } from "react";
import { Input } from "../../../components/ui/input";
import Toast from "../../../common/helper/toast/Toast";
import { ApiCreateRetention, ApiUpdateRetention } from "../../../api-wrapper/ApiRetention";

export default function EditRetentionModal({ open, onClose, retentionData }) {
  const { t } = useTranslation();
  const isEdit = Boolean(retentionData?._id);
  const [loading, setLoading] = useState(false);

  const validationSchema = Yup.object().shape({
    days: Yup.number()
      .typeError(t("Retention days must be a number"))
      .positive(t("Retention days must be greater than 0"))
      .integer(t("Retention days must be an integer"))
      .required(t("Retention days is required")),
    label: Yup.string().nullable(),
    isActive: Yup.boolean(),
  });

  const initialValues = {
    days: retentionData?.days ?? "",
    label: retentionData?.label ?? "",
    isActive: retentionData?.isActive ?? true,
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      let res;
      if (isEdit) {
        res = await ApiUpdateRetention({
          id: retentionData._id,
          days: Number(values.days),
          label: values.label?.trim() || `${values.days} Days`,
          isActive: values.isActive,
        });
      } else {
        res = await ApiCreateRetention({
          days: Number(values.days),
          label: values.label?.trim() || `${values.days} Days`,
          isActive: values.isActive,
        });
      }

      if (res?.isSuccess) {
        Toast.success(res.message);
        onClose();
      } else {
        Toast.error(res?.message || "Operation failed");
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
        className="sm:max-w-[500px] premium-modal modal-content p-0 flex flex-col max-h-[90vh] overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="modal-header border-b-0 p-4 pb-0">
          <DialogTitle className="modal-title">
            {isEdit ? t("Edit Retention") : t("Add Retention")}
          </DialogTitle>
        </DialogHeader>

        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          enableReinitialize
          onSubmit={handleSubmit}
        >
          {({ values, errors, touched, handleChange, handleBlur, setFieldValue, handleSubmit }) => (
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col h-full overflow-hidden">
              <div className="overflow-y-auto flex-1 p-6 gap-4 flex flex-col">
                <div>
                  <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">
                    {t("Retention Days")} *
                  </label>
                  <Input
                    type="number"
                    name="days"
                    placeholder={t("e.g. 30, 60, 90")}
                    value={values.days}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className="w-full h-[42px]"
                    style={{
                      colorScheme: isDark ? "dark" : "light",
                      backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "#ffffff",
                      borderColor: errors.days && touched.days ? "#ef4444" : isDark ? "rgba(255, 255, 255, 0.1)" : "#cbd5e1",
                      color: isDark ? "#f1f5f9" : "#0f172a",
                    }}
                  />
                  {errors.days && touched.days && (
                    <span className="text-red-500 text-[12px] mt-1 block">{errors.days}</span>
                  )}
                </div>

                <div>
                  <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">
                    {t("Label")}
                  </label>
                  <Input
                    type="text"
                    name="label"
                    placeholder={t("e.g. 30 Days Retention")}
                    value={values.label}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className="w-full h-[42px]"
                    style={{
                      colorScheme: isDark ? "dark" : "light",
                      backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "#ffffff",
                      borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "#cbd5e1",
                      color: isDark ? "#f1f5f9" : "#0f172a",
                    }}
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    {t("Leave empty to use default label like 'X Days'")}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    name="isActive"
                    checked={values.isActive}
                    onChange={(e) => setFieldValue("isActive", e.target.checked)}
                    className="w-4 h-4 rounded accent-[#00A3AD] cursor-pointer"
                  />
                  <label htmlFor="isActive" className="text-[13px] font-medium text-[#475569] dark:text-[#cbd5e1] cursor-pointer select-none">
                    {t("Active Status")}
                  </label>
                </div>
              </div>

              <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-[#182234]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={loading}
                >
                  {t("Cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-1.5"
                  style={{ backgroundColor: "#00A3AD", color: "#fff" }}
                >
                  {loading && <i className="fa-solid fa-spinner fa-spin mr-1.5" />}
                  {loading ? t("Saving...") : isEdit ? t("Update Retention") : t("Add Retention")}
                </Button>
              </div>
            </form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  );
}
