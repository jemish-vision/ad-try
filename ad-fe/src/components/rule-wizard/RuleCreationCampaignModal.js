import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApigetCampaign } from '../../api-wrapper/budgetRule/ApiBudgetRule';
import { CustomModal } from '../../helper/modal/CustomModal';
import RuleSearch from '../../layout/component/search/RuleSearch';
import Toast from '../../common/helper/toast/Toast';
import { assignCampaignsToDraft } from '../../utility/ruleCreationAssignment';

// A rule remains a local draft until campaign selection and Save both succeed.
export default function RuleCreationCampaignModal({ draft, onCancel, createRule, onCreated, allRules = [] }) {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const savingRef = useRef(false);
  const emptyIds = useRef([]);

  useEffect(() => {
    if (!draft) return undefined;
    let active = true;
    setCampaigns([]);
    setSelectedIds([]);
    setSelectAll(false);
    setLoadError('');
    setLoading(true);
    ApigetCampaign({ profileId: draft.profileId })
      .then((res) => {
        if (!active) return;
        if (!res?.isSuccess || !Array.isArray(res.data)) {
          throw new Error(res?.message || 'Unable to load campaigns');
        }
        setCampaigns(res.data);
      })
      .catch((error) => {
        if (active) setLoadError(error?.message || 'Unable to load campaigns');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [draft, retry]);

  const save = async () => {
    if (savingRef.current || loading || loadError) return;
    const payload = assignCampaignsToDraft(draft, selectedIds, campaigns);
    if (!payload) {
      Toast.error(t('Select at least one campaign to create this rule.'));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await createRule(payload);
      if (!result?.isSuccess) throw new Error(result?.message || 'Unable to create rule');
      onCreated(result);
    } catch (error) {
      Toast.error(error?.message || t('Unable to create rule'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <CustomModal
      show={Boolean(draft)}
      onHide={() => { if (!savingRef.current) onCancel(); }}
      title={t('assignCampaign')}
      subtitle={t('Select at least one campaign to create this rule.')}
      icon="campaign"
      iconVariant="primary"
      size="lg"
      style={{ zIndex: 10001 }}
      modalId="new-rule-assign-campaign-modal"
      closeOnBackdrop={!saving}
      actions={[
        { label: t('Cancel'), cancel: true, icon: 'close', disabled: saving, onClick: onCancel },
        { label: saving ? t('Submitting...') : t('save'), variant: 'primary', icon: 'save', disabled: saving || loading || Boolean(loadError) || !selectedIds.length, onClick: save },
      ]}
    >
      {loading && <p role="status">{t('Loading campaigns...')}</p>}
      {loadError && <div role="alert"><p>{t(loadError)}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>{t('Retry')}</button></div>}
      {!loading && !loadError && !campaigns.length && <p>{t('No campaigns available. Create or select a profile with campaigns first.')}</p>}
      {!loading && !loadError && campaigns.length > 0 && (
        <RuleSearch campaignList={campaigns} allIds={selectedIds} setAllIds={setSelectedIds}
          campaignIds={emptyIds.current} selectAllCheck={selectAll} setselectAllCheck={setSelectAll}
          allRules={allRules} currentRule={draft} />
      )}
    </CustomModal>
  );
}
