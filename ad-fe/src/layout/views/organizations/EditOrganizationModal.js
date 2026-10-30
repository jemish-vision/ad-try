import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { ShadcnDatePicker } from "../../../components/ui/date-picker";
import { ApiPackageList } from "../../../api-wrapper/ApiPackages";
import { ApiUpdateSuperAdminOrganization } from "../../../api-wrapper/ApiOrganization";
import Toast from "../../../common/helper/toast/Toast";
import { handleLoader } from "../../../helper/links/Link";

const EditOrganizationModal = ({ open, setOpen, organization, onSuccess }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState([]);
  const [formData, setFormData] = useState({
    organizationName: "",
    planId: "",
    startDate: "",
    endDate: "",
    isDataDeletionStopped: false,
  });

  useEffect(() => {
    if (open) {
      fetchPackages();
    }
  }, [open]);

  useEffect(() => {
    if (organization && open) {
      const formatDateForInput = (dateVal) => {
        if (!dateVal) return "";
        try {
          const d = new Date(dateVal);
          if (isNaN(d.getTime())) return "";
          return d.toISOString().split("T")[0];
        } catch {
          return "";
        }
      };

      setFormData({
        organizationName: organization.organizationName || "",
        planId: organization.planId?._id || organization.planId || "",
        startDate: formatDateForInput(organization.startDate),
        endDate: formatDateForInput(organization.endDate),
        isDataDeletionStopped: Boolean(organization.isDataDeletionStopped),
      });
    }
  }, [organization, open]);

  const fetchPackages = async () => {
    try {
      const res = await ApiPackageList({ pageNo: 1, perPage: 100 });
      if (res && res.isSuccess && Array.isArray(res.data)) {
        setPackages(res.data);
      }
    } catch (err) {
      console.error("Error fetching packages:", err);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!organization?._id) return;

    setLoading(true);
    handleLoader(true);
    try {
      const payload = {
        organizationId: organization._id,
        organizationName: formData.organizationName,
        planId: formData.planId || null,
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        isDataDeletionStopped: Boolean(formData.isDataDeletionStopped),
      };

      const res = await ApiUpdateSuperAdminOrganization(payload);
      if (res && res.isSuccess) {
        Toast.success(res.message || "Organization updated successfully.");
        setOpen(false);
        if (onSuccess) onSuccess();
      } else {
        Toast.error(res?.message || "Failed to update organization.");
      }
    } catch (err) {
      Toast.error(t("An error occurred while updating the organization."));
    } finally {
      setLoading(false);
      handleLoader(false);
    }
  };

  return (
    <CustomModal
      show={open}
      onHide={() => setOpen(false)}
      title={t("Edit Organization Details")}
      size="lg"
      modalId="orgs-edit-modal-content"
    >
      <form onSubmit={handleSubmit} className="p-1 space-y-4">
        <div id="orgs-edit-name-wrapper">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            {t("Organization Name")} *
          </label>
          <Input
            id="orgs-edit-name"
            type="text"
            name="organizationName"
            value={formData.organizationName}
            onChange={handleChange}
            required
            className="w-full shadcn-input"
            placeholder={t("Enter organization name")}
          />
        </div>

        <div id="orgs-edit-plan-wrapper">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            {t("Subscription Plan")}
          </label>
          <select
            id="orgs-edit-plan"
            name="planId"
            value={formData.planId}
            onChange={handleChange}
            className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t("Select Plan (No Plan)")}</option>
            {packages.map((pkg) => (
              <option key={pkg._id} value={pkg._id}>
                {pkg.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="orgs-edit-dates">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {t("Start Date")}
            </label>
            <ShadcnDatePicker
              value={formData.startDate}
              onChange={(val) => setFormData((prev) => ({ ...prev, startDate: val || "" }))}
              placeholder={t("Select Start Date")}
              className="w-full h-9"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {t("End Date")}
            </label>
            <ShadcnDatePicker
              value={formData.endDate}
              onChange={(val) => setFormData((prev) => ({ ...prev, endDate: val || "" }))}
              placeholder={t("Select End Date")}
              className="w-full h-9"
            />
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/20 mt-1">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              name="isDataDeletionStopped"
              checked={Boolean(formData.isDataDeletionStopped)}
              onChange={(e) => setFormData((prev) => ({ ...prev, isDataDeletionStopped: e.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
            />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                <i className="fa fa-shield text-amber-600 dark:text-amber-400" />
                {t("Stop Account Data Deletion")}
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                {t("When enabled, automated 30-day cleanup is halted. This organization's and accounts' advertising and seller historical data will NOT be deleted.")}
              </span>
            </div>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 mt-4">
          <Button
            id="orgs-edit-cancel"
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => setOpen(false)}
            className="h-9 px-4 text-xs font-semibold"
          >
            {t("Cancel")}
          </Button>
          <Button
            id="orgs-edit-save"
            type="submit"
            disabled={loading}
            className="h-9 px-5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5"
          >
            {loading && <i className="fa fa-spinner fa-spin mr-1" />}
            {loading ? t("Saving...") : t("Save Changes")}
          </Button>
        </div>
      </form>
    </CustomModal>
  );
};

export default EditOrganizationModal;
