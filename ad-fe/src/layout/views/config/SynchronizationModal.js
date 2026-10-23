import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import Toast from "../../../common/helper/toast/Toast";
import { ApiGetReportDetails, ApiSaveSynchronizationDetails, ApiGetRetentionDays, ApiGetCoreGroups, ApiGetProfileSyncDetails } from "../../../api-wrapper/ApiAdsConfig";
import { t } from "i18next";

const SynchronizationModal = ({ show, onHide, profile, configId, isDark, onSuccess, type = "ads" }) => {
  const { t } = useTranslation();
  const [reports, setReports] = useState([]);
  const [retentionOptions, setRetentionOptions] = useState([]);
  const [coreGroups, setCoreGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Per-group assigned sync days map: { groupId: days }
  const [groupDaysMap, setGroupDaysMap] = useState({});
  // Per-group toggle status map: { groupId: isEnabled }
  const [groupEnabledMap, setGroupEnabledMap] = useState({});

  useEffect(() => {
    if (show) {
      fetchData();
    }
  }, [show, profile, type]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const targetConfigId = configId || profile?.configId || profile?.sellerConfig?.configId;
      const [reportsRes, retentionRes, coreGroupsRes, syncDetailsRes] = await Promise.all([
        ApiGetReportDetails(),
        ApiGetRetentionDays(),
        ApiGetCoreGroups({ type }),
        targetConfigId ? ApiGetProfileSyncDetails(targetConfigId) : Promise.resolve(null),
      ]);

      let availableDays = [];
      if (retentionRes?.isSuccess && Array.isArray(retentionRes?.data) && retentionRes.data.length > 0) {
        availableDays = retentionRes.data.map((d) => Number(d.days)).filter(Boolean).sort((a, b) => a - b);
        setRetentionOptions(availableDays);
      } else {
        setRetentionOptions([]);
      }

      if (coreGroupsRes?.isSuccess && Array.isArray(coreGroupsRes?.data)) {
        let filteredGroups = coreGroupsRes.data;
        if (type) {
          filteredGroups = filteredGroups.filter((g) => (g.type || "ads") === type);
        }
        setCoreGroups(filteredGroups);

        const targetProfileId = Number(profile?.profileId || profile?._id);
        const existingRecords = (syncDetailsRes?.isSuccess && Array.isArray(syncDetailsRes?.data))
          ? syncDetailsRes.data.filter((r) => Number(r.profileId) === targetProfileId)
          : [];

        const initialDaysMap = {};
        const initialEnabledMap = {};
        const defaultDay = availableDays.length > 0 ? availableDays[0] : "";

        filteredGroups.forEach((g) => {
          const match = existingRecords.find((r) => r.groupId === g.id);
          if (match && match.selectedSyncDays) {
            initialDaysMap[g.id] = match.selectedSyncDays;
            initialEnabledMap[g.id] = true;
          } else {
            initialDaysMap[g.id] = defaultDay;
            // Default to ON if profile has no existing sync records yet; OFF if un-selected during an update
            initialEnabledMap[g.id] = existingRecords.length === 0;
          }
        });

        setGroupDaysMap(initialDaysMap);
        setGroupEnabledMap(initialEnabledMap);
      }

      if (reportsRes?.isSuccess && Array.isArray(reportsRes?.data)) {
        setReports(reportsRes.data);
      }
    } catch {
      Toast.error(t("Failed to load report list"));
    } finally {
      setLoading(false);
    }
  };

  const handleGroupDaysChange = (groupId, days) => {
    setGroupDaysMap((prev) => ({
      ...prev,
      [groupId]: Number(days),
    }));
  };

  const handleGroupToggleChange = (groupId, isEnabled) => {
    setGroupEnabledMap((prev) => ({
      ...prev,
      [groupId]: isEnabled,
    }));
  };

  const handleSubmit = async () => {
    // Only send group details where the toggle was ON
    const enabledGroups = (coreGroups || []).filter((g) => groupEnabledMap[g.id] !== false);

    if (enabledGroups.length === 0) {
      Toast.error(t("Please enable at least one group to synchronize!"));
      return;
    }

    setSubmitting(true);
    try {
      const items = enabledGroups.map((g) => {
        const selectedDays = groupDaysMap[g.id] || (retentionOptions.length > 0 ? retentionOptions[0] : "");
        const maxAllowed = g.maxDays || 90;
        return {
          groupId: g.id,
          selectedSyncDays: Math.min(Number(selectedDays), maxAllowed),
        };
      });

      const targetConfigId = configId || profile?.configId || profile?.sellerConfig?.configId;
      const targetProfileId = profile?.profileId || profile?._id || profile?.sellerConfig?.profileId;

      if (!targetConfigId || !targetProfileId) {
        Toast.error(t("Missing profile or configuration details"));
        setSubmitting(false);
        return;
      }

      const payload = {
        configId: targetConfigId,
        profileId: targetProfileId,
        type,
        items,
      };

      const res = await ApiSaveSynchronizationDetails(payload);
      if (res?.isSuccess) {
        Toast.success(t("Group synchronization settings saved successfully!"));
        if (onSuccess) onSuccess();
        onHide();
      } else {
        Toast.error(res?.message || "Failed to save synchronization settings");
      }
    } catch {
      Toast.error(t("Something went wrong while saving"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={show} onOpenChange={(isOpen) => { if (!isOpen) onHide(); }}>
      <DialogContent
        className="sm:max-w-[920px] premium-modal modal-content p-0 flex flex-col max-h-[90vh] overflow-hidden !z-[1050]"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="modal-header border-b p-4 shrink-0 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
          <DialogTitle className="modal-title text-base font-semibold flex items-center gap-2 text-slate-800 dark:text-white">
            <i className="fa fa-refresh text-sky-500" />
            {t("Synchronization Setup")} — {profile?.name || "Profile"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col overflow-hidden p-5 space-y-4">
          <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 rounded-xl p-3.5 text-xs text-sky-900 dark:text-sky-200 space-y-1">
            <div className="font-semibold flex items-center gap-2 text-sky-800 dark:text-sky-300 text-xs">
              <i className="fa fa-info-circle text-sky-500 text-sm" />
              {type === "seller"
                ? t("Amazon Selling Partner Data Synchronization Setup")
                : t("Amazon Advertising Data Synchronization Setup")}
            </div>
            <p className="leading-relaxed text-slate-600 dark:text-slate-300 font-normal">
              {type === "seller"
                ? t("Select the historical timeframe (e.g., 30, 60, or 90 days) and data groups (Orders, Sales, Inventory, & Financials) you want AdvertiseIQ to import from your Amazon Seller Central account for your default profile.")
                : t("Select the historical timeframe (e.g., 30, 60, or 90 days) and advertising report groups you want AdvertiseIQ to import for your Amazon Advertising campaigns to power analytics and automated optimization.")}
            </p>
          </div>

          {/* Core Groups Table */}
          <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            {loading ? (
              <div className="p-8 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                <i className="fa fa-spinner fa-spin text-base" /> {t("Loading group settings...")}
              </div>
            ) : (
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300 border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3 bg-slate-100 dark:bg-slate-800 text-center whitespace-nowrap w-[100px]">
                      {t("Daily Sync")}
                      <i className="fa fa-info-circle text-slate-400 dark:text-slate-500 cursor-help ml-1.5" title={t("Enable to run daily synchronization. If OFF, daily cron will not run.")} />
                    </th>
                    <th className="px-4 py-3 bg-slate-100 dark:bg-slate-800">{t("Group Name")}</th>
                    <th className="px-4 py-3 bg-slate-100 dark:bg-slate-800 whitespace-nowrap">{t("Timeline Permission")}</th>
                    <th className="px-4 py-3 text-center bg-slate-100 dark:bg-slate-800 whitespace-nowrap">{t("Covered Date Range")}</th>
                    <th className="px-4 py-3 text-center bg-slate-100 dark:bg-slate-800 whitespace-nowrap">
                      {t("Sync Days")}
                      <i className="fa fa-info-circle text-slate-400 dark:text-slate-500 cursor-help ml-1.5" title={t("Select how many past days of historical data to synchronize")} />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {(coreGroups || []).map((group) => {
                    const isEnabled = groupEnabledMap[group.id] !== false;
                    const currentDays = groupDaysMap[group.id] || (retentionOptions.length > 0 ? retentionOptions[0] : "");
                    const endDate = moment();
                    const startDate = currentDays ? moment().subtract(currentDays, "days") : moment();
                    const dateRangeStr = currentDays ? `${startDate.format("DD/MM/YYYY")} to ${endDate.format("DD/MM/YYYY")}` : "-";

                    return (
                      <tr
                        key={group.id}
                        className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors ${!isEnabled ? "opacity-50" : ""}`}
                      >
                        {/* Action Toggle Switch */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <label className="relative inline-flex items-center cursor-pointer mb-0">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={(e) => handleGroupToggleChange(group.id, e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:after:border-slate-600 peer-checked:bg-blue-600"></div>
                          </label>
                        </td>


                        {/* Group Name & Description */}
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-sky-700 dark:text-sky-400 text-sm">
                              {group.title}
                            </span>
                            <span className="text-[11px] text-slate-400 font-normal">
                              {group.description}
                            </span>
                          </div>
                        </td>

                        {/* Timeline Permission */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                            <i className="fa fa-clock-o mr-1 text-sky-500" />
                            {group.maxDays || 90} Days Max
                          </span>
                        </td>

                        {/* Covered Date Range */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span className="inline-block text-xs font-semibold font-mono text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 shadow-2xs whitespace-nowrap">
                            {dateRangeStr}
                          </span>
                        </td>

                        {/* Sync Days Dropdown */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <select
                            disabled={!isEnabled}
                            value={currentDays}
                            onChange={(e) => handleGroupDaysChange(group.id, e.target.value)}
                            className="w-[110px] h-[34px] text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold shrink-0 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {retentionOptions.map((opt) => {
                              const isDisabled = group.maxDays ? opt > group.maxDays : false;
                              return (
                                <option key={opt} value={opt} disabled={isDisabled}>
                                  {opt} Days {isDisabled ? `(Exceeds ${group.maxDays}d)` : ""}
                                </option>
                              );
                            })}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="cm-footer p-4 border-t flex justify-end gap-2 shrink-0 bg-slate-50 dark:bg-slate-900">
          <Button
            variant="outline"
            onClick={onHide}
            className="h-[36px] px-4 text-xs font-medium rounded-lg"
          >
            {t("Cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="h-[36px] px-5 text-xs font-semibold bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-lg shadow-sm flex items-center gap-1.5"
          >
            {submitting ? <i className="fa fa-spinner fa-spin" /> : <i className="fa fa-check" />}
            {t("Submit Synchronization")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SynchronizationModal;
