import React, { useState, useEffect, useContext, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { ProfileContext } from '../../../helper/usecontext/useContext';
import { ApiGetAmazonProfiles, ApiSaveAmazonProfiles, ApiGetProfileSyncDetails } from '../../../api-wrapper/ApiAdsConfig';
import Toast from '../../../common/helper/toast/Toast';
import SynchronizationModal from './SynchronizationModal';
import { AppTooltip } from '../../../components/ui/AppTooltip';
import { ApiSelectAccount } from '../../../api-wrapper/campaign/ApiCampaign';

const ManageProfilesModal = ({ open, onClose, configId, sellerId = null, isOAuthFlow = false, onSuccess }) => {
  const { t } = useTranslation();
  const { profileLimit, totalOrgProfiles, setRefreshSideBar, setProfileList } = useContext(ProfileContext);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [syncSetupProfile, setSyncSetupProfile] = useState(null);
  const [syncStatusMap, setSyncStatusMap] = useState({});
  const syncConfirmedRef = useRef(false);

  const activeSellerId = sellerId || localStorage.getItem("appstore_seller_id") || sessionStorage.getItem("appstore_seller_id");

  useEffect(() => {
    if (open && configId) {
      fetchProfiles();
    }
  }, [open, configId]);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const [res, syncRes] = await Promise.all([
        ApiGetAmazonProfiles({ configId }),
        ApiGetProfileSyncDetails(configId).catch(() => null)
      ]);
      if (res?.isSuccess) {
        setProfiles(res.data || []);
        const initialSelected = new Set();
        (res.data || []).forEach(p => {
          if (p.isStored) {
            initialSelected.add(p.profileId.toString());
          }
        });
        setSelectedIds(initialSelected);
      } else {
        Toast.error(res?.message || t('Failed to fetch profiles'));
      }

      if (syncRes?.isSuccess && Array.isArray(syncRes?.data)) {
        const map = {};
        syncRes.data.forEach(r => {
          if (r.requestStatus === "IN_PROGRESS") {
            map[r.profileId.toString()] = "IN_PROGRESS";
          }
        });
        setSyncStatusMap(map);
      }
    } catch (err) {
      Toast.error(t('An error occurred while fetching profiles'));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckboxChange = (id, checked, isStored) => {
    if (isStored) return;
    if (syncStatusMap[id] === "IN_PROGRESS") {
      Toast.error(t("Synchronization is currently in progress. Profile settings cannot be changed until sync completes."));
      return;
    }

    const currentStored = profiles.filter(p => p.isStored).length;
    const currentNewSelected = selectedIds.size - currentStored;

    if (checked && totalOrgProfiles + currentNewSelected + 1 > profileLimit) {
      Toast.error(t("Profile limit exceeded! You can only store up to {{limit}} profiles across your organization.", { limit: profileLimit }));
      return;
    }

    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
      const selectedProfile = profiles.find(p => p.profileId.toString() === id);
      if (selectedProfile) {
        syncConfirmedRef.current = false;
        setSyncSetupProfile(selectedProfile);
      }
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const handleSyncModalClose = () => {
    if (!syncConfirmedRef.current && syncSetupProfile) {
      const pIdStr = syncSetupProfile.profileId.toString();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(pIdStr);
        return next;
      });
    }
    syncConfirmedRef.current = false;
    setSyncSetupProfile(null);
  };

  const handleSave = async () => {
    const selectedProfilesData = profiles.filter(p => !p.isStored && selectedIds.has(p.profileId.toString()));
    const targetSellerId = isOAuthFlow ? (activeSellerId || localStorage.getItem("appstore_seller_id") || sessionStorage.getItem("appstore_seller_id") || configId) : null;

    if (selectedProfilesData.length === 0) {
      if (onSuccess) onSuccess(targetSellerId);
      onClose(targetSellerId);
      return;
    }

    setSaving(true);
    try {
      const res = await ApiSaveAmazonProfiles({ configId, selectedProfiles: selectedProfilesData });
      if (res?.isSuccess) {
        Toast.success(res.message || t('Profiles saved successfully'));
        setRefreshSideBar(prev => prev + 1);
        ApiSelectAccount().then((res) => {
          if (res?.isSuccess && res.data) {
            setProfileList(res.data);
          }
        }).catch(() => { });

        if (onSuccess) onSuccess(targetSellerId);
        onClose(targetSellerId);
      } else {
        Toast.error(res?.message || t('Failed to save profiles'));
      }
    } catch (err) {
      Toast.error(t('An error occurred while saving profiles'));
    } finally {
      setSaving(false);
    }
  };

  const storedCount = profiles.filter(p => p.isStored).length;
  const newSelectedCount = Math.max(0, selectedIds.size - storedCount);
  const storedProfilesOtherConfigs = Math.max(0, (totalOrgProfiles || 0) - storedCount);
  const totalAfterSave = storedProfilesOtherConfigs + selectedIds.size;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[700px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-0 shadow-2xl overflow-hidden">
        <DialogHeader className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <DialogTitle className="text-xl font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
              <i className="fa fa-amazon text-blue-600 dark:text-blue-400"></i>
            </div>
            {t('Manage Amazon Profiles')}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 pt-1.5">
            {t('Select the profiles you want to sync from your connected Amazon account. Your organization can store a total of')} <span className="font-semibold text-slate-700 dark:text-slate-300">{profileLimit}</span> {t('profiles.')}
          </DialogDescription>
        </DialogHeader>

        <div className="p-5">
          <div className="flex items-center justify-between mb-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700/50">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {t('Profiles Used:')} <span className="font-bold text-slate-800 dark:text-slate-200">{totalAfterSave}</span> / {profileLimit}
            </div>
            <div className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
              {t('{{count}} new profile(s) selected', { count: newSelectedCount })}
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <i className="fa fa-circle-o-notch fa-spin text-3xl mb-3 text-blue-500"></i>
                  <p>{t('Fetching profiles from Amazon...')}</p>
                </div>
              ) : profiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <i className="fa fa-exclamation-circle text-3xl mb-3 text-slate-400"></i>
                  <p>{t('No profiles found for this account.')}</p>
                </div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10">
                    <tr>
                      <th scope="col" className="px-4 py-3 w-[50px]"></th>
                      <th scope="col" className="px-4 py-3 font-semibold">{t('Profile Name')}</th>
                      <th scope="col" className="px-4 py-3 font-semibold">{t('Country')}</th>
                      <th scope="col" className="px-4 py-3 font-semibold">{t('Status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((p, idx) => {
                      const pIdStr = p.profileId.toString();
                      const checked = selectedIds.has(pIdStr);
                      const isInProgress = syncStatusMap[pIdStr] === "IN_PROGRESS";
                      const isDisabled = p.isStored || isInProgress;
                      const tooltipMsg = isInProgress
                        ? t("Synchronization in progress. Cannot modify settings.")
                        : p.isStored
                        ? t("Profile is already stored.")
                        : "";
                      return (
                        <tr key={idx} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <AppTooltip text={tooltipMsg}>
                              <label className={`relative inline-flex items-center ${isDisabled ? "cursor-not-allowed opacity-75" : "cursor-pointer"} select-none`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={isDisabled}
                                  onChange={(e) => handleCheckboxChange(pIdStr, e.target.checked, p.isStored)}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:after:border-slate-600 peer-checked:bg-sky-500"></div>
                              </label>
                            </AppTooltip>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">{p.name || '-'}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                              {p.countryCode}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {p.isDisconnected || p.disconnectedAt ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                <i className="fa fa-exclamation-triangle"></i> {t('Disconnected')}
                              </span>
                            ) : p.isStored ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                <i className="fa fa-check-circle"></i> {t('Stored')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
                                {t('Not Stored')}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="!bg-white !border-slate-300 !text-slate-700 hover:!bg-slate-50 dark:!bg-transparent dark:!border-slate-700 dark:!text-slate-300 dark:hover:!bg-slate-800"
          >
            {t('Cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || newSelectedCount === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white border-0 shadow-sm"
          >
            {saving ? (
              <><i className="fa fa-circle-o-notch fa-spin mr-2"></i> {t('Saving...')}</>
            ) : (
              t('Save Selected Profiles')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Synchronization Modal rendered on top when a profile is toggled ON */}
      {syncSetupProfile && (
        <SynchronizationModal
          show={!!syncSetupProfile}
          onHide={handleSyncModalClose}
          onSuccess={() => {
            syncConfirmedRef.current = true;
          }}
          profile={syncSetupProfile}
          configId={configId}
          type="ads"
          isDark={document.documentElement.getAttribute("data-theme") === "dark"}
        />
      )}
    </Dialog>
  );
};

export default ManageProfilesModal;
