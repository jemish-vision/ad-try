import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { Button } from "src/components/ui/button";
import { Badge } from "src/components/ui/badge";
import Toast from "../../../common/helper/toast/Toast";
import { ApiExecuteProfileSyncCron } from "../../../api-wrapper/ApiOrganization";
import { AppTooltip } from "../../../components/ui/AppTooltip";

const PendingSyncProfilesModal = ({ open, setOpen, organization, onSuccess }) => {
  const { t } = useTranslation();
  const [loadingProfileId, setLoadingProfileId] = useState(null);

  const pendingProfiles = organization?.pendingSyncProfiles || [];

  const handlePlayCron = async (profileItem) => {
    try {
      setLoadingProfileId(profileItem.profileId);
      const res = await ApiExecuteProfileSyncCron({ syncIds: profileItem.syncIds });
      if (res?.isSuccess) {
        Toast.success(res.message || "Sync cron started successfully!");
        if (onSuccess) onSuccess();
        setOpen(false);
      } else {
        Toast.error(res?.message || "Failed to start sync cron");
      }
    } catch (err) {
      console.error("Error executing sync cron:", err);
      Toast.error(t("Something went wrong while starting sync cron"));
    } finally {
      setLoadingProfileId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) setOpen(false); }}>
      <DialogContent
        className="sm:max-w-[800px] premium-modal modal-content p-0 flex flex-col max-h-[90vh] overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="modal-header border-b p-4 shrink-0 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
          <DialogTitle className="modal-title text-base font-semibold flex items-center gap-2 text-slate-800 dark:text-white">
            <i className="fa fa-refresh text-sky-500" />
            {t("Pending Synchronization Requests")} — {organization?.organizationName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="modal-body overflow-y-auto p-4 flex-1">
            {pendingProfiles.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <i className="fa fa-check-circle text-emerald-500 text-3xl mb-2" />
                <p className="mb-0">No pending sync requests found for this organization.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300 border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Profile Name</th>
                    <th className="px-4 py-3">Selected Groups</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {pendingProfiles.map((item, idx) => {
                    const isLoading = loadingProfileId === item.profileId;
                    return (
                      <tr key={item.profileId || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-medium">{idx + 1}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <span>{item.profileName}</span>
                            {item.countryCode && (
                              <Badge variant="secondary" className="font-normal text-[11px] px-1.5 py-0">
                                {item.countryCode}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-sky-600 dark:text-sky-400">
                              {item.selectedGroupsCount} {item.selectedGroupsCount === 1 ? "Group Selected" : "Groups Selected"}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {item.selectedGroups?.map((g, gIdx) => (
                                <span
                                  key={gIdx}
                                  className="inline-block text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                >
                                  {g.groupTitle} ({g.selectedSyncDays}d)
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.hasFailed ? (
                            <AppTooltip text={t("This cron was failed again start")}>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isLoading}
                                onClick={() => handlePlayCron(item)}
                                className="h-[32px] px-3 text-xs font-semibold rounded-lg flex items-center gap-1.5 mx-auto cursor-pointer text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-950/50"
                              >
                                {isLoading ? (
                                  <i className="fa fa-spinner fa-spin text-xs" />
                                ) : (
                                  <>
                                    <i className="fa fa-play text-[11px]" />
                                    {t("Play Cron")}
                                  </>
                                )}
                              </Button>
                            </AppTooltip>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isLoading}
                              onClick={() => handlePlayCron(item)}
                              className="h-[32px] px-3 text-xs font-semibold rounded-lg flex items-center gap-1.5 mx-auto cursor-pointer text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                            >
                              {isLoading ? (
                                <i className="fa fa-spinner fa-spin text-xs" />
                              ) : (
                                <>
                                  <i className="fa fa-play text-[11px]" />
                                  {t("Play Cron")}
                                </>
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="cm-footer p-4 flex justify-end shrink-0 border-t">
            <Button
              variant="outline"
              className="customize-button h-[36px] !bg-white !border !border-slate-300 !text-slate-700 hover:!bg-slate-50 dark:!bg-transparent dark:!border-slate-700 dark:!text-slate-300 dark:hover:!bg-slate-800 px-4 font-medium rounded-md shadow-sm flex items-center justify-center gap-1.5"
              onClick={() => setOpen(false)}
            >
              {t("Close")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PendingSyncProfilesModal;
