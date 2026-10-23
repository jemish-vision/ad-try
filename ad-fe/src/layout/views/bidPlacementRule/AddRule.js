import RuleCreationCampaignModal from '../../../components/rule-wizard/RuleCreationCampaignModal';
import React, { useState, useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ApicreateRule, ApiRuleConditions, ApiupdateRule } from '../../../api-wrapper/placementRule/ApiPlacementRule';
import { ProfileContext } from '../../../helper/usecontext/useContext';
import { Toast, useDispatch } from "../../../helper/links/Link";
import { AiOutlinePlus, AiFillDelete } from "react-icons/ai";
import { FiClock, FiCopy, FiInfo, FiHelpCircle } from "react-icons/fi";
import { Label } from '../../../components/ui/label';
import { AppTooltip } from '../../../components/ui/AppTooltip';
import { ShadcnDatePicker } from '../../../components/ui/date-picker';
import { addPlacementRuleQuery, UpdateTargetingQuery } from '../../../utility/createQuery';
import { ApiFilterListing } from '../../../api-wrapper/customer/ApiCustomer';
import { getBlockedSlotsForDays, isTimeConflicting, validateTimeConflict, resolveTemplateTimes } from '../../../utility/ruleTimeConflict';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '../../../components/ui/select';
import { Input } from '../../../components/ui/input';
import { Checkbox } from '../../../components/ui/checkbox';
import { Switch } from '../../../components/ui/switch';
import { Button as ShadcnButton } from '../../../components/ui/button';
import { getBidPlacementRuleTemplates } from './bidPlacementRuleTemplate';
import { RuleWizardChoosePath, RuleWizardTemplates } from '../../../components/rule-wizard/RuleWizardSteps';

const SLOT_STEP = {
  "1_HOUR": 1,
  "2_HOUR": 2,
  "3_HOUR": 3,
  "4_HOUR": 4,
  "6_HOUR": 6,
};

const generatePlacementSlots = (slotType, currentActions = []) => {
  const step = SLOT_STEP[slotType] || 4;
  const slots = [];

  const validPlacements = (currentActions || [])
    .map(a => a?.placement)
    .filter(Boolean);

  const placementsToUse = validPlacements.length > 0
    ? validPlacements
    : ["Top of Search"];

  for (let i = 0; i < 24; i += step) {
    slots.push({
      slotIndex: slots.length,
      startTime: `${String(i).padStart(2, "0")}:00`,
      endTime: `${String(i + step).padStart(2, "0")}:00`,
      enabled: true,
      actions: placementsToUse.map(p => {
        const existing = (currentActions || []).find(a => a?.placement === p);
        return {
          placement: p,
          actionName: existing?.actionName || "Increase Bid",
          actionValue: 0,
          actionValueType: existing?.actionValueType || "Percentage",
        };
      })
    });
  }
  return slots;
};

