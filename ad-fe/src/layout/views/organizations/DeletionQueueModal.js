import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { MdOutlineClose } from "react-icons/md";
import { FiSearch, FiShield, FiAlertTriangle, FiClock, FiCheckCircle, FiRefreshCw } from "react-icons/fi";
import { ApiGetDeletionQueue, ApiToggleStopDataDeletion } from "../../../api-wrapper/ApiOrganization";
import Toast from "../../../common/helper/toast/Toast";
import { AppTooltip } from "../../../components/ui/AppTooltip";

const DeletionQueueModal = ({ open, setOpen, onStatusChange }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState([]);
  const [search, setSearch] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await ApiGetDeletionQueue();
      if (res && res.isSuccess && Array.isArray(res.data)) {
        setQueue(res.data);
      } else {
        setQueue([]);
      }
    } catch (err) {
      console.error("Error fetching deletion queue:", err);
      Toast.error(t("Failed to load deletion queue"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchQueue();
    }
  }, [open]);

  const handleToggle = async (item) => {
    const newStatus = !item.isDataDeletionStopped;
    const confirmMsg = newStatus
      ? t("Are you sure you want to STOP the data deletion process for this account? Their data will NOT be deleted.")
      : t("Are you sure you want to RESUME the 30-day automated data deletion process for this account?");

    if (!window.confirm(confirmMsg)) return;

    setActionLoadingId(item._id);
    try {
      const payload = {
        isDataDeletionStopped: newStatus,
        ...(item.type === "ads" ? { configId: item._id } : { sellerConfigId: item._id }),
        ...(item.organizationId && { organizationId: item.organizationId }),
      };

      const res = await ApiToggleStopDataDeletion(payload);
      if (res && res.isSuccess) {
        Toast.success(res.message);
        fetchQueue();
        if (onStatusChange) onStatusChange();
      } else {
        Toast.error(res?.message || t("Failed to update status"));
      }
    } catch (err) {
      Toast.error(t("Something went wrong"));
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "-";
      return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return "-";
    }
  };

  const filteredQueue = queue.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.organizationName && item.organizationName.toLowerCase().includes(q)) ||
      (item.ownerName && item.ownerName.toLowerCase().includes(q)) ||
      (item.ownerEmail && item.ownerEmail.toLowerCase().includes(q))
    );
  });

  const totalCount = queue.length;
  const stoppedCount = queue.filter((q) => q.isDataDeletionStopped).length;
  const pendingCount = totalCount - stoppedCount;

  return (
    <CustomModal
      show={open}
      onHide={() => setOpen(false)}
      title={
        <div className="flex items-center gap-2">
          <FiClock className="text-amber-500" size={18} />
          <span>{t("Disconnected Accounts — Data Deletion Queue")}</span>
        </div>
      }
      size="xl"
      modalId="orgs-deletion-queue-modal"
    >
      <div className="p-2 space-y-4">
        {/* Top Summary Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase">{t("Total Disconnected")}</p>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{totalCount}</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <FiClock size={16} />
            </div>
          </div>

          <div className="p-3 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-red-600 uppercase">{t("Scheduled for Deletion")}</p>
              <p className="text-xl font-bold text-red-700 dark:text-red-400">{pendingCount}</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center font-bold">
              <FiAlertTriangle size={16} />
            </div>
          </div>

          <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-emerald-600 uppercase">{t("Deletion Stopped (Protected)")}</p>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{stoppedCount}</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <FiShield size={16} />
            </div>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="relative flex items-center w-full sm:w-[280px]">
            <Input
              type="text"
              placeholder={t("Search account, organization, email...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="shadcn-search-input pr-8 text-xs h-8"
            />
            {search ? (
              <MdOutlineClose
                onClick={() => setSearch("")}
                className="absolute right-2.5 cursor-pointer opacity-70 hover:opacity-100 text-base"
              />
            ) : (
              <FiSearch className="absolute right-2.5 opacity-40 text-sm pointer-events-none" />
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchQueue}
            disabled={loading}
            className="h-8 text-xs flex items-center gap-1.5"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} size={12} />
            {t("Refresh")}
          </Button>
        </div>

        {/* Table of Disconnected Accounts */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto max-h-[460px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-800/80 sticky top-0 z-10 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-2.5 px-3">{t("Account / Company")}</th>
                <th className="py-2.5 px-3">{t("Organization & Owner")}</th>
                <th className="py-2.5 px-3">{t("Type")}</th>
                <th className="py-2.5 px-3">{t("Disconnected")}</th>
                <th className="py-2.5 px-3">{t("Days Left")}</th>
                <th className="py-2.5 px-3">{t("Reminders Sent")}</th>
                <th className="py-2.5 px-3">{t("Deletion Status")}</th>
                <th className="py-2.5 px-3 text-center">{t("Admin Action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
              {loading && queue.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    <i className="fa fa-spinner fa-spin mr-2" />
                    {t("Loading accounts queue...")}
                  </td>
                </tr>
              ) : filteredQueue.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    {search ? t("No accounts matched your search.") : t("No disconnected accounts found in the deletion queue.")}
                  </td>
                </tr>
              ) : (
                filteredQueue.map((row) => {
                  const isStopped = row.isDataDeletionStopped;
                  const isActionLoading = actionLoadingId === row._id;

                  return (
                    <tr
                      key={row._id}
                      className={
                        isStopped
                          ? "bg-emerald-50/30 dark:bg-emerald-950/10 hover:bg-emerald-50/50"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }
                    >
                      <td className="py-2.5 px-3 font-semibold">
                        <div className="flex flex-col">
                          <span>{row.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">ID: {row._id}</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900 dark:text-slate-100">{row.organizationName}</span>
                          <span className="text-[11px] text-slate-500">{row.ownerName} &lt;{row.ownerEmail}&gt;</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        {row.type === "ads" ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                            Ads
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            SP-API
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                        {formatDate(row.disconnectedAt)}
                      </td>

                      <td className="py-2.5 px-3">
                        {isStopped ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 inline-flex items-center gap-1">
                            <FiShield size={11} /> {t("Protected")}
                          </span>
                        ) : row.daysLeft <= 1 ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 inline-flex items-center gap-1 animate-pulse">
                            🚨 {row.daysLeft} {t("day left")}
                          </span>
                        ) : row.daysLeft <= 15 ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 inline-flex items-center gap-1">
                            ⚠️ {row.daysLeft} {t("days left")}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {row.daysLeft} {t("days left")}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-0.5 text-[10px]">
                          <span className={row.deletionReminder15SentAt ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-slate-400"}>
                            15d: {row.deletionReminder15SentAt ? `Sent ${formatDate(row.deletionReminder15SentAt)}` : t("Pending")}
                          </span>
                          <span className={row.deletionReminder1SentAt ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-400"}>
                            1d: {row.deletionReminder1SentAt ? `Sent ${formatDate(row.deletionReminder1SentAt)}` : t("Pending")}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        {isStopped ? (
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <FiCheckCircle size={12} /> {t("Deletion Stopped")}
                            </span>
                            {row.dataDeletionStoppedBy && (
                              <span className="text-[10px] text-slate-400">by {row.dataDeletionStoppedBy}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <FiClock size={12} /> {t("Pending Purge")}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <Button
                          type="button"
                          size="sm"
                          disabled={isActionLoading}
                          onClick={() => handleToggle(row)}
                          className={
                            isStopped
                              ? "h-7 px-2.5 text-[11px] font-semibold bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200"
                              : "h-7 px-2.5 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs"
                          }
                        >
                          {isActionLoading ? (
                            <i className="fa fa-spinner fa-spin mr-1" />
                          ) : isStopped ? (
                            t("Resume Deletion")
                          ) : (
                            <span className="flex items-center gap-1">
                              <FiShield size={12} /> {t("Stop Deletion")}
                            </span>
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Note */}
        <div className="pt-2 text-right">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            className="h-8 px-4 text-xs font-semibold"
          >
            {t("Close")}
          </Button>
        </div>
      </div>
    </CustomModal>
  );
};

export default DeletionQueueModal;
