import React, { useState, useContext, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiAddRules, ApiUpdateRules, ApiGetRuleById } from '../../../api-wrapper/recommendation/ApiRecommendation';
import { ProfileContext } from '../../../helper/usecontext/useContext';
import { handleLoader, Toast, useDispatch } from '../../../helper/links/Link';
import { AiOutlinePlus } from 'react-icons/ai';
import { AiFillDelete } from 'react-icons/ai';
import { buildRecommendationQuery } from '../../../utility/createQuery';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { RuleWizardChoosePath, RuleWizardTemplates } from '../../../components/rule-wizard/RuleWizardSteps';
import { RecommendationRuleTemplates } from './recommendationRuleTemplate';
import RecommendationCampaignModal from './RecommendationCampaignModal';
import { FiLayers, FiInfo } from 'react-icons/fi';
import { getCurrencySymbol } from '../../../helper/currencyCode/CurrencyCode';


// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DATE_FILTER_OPTIONS = [
  { value: 'TODAY', label: 'Today' },
  { value: 'YESTERDAY', label: 'Yesterday' },
  { value: 'LAST_7_DAYS', label: 'Last 7 days' },
  { value: 'THIS_WEEK', label: 'This week' },
  { value: 'LAST_WEEK', label: 'Last week' },
  { value: 'LAST_30_DAYS', label: 'Last 30 days' },
  { value: 'THIS_MONTH', label: 'This month' },
  { value: 'LAST_MONTH', label: 'Last month' },
  { value: 'YEAR_TO_DATE', label: 'Year to date' },
  { value: 'LIFETIME', label: 'Lifetime' },
];

const GRID_NAMES = [
  { value: 'Campaign', label: 'Campaign' },
  { value: 'Placement', label: 'Placement' },
  { value: 'Targeting', label: 'Targeting' },
  { value: 'Search Term', label: 'Search Term' },
];

const CONDITION_METRICS = [
  { value: 'Impressions', label: 'Impressions' },
  { value: 'Clicks', label: 'Clicks' },
  { value: 'Orders', label: 'Orders' },
  { value: 'Sales', label: 'Sales' },
  { value: 'ACOS', label: 'ACOS' },
  { value: 'ROAS', label: 'ROAS' },
  { value: 'Spend', label: 'Spend' },
  { value: 'CPC', label: 'CPC' },
  { value: 'CTR', label: 'CTR' },
  { value: 'CVR', label: 'CVR' },
];

const getConditionMetrics = (grid) => {
  if (!grid || grid === 'Campaign' || grid === 'Targeting' || grid === 'Placement') {
    return [
      ...CONDITION_METRICS,
      { value: 'Out of Budget', label: 'Out of Budget' },
    ];
  }
  return CONDITION_METRICS;
};

const CONDITION_OPERATORS = [
  { value: 'LESS_THAN', label: 'Less Than' },
  { value: 'LESS_THAN_OR_EQUAL_TO', label: 'Less Than or Equal To' },
  { value: 'GREATER_THAN_OR_EQUAL_TO', label: 'Greater Than or Equal To' },
  { value: 'GREATER_THAN', label: 'Greater Than' },
  { value: 'EQUAL_TO', label: 'Equal To' },
];

// Actions per gridName
const ACTION_OPTIONS = {
  Campaign: [
    { value: 'SetBudget', label: 'Set Budget' },
    { value: 'IncreaseBudget', label: 'Increase Budget' },
    { value: 'DecreaseBudget', label: 'Decrease Budget' },
    { value: 'CampaignEnable', label: 'Campaign Enable' },
    { value: 'CampaignPause', label: 'Campaign Pause' },
  ],
  Placement: [
    { value: 'IncreaseBid', label: 'Increase Bid' },
    { value: 'DecreaseBid', label: 'Decrease Bid' },
    { value: 'SetBid', label: 'Set Bid' },
  ],
  Targeting: [
    { value: 'SetBid', label: 'Set Bid' },
    { value: 'IncreaseBid', label: 'Increase Bid' },
    { value: 'DecreaseBid', label: 'Decrease Bid' },
    { value: 'EnableTargeting', label: 'Enable Targeting' },
    { value: 'PauseTargeting', label: 'Pause Targeting' },
  ],
  'Search Term': [
    { value: 'AddAsTargeting', label: 'Add as Targeting' },
    { value: 'AddAsNegativeTargeting', label: 'Add as Negative Targeting' },
  ],
};

