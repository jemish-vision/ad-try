import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { MdOutlineClose } from "react-icons/md";
import {
  FiSearch,
  FiShield,
  FiClock,
  FiCheckCircle,
  FiRefreshCw,
} from "react-icons/fi";
import {
  ApiGetOrgDeletionProfiles,
  ApiToggleProfileDataDeletion,
} from "../../../api-wrapper/ApiOrganization";
import Toast from "../../../common/helper/toast/Toast";

const OrgProfilesDeletionModal = ({ open, setOpen, organization, onStatusChange }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedToKeep, setSelectedToKeep] = useState({});
  const [initialSelected, setInitialSelected] = useState({});

  const fetchProfiles = async () => {
    if (!organization?._id) return;
    setLoading(true);
    try {
      const res = await ApiGetOrgDeletionProfiles(organization._id);
      if (res && res.isSuccess && res.data) {
        const list = res.data.profiles || [];
        setProfiles(list);

        const keepMap = {};
        list.forEach((p) => {
          keepMap[p._id] = Boolean(p.isDataDeletionStopped);
        });
        setSelectedToKeep(keepMap);
        setInitialSelected(keepMap);
      } else {
        setProfiles([]);
        setSelectedToKeep({});
        setInitialSelected({});
      }
    } catch (err) {
      console.error("Error fetching org deletion profiles:", err);
      Toast.error(t("Failed to load profiles"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && organization?._id) {
      fetchProfiles();
      setSearch("");
    }
  }, [open, organization?._id]);

  const toggleSelectProfile = (profileId) => {
    setSelectedToKeep((prev) => ({
      ...prev,
      [profileId]: !prev[profileId],
    }));
  };

  const hasChanges = React.useMemo(() => {
    return profiles.some((p) => Boolean(selectedToKeep[p._id]) !== Boolean(initialSelected[p._id]));
  }, [profiles, selectedToKeep, initialSelected]);

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      const updates = profiles.map((p) => ({
        id: p._id,
        profileDbId: p.type === "ads" ? p._id : undefined,
        sellerConfigId: p.type === "sp" ? p._id : undefined,
        profileId: p.profileId,
        configId: p.configId,
        type: p.type,
        isDataDeletionStopped: Boolean(selectedToKeep[p._id]),
      }));

      const res = await ApiToggleProfileDataDeletion({
        organizationId: organization._id,
        updates,
      });

      if (res && res.isSuccess) {
        Toast.success(res.message || t("Profile deletion settings updated successfully"));
        await fetchProfiles();
        if (onStatusChange) onStatusChange();
      } else {
        Toast.error(res?.message || t("Failed to save changes"));
      }
    } catch (err) {
      console.error("Error saving profile deletion settings:", err);
      Toast.error(t("Failed to save changes"));
    } finally {
      setSaving(false);
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

  const filteredProfiles = profiles.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.profileId && String(p.profileId).includes(q)) ||
      (p.sellerId && String(p.sellerId).toLowerCase().includes(q)) ||
      (p.typeName && p.typeName.toLowerCase().includes(q)) ||
      (p.countryCode && p.countryCode.toLowerCase().includes(q))
    );
  });

  const protectedCount = profiles.filter((p) => selectedToKeep[p._id]).length;

  return (
    <CustomModal
      show={open}
      onHide={() => setOpen(false)}
      title={`${t("Profiles Scheduled for Deletion —")} ${organization?.organizationName || ""}`}
      subtitle={t("Select the profiles you do NOT want to delete (Keep Data) to protect them from automated cleanup.")}
      size="lg"
      modalId="orgs-profiles-deletion-modal"
    >
      <div className="p-1 space-y-3">
        {/* Top bar with count, refresh & search */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
            <span>
              {t("Profiles to delete:")} <strong className="text-slate-800 dark:text-slate-100">{profiles.length}</strong>
            </span>
            {protectedCount > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <FiShield size={12} />
                {protectedCount} {t("protected (will not delete)")}
              </span>
            )}
            <button
              onClick={fetchProfiles}
              disabled={loading}
              className="text-slate-400 hover:text-primary-600 cursor-pointer p-0.5 ml-1"
              title={t("Refresh")}
            >
              <FiRefreshCw className={loading ? "animate-spin" : ""} size={12} />
            </button>
          </div>

          {profiles.length > 3 && (
            <div className="relative w-48">
              <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search...")}
                className="pl-7 pr-7 text-xs h-7"
              />
              {search && (
                <MdOutlineClose
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-600 text-xs"
                />
              )}
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <FiRefreshCw className="animate-spin text-2xl mb-2 text-primary-500" />
            <p className="text-xs">{t("Loading deletion profiles...")}</p>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
              <FiCheckCircle size={20} />
            </div>
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {t("No profiles are scheduled for deletion.")}
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {t("All accounts in this organization are active or already protected.")}
            </p>
          </div>
        ) : (
          <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
            {filteredProfiles.map((p) => {
              const isProtected = Boolean(selectedToKeep[p._id]);
              return (
                <div
                  key={p._id}
                  className={`flex flex-wrap items-center justify-between p-3 rounded-lg border transition-colors gap-3 ${
                    isProtected
                      ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100/60 dark:hover:bg-slate-800/60"
                  }`}
                >
                  {/* Left: Checkbox & Profile Info */}
                  <div className="flex items-start gap-3">
                    <label className="flex items-center pt-0.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isProtected}
                        onChange={() => toggleSelectProfile(p._id)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                      />
                    </label>

                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                          {p.name || `Profile ${p.profileId}`}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            p.type === "ads"
                              ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
                              : "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300"
                          }`}
                        >
                          {p.type === "ads" ? t("Amazon Ads") : t("Seller Central SP-API")}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-3">
                        <span className="font-mono">
                          {p.type === "ads" ? `ID: ${p.profileId || "-"}` : `Seller ID: ${p.sellerId || p.profileId || "-"}`}
                        </span>
                        {p.countryCode && p.countryCode !== "-" && (
                          <span>Marketplace: {p.countryCode}</span>
                        )}
                        {p.disconnectedAt && (
                          <span>Disconnected: {formatDate(p.disconnectedAt)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Deletion Status Badge */}
                  <div>
                    {isProtected ? (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 flex items-center gap-1">
                        <FiShield size={12} />
                        {t("Don't Delete (Keep Data)")}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300 flex items-center gap-1">
                        <FiClock size={12} />
                        {p.daysLeft !== null && p.daysLeft > 0
                          ? t(`Deletes in ${p.daysLeft} days`)
                          : t("Expired (Pending cleanup)")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800 mt-3">
          <div className="text-xs text-slate-500">
            {hasChanges && (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                ● {t("Unsaved changes")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="h-8 px-4 text-xs font-semibold"
            >
              {t("Close")}
            </Button>
            <Button
              type="button"
              disabled={saving || !hasChanges}
              onClick={handleSaveChanges}
              className={`h-8 px-4 text-xs font-semibold ${
                hasChanges ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
              }`}
            >
              {saving ? (
                <div className="flex items-center gap-1">
                  <FiRefreshCw className="animate-spin" size={12} />
                  <span>{t("Saving...")}</span>
                </div>
              ) : (
                <span>{t("Save Changes")}</span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </CustomModal>
  );
};

export default OrgProfilesDeletionModal;
