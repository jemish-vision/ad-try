import React, { useRef, useState } from "react";
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
  const submitting = useRef(false);

  const pendingProfiles = organization?.pendingSyncProfiles || [];

  const handlePlayCron = async (profileItem) => {
    if (submitting.current || profileItem.hasInProgress || !profileItem.syncIds?.length) return;
    submitting.current = true;
    try {
      setLoadingProfileId(profileItem.profileId);
      const res = await ApiExecuteProfileSyncCron({ syncIds: profileItem.syncIds });
      if (res?.isSuccess) {
        Toast.success(res.message || "Sync cron started successfully!");
        await onSuccess?.();
      } else {
        Toast.error(res?.message || "Failed to start sync cron");
      }
    } catch (err) {
      console.error("Error executing sync cron:", err);
      Toast.error(t("Something went wrong while starting sync cron"));
    } finally {
      submitting.current = false;
      setLoadingProfileId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) setOpen(false); }}>
      <DialogContent
        className="sm:max-w-[880px] premium-modal modal-content p-0 gap-0 flex flex-col max-h-[90vh] overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="modal-header border-b border-slate-200 dark:border-slate-800 px-6 py-4 pr-14 shrink-0 flex flex-row items-center justify-start text-left bg-slate-50 dark:bg-slate-900">
          <DialogTitle className="modal-title text-base font-semibold flex items-center gap-2.5 text-slate-800 dark:text-white m-0">
            <i className="fa fa-refresh text-sky-500" />
            <span>{t("Pending Synchronization Requests")} — {organization?.organizationName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="modal-body overflow-y-auto p-6 flex-1">
            {pendingProfiles.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <i className="fa fa-check-circle text-emerald-500 text-3xl mb-2" />
                <p className="mb-0">No pending sync requests found for this organization.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900/50">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300 border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3 w-12 text-center">#</th>
                      <th className="px-4 py-3 whitespace-nowrap">Profile Name</th>
                      <th className="px-4 py-3">Selected Groups</th>
                      <th className="px-4 py-3 w-[160px] text-center whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {pendingProfiles.map((item, idx) => {
                      const isLoading = loadingProfileId === item.profileId;
                      return (
                        <tr key={item.profileId || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors align-middle">
                          <td className="px-4 py-4 text-center text-slate-500 dark:text-slate-400 font-medium">{idx + 1}</td>
                          <td className="px-4 py-4 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span>{item.profileName}</span>
                              {item.countryCode && (
                                <Badge variant="secondary" className="font-medium text-[11px] px-1.5 py-0.5 shrink-0">
                                  {item.countryCode}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-2">
                              <span className="text-xs font-bold text-sky-600 dark:text-sky-400">
                                {item.selectedGroupsCount} {item.selectedGroupsCount === 1 ? "Group Selected" : "Groups Selected"}
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {item.selectedGroups?.map((g, gIdx) => (
                                  <span
                                    key={gIdx}
                                    className="inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 whitespace-nowrap"
                                  >
                                    {g.groupTitle} ({g.selectedSyncDays}d)
                                  </span>
                                ))}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center whitespace-nowrap">
                            {item.hasInProgress ? (
                              <Badge role="status" variant="outline" className="inline-flex items-center gap-1.5 px-3 py-1.5 whitespace-nowrap border-sky-300/80 text-sky-600 dark:border-sky-500/60 dark:text-sky-400 bg-sky-50/50 dark:bg-sky-950/30">
                                <i className="fa fa-spinner fa-spin text-xs" aria-hidden="true" />
                                <span>{t("In Progress")}</span>
                              </Badge>
                            ) : item.hasFailed ? (
                              <AppTooltip text={t("This cron was failed again start")}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={loadingProfileId !== null || !item.syncIds?.length}
                                  onClick={() => handlePlayCron(item)}
                                  className="h-[32px] px-3 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 mx-auto whitespace-nowrap cursor-pointer text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-950/50"
                                >
                                  {isLoading ? (
                                    <i className="fa fa-spinner fa-spin text-xs" />
                                  ) : (
                                    <>
                                      <i className="fa fa-play text-[11px]" />
                                      <span>{t("Play Cron")}</span>
                                    </>
                                  )}
                                </Button>
                              </AppTooltip>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={loadingProfileId !== null || !item.syncIds?.length}
                                onClick={() => handlePlayCron(item)}
                                className="h-[32px] px-3 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 mx-auto whitespace-nowrap cursor-pointer text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                              >
                                {isLoading ? (
                                  <i className="fa fa-spinner fa-spin text-xs" />
                                ) : (
                                  <>
                                    <i className="fa fa-play text-[11px]" />
                                    <span>{t("Play Cron")}</span>
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
              </div>
            )}
          </div>
          <div className="cm-footer px-6 py-3.5 flex justify-end shrink-0 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60">
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