const PLACEMENT_OPTIONS = [
  { value: 'Top of Search', label: 'Top of Search' },
  { value: 'Rest of Search', label: 'Rest of Search' },
  { value: 'Product pages', label: 'Product Page' },
];

const MATCH_TYPE_OPTIONS = [
  { value: 'Exact', label: 'Exact' },
  { value: 'Phrase', label: 'Phrase' },
];

const VALUE_TYPE_OPTIONS = [
  { value: 'Number', label: 'Number' },
  { value: 'Percentage', label: 'Percentage' },
];

// Actions that do NOT need a numeric value (toggle-style)
const NO_VALUE_ACTIONS = ['CampaignEnable', 'CampaignPause', 'EnableTargeting', 'PauseTargeting'];

// Actions that need placement sub-field
const PLACEMENT_ACTIONS = ['IncreaseBid', 'DecreaseBid', 'SetBid'];

// Grids that allow only one action
const SINGLE_ACTION_GRIDS = ['Campaign', 'Targeting'];

// Out of Budget look-back period options
const OOB_PERIOD_OPTIONS = [
  { value: 'LAST_7_DAYS', label: 'Last 7 Days' },
  { value: 'LAST_14_DAYS', label: 'Last 14 Days' },
  { value: 'LAST_30_DAYS', label: 'Last 30 Days' },
  { value: 'CUSTOM', label: 'Custom' },
];

// Default empty condition
const emptyCondition = () => ({
  conditionType: '',
  conditionOperator: '',
  conditionValue: '',
  oobPeriod: '',
  oobDays: '',
});

