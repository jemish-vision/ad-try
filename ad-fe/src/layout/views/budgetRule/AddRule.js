import RuleCreationCampaignModal from '../../../components/rule-wizard/RuleCreationCampaignModal';
import React, { useState, useContext, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next';
import { ApicreateRule, ApiupdateRule, ApiRuleConditions } from '../../../api-wrapper/budgetRule/ApiBudgetRule';
import { ProfileContext } from '../../../helper/usecontext/useContext';
import { handleLoader, Toast, useDispatch } from "../../../helper/links/Link";
import { AiOutlinePlus } from "react-icons/ai";
import { AiFillDelete } from "react-icons/ai";
import { Input } from '../../../components/ui/input';
import { Button as ShadcnButton } from '../../../components/ui/button';
import { ShadcnDatePicker } from '../../../components/ui/date-picker';
import { Checkbox } from '../../../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '../../../components/ui/select';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import { FiClock, FiInfo, FiHelpCircle } from 'react-icons/fi';
import { AppTooltip } from '../../../components/ui/AppTooltip';
import { getCurrencySymbol } from '../../../helper/currencyCode/CurrencyCode';

import { addBudgetRuleQuery, UpdateBudgetQuery } from '../../../utility/createQuery';
import { ApiFilterListing } from '../../../api-wrapper/customer/ApiCustomer';
import { getBlockedSlotsForDays, isTimeConflicting, validateTimeConflict, resolveTemplateTimes } from '../../../utility/ruleTimeConflict';
import { getBudgetRuleTemplates } from './budgetRuleTemplate';
import { RuleWizardChoosePath, RuleWizardTemplates } from '../../../components/rule-wizard/RuleWizardSteps';

function AddRule({ setaddModalFlag, editId, setEditId, getRule, editData, setEditData, adminRulesSchedule = [], allRulesSchedule = [] }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  let { profileId, today, selectedAdType, currencyCode } = useContext(ProfileContext);

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);



  const subValueType = [
    { value: "Paused", label: "Campaign Paused" },
    { value: "Enabled", label: "Campaign Enabled" },
    { value: "Increase", label: "Increase Budget" },
    { value: "Decrease", label: "Decrease Budget" },
    { value: "setBudget", label: "Set Budget" },
  ];

  const validatorLabel = [
    { value: "LESS_THAN", label: "Less Than" },
    { value: "LESS_THAN_OR_EQUAL_TO", label: "Less Than Or Equal To" },
    { value: "GREATER_THAN_OR_EQUAL_TO", label: "Greater Than Or Equal To" },
    { value: "GREATER_THAN", label: "Greater Than" },
    { value: "EQUAL_TO", label: "Equal To" },
  ];

  const status = [
    { value: "ENABLED", label: "Enabled" },
    { value: "PAUSED", label: "Paused" },
    { value: "ARCHIVED", label: "Archived" },
    { value: "OUT_OF_BUDGET", label: "Out Of Budget" },
  ];

  const type = [
    { value: "Sponsored Products", label: "Sponsored Products" },
    { value: "Sponsored Brands", label: "Sponsored Brands" },
    { value: "Sponsored Display", label: "Sponsored Display" },
  ];

  const targeting_type = [
    { value: "MANUAL", label: "Manual Targeting" },
    { value: "AUTO", label: "Automatic Targeting" },
  ];



  const selector = [
    { value: "Number", label: "Number" },
    { value: "Percentage", label: "Percentage" },
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

  const [loadingEditData, setLoadingEditData] = useState(Boolean(editId));
  const [submitting, setSubmitting] = useState(false);
  const [creationDraft, setCreationDraft] = useState(null);
  const [error, seterror] = useState();
  const [ruleName, setRuleName] = useState("");
  const [reportDate, setReportDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [selectedDays, setSelectedDays] = useState([]);
  const [ruleType, setRuleType] = useState("");
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [allowMultiTimeChanges, setAllowMultiTimeChanges] = useState(true);
  const [daysSinceCreation, setDaysSinceCreation] = useState(0);
  const [isDaysSinceCreation, setIsDaysSinceCreation] = useState(false);

  // Hourly budget toggle states
  const [isHourlyBudgetEnabled, setIsHourlyBudgetEnabled] = useState(false);
  const [hourlyFrequency, setHourlyFrequency] = useState("DAILY");
  const [hourlySlotType, setHourlySlotType] = useState("2_HOUR");
  const [hourlySlots, setHourlySlots] = useState([]);

  const SLOT_STEP = {
    "1_HOUR": 1,
    "2_HOUR": 2,
    "3_HOUR": 3,
    "4_HOUR": 4,
    "6_HOUR": 6,
  };

  const generateSlots = (slotType, currentActionType = actionType) => {
    const step = SLOT_STEP[slotType] || 2;
    const slots = [];
    const isState = ["Enabled", "Paused"].includes(currentActionType?.actionName);

    for (let i = 0; i < 24; i += step) {
      slots.push({
        slotIndex: slots.length,
        startTime: `${String(i).padStart(2, "0")}:00`,
        endTime: `${String(i + step).padStart(2, "0")}:00`,
        enabled: true,
        budgetPercentage: 0,
        bidPercentage: 0,
        value: 0,
        state: isState && currentActionType?.actionName === "Paused" ? "PAUSED" : "ENABLED",
      });
    }
    return slots;
  };

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

    if (template.data.conditionData && template.data.conditionData.length > 0) {
      setMainRuleData(template.data.conditionData);
    } else {
      setMainRuleData([{ conditionType: "", conditionOperator: "", conditionValue: "", conditionStringValue: "", conditionValueType: "Number" }]);
    }

    setActionType({
      actionName: template.data.actionType?.actionName || "",
      actionValue: template.data.actionType?.actionValue || "",
      actionValueType: template.data.actionType?.actionValueType || ""
    });

    setIsHourlyBudgetEnabled(false);
    setHourlySlots([]);
    setStep('form');
  };

  const [mainLabel, setMainLabel] = useState([]);

  const [actionType, setActionType] = useState({
    actionName: '',
    actionValue: '',
    actionValueType: ''
  });

  const [mainRuleData, setMainRuleData] = useState([
    {
      conditionType: "",
      conditionOperator: "",
      conditionValue: "",
      conditionStringValue: "",
      conditionValueType: "Number",
    },
  ]);

  const [timeData, setTimeData] = useState([""]);
  const isBudgetAction = ["Increase", "Decrease", "setBudget"].includes(actionType?.actionName);

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

  useEffect(() => {
    const getMainLabel = async () => {
      if (profileId.value && selectedAdType) {
        await ApiFilterListing({
          profileId: profileId.value,
          pageName: "Budget Rules",
        })
          .then((e) => {
            if (e?.isSuccess) {
              const skipOption = ["CampaignsAndAdGroups"];
              let filters = e?.filters?.map((el) => ({ ...el, label: el.name })).filter(e1 => !skipOption?.includes(e1?.value)) || [];
              if (!filters.some(el => el?.value === "OutOfBudget" || el?.value === "Out of Budget")) {
                filters.push({
                  name: "Out of Budget",
                  value: "OutOfBudget",
                  label: "Out of Budget",
                  isDefault: true,
                  isSPFilter: true,
                  isSBFilter: true,
                  isSDFilter: true,
                });
              }
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
  }, [editId, profileId, selectedAdType])

  useEffect(() => {
    if (editId) {
      setLoadingEditData(true);
      ApiRuleConditions(editId)
        .then((res) => {
          if (res.isSuccess) {
            setRuleName(res.data.ruleName);
            setReportDate(res?.data?.reportDate);
            setToDate(res?.data?.toDate);
            setActionType(res.data.actionType);
            setMainRuleData(res.data.conditions);
            setSelectedDays(res.data.days ?? []);
            setTimeData(res.data.times?.length ? res.data.times : [""]);
            setRuleType(res.data.ruleType);
            setStartDate(res.data.startDate);
            setEndDate(res.data.endDate);
            setAllowMultiTimeChanges(res.data.allowMultiTimeChanges);
            setDaysSinceCreation(res.data.daysSinceCreation || 0);
            setIsDaysSinceCreation(res.data.isDaysSinceCreation || false);
            setIsHourlyBudgetEnabled(res.data.isHourlyBudget || res.data.isHourlyBid || false);
            if (res.data.hourlyConfig) {
              setHourlyFrequency(res.data.hourlyConfig.frequency || "DAILY");
              setHourlySlotType(res.data.hourlyConfig.slotType || "2_HOUR");
              setHourlySlots(res.data.hourlyConfig.slots || []);
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

  const submitHandler = (e) => {
    e.preventDefault();

    const isBudgetAction = ["Increase", "Decrease", "setBudget"].includes(actionType?.actionName);
    const effectiveIsHourlyBudget = isHourlyBudgetEnabled && isBudgetAction;

    let flag = false;
    let sendData = {
      ruleName: ruleName,
      reportDate: reportDate,
      toDate: toDate,
      actionType: actionType,
      profileId: profileId?.value,
      conditions: mainRuleData,
      times: effectiveIsHourlyBudget ? [] : timeData,
      days: selectedDays,
      ruleType,
      startDate,
      endDate,
      allowMultiTimeChanges,
      daysSinceCreation,
      isDaysSinceCreation,
      isHourlyBudget: effectiveIsHourlyBudget,
      isHourlyBid: effectiveIsHourlyBudget,
      hourlyConfig: effectiveIsHourlyBudget ? {
        frequency: hourlyFrequency,
        slotType: hourlySlotType,
        slots: hourlySlots.map((s) => ({
          ...s,
          value: Number(s.value) || 0,
          budgetPercentage: Number(s.budgetPercentage ?? s.bidPercentage) || 0,
          bidPercentage: Number(s.budgetPercentage ?? s.bidPercentage) || 0,
        })),
      } : null,
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

        if (["Status", "Type", "Targeting Type"].includes(el?.conditionType)) {
          if (!el.conditionStringValue) {
            flag = true;
            subArr.conditionStringValue = "Condition Status is required";
          }
        } else if (["OutOfBudget", "Out of Budget"].includes(el?.conditionType)) {
          // Out of Budget is self-contained without secondary fields
        } else {
          if (!el.conditionOperator) {
            flag = true;
            subArr.conditionOperator = "Operator is required";
          }
          if (!el.conditionValueType) {
            flag = true;
            subArr.conditionValueType = "Value Type is required";
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
      if (!sendData?.actionType.actionName) {
        flag = true;
        errorData.actionName = "Action Name is required";
      }
      if (['Increase', 'Decrease', 'setBudget'].includes(sendData?.actionType.actionName)) {
        if (!effectiveIsHourlyBudget && !sendData?.actionType.actionValue && sendData?.actionType.actionValue !== 0) {
          flag = true;
          errorData.actionValue = "Action Value is required";
        }
        if (!sendData?.actionType.actionValueType) {
          flag = true;
          errorData.actionValueType = "Action Value Type is required";
        }
      }
    }

    if (!effectiveIsHourlyBudget) {
      let mainArrCheck = [];
      sendData?.times?.forEach((el, index) => {
        if (!el || Object.keys(el).length === 0) {
          flag = true;
          mainArrCheck[index] = "Time is required";
        }
      });
      errorData.timesErr = mainArrCheck;
    } else {
      if (!hourlySlots.some((s) => s.enabled)) {
        flag = true;
        errorData.hourlySlots = t("At least one time slot must be enabled");
      }
    }

    if (!selectedDays || selectedDays.length === 0) {
      flag = true;
      errorData.days = "At least one day is required";
    }

    if (reportDate && reportDate === "YEAR_TO_DATE" && !toDate) {
      flag = true;
      errorData.toDate = "Date is required";
    }

    if (!sendData.reportDate) {
      flag = true;
      errorData.reportDate = "Date Filter is required";
    }

    if (!effectiveIsHourlyBudget && selectedDays.length > 0 && sendData.times?.length > 0) {
      const conflicts = validateTimeConflict(allRulesSchedule, adminRulesSchedule, selectedDays, sendData.times, editId || null);
      if (conflicts.length > 0) flag = true;
    }

    seterror(errorData);

    if (!flag) {
      sendData.query = {
        SP: UpdateBudgetQuery(addBudgetRuleQuery(sendData, mainLabel, "SP"), editData?.campaignIds?.SP ?? []),
        SB: UpdateBudgetQuery(addBudgetRuleQuery(sendData, mainLabel, "SB"), editData?.campaignIds?.SB ?? []),
        SD: UpdateBudgetQuery(addBudgetRuleQuery(sendData, mainLabel, "SD"), editData?.campaignIds?.SD ?? []),
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
              getRule()
              setEditId(null)
              setEditData(null)
              Toast.success(res.message);
              setaddModalFlag(false)
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
      }
    }
  };

  const mainRuleChangeHandler = (e, obj, address_type, numberVal, index) => {
    let data = [...mainRuleData];
    let value = e.target.value;

    if (address_type === "conditionValueType") {
      obj.conditionValue = '';
      obj.conditionValueType = value;
      setMainRuleData(data);
      removeError('conditions', index, 'conditionValueType');
      return;
    }

    if (address_type === "conditionValue" && data[index]?.conditionValueType === 'Percentage') {
      const newValue = parseFloat(value);
      if (!isNaN(newValue) && newValue >= 0 && newValue <= 100) {
        obj.conditionValue = value;
      } else {
        obj.conditionValue = "";
      }
      setMainRuleData(data);
      removeError('conditions', index, 'conditionValue');
      return;
    }

    if (address_type === "conditionType") {
      obj.conditionType = value;
      if (["OutOfBudget", "Out of Budget"].includes(value)) {
        obj.conditionStringValue = obj.conditionStringValue || "OUT_OF_BUDGET";
        obj.conditionOperator = "EQUAL_TO";
        obj.conditionValue = "";
      } else if (["Status", "Type", "Targeting Type"].includes(value)) {
        obj.conditionOperator = "EQUAL_TO";
        obj.conditionValue = "";
      } else {
        obj.conditionStringValue = "";
      }
      setMainRuleData(data);
      removeError('conditions', index, 'conditionType');
      return;
    }

    if (address_type) {
      obj[address_type] = value;
      setMainRuleData(data);
      removeError('conditions', index, address_type);
      return;
    }

    const dataName = e.target.attributes["data-name"]?.value;
    if (dataName) {
      obj[dataName] = value;
      setMainRuleData(data);
    }
  };

  const addConditionHandler = () => {
    setMainRuleData([
      ...mainRuleData,
      {
        conditionType: "",
        conditionOperator: "",
        conditionValue: "",
        conditionStringValue: "",
        conditionValueType: "Number",
      },
    ]);
  };

  const handleTimeChange = (index, e) => {
    let arr = [...timeData]
    arr[index] = e.target.value
    setTimeData(arr)

    if (error?.timesErr?.[index]) {
      let newTimesErr = [...error.timesErr];
      newTimesErr[index] = undefined;
      seterror({ ...error, timesErr: newTimesErr });
    }
  };

  const handleAddTimeField = () => {
    setTimeData([...timeData, ""]);
  };

  const handleRemoveTimeField = (index) => {
    let arr = [...timeData]
    arr.splice(index, 1)
    setTimeData(arr)
  };

  const handleRemoveRule = (index) => {
    const newData = [...mainRuleData];
    newData.splice(index, 1);
    setMainRuleData(newData);
  }

  const handleActionType = (e, numberVal) => {
    if (e.target.name === 'actionValueType') {
      setActionType({
        ...actionType,
        actionValue: "",
        actionValueType: e.target.value
      })
      removeError('actionValueType');
    } else if (e.target.name === "actionValue" && actionType.actionValueType === "Percentage") {
      const newValue = parseFloat(e.target.value);
      if (!isNaN(newValue) && newValue >= 0 && newValue <= 100) {
        setActionType({
          ...actionType,
          [e.target.name]: e.target.value
        })
      } else {
        setActionType({
          ...actionType,
          actionValue: "",
        })
      }
      removeError('actionValue');
    } else if (e.target.value === 'Paused' || e.target.value === 'Enabled') {
      setActionType({
        actionName: e.target.value,
        actionValue: '',
        actionValueType: ''
      });
      setIsHourlyBudgetEnabled(false);
      removeError('actionName');
    } else if (['Increase', 'Decrease', 'setBudget'].includes(e.target.value)) {
      setActionType({
        ...actionType,
        actionName: e.target.value,
        actionValueType: actionType.actionValueType || "Number"
      });
      removeError('actionName');
      removeError('actionValueType');
    } else {
      setActionType({
        ...actionType,
        [e.target.name]: e.target.value
      })
      if (e.target.name) {
        removeError(e.target.name);
      }
    }
  }

  const handleCancel = () => {
    setEditId(null)
    setEditData(null)
    setRuleName("");
    setReportDate(null)
    setToDate(null)
    setSelectedDays([]);
    setMainRuleData([
      {
        conditionType: "",
        conditionOperator: "",
        conditionValue: "",
        conditionStringValue: "",
        conditionValueType: "Number",
      },
    ]);
    setActionType({
      actionName: "",
      actionValue: "",
      actionValueType: "",
    });
    setTimeData([""]);
    setRuleType("");
    setStartDate(null);
    setEndDate(null);
    setAllowMultiTimeChanges(false);
    setDaysSinceCreation(0);
    setIsDaysSinceCreation(false);
    setIsHourlyBudgetEnabled(false);
    setHourlySlots([]);
    setHourlyFrequency("DAILY");
    setHourlySlotType("2_HOUR");
    setaddModalFlag(false)
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
        title={t("Create New Budget Rule")}
        description={t("Automation helps you optimize your ad spend 24/7. Select how you want to start building your optimization logic.")}
        templateCardTitle={t("Browse Templates")}
        templateCardDesc={t("Choose from pre-configured rules for Dayparting, ACOS targets, or Budget Boosts.")}
        scratchCardTitle={t("Build Custom Rule")}
        scratchCardDesc={t("Create a blank rule and define your own conditions and actions from the ground up.")}
        onSelectTemplates={() => setStep('templates')}
        onSelectScratch={() => {
          setRuleName("");
          setRuleType("");
          setReportDate(null);
          setSelectedDays([]);
          setTimeData([""]);
          setMainRuleData([{ conditionType: "", conditionOperator: "", conditionValue: "", conditionStringValue: "", conditionValueType: "Number" }]);
          setActionType({ actionName: "", actionValue: "", actionValueType: "" });
          setIsHourlyBudgetEnabled(false);
          setHourlySlots([]);
          setStep('form');
        }}
      />
    );
  }

  if (step === 'templates') {
    return (
      <RuleWizardTemplates
        templates={getBudgetRuleTemplates(t)}
        onApplyTemplate={applyTemplate}
        onBack={() => setStep('choose-path')}
      />
    );
  }

  return (
    <div id='budget-rule-add' className="new_rule">
      <form onSubmit={submitHandler}>
        <div className="p-6 pb-0">
          {/* Rule Name, Date Filter, Days Since Creation */}
          <div className="flex flex-wrap -mx-2 items-start mb-3">
            <div id="budget-rule-name-input" className="w-full md:w-4/12 px-2">
              <label className="mb-1 block">{t("Rule Name")} <span className="text-danger">*</span></label>
              <Input type="text"
                name="ruleName"
                className={`${error?.ruleName ? 'border-red-500' : ''}`}
                placeholder={t("Enter rule name")}
                onChange={(e) => {
                  setRuleName(e.target.value);
                  removeError('ruleName');
                }}
                value={ruleName}
              />
              {error?.ruleName && <p className="error">{error.ruleName}</p>}
            </div>

            <div className="w-full md:w-3/12 px-2" id="budget-rule-date-filter">
              <label className="mb-1 block">{t("Date Filter")}</label>
              <Select value={reportDate || undefined} onValueChange={(value) => {
                setReportDate(value);
                removeError('reportDate');
              }}>
                <SelectTrigger className={error?.reportDate ? 'error' : '' ? 'border-red-500' : ''}>
                  <SelectValue placeholder={t("Select")} />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FILTER_OPTION.map((el) => (
                    <SelectItem key={el.value} value={el.value}>{t(el.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {error?.reportDate && <p className="error">{error.reportDate}</p>}
            </div>

            {reportDate === "YEAR_TO_DATE" && (
              <div className="w-full md:w-2/12 px-2">
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
                {error?.toDate && <p className="error">{error.toDate}</p>}
              </div>
            )}

            <div className="w-full md:w-3/12 px-2" id="budget-rule-days-since">
              <label className="custom-checkbox mb-1 flex items-center gap-2 pb-1">
                <Checkbox
                  checked={isDaysSinceCreation}
                  onCheckedChange={(checked) => {
                    setIsDaysSinceCreation(checked);
                    if (!checked) setDaysSinceCreation(0);
                  }}
                />
                <span>{t("Day's Since Creation")}</span>
              </label>
              <Input type="number"
                name="daysSinceCreation"
                className={`${error?.daysSinceCreation ? 'border-red-500' : ''}`}
                placeholder={t("0")} value={daysSinceCreation}
                onChange={(e) => setDaysSinceCreation(e.target.value)} disabled={!isDaysSinceCreation}
              />
              {error?.daysSinceCreation && <p className="error">{error.daysSinceCreation}</p>}
            </div>
          </div> {/* Rule Type and Dates */}
          <div className="flex flex-wrap -mx-2 items-start mb-3">
            <div className="w-full md:w-4/12 px-2" id="budget-rule-type">
              <label className="mb-1 block">{t("Rule Type")} <span className="text-danger">*</span></label>
              <Select value={ruleType || undefined} onValueChange={(value) => {
                setRuleType(value);
                removeError('ruleType');
              }}>
                <SelectTrigger className={error?.ruleType ? 'error' : '' ? 'border-red-500' : ''}>
                  <SelectValue placeholder={t("Select")} />
                </SelectTrigger>
                <SelectContent>
                  {ruleTypeOption.map((el) => (
                    <SelectItem key={el.value} value={el.value}>{t(el.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {error?.ruleType && <p className="error">{error.ruleType}</p>}
            </div>
            {ruleType === "T" && (
              <>
                <div className="w-full md:w-4/12 px-2">
                  <label className="mb-1 block">{t("Start Date")} <span className="text-danger">*</span></label>
                  <ShadcnDatePicker className={`${error?.startDate ? 'border-red-500' : ''}`}
                    placeholder={t("Select Start Date")}
                    value={startDate}
                    onChange={(date) => {
                      setStartDate(date);
                      removeError('startDate');
                    }} />
                  {error?.startDate && <p className="error">{error.startDate}</p>}
                </div>
                <div className="w-full md:w-4/12 px-2">
                  <label className="mb-1 block">{t("End Date")} <span className="text-danger">*</span></label>
                  <ShadcnDatePicker className={`${error?.endDate ? 'border-red-500' : ''}`}
                    placeholder={t("Select End Date")}
                    value={endDate}
                    onChange={(date) => {
                      setEndDate(date);
                      removeError('endDate');
                    }} />
                  {error?.endDate && <p className="error">{error.endDate}</p>}
                </div>
              </>)}
          </div>
          <div className="add_border"></div>
          {/* Conditions Array */}
          <div className="mb-4" id="budget-rule-conditions">
            <div className="flex justify-between items-center mb-3">
              <div className="section-title">{t("Conditions")}</div>
              <ShadcnButton type="button" variant="default" onClick={addConditionHandler}>
                <AiOutlinePlus size={13} /> {t("Add Condition")}
              </ShadcnButton>
            </div>
            {mainRuleData?.map((element, index) => {
              const conditionError = error?.conditions?.[index] || {};
              const isStatusType = ["Status", "Type", "Targeting Type"].includes(element?.conditionType);
              const isOutOfBudgetType = ["OutOfBudget", "Out of Budget"].includes(element?.conditionType);
              const showOperators = !isStatusType && !isOutOfBudgetType && element?.conditionType;
              return (
                <div className="flex flex-wrap -mx-2 items-start mb-2" key={index}>
                  <div className="w-full md:w-3/12 px-2">
                    <Select key={`conditionType-${index}-${mainLabel.length}-${element.conditionType || 'empty'}`} value={element.conditionType ? String(element.conditionType) : undefined} onValueChange={(value) => {
                      mainRuleChangeHandler({ target: { value } }, element, "conditionType", null, index);
                    }}>
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

                    {conditionError.conditionType && <p className="error">{conditionError.conditionType}</p>}
                  </div>

                  {isStatusType && (
                    <div className="w-full md:w-3/12 px-2">
                      <Select value={element.conditionStringValue ? String(element.conditionStringValue) : undefined} onValueChange={(value) => {
                        mainRuleChangeHandler({ target: { value } }, element, "conditionStringValue", null, index);
                      }}>
                        <SelectTrigger className={conditionError.conditionStringValue ? 'border-red-500' : ''}>
                          <SelectValue placeholder={t("Select")} />
                        </SelectTrigger>
                        <SelectContent>
                          {element?.conditionType === 'Status' && status.map(el => (
                            <SelectItem key={el.value} value={String(el.value)}>{t(el.label)}</SelectItem>
                          ))}
                          {element?.conditionType === 'Type' && type.map(el => (
                            <SelectItem key={el.value} value={String(el.value)}>{t(el.label)}</SelectItem>
                          ))}
                          {element?.conditionType === 'Targeting Type' && targeting_type.map(el => (
                            <SelectItem key={el.value} value={String(el.value)}>{t(el.label)}</SelectItem>
                          ))}

                        </SelectContent>
                      </Select>

                      {conditionError.conditionStringValue && <p className="error">{conditionError.conditionStringValue}</p>}
                    </div>
                  )}

                  {showOperators && (
                    <>
                      <div className="w-full md:w-3/12 px-2">
                        <Select value={element.conditionOperator ? String(element.conditionOperator) : undefined} onValueChange={(value) => {
                          mainRuleChangeHandler({ target: { value } }, element, "conditionOperator", null, index);
                        }}>
                          <SelectTrigger className={conditionError.conditionOperator ? 'border-red-500' : ''}>
                            <SelectValue placeholder={t("Select")} />
                          </SelectTrigger>
                          <SelectContent>
                            {validatorLabel.map(el => (
                              <SelectItem key={el.value} value={String(el.value)}>{t(el.label)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {conditionError.conditionOperator && <p className="error">{conditionError.conditionOperator}</p>}
                      </div>

                      <div className="w-full md:w-2/12 px-2">
                        <Select value={element.conditionValueType || undefined} onValueChange={(value) => {
                          mainRuleChangeHandler({ target: { value } }, element, "conditionValueType", null, index);
                        }}>
                          <SelectTrigger className={conditionError.conditionValueType ? 'border-red-500' : ''}>
                            <SelectValue placeholder={t("Select")} />
                          </SelectTrigger>
                          <SelectContent>
                            {selector.map(el => (
                              <SelectItem key={el.value} value={el.value}>{t(el.label)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {conditionError.conditionValueType && <p className="error">{conditionError.conditionValueType}</p>}
                      </div>

                      <div className="w-full md:w-3/12 px-2">
                        <div className="flex items-stretch w-full rounded-md border border-slate-300 dark:border-slate-600 overflow-hidden focus-within:ring-1 focus-within:ring-[#1A9FD4] focus-within:border-[#1A9FD4]">
                          <Input type="number"
                            name={`conditions.${index}.conditionValue`}
                            className={`flex-1 w-full border-0 outline-none focus-visible:ring-0 shadow-none text-sm ${conditionError.conditionValue ? 'bg-red-50 dark:bg-red-900/20' : ''}`}
                            placeholder={t("Value")}
                            onChange={(e) => mainRuleChangeHandler(e, element, "conditionValue", null, index)}
                            value={element.conditionValue} />
                          {element.conditionValueType === "Percentage" && (<span className="flex items-center px-3 bg-slate-50 dark:bg-slate-800 border-l border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-sm">%</span>)}
                        </div>
                        {conditionError.conditionValue && <p className="error text-red-500 text-xs mt-1">{conditionError.conditionValue}</p>}
                      </div>
                    </>
                  )}
                  <div className="w-full md:w-1/12 px-2 flex items-center gap-2 mt-1">
                    {mainRuleData.length > 1 && (<div className="delete_icon text-slate-400 hover:text-red-500 cursor-pointer" onClick={() => handleRemoveRule(index)}> <AiFillDelete size={20} /> </div>)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="add_border"></div>
          {/* Action Type */}
          <div className="mb-4" id="budget-rule-actions">
            <div className="flex justify-between items-center mb-3">
              <div className="section-title">{t("Action Type")} <span className="text-danger ms-1">*</span></div>
            </div>
            <div className="flex flex-wrap -mx-2 items-start">
              <div className="w-full md:w-4/12 px-2">
                <Select value={actionType.actionName ? String(actionType.actionName) : undefined} onValueChange={(value) => {
                  handleActionType({ target: { name: 'actionName', value } });
                }}>
                  <SelectTrigger className={error?.actionName ? 'border-red-500' : ''}>
                    <SelectValue placeholder={t("Select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {subValueType.map(el => (
                      <SelectItem key={el.value} value={String(el.value)}>{t(el.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {error?.actionName && <p className="error">{error.actionName}</p>}
              </div>

              {!['Paused', 'Enabled'].includes(actionType.actionName) && (
                <>
                  <div className="w-full md:w-3/12 px-2">
                    <Select value={actionType.actionValueType ? String(actionType.actionValueType) : undefined} onValueChange={(value) => {
                      handleActionType({ target: { name: 'actionValueType', value } });
                    }}>
                      <SelectTrigger className={error?.actionValueType ? 'border-red-500' : ''}>
                        <SelectValue placeholder={t("Select")} />
                      </SelectTrigger>
                      <SelectContent>
                        {selector.map(el => (
                          <SelectItem key={el.value} value={String(el.value)}>{t(el.label)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {error?.actionValueType && <p className="error">{error.actionValueType}</p>}
                  </div>

                  {!isHourlyBudgetEnabled && (
                    <div className="w-full md:w-3/12 px-2">
                      <div className="relative w-full">
                        {actionType.actionValueType === "Number" && (
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">{getCurrencySymbol(currencyCode)}</span>
                        )}
                        <Input type="number"
                          name="actionValue"
                          className={`${error?.actionValue ? 'border-red-500' : ''} ${actionType.actionValueType === 'Percentage' ? 'pr-8' : ''} ${actionType.actionValueType === 'Number' ? 'pl-7' : ''}`}
                          placeholder={t("Enter value")}
                          value={actionType.actionValue}
                          onChange={(e) => handleActionType(e)}
                        />
                        {actionType.actionValueType === "Percentage" && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                        )}
                      </div>
                      {error?.actionValue && <p className="error text-red-500 text-xs mt-1">{error.actionValue}</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="add_border"></div>

          {/* Days and Times Section */}
          <div className="flex flex-wrap -mx-2 mt-4">
            {/* Days Section */}
            <div className="w-full px-2 mb-4" id="budget-rule-rule-days">
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
            {(!isHourlyBudgetEnabled || !isBudgetAction) && (
              <div className="w-full px-2 mb-4" id="budget-rule-rule-times">
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
                            <div className="delete_icon" onClick={() => handleRemoveTimeField(index)}>
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
                      <span>
                        {t("Allow Multiple Time Change In A Campaign Per Day")}
                        <i className="fa fa-info-circle text-gray-500 ml-1"></i>
                      </span>
                    </label>
                    <ShadcnButton type="button" variant="default" onClick={handleAddTimeField} className="flex items-center gap-2 h-9">
                      <AiOutlinePlus size={14} /> {t("Add Time")}
                    </ShadcnButton>
                  </div>
                </div>
              </div>
            )}

            {/* Hourly Bid/Budget Changes Section */}
            <div className={`w-full px-2 ${isHourlyBudgetEnabled && isBudgetAction ? "mb-2" : "mb-4"}`} id="budget-rule-hourly-section">
              <div
                className={`p-4 rounded-xl border transition-all duration-200 shadow-sm ${
                  isHourlyBudgetEnabled && isBudgetAction
                    ? "bg-sky-50/70 border-sky-300/80 dark:bg-sky-950/20 dark:border-sky-700/50"
                    : !isBudgetAction
                    ? "bg-slate-50/40 border-slate-200/60 dark:bg-slate-900/40 dark:border-slate-800/60 opacity-60"
                    : "bg-slate-50/80 border-slate-200 dark:bg-slate-900/60 dark:border-slate-800"
                }`}
              >
                {/* Toggle Header: Enable Hourly Budget */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 shrink-0">
                      <FiClock size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Label className={`text-sm font-bold text-slate-800 dark:text-slate-200 mb-0 ${isBudgetAction ? "cursor-pointer" : "cursor-not-allowed"}`}>
                          {t("Enable Hourly-Based Changes")}
                        </Label>
                        <AppTooltip
                          text={
                            !isBudgetAction
                              ? t("Hourly changes are only available when a Budget action (Increase Budget, Decrease Budget, Set Budget) is selected.")
                              : t("When enabled, replaces single execution times with multi-slot dayparting. Configure custom percentage changes for each time window of the day.")
                          }
                        >
                          <span className="cursor-pointer text-slate-400 hover:text-sky-500 transition-colors">
                            <FiHelpCircle size={14} />
                          </span>
                        </AppTooltip>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-0 mt-0.5">
                        {!isBudgetAction
                          ? t("Select a budget action (Increase, Decrease, Set Budget) to enable hourly scheduling.")
                          : t("Configure changes for specific time periods throughout the day.")}
                      </p>
                    </div>
                  </div>
                  <Switch
                    disabled={!isBudgetAction}
                    checked={isHourlyBudgetEnabled && isBudgetAction}
                    onCheckedChange={(checked) => {
                      setIsHourlyBudgetEnabled(checked);
                      if (checked) {
                        if (hourlySlots.length === 0) {
                          setHourlySlots(generateSlots(hourlySlotType, actionType));
                        }
                      } else {
                        setTimeData((prev) => (prev && prev.length > 0 ? prev : [""]));
                      }
                    }}
                  />
                </div>

                {isHourlyBudgetEnabled && isBudgetAction && (
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

                    {/* Slot Type */}
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
                          onValueChange={(value) => {
                            setHourlySlotType(value);
                            setHourlySlots(generateSlots(value, actionType));
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

                    {/* Time Slot Grid */}
                    {(() => {
                      const isStateAction = ["Enabled", "Paused"].includes(actionType.actionName);
                      const isNumberMode = !isStateAction && actionType.actionValueType === "Number";
                      const currSym = getCurrencySymbol(currencyCode);

                      return (
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

                            {/* Quick Presets for Bulk Adjustment */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-medium text-slate-400 mr-1">{t("Presets")}:</span>
                              {isStateAction ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setHourlySlots(hourlySlots.map((s) => ({ ...s, state: "ENABLED" })));
                                    }}
                                    className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
                                  >
                                    {t("All Enabled")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setHourlySlots(hourlySlots.map((s) => ({ ...s, state: "PAUSED" })));
                                    }}
                                    className="text-[11px] font-medium px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors"
                                  >
                                    {t("All Paused")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setHourlySlots(hourlySlots.map((s) => {
                                        const h = parseInt(s.startTime, 10);
                                        return { ...s, state: (h >= 9 && h < 18) ? "ENABLED" : "PAUSED" };
                                      }));
                                    }}
                                    className="text-[11px] font-medium px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
                                  >
                                    {t("Business Hours (09–18)")}
                                  </button>
                                </>
                              ) : isNumberMode ? (
                                actionType.actionName === "setBudget" ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHourlySlots(hourlySlots.map((s) => ({ ...s, value: 10 })));
                                      }}
                                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    >
                                      {currSym}10.00
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHourlySlots(hourlySlots.map((s) => ({ ...s, value: 25 })));
                                      }}
                                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
                                    >
                                      {currSym}25.00
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHourlySlots(hourlySlots.map((s) => ({ ...s, value: 50 })));
                                      }}
                                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
                                    >
                                      {currSym}50.00
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHourlySlots(hourlySlots.map((s) => ({ ...s, value: 100 })));
                                      }}
                                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors"
                                    >
                                      {currSym}100.00
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHourlySlots(hourlySlots.map((s) => ({ ...s, value: 0 })));
                                      }}
                                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    >
                                      {currSym}0.00
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHourlySlots(hourlySlots.map((s) => ({ ...s, value: 5 })));
                                      }}
                                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
                                    >
                                      +{currSym}5.00
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHourlySlots(hourlySlots.map((s) => ({ ...s, value: 10 })));
                                      }}
                                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
                                    >
                                      +{currSym}10.00
                                    </button>
                                  </>
                                )
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setHourlySlots(hourlySlots.map((s) => ({ ...s, budgetPercentage: 0, bidPercentage: 0 })));
                                    }}
                                    className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                  >0</button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setHourlySlots(hourlySlots.map((s) => ({ ...s, budgetPercentage: 10, bidPercentage: 10 })));
                                    }}
                                    className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
                                  >
                                    +10%
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setHourlySlots(hourlySlots.map((s) => ({ ...s, budgetPercentage: 20, bidPercentage: 20 })));
                                    }}
                                    className="text-[11px] font-medium px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
                                  >
                                    +20%
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setHourlySlots(hourlySlots.map((s) => ({ ...s, budgetPercentage: 50, bidPercentage: 50 })));
                                    }}
                                    className="text-[11px] font-medium px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors"
                                  >
                                    +50%
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Header row */}
                          <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400 py-2 border-b border-slate-100 dark:border-slate-800">
                            <div className="col-span-5">{t("Time Window")}</div>
                            <div className="col-span-7 flex items-center justify-between">
                              <span>
                                {isStateAction
                                  ? t("Campaign Status")
                                  : isNumberMode
                                  ? (actionType.actionName === "setBudget" ? `${t("Target Budget")} (${currSym})` : `${t("Budget Adjustment")} (${currSym})`)
                                  : t("Budget / Action Value (%)")}
                              </span>
                              <span className="text-[10px] text-slate-400 font-normal">
                                {isStateAction
                                  ? t("Toggle state per window")
                                  : isNumberMode
                                  ? t("Numeric amount")
                                  : t("Positive = Boost, Negative = Lower")}
                              </span>
                            </div>
                          </div>

                          {/* Scrollable Slots */}
                          <div className={`flex flex-col gap-1.5 overflow-y-auto custom-scroll pr-1 mt-2 ${
                            hourlySlots.length > 12 ? "max-h-[420px]" : "max-h-none"
                          }`}>
                            {hourlySlots.map((slot, index) => {
                              return (
                                <div
                                  key={slot.slotIndex}
                                  className="grid grid-cols-12 gap-3 items-center hover:bg-slate-50 dark:hover:bg-slate-800/60 py-1.5 px-2.5 rounded-lg transition-colors"
                                >
                                  <div className="col-span-5 flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                                    <span className="inline-block w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                                    {slot.startTime} – {slot.endTime}
                                  </div>

                                  {isStateAction ? (
                                    <div className="col-span-7 flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide transition-all ${
                                            slot.state === "ENABLED"
                                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                                              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                                          }`}
                                        >
                                          {slot.state === "ENABLED" ? t("Enabled") : t("Paused")}
                                        </span>
                                      </div>
                                      <Switch
                                        checked={slot.state === "ENABLED"}
                                        onCheckedChange={(checked) => {
                                          const newSlots = [...hourlySlots];
                                          newSlots[index] = {
                                            ...newSlots[index],
                                            state: checked ? "ENABLED" : "PAUSED",
                                          };
                                          setHourlySlots(newSlots);
                                        }}
                                      />
                                    </div>
                                  ) : isNumberMode ? (
                                    <div className="col-span-7 flex items-center gap-2">
                                      <div className="relative w-full">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 pointer-events-none">
                                          {currSym}
                                        </span>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={slot.value ?? ""}
                                          onChange={(e) => {
                                            const newSlots = [...hourlySlots];
                                            newSlots[index] = {
                                              ...newSlots[index],
                                              value: e.target.value,
                                            };
                                            setHourlySlots(newSlots);
                                          }}
                                          className="w-full h-8 pl-6 pr-3 text-xs font-semibold"
                                          placeholder="0.00"
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="col-span-7 flex items-center gap-2">
                                      <div className="relative w-full">
                                        <Input
                                          type="number"
                                          step="1"
                                          min="-90"
                                          max="500"
                                          value={slot.budgetPercentage ?? slot.bidPercentage ?? ""}
                                          onChange={(e) => {
                                            const newSlots = [...hourlySlots];
                                            newSlots[index] = {
                                              ...newSlots[index],
                                              budgetPercentage: e.target.value,
                                              bidPercentage: e.target.value,
                                            };
                                            setHourlySlots(newSlots);
                                          }}
                                          className={`w-full h-8 pl-3 pr-7 text-xs font-semibold ${
                                            Number(slot.budgetPercentage ?? slot.bidPercentage) > 0
                                              ? "border-emerald-400 dark:border-emerald-600/60 text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20"
                                              : Number(slot.budgetPercentage ?? slot.bidPercentage) < 0
                                              ? "border-rose-400 dark:border-rose-600/60 text-rose-600 dark:text-rose-400 bg-rose-50/30 dark:bg-rose-950/20"
                                              : ""
                                          }`}
                                          placeholder="0"
                                        />
                                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 pointer-events-none">
                                          %
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
                            * {t("Note: If you set the 0 in slot then it will set the value to its base value.")}
                          </p>
                          {error?.hourlySlots && (
                            <p className="error text-red-500 text-[10px] font-bold mt-2">
                              {error.hourlySlots}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="cm-footer border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 flex !justify-between items-center shrink-0 sticky bottom-0 z-10 w-full">
          <div>
            {!editId && (
              <ShadcnButton
                variant="outline"
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
              className="px-4 py-2 text-sm font-semibold"
              type="button"
              disabled={submitting}
              onClick={handleCancel}
            >
              {t("Cancel")}
            </ShadcnButton>
            <ShadcnButton
              id="budget-rule-submit"
              type="submit"
              disabled={submitting}
              className="improve add_btn px-4 py-2 bg-[#1A9FD4] text-white hover:opacity-90 rounded-md text-sm font-semibold flex items-center justify-center"
            >
              {submitting ? (
                <>
                  <i className="fa fa-spinner fa-spin mr-1.5" />
                  {t("Submitting...")}
                </>
              ) : (
                t("Submit")
              )}
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
  )
}
export default AddRule;