function AddRule({ setaddModalFlag, editId, setEditId, getRule, editData, adminRulesSchedule = [], allRulesSchedule = [] }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  let { profileId, today, selectedAdType } = useContext(ProfileContext);

  const [error, seterror] = useState();
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const [ruleName, setRuleName] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [toDate, setToDate] = useState(null);
  const [selectedDays, setSelectedDays] = useState([]);
  const [ruleType, setRuleType] = useState("");
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [allowMultiTimeChanges, setAllowMultiTimeChanges] = useState(true);
  const [daysSinceCreation, setDaysSinceCreation] = useState(0);
  const [isDaysSinceCreation, setIsDaysSinceCreation] = useState(false);
  const [loadingEditData, setLoadingEditData] = useState(Boolean(editId));
  const [submitting, setSubmitting] = useState(false);
  const [creationDraft, setCreationDraft] = useState(null);

  // Hourly Dayparting States
  const [isHourlyBid, setIsHourlyBid] = useState(false);
  const [hourlyFrequency, setHourlyFrequency] = useState("DAILY");
  const [hourlySlotType, setHourlySlotType] = useState("4_HOUR");
  const [hourlySlots, setHourlySlots] = useState(() =>
    generatePlacementSlots("4_HOUR", [{ placement: "Top of Search", actionName: "Increase Bid", actionValue: 0, actionValueType: "Percentage" }])
  );
  const [copiedIdx, setCopiedIdx] = useState(null);

  const [step, setStep] = useState(editId ? 'form' : 'choose-path');

  const applyTemplate = (template) => {
    setRuleName(template.data.ruleName);
    setRuleType(template.data.ruleType);
    setReportDate(template.data.reportDate);

    const newDays = template.data.selectedDays || [];
    setSelectedDays(newDays);

    const baseTimes = template.data.timeData || [""];
    const resolvedTimes = resolveTemplateTimes(baseTimes, newDays, allRulesSchedule, adminRulesSchedule, editId);
    setTimeData(resolvedTimes);

    if (template.data.conditions && template.data.conditions.length > 0) {
      setMainRuleData(template.data.conditions);
    } else {
      setMainRuleData([{ conditionType: "", conditionOperator: "", conditionValue: "", conditionValueType: "Number" }]);
    }

    if (template.data.actionType && template.data.actionType.length > 0) {
      setActionType(template.data.actionType);
    } else {
      setActionType([{ placement: "", actionName: "", actionValue: "", actionValueType: "" }]);
    }

    if (template.data.isHourlyBid) {
      setIsHourlyBid(true);
      if (template.data.hourlyConfig) {
        setHourlyFrequency(template.data.hourlyConfig.frequency || "DAILY");
        setHourlySlotType(template.data.hourlyConfig.slotType || "4_HOUR");
        if (template.data.hourlyConfig.slots?.length > 0) {
          setHourlySlots(template.data.hourlyConfig.slots);
        } else {
          setHourlySlots(generatePlacementSlots(template.data.hourlyConfig.slotType || "4_HOUR", template.data.actionType || []));
        }
      }
    } else {
      setIsHourlyBid(false);
    }

    setStep('form');
  };

  const [mainLabel, setMainLabel] = useState([]);

  const subValueType = [
    { value: "Increase Bid", label: "Increase Bid" },
    { value: "Decrease Bid", label: "Decrease Bid" },
    { value: "Set Bid", label: "Set Bid" }
  ];

  const placement = [
    { value: "Top of Search", label: "Top of Search" },
    { value: "Rest of Search", label: "Rest of Search" },
    { value: "Product pages", label: "Product pages" },
  ];

  const validatorLabel = [
    { value: "LESS_THAN", label: "Less Than" },
    { value: "LESS_THAN_OR_EQUAL_TO", label: "Less Than Or Equal To" },
    { value: "GREATER_THAN_OR_EQUAL_TO", label: "Greater Than Or Equal To" },
    { value: "GREATER_THAN", label: "Greater Than" },
    { value: "EQUAL_TO", label: "Equal To" },
  ];

  const selector = [
    { value: "Percentage", label: "Percentage (%)" },
    { value: "Number", label: "Number" },
  ];

  const ruleTypeOption = [
    { value: "N", label: "Normal Rule" },
    { value: "T", label: "Time Based Rule" },
  ];

  const DATE_FILTER_OPTION = [
    { value: "TODAY", label: "Today" },
    { value: "YESTERDAY", label: "Yesterday" },
    { value: "LAST_7_DAYS", label: "Last 7 days" },
    { value: "THIS_WEEK", label: "This week" },
    { value: "LAST_WEEK", label: "Last week" },
    { value: "LAST_30_DAYS", label: "Last 30 days" },
    { value: "THIS_MONTH", label: "This month" },
    { value: "LAST_MONTH", label: "Last month" },
    { value: "YEAR_TO_DATE", label: "Year to date" },
    { value: "LIFETIME", label: "Lifetime" },
  ];

  const allDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Every 10 Days", "Every 15 Days", "Every 30 Days"];
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const intervalDays = ["Every 10 Days", "Every 15 Days", "Every 30 Days"];

  const [actionType, setActionType] = useState([{
    placement: "Top of Search",
    actionName: 'Increase Bid',
    actionValue: 20,
    actionValueType: 'Percentage'
  }]);

  const [mainRuleData, setMainRuleData] = useState([{
    conditionType: "",
    conditionOperator: "",
    conditionValue: "",
    conditionValueType: "",
  }]);

  const [timeData, setTimeData] = useState([""]);

  useEffect(() => {
    const getMainLabel = async () => {
      if (profileId?.value && selectedAdType) {
        await ApiFilterListing({
          profileId: profileId.value,
          pageName: "Placement"
        })
          .then((e) => {
            if (e?.isSuccess) {
              const skipOption = ["CampaignsAndAdGroups", "BidAdjustment"];
              const filters = e?.filters?.map((el) => ({ ...el, label: el.name })).filter(e1 => !skipOption?.includes(e1?.value))
              setMainLabel(filters);
            } else {
              Toast.error(e?.message);
            }
          })
          .catch((e) => {
            Toast.error(t("Something went wrong"));
          });
      }
    }
    getMainLabel()
  }, [editId, profileId, selectedAdType]);

  useEffect(() => {
    if (editId) {
      setLoadingEditData(true);
      ApiRuleConditions(editId)
        .then((res) => {
          if (res.isSuccess) {
            setRuleName(res.data.ruleName || "");
            setReportDate(res.data.reportDate || "");
            setToDate(res.data.toDate || null);
            setActionType(res.data.actionType?.length ? res.data.actionType : [{ placement: "Top of Search", actionName: "Increase Bid", actionValue: 20, actionValueType: "Percentage" }]);
            setMainRuleData(res.data.conditions?.length ? res.data.conditions : [{ conditionType: "", conditionOperator: "", conditionValue: "", conditionValueType: "" }]);
            setSelectedDays(res.data.days || []);
            setTimeData(res.data.times || [""]);
            setRuleType(res.data.ruleType || "");
            setStartDate(res.data.startDate || null);
            setEndDate(res.data.endDate || null);
            setAllowMultiTimeChanges(res.data.allowMultiTimeChanges ?? true);
            setDaysSinceCreation(res.data.daysSinceCreation || 0);
            setIsDaysSinceCreation(res.data.isDaysSinceCreation || false);

            if (res.data.isHourlyBid) {
              setIsHourlyBid(true);
              if (res.data.hourlyConfig) {
                setHourlyFrequency(res.data.hourlyConfig.frequency || "DAILY");
                setHourlySlotType(res.data.hourlyConfig.slotType || "4_HOUR");
                if (res.data.hourlyConfig.slots?.length > 0) {
                  setHourlySlots(res.data.hourlyConfig.slots);
                } else {
                  setHourlySlots(generatePlacementSlots(res.data.hourlyConfig.slotType || "4_HOUR", res.data.actionType || []));
                }
              }
            } else {
              setIsHourlyBid(false);
            }
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

  // Keep hourly slot actions synchronized with active placements in actionType
  useEffect(() => {
    const activePlacements = (actionType || []).map(a => a?.placement).filter(Boolean);
    if (activePlacements.length === 0) return;

    setHourlySlots(prevSlots => {
      if (!prevSlots || prevSlots.length === 0) {
        return generatePlacementSlots(hourlySlotType, actionType);
      }
      return prevSlots.map(slot => {
        const updatedActions = activePlacements.map(p => {
          const existing = slot.actions?.find(a => a?.placement === p);
          if (existing) return existing;
          const parentAction = (actionType || []).find(a => a?.placement === p);
          return {
            placement: p,
            actionName: parentAction?.actionName || "Increase Bid",
            actionValue: 0,
            actionValueType: parentAction?.actionValueType || "Percentage"
          };
        });
        return {
          ...slot,
          actions: updatedActions
        };
      });
    });
  }, [actionType, hourlySlotType]);

  const handleSlotActionChange = (slotIndex, placementName, field, value) => {
    setHourlySlots(prev => prev.map((s, idx) => {
      if (idx !== slotIndex) return s;
      const newActions = (s.actions || []).map(act => {
        if (act.placement !== placementName) return act;
        return {
          ...act,
          [field]: field === "actionValue" ? (value === "" ? "" : Number(value)) : value
        };
      });
      return { ...s, actions: newActions };
    }));
    if (error?.hourlySlots) removeError('hourlySlots');
  };

  const handleCopyToAll = (sourceIndex) => {
    const sourceSlot = hourlySlots[sourceIndex];
    if (!sourceSlot) return;
    setHourlySlots(prev => prev.map(s => ({
      ...s,
      actions: (sourceSlot.actions || []).map(a => ({ ...a }))
    })));
    setCopiedIdx(sourceIndex);
    Toast.success(t("Slot configuration copied to all slots"));
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const submitHandler = (e) => {
    e.preventDefault();

    let flag = false;
    let sendData = {
      ruleName,
      reportDate,
      toDate,
      actionType,
      profileId: profileId?.value,
      conditions: mainRuleData,
      times: isHourlyBid ? [] : timeData,
      days: selectedDays,
      ruleType,
      startDate,
      endDate,
      allowMultiTimeChanges,
      daysSinceCreation,
      isDaysSinceCreation,
      isHourlyBid,
      hourlyConfig: isHourlyBid ? {
        frequency: hourlyFrequency,
        slotType: hourlySlotType,
        slots: hourlySlots
      } : null
    };

    let errorData = {};
    if (!sendData.ruleName) {
      flag = true;
      errorData.ruleName = "Rule Name is required";
    }

    if (!sendData.ruleType) {
      flag = true;
      errorData.ruleType = "Rule Type is required";
    } else if (sendData.ruleType === "T") {
      if (!sendData.startDate) {
        flag = true;
        errorData.startDate = "Start Date is required";
      }
      if (!sendData.endDate) {
        flag = true;
        errorData.endDate = "End Date is required";
      }
    }

    if (sendData.conditions) {
      let mainArr = [];
      sendData.conditions.forEach((el, index) => {
        let subArr = {};
        if (!el.conditionType) {
          flag = true;
          subArr.conditionType = "Condition Type is required";
        }

        if (["Impressions", "Clicks", "Orders", "Sales", "Spend", "ROAS", "ACOS"].includes(el.conditionType)) {
          if (!el.conditionOperator) {
            flag = true;
            subArr.conditionOperator = "Operator is required";
          }
          if (!el.conditionValue && el.conditionValue !== 0) {
            flag = true;
            subArr.conditionValue = "Value is required";
          }
        }
        if (Object.keys(subArr).length > 0) mainArr[index] = subArr;
      });
      errorData.conditions = mainArr;
    }

    if (sendData.actionType) {
      let mainArr = [];
      sendData.actionType.forEach((el, index) => {
        let subArr = {};
        if (!el.actionName) {
          flag = true;
          subArr.actionName = "Action Name is required";
        }
        if (!isHourlyBid && !el.actionValue && el.actionValue !== 0) {
          flag = true;
          subArr.actionValue = "Value is required";
        }
        if (!el.actionValueType) {
          flag = true;
          subArr.actionValueType = "Adjustment Type is required";
        }
        if (!el.placement) {
          flag = true;
          subArr.placement = "Placement is required";
        }
        if (Object.keys(subArr).length > 0) mainArr[index] = subArr;
      });
      errorData.actionErr = mainArr;
    }

    if (isHourlyBid) {
      if (!hourlySlots || hourlySlots.length === 0) {
        flag = true;
        errorData.hourlySlots = t("Please configure time slots");
      } else {
        let slotErr = false;
        hourlySlots.forEach(s => {
          s.actions?.forEach(a => {
            if (a.actionValue === "" || a.actionValue === undefined || isNaN(Number(a.actionValue))) {
              slotErr = true;
            }
          });
        });
        if (slotErr) {
          flag = true;
          errorData.hourlySlots = t("All time slots must have valid bid adjustment values");
        }
      }
    } else {
      let mainArrCheck = [];
      sendData?.times?.forEach((el, index) => {
        if (!el || Object.keys(el).length === 0) {
          flag = true;
          mainArrCheck[index] = "Time is required";
        }
      });
      errorData.timesErr = mainArrCheck;

      if (selectedDays.length > 0 && sendData.times?.length > 0) {
        const conflicts = validateTimeConflict(allRulesSchedule, adminRulesSchedule, selectedDays, sendData.times, editId || null);
        if (conflicts.length > 0) flag = true;
      }
    }

    if (!selectedDays || selectedDays.length === 0) {
      flag = true;
      errorData.days = "At least one day is required";
    }

    if (reportDate === "YEAR_TO_DATE" && !toDate) {
      flag = true;
      errorData.toDate = "Date is required";
    }

    if (!sendData.reportDate) {
      flag = true;
      errorData.reportDate = "Date Filter is required";
    }

    seterror(errorData);

    if (!flag) {
      sendData.query = {
        SP: UpdateTargetingQuery(addPlacementRuleQuery(sendData, mainLabel, "SP"), editData?.campaignIds?.SP ?? []),
        SB: UpdateTargetingQuery(addPlacementRuleQuery(sendData, mainLabel, "SB"), editData?.campaignIds?.SB ?? []),
        SD: UpdateTargetingQuery(addPlacementRuleQuery(sendData, mainLabel, "SD"), editData?.campaignIds?.SD ?? []),
      };

      if (!editId) {
        setCreationDraft(JSON.parse(JSON.stringify(sendData)));
        return;
      }
      setSubmitting(true);
      if (editId) {
        ApiupdateRule(editId, sendData)
          .then((res) => {
            if (res.isSuccess) {
              getRule();
              setEditId(null);
              Toast.success(res.message);
              setaddModalFlag(false);
            } else {
              Toast.error(res.message);
            }
          })
          .catch((err) => Toast.error(err))
          .finally(() => setSubmitting(false));
      }
    }
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
    seterror(newError);
  };

  const mainRuleChangeHandler = (e, index, field) => {
    let data = [...mainRuleData];

    data[index][field] = e.target.value;

    setMainRuleData(data);
    removeError('conditions', index, field);
  };

  const actionTypeHandler = (e, index, field) => {
    let data = [...actionType];
    data[index][field] = field === "actionValue" ? Number(e.target.value) : e.target.value;
    setActionType(data);
    removeError('actionErr', index, field);
  };

  const handleTimeChange = (index, e) => {
    let arr = [...timeData];
    arr[index] = e.target.value;
    setTimeData(arr);

    if (error?.timesErr?.[index]) {
      let newTimesErr = [...error.timesErr];
      newTimesErr[index] = undefined;
      seterror({ ...error, timesErr: newTimesErr });
    }
  };

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
        title={t("Create New Placement Rule")}
        description="Automation helps you optimize your ad spend 24/7. Select how you want to start building your optimization logic."
        templateCardTitle="Browse Templates"
        templateCardDesc="Choose from pre-configured rules for Top of Search, Product Pages, or Peak Hours."
        scratchCardTitle="Build Custom Rule"
        scratchCardDesc="Create a blank rule and define your own conditions and actions from the ground up."
        onSelectTemplates={() => setStep('templates')}
        onSelectScratch={() => {
          setRuleName("");
          setRuleType("");
          setReportDate(null);
          setSelectedDays([]);
          setTimeData([""]);
          setMainRuleData([{ conditionType: "", conditionOperator: "", conditionValue: "", conditionValueType: "Number" }]);
          setActionType([{ placement: "Top of Search", actionName: "Increase Bid", actionValue: 20, actionValueType: "Percentage" }]);
          setIsHourlyBid(false);
          setHourlyFrequency("DAILY");
          setHourlySlotType("4_HOUR");
          setStep('form');
        }}
      />
    );
  }

  if (step === 'templates') {
    return (
      <RuleWizardTemplates
        templates={getBidPlacementRuleTemplates(t)}
        onApplyTemplate={applyTemplate}
        onBack={() => setStep('choose-path')}
      />
    );
  }

  return (
    <div id='placement-rule-add' className="new_rule">
      <form onSubmit={submitHandler}>
        <div className="p-6 pb-0">

          <div className="flex flex-wrap items-start -mx-2 mb-3">
            <div className="w-full md:w-4/12 px-2 mb-3 md:mb-0" id="bid-placement-rule-name-input">
              <label className="mb-1 block">{t("Rule Name")} <span className="text-danger">*</span></label>
              <Input
                type="text"
                name="ruleName"
                className={`${error?.ruleName ? 'border-red-500' : ''}`}
                placeholder={t("Enter rule name")}
                onChange={(e) => {
                  setRuleName(e.target.value);
                  removeError('ruleName');
                }}
                value={ruleName}
              />
              {error?.ruleName && <p className="error text-red-500 text-xs mt-1">{error.ruleName}</p>}
            </div>

            <div className="w-full md:w-3/12 px-2 mb-3 md:mb-0" id="bid-placement-rule-date-filter">
              <label className="mb-1 block">{t("Date Filter")}</label>
              <Select value={reportDate || ""} onValueChange={(value) => { setReportDate(value); removeError('reportDate'); }}>
                <SelectTrigger className={error?.reportDate ? 'border-red-500' : ''}>
                  <SelectValue placeholder={t("Select")} />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FILTER_OPTION.map((el) => (
                    <SelectItem key={el.value} value={el.value}>{t(el.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error?.reportDate && <p className="error text-red-500 text-xs mt-1">{error.reportDate}</p>}
            </div>

            {reportDate === "YEAR_TO_DATE" && (
              <div className="w-full md:w-2/12 px-2 mb-3 md:mb-0">
                <label className="mb-1 block">{t("Date")}</label>
                <ShadcnDatePicker
                  className={`${error?.toDate ? 'border-red-500' : ''}`}
                  placeholder={t("Select Date")}
                  value={toDate}
                  onChange={(date) => {
                    setToDate(date);
                    removeError('toDate');
                  }}
                />
                {error?.toDate && <p className="error text-red-500 text-xs mt-1">{error.toDate}</p>}
              </div>
            )}

            <div className="w-full md:w-3/12 px-2 mb-3 md:mb-0" id="bid-placement-rule-days-since">
              <label className="custom-checkbox mb-1 flex items-center gap-2 pb-1">
                <Checkbox
                  checked={isDaysSinceCreation}
                  onCheckedChange={(checked) => {
                    setIsDaysSinceCreation(checked);
                    if (!checked) setDaysSinceCreation(0);
                  }}
                />
                <span className="text-sm">{t("Day's Since Creation")}</span>
              </label>
              <Input
                type="number"
                name="daysSinceCreation"
                className={`${error?.daysSinceCreation ? 'border-red-500' : ''}`}
                placeholder={t("0")}
                value={daysSinceCreation}
                onChange={(e) => setDaysSinceCreation(e.target.value)}
                disabled={!isDaysSinceCreation}
              />
              {error?.daysSinceCreation && <p className="error text-red-500 text-xs mt-1">{error.daysSinceCreation}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-start -mx-2 mb-3">
            <div className="w-full md:w-3/12 px-2 mb-3 md:mb-0" id="bid-placement-rule-type">
              <label className="mb-1 block">{t("Rule Type")} <span className="text-danger">*</span></label>
              <Select value={ruleType || ""} onValueChange={(value) => { setRuleType(value); removeError('ruleType'); }}>
                <SelectTrigger className={error?.ruleType ? 'border-red-500' : ''}>
                  <SelectValue placeholder={t("Select")} />
                </SelectTrigger>
                <SelectContent>
                  {ruleTypeOption.map((el) => (
                    <SelectItem key={el.value} value={el.value}>{t(el.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error?.ruleType && <p className="error text-red-500 text-xs mt-1">{error.ruleType}</p>}
            </div>

            {ruleType === "T" && (
              <>
                <div className="w-full md:w-4/12 px-2 mb-3 md:mb-0">
                  <label className="mb-1 block">{t("Start Date")} <span className="text-danger">*</span></label>
                  <ShadcnDatePicker
                    className={`${error?.startDate ? 'border-red-500' : ''}`}
                    placeholder={t("Select Start Date")}
                    value={startDate}
                    onChange={(date) => {
                      setStartDate(date);
                      removeError('startDate');
                    }}
                  />
                  {error?.startDate && <p className="error text-red-500 text-xs mt-1">{error.startDate}</p>}
                </div>

                <div className="w-full md:w-4/12 px-2 mb-3 md:mb-0">
                  <label className="mb-1 block">{t("End Date")} <span className="text-danger">*</span></label>
                  <ShadcnDatePicker
                    className={`${error?.endDate ? 'border-red-500' : ''}`}
                    placeholder={t("Select End Date")}
                    value={endDate}
                    onChange={(date) => {
                      setEndDate(date);
                      removeError('endDate');
                    }}
                  />
                  {error?.endDate && <p className="error text-red-500 text-xs mt-1">{error.endDate}</p>}
                </div>
              </>
            )}
          </div>

          <div className="add_border"></div>

          {/* Conditions Array */}
          <div className="mb-4" id="bid-placement-rule-conditions">
            <div className="flex justify-between items-center mb-3">
              <div className="section-title">{t("Conditions")}</div>
              <ShadcnButton type="button" variant="default" onClick={() => setMainRuleData([...mainRuleData, { conditionType: "", conditionOperator: "", conditionValue: "", conditionValueType: "" }])}>
                <AiOutlinePlus size={14} /> {t("Add Condition")}
              </ShadcnButton>
            </div>
            {mainRuleData.map((condition, index) => {
              const conditionError = error?.conditions?.[index] || {};
              const showOperators = ["Impressions", "Clicks", "Orders", "Sales", "Spend", "ROAS", "ACOS"].includes(condition.conditionType);

              return (
                <div className="flex flex-wrap items-start -mx-2 mb-2" key={index}>
                  <div className="w-full md:w-3/12 px-2 mb-3 md:mb-0">
                    <Select key={`conditionType-${index}-${mainLabel.length}-${condition.conditionType || 'empty'}`} value={condition.conditionType ? String(condition.conditionType) : undefined} onValueChange={(value) => mainRuleChangeHandler({ target: { value } }, index, "conditionType")}>
                      <SelectTrigger className={conditionError.conditionType ? 'border-red-500' : ''}>
                        <SelectValue placeholder={t("Select")} />
                      </SelectTrigger>
                      <SelectContent>
                        {mainLabel.filter(el => !el.isDefault).length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="font-semibold text-slate-500 dark:text-slate-400 bg-transparent px-2 py-1.5 text-xs uppercase tracking-wider">{t("Saved Filters")}</SelectLabel>
                            {mainLabel.filter(el => !el.isDefault).map(el => (
                              <SelectItem key={el.value} value={String(el.value)}>{t(el.label)}</SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        <SelectGroup>
                          <SelectLabel className="font-semibold text-slate-500 dark:text-slate-400 bg-transparent px-2 py-1.5 text-xs uppercase tracking-wider">{t("Filter Options")}</SelectLabel>
                          {mainLabel.filter(el => el.isDefault).map(el => (
                            <SelectItem key={el.value} value={String(el.value)}>{t(el.label)}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {conditionError.conditionType && <p className="error text-red-500 text-xs mt-1">{conditionError.conditionType}</p>}
                  </div>

                  {showOperators && (
                    <>
                      <div className="w-full md:w-4/12 px-2 mb-3 md:mb-0">
                        <Select value={condition.conditionOperator ? String(condition.conditionOperator) : undefined} onValueChange={(value) => mainRuleChangeHandler({ target: { value } }, index, "conditionOperator")}>
                          <SelectTrigger className={conditionError.conditionOperator ? 'border-red-500' : ''}>
                            <SelectValue placeholder={t("Select Operator")} />
                          </SelectTrigger>
                          <SelectContent>
                            {validatorLabel.map((el) => (
                              <SelectItem key={el.value} value={String(el.value)}>{t(el.label)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {conditionError.conditionOperator && <p className="error text-red-500 text-xs mt-1">{conditionError.conditionOperator}</p>}
                      </div>

                      <div className="w-full md:w-4/12 px-2 mb-3 md:mb-0">
                        <div className="flex items-stretch w-full rounded-md border border-slate-300 overflow-hidden focus-within:ring-1 focus-within:ring-[#1A9FD4] focus-within:border-[#1A9FD4]">
                          {["Spend", "Sales", "CPC"].includes(condition.conditionType) && <span className="flex items-center px-3 bg-slate-50 border-r border-slate-300 text-slate-500 text-sm">₹</span>}
                          <Input
                            type="number"
                            name={`conditions.${index}.conditionValue`}
                            className={`flex-1 w-full border-0 outline-none focus-visible:ring-0 shadow-none text-sm ${conditionError.conditionValue ? 'bg-red-50' : ''}`}
                            placeholder={t("Value")}
                            onChange={(e) => mainRuleChangeHandler(e, index, "conditionValue")}
                            value={condition.conditionValue}
                          />
                          {["ACOS", "CTR"].includes(condition.conditionType) && <span className="flex items-center px-3 bg-slate-50 border-l border-slate-300 text-slate-500 text-sm">%</span>}
                        </div>
                        {conditionError.conditionValue && <p className="error text-red-500 text-xs mt-1">{conditionError.conditionValue}</p>}
                      </div>
                    </>
                  )}
                  <div className="w-full md:w-1/12 px-2 mb-3 md:mb-0 flex items-center gap-2 mt-1">
                    {mainRuleData.length > 1 && (
                      <div className="delete_icon text-slate-400 hover:text-red-500 cursor-pointer" onClick={() => {
                        const newData = [...mainRuleData];
                        newData.splice(index, 1);
                        setMainRuleData(newData);
                      }}>
                        <AiFillDelete size={20} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="add_border"></div>

          {/* Action Array */}
          <div className="mb-4" id="bid-placement-rule-actions">
            <div className="flex justify-between items-center mb-3">
              <div className="section-title">{t("Action Type")} <span className="text-danger ml-1">*</span></div>
              {actionType.length < 3 && (
                <ShadcnButton type="button" variant="default" onClick={() => setActionType([...actionType, { placement: "", actionName: "Increase Bid", actionValue: 20, actionValueType: "Percentage" }])}>
                  <AiOutlinePlus size={14} /> {t("Add Action")}
                </ShadcnButton>
              )}
            </div>
            {actionType.map((action, index) => {
              const actionError = error?.actionErr?.[index] || {};

              return (
                <div className="flex flex-wrap items-start -mx-2 mb-2" key={index}>
                  <div className={`w-full ${isHourlyBid ? 'md:w-4/12' : 'md:w-3/12'} px-2 mb-3 md:mb-0`}>
                    <Select value={action.placement ? String(action.placement) : undefined} onValueChange={(value) => actionTypeHandler({ target: { value } }, index, "placement")}>
                      <SelectTrigger className={actionError.placement ? 'border-red-500' : ''}>
                        <SelectValue placeholder={t("Select Target")} />
                      </SelectTrigger>
                      <SelectContent>
                        {placement.map((el) => {
                          const isSelectedElsewhere = actionType.some((a, aIndex) => aIndex !== index && a.placement === el.value);
                          return (
                            <SelectItem key={el.value} value={String(el.value)} disabled={isSelectedElsewhere}>{t(el.label)}</SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {actionError.placement && <p className="error text-red-500 text-xs mt-1">{actionError.placement}</p>}
                  </div>

                  <div className={`w-full ${isHourlyBid ? 'md:w-4/12' : 'md:w-3/12'} px-2 mb-3 md:mb-0`}>
                    <Select value={action.actionName ? String(action.actionName) : undefined} onValueChange={(value) => actionTypeHandler({ target: { value } }, index, "actionName")}>
                      <SelectTrigger className={actionError.actionName ? 'border-red-500' : ''}>
                        <SelectValue placeholder={t("Select Action")} />
                      </SelectTrigger>
                      <SelectContent>
                        {subValueType.map((el) => (
                          <SelectItem key={el.value} value={String(el.value)}>{t(el.label)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {actionError.actionName && <p className="error text-red-500 text-xs mt-1">{actionError.actionName}</p>}
                  </div>

                  <div className={`w-full ${isHourlyBid ? 'md:w-3/12' : 'md:w-2/12'} px-2 mb-3 md:mb-0`}>
                    <Select value={action.actionValueType ? String(action.actionValueType) : undefined} onValueChange={(value) => actionTypeHandler({ target: { value } }, index, "actionValueType")}>
                      <SelectTrigger className={actionError.actionValueType ? 'border-red-500' : ''}>
                        <SelectValue placeholder={t("Select Type")} />
                      </SelectTrigger>
                      <SelectContent>
                        {selector.map((el) => (
                          <SelectItem key={el.value} value={String(el.value)}>{t(el.label)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {actionError.actionValueType && <p className="error text-red-500 text-xs mt-1">{actionError.actionValueType}</p>}
                  </div>

                  {!isHourlyBid && (
                    <div className="w-full md:w-3/12 px-2 mb-3 md:mb-0">
                      <div className="relative w-full">
                        <Input
                          type="number"
                          name="actionValue"
                          className={`${actionError?.actionValue ? 'border-red-500' : ''} ${action.actionValueType === 'Percentage' ? 'pr-8' : ''}`}
                          placeholder={t("Value")}
                          onChange={(e) => actionTypeHandler(e, index, "actionValue")}
                          value={action.actionValue}
                        />
                        {action.actionValueType === "Percentage" && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                            %
                          </span>
                        )}
                      </div>
                      {actionError.actionValue && <p className="error text-red-500 text-xs mt-1">{actionError.actionValue}</p>}
                    </div>
                  )}

                  <div className="w-full md:w-1/12 px-2 mb-3 md:mb-0 flex items-center gap-2 mt-1">
                    {actionType.length > 1 && (
                      <div className="delete_icon text-slate-400 hover:text-red-500 cursor-pointer" onClick={() => {
                        const newData = [...actionType];
                        newData.splice(index, 1);
                        setActionType(newData);
                      }}>
                        <AiFillDelete size={20} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="add_border"></div>

          <div className="flex flex-wrap -mx-2 mt-4">
            {/* Days Section */}
            <div className="w-full px-2 mb-4" id="bid-placement-rule-rule-days">
              <label className="mb-1 block">{t("Rule Days")} <span className="text-danger">*</span></label>
              <div className={`days-container flex flex-col gap-2 ${error?.days ? 'has-error' : ''}`}>
                {/* Row 1: All */}
                <div className="flex flex-wrap gap-2">
                  <div
                    className={`day-btn ${selectedDays.length === allDays.length ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedDays(selectedDays.length === allDays.length ? [] : allDays);
                      removeError('days');
                    }}
                  >
                    {t("All")}
                  </div>
                </div>

                {/* Row 2: Days of the week */}
                <div className="flex flex-wrap gap-2">
                  {daysOfWeek.map((day) => (
                    <div
                      key={day}
                      className={`day-btn ${selectedDays.includes(day) ? 'active' : ''}`}
                      onClick={() => {
                        const newDays = selectedDays.includes(day)
                          ? selectedDays.filter(d => d !== day)
                          : [...selectedDays, day];
                        setSelectedDays(newDays);
                        removeError('days');
                      }}
                    >
                      {t(day)}
                    </div>
                  ))}
                </div>

                {/* Row 3: Intervals */}
                <div className="flex flex-wrap gap-2">
                  {intervalDays.map((day) => (
                    <div
                      key={day}
                      className={`day-btn ${selectedDays.includes(day) ? 'active' : ''}`}
                      onClick={() => {
                        const newDays = selectedDays.includes(day)
                          ? selectedDays.filter(d => d !== day)
                          : [...selectedDays, day];
                        setSelectedDays(newDays);
                        removeError('days');
                      }}
                    >
                      {t(day)}
                    </div>
                  ))}
                </div>
              </div>
              {error?.days && <p className="error">{error.days}</p>}
            </div>

            {/* Times Section */}
            {!isHourlyBid && (
              <div className="w-full px-2 mb-4" id="bid-placement-rule-rule-times">
                <label className="mb-1 block">{t("Rule Times")} <span className="text-danger">*</span></label>
                <div className="p-3 bg-gray-100 dark:bg-white/5 border dark:border-white/10 rounded">
                  <div className="flex flex-wrap gap-3 mb-2">
                    {timeData.map((time, index) => {
                      const blockedSlots = getBlockedSlotsForDays(allRulesSchedule, adminRulesSchedule, selectedDays, editId || null);
                      const conflict = isTimeConflicting(time, blockedSlots);
                      const hasError = error?.timesErr?.[index];

                      return (
                        <div key={index} className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <Input type="time"
                              className={`dark:[color-scheme:dark] ${conflict || hasError ? 'border-red-500' : ''}`}
                              value={time}
                              onChange={(e) => handleTimeChange(index, e)}
                            />
                            {conflict && (
                              <p className="error" style={{ fontSize: "10px", marginTop: "2px", maxWidth: "120px", lineHeight: "1.2" }}>
                                ⚠️ {t("Conflict")}: {conflict.ruleName}
                              </p>
                            )}
                            {hasError && !conflict && <p className="error">{hasError}</p>}
                          </div>
                          {timeData.length > 1 && (
                            <div className="delete_icon" onClick={() => {
                              const newTimes = [...timeData];
                              newTimes.splice(index, 1);
                              setTimeData(newTimes);
                            }}>
                              <AiFillDelete size={18} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex justify-between items-center">
                    <label className="custom-checkbox">
                      <input
                        type="checkbox"
                        checked={allowMultiTimeChanges}
                        onChange={(e) => setAllowMultiTimeChanges(e.target.checked)}
                      />
                      <span>{t("Allow Multiple Time Change In A Campaign Per Day")} <i className="fa fa-info-circle text-gray-500 ml-1"></i></span>
                    </label>
                    <ShadcnButton type="button" variant="default" onClick={() => setTimeData([...timeData, ""])}>
                      <AiOutlinePlus size={14} /> {t("Add Time")}
                    </ShadcnButton>
                  </div>
                </div>
              </div>
            )}

            <div className="w-full px-2">
              <div className="add_border"></div>
            </div>
          </div>

          {/* Hourly-Based Changes Section (At the very bottom) */}
          <div className={`col-12 col-lg-12 ${isHourlyBid ? "mb-2" : "mb-4"}`} id="bid-placement-rule-hourly-section">
            <div
              className={`p-4 rounded-xl border transition-all duration-200 shadow-sm ${
                isHourlyBid
                  ? "bg-sky-50/70 border-sky-300/80 dark:bg-sky-950/20 dark:border-sky-700/50"
                  : "bg-slate-50/80 border-slate-200 dark:bg-slate-900/60 dark:border-slate-800"
              }`}
            >
              {/* Toggle Header: Enable Hourly Bid */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 shrink-0">
                    <FiClock size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-0 cursor-pointer">
                        {t("Enable Hourly-Based Changes")}
                      </Label>
                      <AppTooltip
                        text={t("When enabled, replaces single execution times with multi-slot dayparting. Configure custom percentage changes for each time window of the day.")}
                      >
                        <span className="cursor-pointer text-slate-400 hover:text-sky-500 transition-colors">
                          <FiHelpCircle size={14} />
                        </span>
                      </AppTooltip>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-0 mt-0.5">
                      {t("Configure changes for specific time periods throughout the day.")}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isHourlyBid}
                  onCheckedChange={(checked) => {
                    setIsHourlyBid(checked);
                    if (checked) {
                      if (!hourlySlots || hourlySlots.length === 0) {
                        setHourlySlots(generatePlacementSlots(hourlySlotType, actionType));
                      }
                    } else {
                      setTimeData((prev) => (prev && prev.length > 0 ? prev : [""]));
                    }
                  }}
                />
              </div>

              {/* Hourly Configuration Panel */}
              {isHourlyBid && (
                <div className="mt-4 pt-4 border-t border-sky-200/60 dark:border-sky-800/40 space-y-4">
                  {/* Informational Guidance Banner */}
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-sky-100/60 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800/60 text-sky-800 dark:text-sky-300 text-xs">
                    <FiInfo size={16} className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-400" />
                    <div className="space-y-1">
                      <div>
                        <span className="font-semibold">{t("Hourly Schedule Mode Active")}: </span>
                        {t(
                          "Standard fixed 'Rule Times' are disabled. The system will automatically execute your action percentage for each enabled time window below on your selected days."
                        )}
                      </div>
                      <div className="text-sky-700 dark:text-sky-300/90 font-medium">
                        <span className="font-semibold">{t("Note")}: </span>
                        {t(
                          "Setting a slot to 0 will reset the value to its base value (no adjustment)."
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Slot Type Selection */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {t("Slot Type")} <span className="text-danger">*</span>
                        </Label>
                        <AppTooltip text={t("Interval duration for each time block across the 24-hour day.")}>
                          <FiInfo size={12} className="text-slate-400 cursor-pointer" />
                        </AppTooltip>
                      </div>
                      <Select
                        value={hourlySlotType}
                        onValueChange={(val) => {
                          setHourlySlotType(val);
                          setHourlySlots(generatePlacementSlots(val, actionType));
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("Select")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1_HOUR">1 {t("Hour Slots (24 blocks)")}</SelectItem>
                          <SelectItem value="2_HOUR">2 {t("Hour Slots (12 blocks)")}</SelectItem>
                          <SelectItem value="3_HOUR">3 {t("Hour Slots (8 blocks)")}</SelectItem>
                          <SelectItem value="4_HOUR">4 {t("Hour Slots (6 blocks)")}</SelectItem>
                          <SelectItem value="6_HOUR">6 {t("Hour Slots (4 blocks)")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Table-structured Hourly Schedule */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900/90 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <FiClock size={15} className="text-sky-500" />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {t("Configured Time Slots")}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          ({hourlySlots.length} {t("slots")})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyToAll(0)}
                        className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors"
                      >
                        <FiCopy size={13} /> {copiedIdx === 0 ? t("Copied Slot 1 to All!") : t("Copy Slot 1 to All")}
                      </button>
                    </div>

                    
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
                            * {t("Note: If you set the 0 in slot then it will set the value to its base value.")}
                          </p>
                          {error?.hourlySlots && (
                      <p className="text-red-500 text-xs font-bold bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-200 dark:border-red-900/50 mt-3 mb-1">
                        ⚠️ {error.hourlySlots}
                      </p>
                    )}

                    {(() => {
                      const activeActions = (actionType || []).filter(a => a?.placement);
                      if (activeActions.length === 0) {
                        return (
                          <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                            {t("Please select at least one Target in Action Type above to configure hourly adjustments.")}
                          </div>
                        );
                      }

                      const gridTemplate = `180px repeat(${activeActions.length}, minmax(130px, 1fr))`;

                      return (
                        <div className="overflow-x-auto custom-scroll mt-3">
                          <div style={{ minWidth: `${180 + activeActions.length * 140}px` }}>
                            {/* Table Header */}
                            <div
                              className="grid gap-4 text-xs font-bold text-slate-700 dark:text-slate-300 pb-2.5 border-b border-slate-100 dark:border-slate-800 items-center px-2"
                              style={{ gridTemplateColumns: gridTemplate }}
                            >
                              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-bold">
                                <FiClock size={14} className="text-slate-400" />
                                <span>{t("Time Range")}</span>
                              </div>

                              {activeActions.map((action, aIdx) => {
                                const isTop = action.placement === "Top of Search";
                                const isProduct = action.placement === "Product pages";
                                const badgeClass = isTop
                                  ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30"
                                  : isProduct
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30";

                                return (
                                  <div key={action.placement || aIdx} className="flex flex-col">
                                    <div className="flex items-center gap-1">
                                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${badgeClass}`}>
                                        {t(action.placement)}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                                      {t(action.actionName || "Increase Bid")} ({action.actionValueType === "Percentage" ? "%" : "Value"})
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Table Rows */}
                            <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto custom-scroll pr-1 mt-2">
                              {hourlySlots.map((slot, slotIdx) => (
                                <div
                                  key={slot.slotIndex ?? slotIdx}
                                  className="grid gap-4 items-center hover:bg-slate-50 dark:hover:bg-white/5 py-1.5 px-2 rounded-lg transition-colors"
                                  style={{ gridTemplateColumns: gridTemplate }}
                                >
                                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                    {slot.startTime} – {slot.endTime}
                                  </div>

                                  {activeActions.map((action, aIdx) => {
                                    const act = slot.actions?.find(a => a.placement === action.placement);
                                    const isPercentage = action.actionValueType === "Percentage";

                                    return (
                                      <div key={action.placement || aIdx} className="relative">
                                        <input
                                          type="number"
                                          value={act?.actionValue !== undefined && act?.actionValue !== null ? act.actionValue : ""}
                                          placeholder="0"
                                          onChange={(e) => handleSlotActionChange(slotIdx, action.placement, "actionValue", e.target.value)}
                                          className={`w-full h-8 px-2.5 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 text-slate-900 dark:text-white ${
                                            isPercentage ? "pr-6" : ""
                                          }`}
                                        />
                                        {isPercentage && (
                                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold pointer-events-none">
                                            %
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="cm-footer border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 flex !justify-between items-center shrink-0 sticky bottom-0 z-10 w-full">
          <div>
            {!editId && (
              <ShadcnButton
                variant="outline"
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold"
                type="button"
                onClick={() => setStep('choose-path')}
              >
                {t("Back")}
              </ShadcnButton>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <ShadcnButton
              variant="outline"
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold"
              type="button"
              onClick={() => setaddModalFlag(false)}
            >
              {t("Cancel")}
            </ShadcnButton>
            <ShadcnButton
              id="bid-placement-rule-submit"
              type="submit"
              disabled={submitting}
              className="improve add_btn px-4 py-2 bg-[#1A9FD4] text-white hover:opacity-90 rounded-md text-sm font-semibold flex items-center gap-1.5"
            >
              {submitting && <i className="fa fa-spinner fa-spin mr-1.5" />}
              {submitting ? t("Submitting...") : t("Submit")}
            </ShadcnButton>
          </div>
        </div>
      </form>
      <RuleCreationCampaignModal
        draft={creationDraft}
        onCancel={() => setCreationDraft(null)}
        createRule={ApicreateRule}
        allRules={allRulesSchedule}
        onCreated={(result) => {
          setCreationDraft(null);
          getRule();
          Toast.success(result.message);
          setaddModalFlag(false);
        }}
      />
    </div>
  );
}

export default AddRule;

