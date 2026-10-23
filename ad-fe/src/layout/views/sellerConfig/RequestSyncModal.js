import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { useEffect, useState } from "react";
import Toast from "../../../common/helper/toast/Toast";
import { ApiGetSyncRequests, ApiExecuteSync } from "../../../api-wrapper/ApiAdsConfig";
import moment from "moment";
import { useTranslation } from "react-i18next";

const RequestSyncModal = ({ show, onHide, rowData }) => {
  const { t } = useTranslation();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);

  const fetchSyncRequests = async () => {
    setLoading(true);
    try {
      const res = await ApiGetSyncRequests();
      if (res?.isSuccess && Array.isArray(res?.data)) {
        // Filter requests matching profile / config
        const targetProfileId = rowData?.profileId || rowData?._id;
        const targetConfigId = rowData?.configId || rowData?.sellerConfig?.configId;

        const filtered = res.data.filter((item) => {
          const profileMatch = String(item.profileId) === String(targetProfileId);
          const configMatch = !targetConfigId || String(item.configId?._id || item.configId) === String(targetConfigId);
          return profileMatch || configMatch;
        });

        setRequests(filtered.length > 0 ? filtered : res.data); // Fallback to all if specific match empty
      } else {
        setRequests([]);
      }
    } catch {
      Toast.error(t("Failed to load synchronization requests"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show) {
      fetchSyncRequests();
    }
  }, [show, rowData]);

  const handleExecuteSync = async () => {
    setExecuting(true);
    try {
      const pendingIds = requests.filter((r) => r.requestStatus === "PENDING").map((r) => r._id);
      const res = await ApiExecuteSync({
        syncIds: pendingIds,
        profileId: rowData?.profileId || rowData?._id,
        configId: rowData?.configId || rowData?.sellerConfig?.configId,
      });

      if (res?.isSuccess) {
        Toast.success(t("Synchronization executed successfully!"));
        fetchSyncRequests();
      } else {
        Toast.error(res?.message || t("Failed to execute sync"));
      }
    } catch {
      Toast.error(t("Something went wrong during sync execution"));
    } finally {
      setExecuting(false);
    }
  };

  const clientInfo = rowData?.configId?.companyName || rowData?.sellerConfig?.sellerId || t("Client Account");
  const profileInfo = rowData?.name ? `${rowData?.countryCode || ""} | ${rowData?.name} (${rowData?.profileId || ""})` : t("Profile {{id}}", { id: rowData?.profileId || "" });
  const totalSyncedDays = requests.reduce((acc, r) => acc + (Number(r.selectedSyncDays) || 0), 0);

  return (
    <Dialog open={Boolean(show)} onOpenChange={(isOpen) => { if (!isOpen) onHide(); }}>
      <DialogContent
        className="sm:max-w-[700px] premium-modal modal-content p-0 flex flex-col max-h-[90vh] overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="modal-header border-b p-4 shrink-0 flex justify-between items-center">
          <DialogTitle className="modal-title text-base font-semibold flex items-center gap-2">
            <i className="fa fa-refresh text-sky-500" />
            {t("Synchronization Details & Execution")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
          {/* Metadata Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <span className="font-semibold text-slate-500 uppercase block text-[10px] mb-1">{t("Client Information")}</span>
              <p className="font-medium text-slate-800 dark:text-slate-200">{clientInfo}</p>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <span className="font-semibold text-slate-500 uppercase block text-[10px] mb-1">{t("Profile Information")}</span>
              <p className="font-medium text-slate-800 dark:text-slate-200">{profileInfo}</p>
            </div>
          </div>

          {/* Synced Data Summary Badge */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-sky-50 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 text-xs">
            <div className="flex items-center gap-2">
              <i className="fa fa-database text-sky-600 text-sm" />
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {t("Amount of Data Synchronized:")} <strong className="text-sky-600 dark:text-sky-400 font-mono text-sm">{t("{{count}} Total Days", { count: totalSyncedDays })}</strong>
              </span>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              {t("{{count}} Configuration(s)", { count: requests.length })}
            </span>
          </div>

          {/* Report-wise Configuration Grid */}
          <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            {loading ? (
              <div className="p-8 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                <i className="fa fa-spinner fa-spin text-base" /> {t("Loading synchronization requests...")}
              </div>
            ) : requests.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                {t("No sync requests found for this profile.")}
              </div>
            ) : (
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300 border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-200 uppercase sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3.5 py-2.5">{t("Report Type")}</th>
                    <th className="px-3.5 py-2.5 text-center">{t("Selected Days")}</th>
                    <th className="px-3.5 py-2.5 text-center">{t("Request Time")}</th>
                    <th className="px-3.5 py-2.5 text-right">{t("Status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {requests.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="px-3.5 py-2.5 font-medium text-slate-900 dark:text-white">
                        {item.reportType}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono font-semibold">
                        {t("{{count}} Days", { count: item.selectedSyncDays })}
                      </td>
                      <td className="px-3.5 py-2.5 text-center text-[11px] text-slate-500">
                        {item.syncRequestTime ? moment(item.syncRequestTime).format("DD/MM/YYYY hh:mm A") : moment(item.createdAt).format("DD/MM/YYYY hh:mm A")}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${item.requestStatus === "COMPLETED"
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900"
                            : "bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900"
                          }`}>
                          {item.requestStatus || "PENDING"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t p-4 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
          <Button variant="outline" size="sm" onClick={onHide} className="text-xs">
            {t("Close")}
          </Button>
          <Button
            size="sm"
            onClick={handleExecuteSync}
            disabled={executing || requests.length === 0}
            className="h-[34px] text-xs px-4 !bg-sky-600 hover:!bg-sky-700 !text-white hover:!text-white border-0 rounded-lg shadow-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {executing ? (
              <>
                <i className="fa fa-spinner fa-spin" /> {t("Executing Sync...")}
              </>
            ) : (
              <>
                <i className="fa fa-play" /> {t("Execute Sync")}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RequestSyncModal;