// Default empty action
const emptyAction = () => ({
  actionName: '',
  actionValue: '',
  actionValueType: '',
  placementType: '',   // only for Placement grid
  matchType: '',       // only for Search Term grid
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function AddRecommendationRule({
  setaddModalFlag,
  editId,
  setEditId,
  getRule,
  editData,
  setEditData,
  allRulesSchedule = [],
}) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { profileId, currencyCode } = useContext(ProfileContext);

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);



  // ── Form state ──────────────────────────────────────────────────────────────
  const [loadingEditData, setLoadingEditData] = useState(Boolean(editId));
  const [submitting, setSubmitting] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [reportDate, setReportDate] = useState('');
  const [gridName, setGridName] = useState('');
  const [conditions, setConditions] = useState([emptyCondition()]);
  const [actions, setActions] = useState([emptyAction()]);
  const [campaignSelectionType, setCampaignSelectionType] = useState('ALL');
  const [campaignIds, setCampaignIds] = useState({ SP: [], SB: [], SD: [] });
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [error, setError] = useState({});

  const [step, setStep] = useState(editId ? 'form' : 'choose-path');

  const applyTemplate = (template) => {
    setRuleName(template.data.ruleName);
    setReportDate(template.data.reportDate);
    setGridName(template.data.gridName);

    if (template.data.conditions && template.data.conditions.length > 0) {
      setConditions(template.data.conditions);
    } else {
      setConditions([emptyCondition()]);
    }

    if (template.data.actions && template.data.actions.length > 0) {
      setActions(template.data.actions);
    } else {
      setActions([emptyAction()]);
    }

    setCampaignSelectionType('ALL');
    setCampaignIds({ SP: [], SB: [], SD: [] });

    setStep('form');
  };

  const removeError = (field, index, subField) => {
    if (!error) return;
    let newError = { ...error };
    if (index !== undefined && subField) {
      if (newError[field]?.[index]?.[subField]) {
        delete newError[field][index][subField];
      }
    } else {
      if (newError[field]) {
        delete newError[field];
      }
    }
    setError(newError);
  };

  // ── Load edit data ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (editId) {
      setLoadingEditData(true);
      ApiGetRuleById(editId)
        .then((res) => {
          if (res.isSuccess) {
            const d = res.data;
            setRuleName(d.ruleName || '');
            setReportDate(d.reportDate || '');
            setGridName(d.gridName || '');
            setConditions(d.conditions?.length ? d.conditions : [emptyCondition()]);
            setActions(d.actions?.length ? d.actions : [emptyAction()]);
            setCampaignSelectionType(d.campaignSelectionType || 'ALL');
            setCampaignIds(d.campaignIds || { SP: [], SB: [], SD: [] });
          } else {
            Toast.error(res.message);
          }
        })
        .catch((err) => {
          Toast.error(err);
        })
        .finally(() => {
          setLoadingEditData(false);
        });
    } else {
      setLoadingEditData(false);
    }
  }, [editId]);

  // ── Reset on gridName change (clear actions) ─────────────────────────────────
  const handleGridNameChange = (val) => {
    setGridName(val);
    setActions([emptyAction()]);
    if (val && val !== 'Campaign' && val !== 'Targeting' && val !== 'Placement') {
      setConditions((prev) => {
        const filtered = prev.filter(c => c.conditionType !== 'Out of Budget' && c.conditionType !== 'OutOfBudget');
        return filtered.length > 0 ? filtered : [emptyCondition()];
      });
    }
    setError({});
  };

  const hasOutOfBudget = useMemo(() => {
    return conditions.some(c => c?.conditionType === 'Out of Budget' || c?.conditionType === 'OutOfBudget');
  }, [conditions]);

  // ── Condition handlers ───────────────────────────────────────────────────────
  const handleConditionChange = (index, field, value) => {
    setConditions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'conditionType') {
        updated[index].conditionOperator = '';
        updated[index].conditionValue = '';
        updated[index].oobPeriod = '';
        updated[index].oobDays = '';
      }
      if (field === 'oobPeriod' && value !== 'CUSTOM') {
        updated[index].oobDays = '';
      }
      return updated;
    });

    if (field === 'conditionType' && (value === 'Out of Budget' || value === 'OutOfBudget')) {
      if (!gridName) {
        setGridName('Campaign');
      }
      // Clear action errors when Out of Budget is selected since actions are not required
      if (error?.actions) {
        setError((prev) => {
          const nextErr = { ...prev };
          delete nextErr.actions;
          return nextErr;
        });
      }
    }

    removeError('conditions', index, field);
  };

  const addCondition = () => setConditions((prev) => [...prev, emptyCondition()]);

  const removeCondition = (index) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
    // Remove errors for removed condition
    if (error?.conditions) {
      const newConditions = [...error.conditions];
      newConditions.splice(index, 1);
      setError({ ...error, conditions: newConditions });
    }
  };

  // ── Action handlers ──────────────────────────────────────────────────────────
  const handleActionChange = (index, field, value) => {
    setActions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'actionName') {
        updated[index].actionValue = '';
        updated[index].actionValueType = '';
        updated[index].placementType = '';
        updated[index].matchType = '';
      }
      if (field === 'actionValueType') {
        updated[index].actionValue = '';
      }
      return updated;
    });
    removeError('actions', index, field);
  };

  const addAction = () => {
    if (SINGLE_ACTION_GRIDS.includes(gridName)) {
      return;
    }
    setActions((prev) => [...prev, emptyAction()]);
  };

  const removeAction = (index) => {
    if (SINGLE_ACTION_GRIDS.includes(gridName) && actions.length === 1) {
      return;
    }
    setActions((prev) => prev.filter((_, i) => i !== index));
    // Remove errors for removed action
    if (error?.actions?.details) {
      const newActions = [...error.actions.details];
      newActions.splice(index, 1);
      setError({ ...error, actions: { ...error.actions, details: newActions } });
    }
  };

  // ── Percentage guard ─────────────────────────────────────────────────────────
  const handlePercentageInput = (raw, actionValueType) => {
    if (actionValueType === 'Percentage') {
      const n = parseFloat(raw);
      if (!isNaN(n) && n >= 0 && n <= 100) return raw;
      return '';
    }
    return raw;
  };

  // ── Validation ───────────────────────────────────────────────────────────────
  const validate = (sendData) => {
    let flag = false;
    const err = {};

    if (!sendData.ruleName.trim()) {
      flag = true;
      err.ruleName = 'Recommendation name is required.';
    }

    if (!sendData.reportDate) {
      flag = true;
      err.reportDate = 'Date filter is required.';
    }

    if (!sendData.gridName) {
      flag = true;
      err.gridName = 'Affected parameter is required.';
    }

    // Validate at least one action exists ONLY if Out of Budget condition is not present
    if (!hasOutOfBudget) {
      const validActions = sendData.actions.filter(action => action.actionName);
      if (validActions.length === 0) {
        flag = true;
        err.actions = { general: 'At least one action is required.' };
      }
    }

    // Validate conditions
    const conditionErrs = [];
    sendData.conditions.forEach((c, i) => {
      const e = {};
      if (!c.conditionType) e.conditionType = 'Metric is required.';
      const isOob = c.conditionType === 'Out of Budget' || c.conditionType === 'OutOfBudget';
      if (!isOob) {
        if (!c.conditionOperator) e.conditionOperator = 'Operator is required.';
        if (c.conditionValue === '' || c.conditionValue === null || c.conditionValue === undefined)
          e.conditionValue = 'Value is required.';
      } else {
        if (!c.oobPeriod) e.oobPeriod = 'Period is required.';
        if (c.oobPeriod === 'CUSTOM') {
          const d = Number(c.oobDays);
          if (!Number.isInteger(d) || d < 1 || d > 365) e.oobDays = 'Enter days between 1 and 365.';
        }
      }
      if (Object.keys(e).length) { conditionErrs[i] = e; flag = true; }
    });
    if (conditionErrs.length) err.conditions = conditionErrs;

    // Validate actions ONLY if Out of Budget condition is not present
    if (!hasOutOfBudget) {
      const actionErrs = [];
      sendData.actions.forEach((a, i) => {
        const e = {};
        if (!a.actionName) {
          e.actionName = 'Action is required.';
          flag = true;
        } else {
          const needsValue = !NO_VALUE_ACTIONS.includes(a.actionName);
          const needsPlacement = sendData.gridName === 'Placement';
          const isSearchTerm = sendData.gridName === 'Search Term';

          if (needsValue && !isSearchTerm) {
            if (!a.actionValueType) { e.actionValueType = 'Value type is required.'; flag = true; }
            if (a.actionValue === '' || a.actionValue === null || a.actionValue === undefined) {
              e.actionValue = 'Value is required.'; flag = true;
            }
          }

          if (needsPlacement && PLACEMENT_ACTIONS.includes(a.actionName) && !a.placementType) {
            e.placementType = 'Placement type is required.'; flag = true;
          }

          if (isSearchTerm) {
            if (!a.matchType) {
              e.matchType = 'Match type is required.';
              flag = true;
            }
          }
        }
        if (Object.keys(e).length) actionErrs[i] = e;
      });
      if (actionErrs.length) err.actions = { ...err.actions, details: actionErrs };
    }

    return { flag, err };
  };

  // ── Reset form ───────────────────────────────────────────────────────────────
  const resetForm = () => {
    setRuleName('');
    setReportDate('');
    setGridName('');
    setConditions([emptyCondition()]);
    setActions([emptyAction()]);
    setCampaignSelectionType('ALL');
    setCampaignIds({ SP: [], SB: [], SD: [] });
    setShowCampaignModal(false);
    setError({});
  };

  const handleCancel = () => {
    setEditId(null);
    setEditData(null);
    resetForm();
    setaddModalFlag(false);
  };

  // ── Submit Step 1: Validate and open Campaign Selection popup ─────────────────
  const submitHandler = (e) => {
    e.preventDefault();

    const query = buildRecommendationQuery(conditions);

    const sendData = {
      ruleName,
      reportDate,
      gridName,
      profileId: profileId?.value,
      conditions,
      actions: hasOutOfBudget ? [] : actions.filter(action => action.actionName),
      query,
      campaignSelectionType,
      campaignIds,
    };

    const { flag, err } = validate(sendData);
    setError(err);
    if (flag) return;

    // Open Campaign Selection Modal as next step
    setShowCampaignModal(true);
  };

  // ── Final Save with Campaign Selection ───────────────────────────────────────
  const handleSaveRuleWithCampaigns = ({ campaignSelectionType: selectedType, campaignIds: selectedCampaignIds }) => {
    const query = buildRecommendationQuery(conditions);

    const sendData = {
      ruleName,
      reportDate,
      gridName,
      profileId: profileId?.value,
      conditions,
      actions: hasOutOfBudget ? [] : actions.filter(action => action.actionName),
      query,
      campaignSelectionType: selectedType,
      campaignIds: selectedCampaignIds,
    };

    setSubmitting(true);
    const apiCall = editId ? ApiUpdateRules(editId, sendData) : ApiAddRules(sendData);

    apiCall
      .then((res) => {
        if (res.isSuccess) {
          Toast.success(res.message);
          getRule();
          if (editId) { setEditId(null); if (setEditData) setEditData(null); }
          resetForm();
          setaddModalFlag(false);
        } else {
          Toast.error(res.message);
        }
      })
      .catch((err) => {
        Toast.error(err);
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const conditionErr = (index, field) => {
    const e = error?.conditions?.[index]?.[field];
    return e ? <p className="error">{e}</p> : null;
  };

  const actionErr = (index, field) => {
    const e = error?.actions?.details?.[index]?.[field];
    return e ? <p className="error">{e}</p> : null;
  };

  const currentActions = ACTION_OPTIONS[gridName] || [];

  const showAddAction = () => {
    if (!gridName) return false;
    if (SINGLE_ACTION_GRIDS.includes(gridName)) return false;
    if (gridName === 'Placement') {
      return actions.length < PLACEMENT_OPTIONS.length;
    }
    if (gridName === 'Search Term') {
      return actions.length < 4;
    }
    return actions.length < currentActions.length;
  };

  const isCombinationDisabled = (index, actionValue, matchValue) => {
    if (gridName !== 'Search Term') return false;
    return actions.some((ac, i) =>
      i !== index &&
      ac.actionName === actionValue &&
      ac.matchType === matchValue
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  if (editId && loadingEditData) {
    return (
      <div className="flex flex-col items-center justify-center py-28 min-h-[350px]">
        <i className="fa fa-spinner fa-spin text-[#1A9FD4] mb-3" style={{ fontSize: "32px" }} />
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          Loading rule configuration...
        </span>
      </div>
    );
  }

  if (step === 'choose-path') {
    return (
      <RuleWizardChoosePath
        title={t("Create New Recommendation Rule")}
        description="Automation helps you optimize your account. Select how you want to start building your optimization logic."
        templateCardTitle="Browse Templates"
        templateCardDesc="Choose from pre-configured rules for pausing keywords or harvesting search terms."
        scratchCardTitle="Build Custom Rule"
        scratchCardDesc="Create a blank recommendation rule and define your own conditions from the ground up."
        onSelectTemplates={() => setStep('templates')}
        onSelectScratch={() => setStep('form')}
      />
    );
  }

  if (step === 'templates') {
    return (
      <RuleWizardTemplates
        templates={RecommendationRuleTemplates}
        onApplyTemplate={applyTemplate}
        onBack={() => setStep('choose-path')}
      />
    );
  }

  return (
    <div id='recommandation-rule-add' className="new_rule flex flex-col h-full overflow-hidden w-full bg-transparent p-0 m-0 border-0">
      <form onSubmit={submitHandler} className="flex flex-col h-full overflow-hidden">
        <div className="overflow-y-auto p-4 flex-1">
          {/* Rule Name + Date Filter + Affected Parameter */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-3 items-start w-full">
            <div className="col-span-1 md:col-span-4">
              <label className="block mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">{t("Recommendation Name")} <span className="text-danger">*</span></label>
              <Input
                type="text"
                name="ruleName"
                className={`w-full ${error?.ruleName ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                placeholder={t("Enter recommendation name")}
                onChange={(e) => {
                  setRuleName(e.target.value);
                  removeError('ruleName');
                }}
                value={ruleName}
              />
              {error?.ruleName && <p className="error">{error.ruleName}</p>}
            </div>

            <div className="col-span-1 md:col-span-3">
              <label className="block mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">{t("Date Filter")}</label>
              <Select
                value={reportDate || undefined}
                onValueChange={(val) => {
                  setReportDate(val || "");
                  removeError('reportDate');
                }}
              >
                <SelectTrigger className={`w-full ${error?.reportDate ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder={t("Select")} />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{t(opt.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error?.reportDate && <p className="error">{error.reportDate}</p>}
            </div>

            <div className="col-span-1 md:col-span-3">
              <label className="block mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">{t("Affected Parameter")} <span className="text-danger">*</span></label>
              <Select
                value={gridName || undefined}
                onValueChange={(val) => {
                  handleGridNameChange(val || "");
                  removeError('gridName');
                }}
              >
                <SelectTrigger className={`w-full ${error?.gridName ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder={t("Select")} />
                </SelectTrigger>
                <SelectContent>
                  {GRID_NAMES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{t(opt.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error?.gridName && <p className="error">{error.gridName}</p>}
            </div>
          </div>


          <div className="add_border" />

          {/* Conditions Section */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-3">
              <div className="section-title">{t("Conditions")}</div>
              <Button type="button" variant="outline" className="h-8 gap-1 border-sky-500/30 hover:border-sky-500 text-sky-600 dark:text-sky-400 bg-sky-500/5 hover:bg-sky-500/10 transition-colors font-bold text-xs" onClick={addCondition}>
                <AiOutlinePlus size={13} /> {t("Add Condition")}
              </Button>
            </div>

            {conditions.map((condition, index) => {
              const isOob = condition.conditionType === 'Out of Budget' || condition.conditionType === 'OutOfBudget';
              const availableMetrics = getConditionMetrics(gridName);

              return (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-2 items-start w-full" key={index}>
                  <div className="col-span-1 md:col-span-3">
                    <Select
                      value={condition.conditionType || undefined}
                      onValueChange={(val) => handleConditionChange(index, 'conditionType', val || '')}
                    >
                      <SelectTrigger className={`w-full ${error?.conditions?.[index]?.conditionType ? 'border-red-500' : ''}`}>
                        <SelectValue placeholder={t("Select")} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMetrics.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{t(opt.label)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {conditionErr(index, 'conditionType')}
                  </div>

                  {isOob ? (
                    <>
                      <div className="col-span-1 md:col-span-3">
                        <Select
                          value={condition.oobPeriod || undefined}
                          onValueChange={(val) => handleConditionChange(index, 'oobPeriod', val || '')}
                        >
                          <SelectTrigger className={`w-full ${error?.conditions?.[index]?.oobPeriod ? 'border-red-500' : ''}`}>
                            <SelectValue placeholder={t("Select period")} />
                          </SelectTrigger>
                          <SelectContent>
                            {OOB_PERIOD_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{t(opt.label)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {conditionErr(index, 'oobPeriod')}
                      </div>
                      {condition.oobPeriod === 'CUSTOM' && (
                        <div className="col-span-1 md:col-span-2">
                          <Input
                            type="number"
                            min={1}
                            max={365}
                            className={`w-full ${error?.conditions?.[index]?.oobDays ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                            placeholder={t("Days")}
                            value={condition.oobDays}
                            onChange={(e) => handleConditionChange(index, 'oobDays', e.target.value)}
                          />
                          {conditionErr(index, 'oobDays')}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="col-span-1 md:col-span-3">
                        <Select
                          value={condition.conditionOperator || undefined}
                          onValueChange={(val) => handleConditionChange(index, 'conditionOperator', val || '')}
                          disabled={!condition.conditionType}
                        >
                          <SelectTrigger className={`w-full ${error?.conditions?.[index]?.conditionOperator ? 'border-red-500' : ''}`}>
                            <SelectValue placeholder={t("Select")} />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITION_OPERATORS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{t(opt.label)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {conditionErr(index, 'conditionOperator')}
                      </div>

                      <div className="col-span-1 md:col-span-3">
                        <div className="flex rounded-md shadow-sm">
                          {['Sales', 'Spend', 'CPC'].includes(condition.conditionType) && (
                            <span className={`flex items-center justify-center px-3 border border-r-0 rounded-l-md text-[14px] ${error?.conditions?.[index]?.conditionValue ? (isDark ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-red-50 border-red-400 text-red-500') : (isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-gray-200 text-slate-500')}`}>{getCurrencySymbol(currencyCode)}</span>
                          )}
                          <Input
                            type="number"
                            name={`conditions.${index}.conditionValue`}
                            className={`w-full ${error?.conditions?.[index]?.conditionValue ? 'border-red-500 focus-visible:ring-red-500' : ''} ${['Sales', 'Spend', 'CPC'].includes(condition.conditionType) ? 'rounded-l-none' : ''} ${['ACOS', 'CTR', 'CVR'].includes(condition.conditionType) ? 'rounded-r-none' : ''}`}
                            placeholder={t("Value")}
                            value={condition.conditionValue}
                            disabled={!condition.conditionOperator}
                            onChange={(e) => handleConditionChange(index, 'conditionValue', e.target.value)}
                          />
                          {['ACOS', 'CTR', 'CVR'].includes(condition.conditionType) && (
                            <span className={`flex items-center justify-center px-3 border border-l-0 rounded-r-md text-[14px] ${error?.conditions?.[index]?.conditionValue ? (isDark ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-red-50 border-red-400 text-red-500') : (isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-gray-200 text-slate-500')}`}>%</span>
                          )}
                        </div>
                        {conditionErr(index, 'conditionValue')}
                      </div>
                    </>
                  )}

                  <div className="col-span-1 md:col-span-1 flex items-center gap-2 mt-1">
                    {conditions.length > 1 && (
                      <div className="delete_icon" onClick={() => removeCondition(index)}>
                        <AiFillDelete size={20} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="add_border" />

          {/* Actions Section or Out of Budget Note */}
          {hasOutOfBudget ? (
            <div className="mb-4 p-4 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 flex items-center gap-3">
              <FiInfo className="w-5 h-5 text-sky-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-sky-800 dark:text-sky-200">
                  {gridName === 'Targeting'
                    ? t("Note: This condition was only for displaying targets whose campaign was out of budget. It will not trigger any actions.")
                    : gridName === 'Placement'
                      ? t("Note: This condition was only for displaying placements whose campaign was out of budget. It will not trigger any actions.")
                      : t("Note: This condition was only for displaying campaigns that were out of budget. It will not trigger any actions.")}
                </p>
                <p className="text-[11px] text-sky-600 dark:text-sky-400 mt-0.5">
                  {gridName === 'Targeting'
                    ? t("Actions are hidden and not required when Out of Budget condition is added. The recommendation will display only targets whose campaign status is out of budget.")
                    : gridName === 'Placement'
                      ? t("Actions are hidden and not required when Out of Budget condition is added. The recommendation will display only placements whose campaign status is out of budget.")
                      : t("Actions are hidden and not required when Out of Budget condition is added. The recommendation will display only campaigns whose status is out of budget.")}
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <div className="flex justify-between items-center mb-3">
                <div className="section-title">
                  {t("Actions")} <span className="text-danger ml-1">*</span>
                  {SINGLE_ACTION_GRIDS.includes(gridName) && (
                    <span className="text-gray-500 ml-2" style={{ fontSize: '12px' }}>
                      ({t("Only one action allowed for")} {t(gridName)})
                    </span>
                  )}
                  {gridName === 'Search Term' && (
                    <span className="text-gray-500 ml-2" style={{ fontSize: '12px' }}>
                      ({t("Max 4 actions")})
                    </span>
                  )}
                </div>
                {gridName && showAddAction() && (
                  <Button type="button" variant="outline" className="h-8 gap-1" onClick={addAction}>
                    <AiOutlinePlus size={14} /> {t("Add Action")}
                  </Button>
                )}
              </div>

              {!gridName && (
                <p className="text-gray-500" style={{ fontSize: '13px', marginBottom: '8px' }}>
                  {t("Please select an Affected Parameter to configure actions.")}
                </p>
              )}

              {gridName && actions.map((action, index) => {
                const needsValue = action.actionName && !NO_VALUE_ACTIONS.includes(action.actionName);
                const isPlacementGrid = gridName === 'Placement';
                const isSearchTermGrid = gridName === 'Search Term';
                const isPlacementBidAction = isPlacementGrid && PLACEMENT_ACTIONS.includes(action.actionName);
                const isSingleActionGrid = SINGLE_ACTION_GRIDS.includes(gridName);

                return (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-2 items-start w-full" key={index}>
                    <div className="col-span-1 md:col-span-3">
                      <Select
                        value={action.actionName || undefined}
                        onValueChange={(val) => handleActionChange(index, 'actionName', val || '')}
                      >
                        <SelectTrigger className={`w-full ${error?.actions?.details?.[index]?.actionName ? 'border-red-500' : ''}`}>
                          <SelectValue placeholder={t("Select")} />
                        </SelectTrigger>
                        <SelectContent>
                          {currentActions.map((a) => (
                            <SelectItem
                              key={a.value}
                              value={a.value}
                              disabled={
                                isSearchTermGrid && action.matchType &&
                                actions.some((ac, i) =>
                                  i !== index &&
                                  ac.actionName === a.value &&
                                  ac.matchType === action.matchType
                                )
                              }
                            >
                              {t(a.label)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {actionErr(index, 'actionName')}
                    </div>

                    {/* Placement sub-select */}
                    {isPlacementBidAction && (
                      <div className="col-span-1 md:col-span-3">
                        <Select
                          value={action.placementType || undefined}
                          onValueChange={(val) => handleActionChange(index, 'placementType', val || '')}
                        >
                          <SelectTrigger className={`w-full ${error?.actions?.details?.[index]?.placementType ? 'border-red-500' : ''}`}>
                            <SelectValue placeholder={t("Select Placement")} />
                          </SelectTrigger>
                          <SelectContent>
                            {PLACEMENT_OPTIONS.map((p) => (
                              <SelectItem
                                key={p.value}
                                value={p.value}
                                disabled={actions.some((ac, i) => i !== index && ac.placementType === p.value)}
                              >
                                {t(p.label)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {actionErr(index, 'placementType')}
                      </div>
                    )}

                    {/* Match Type */}
                    {isSearchTermGrid && action.actionName && (
                      <div className="col-span-1 md:col-span-3">
                        <Select
                          value={action.matchType || undefined}
                          onValueChange={(val) => handleActionChange(index, 'matchType', val || '')}
                        >
                          <SelectTrigger className={`w-full ${error?.actions?.details?.[index]?.matchType ? 'border-red-500' : ''}`}>
                            <SelectValue placeholder={t("Select Match Type")} />
                          </SelectTrigger>
                          <SelectContent>
                            {MATCH_TYPE_OPTIONS.map((m) => (
                              <SelectItem
                                key={m.value}
                                value={m.value}
                                disabled={isCombinationDisabled(index, action.actionName, m.value)}
                              >
                                {t(m.label)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {actionErr(index, 'matchType')}
                      </div>
                    )}

                    {/* Value Type */}
                    {needsValue && !isSearchTermGrid && (
                      <div className="col-span-1 md:col-span-2">
                        <Select
                          value={action.actionValueType || undefined}
                          onValueChange={(val) => handleActionChange(index, 'actionValueType', val || '')}
                        >
                          <SelectTrigger className={`w-full ${error?.actions?.details?.[index]?.actionValueType ? 'border-red-500' : ''}`}>
                            <SelectValue placeholder={t("Select Type")} />
                          </SelectTrigger>
                          <SelectContent>
                            {VALUE_TYPE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{t(opt.label)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {actionErr(index, 'actionValueType')}
                      </div>
                    )}

                    {/* Numeric Value */}
                    {needsValue && !isSearchTermGrid && (
                      <div className="col-span-1 md:col-span-3">
                        <div className="flex rounded-md shadow-sm">
                          <Input
                            type="number"
                            name={`actions.${index}.actionValue`}
                            className={`w-full ${error?.actions?.details?.[index]?.actionValue ? 'border-red-500 focus-visible:ring-red-500' : ''} ${action.actionValueType === "Percentage" ? 'rounded-r-none' : ''}`}
                            placeholder={t("Value")}
                            value={action.actionValue}
                            onChange={(e) => {
                              const val = handlePercentageInput(e.target.value, action.actionValueType);
                              handleActionChange(index, 'actionValue', val);
                            }}
                          />
                          {action.actionValueType === "Percentage" && (
                            <span className={`flex items-center justify-center px-3 border border-l-0 rounded-r-md text-[14px] ${error?.actions?.details?.[index]?.actionValue ? (isDark ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-red-50 border-red-400 text-red-500') : (isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-gray-200 text-slate-500')}`}>%</span>
                          )}
                        </div>
                        {actionErr(index, 'actionValue')}
                      </div>
                    )}

                    <div className="col-span-1 md:col-span-1 flex items-center gap-2 mt-1">
                      {!isSingleActionGrid && actions.length > 1 && (
                        <div className="delete_icon" onClick={() => removeAction(index)}>
                          <AiFillDelete size={20} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {error?.actions?.general && (
                <p className="error" style={{ marginBottom: '10px' }}>{error.actions.general}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="cm-footer border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 flex !justify-between items-center shrink-0">
          <div>
            {!editId && (
              <Button
                variant="outline"
                className="px-4 py-2 text-sm font-semibold"
                type="button"
                onClick={() => setStep('choose-path')}
              >
                {t("Back")}
              </Button>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="px-4 py-2 text-sm font-semibold"
              disabled={submitting}
              onClick={handleCancel}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="improve add_btn px-4 py-2 bg-[#1A9FD4] text-white hover:opacity-90 rounded-md text-sm font-semibold flex items-center justify-center"
            >
              {submitting ? (
                <>
                  <i className="fa fa-spinner fa-spin mr-1.5" />
                  {t("Submitting")}
                </>
              ) : (
                t("Submit")
              )}
            </Button>
          </div>
        </div>
      </form>

      <RecommendationCampaignModal
        isOpen={showCampaignModal}
        onClose={() => setShowCampaignModal(false)}
        onConfirm={handleSaveRuleWithCampaigns}
        initialSelectionType={campaignSelectionType}
        initialCampaignIds={campaignIds}
        profileId={profileId?.value}
        gridName={gridName}
        actions={actions.filter(a => a.actionName)}
        ruleName={ruleName}
      />
    </div>
  );
}

export default AddRecommendationRule;