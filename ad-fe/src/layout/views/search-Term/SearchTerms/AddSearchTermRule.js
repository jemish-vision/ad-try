import RuleCreationCampaignModal from '../../../../components/rule-wizard/RuleCreationCampaignModal';
import React, { useState, useContext, useEffect, useMemo } from 'react'
import { useTranslation } from "react-i18next";
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Checkbox } from "../../../../components/ui/checkbox";
import { ProfileContext } from '../../../../helper/usecontext/useContext';
import { handleLoader, Toast, useDispatch } from "../../../../helper/links/Link";
import { AiOutlinePlus } from "react-icons/ai";
import { AiFillDelete } from "react-icons/ai";
import { ApiCreateSearchTermRule, ApiGetSearchTermRuleById, ApiUpdateSearchTermRule } from '../../../../api-wrapper/search-term/ApiSearchTerm';
import { ApiFilterListing } from '../../../../api-wrapper/customer/ApiCustomer';
import { addSearchTermRuleQuery, UpdateSearchTermQuery } from '../../../../utility/createQuery';
import { ShadcnDatePicker } from '../../../../components/ui/date-picker';
import { RuleWizardChoosePath, RuleWizardTemplates } from '../../../../components/rule-wizard/RuleWizardSteps';
import { SearchTermRuleTemplates } from './searchTermRuleTemplate';

import { ApiGetAcos } from '../../../../api-wrapper/campaign-setting/ApiSettings';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { getCurrencySymbol } from '../../../../helper/currencyCode/CurrencyCode';

function AddSearchTermRule({ setaddModalFlag, editId, setEditId, getRule, editData, setEditData }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  let { profileId, selectedAdType, currencyCode } = useContext(ProfileContext);



  const ACTION_NAME_OPTIONS = [
    { value: "TARGETING", label: "Targeting" },
    { value: "NEGATIVE_TARGETING", label: "Negative Targeting" },
    { value: "CREATE_CAMPAIGN", label: "Create Campaign" },
  ];

  const negetiveType = [
    { value: "EXACT", label: "EXACT" },
    { value: "PHRASE", label: "PHRASE" },
  ];

  const validatorLabel = [
    { value: "LESS_THAN", label: "Less Than" },
    { value: "LESS_THAN_OR_EQUAL_TO", label: "Less Than Or Equal To" },
    { value: "GREATER_THAN_OR_EQUAL_TO", label: "Greater Than Or Equal To" },
    { value: "GREATER_THAN", label: "Greater Than" },
    { value: "EQUAL_TO", label: "Equal To" },
    { value: "NOT_EQUAL_TO", label: "Not Equal To" },
    { value: "BETWEEN", label: "Between" },
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

  const ruleTypeOption = [
    { value: "AUTO", label: "AUTO" },
    { value: "MANUAL", label: "MANUAL" },
  ];

  const [loadingEditData, setLoadingEditData] = useState(Boolean(editId));
  const [submitting, setSubmitting] = useState(false);
  const [creationDraft, setCreationDraft] = useState(null);
  const [error, seterror] = useState();
  const [ruleName, setRuleName] = useState("");
  const [reportDate, setReportDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [ruleType, setRuleType] = useState("");
  const [targetAcos, setTargetAcos] = useState(0);

  const [step, setStep] = useState(editId ? 'form' : 'choose-path');

  const applyTemplate = (template) => {
    setRuleName(template.data.ruleName);
    setReportDate(template.data.reportDate);
    setRuleType(template.data.ruleType || "AUTO");

    if (template.data.conditions && template.data.conditions.length > 0) {
      setMainRuleData(template.data.conditions);
    } else {
      setMainRuleData([
        {
          operator: "AND",
          conditionType: "",
          conditionOperator: "",
          conditionValue: "",
          conditionMaxValue: "",
          conditionStatus: "",
          conditionValueType: "",
          useTargetAcos: false,
        },
      ]);
    }

    if (template.data.actionType) {
      setActionType({
        actionName: template.data.actionType.actionName || "",
        actionValue: template.data.actionType.actionValue || "",
        actionValueType: template.data.actionType.actionValueType || "",
      });
    } else {
      setActionType({
        actionName: "",
        actionValue: "",
        actionValueType: "",
      });
    }

    setStep('form');
  };

  const DEFAULT_SEARCH_TERM_FILTERS = [
    { name: "Impressions", label: "Impressions", value: "Impressions", isDefault: true },
    { name: "Clicks", label: "Clicks", value: "Clicks", isDefault: true },
    { name: "Orders", label: "Orders", value: "Orders", isDefault: true },
    { name: "Sales", label: "Sales", value: "Sales", isDefault: true },
    { name: "ROAS", label: "ROAS", value: "ROAS", isDefault: true },
    { name: "ACOS", label: "ACOS", value: "ACOS", isDefault: true },
    { name: "Spend", label: "Spend", value: "Spend", isDefault: true },
    { name: "Bid", label: "Bid", value: "Bid", isDefault: true },
  ];

  const [mainLabel, setMainLabel] = useState(DEFAULT_SEARCH_TERM_FILTERS);

  const [actionType, setActionType] = useState({
    actionName: '',
    actionValue: '',
    actionValueType: ''
  });

  const [mainRuleData, setMainRuleData] = useState([
    {
      operator: "AND",
      conditionType: "",
      conditionOperator: "",
      conditionValue: "",
      conditionMaxValue: "",
      conditionStatus: "",
      conditionValueType: "",
      useTargetAcos: false,
    },
  ]);

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
    if (profileId?.value && selectedAdType) {
      ApiGetAcos({ profileId: profileId?.value })
        .then((e) => {
          if (e?.isSuccess && e?.campaignSetting?.targetAcos) setTargetAcos(e?.campaignSetting?.targetAcos);
          else Toast.error(e?.message);
        })
        .catch((e) => Toast.error(t("Something went wrong")));
    }
  }, [profileId?.value, selectedAdType]);

  useEffect(() => {
    const getMainLabel = async () => {
      if (profileId.value && selectedAdType) {
        await ApiFilterListing({
          profileId: profileId.value,
          pageName: "Search Term"
        })
          .then((e) => {
            if (e?.isSuccess) {
              const skipOption = ["CampaignsAndAdGroups"];
              const filters = e?.filters?.map((el) => ({
                ...el,
                value: el.value || el.name || el._id,
                label: el.name || el.label
              })).filter(e1 => !skipOption?.includes(e1?.value)) || [];
              DEFAULT_SEARCH_TERM_FILTERS.forEach((def) => {
                if (!filters.find((f) => f.value === def.value)) {
                  filters.push(def);
                }
              });
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
      const scrollableDiv = document.querySelector(".outlet_wrapper");
      if (scrollableDiv) {
        scrollableDiv.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      setLoadingEditData(true);
      ApiGetSearchTermRuleById(editId)
        .then((res) => {
          if (res.isSuccess) {
            setRuleName(res.data.ruleName);
            setReportDate(res?.data?.reportDate);
            setToDate(res?.data?.toDate);
            setActionType(res.data.actionType);
            setMainRuleData(
              res.data.conditions?.length
                ? res.data.conditions
                : [
                  {
                    operator: "AND",
                    conditionType: "",
                    conditionOperator: "",
                    conditionValue: "",
                    conditionMaxValue: "",
                    conditionStatus: "",
                    conditionValueType: "",
                    useTargetAcos: false,
                  },
                ]
            );
            setRuleType(res.data.ruleType);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const handleCancel = () => {
    setEditId(null)
    setEditData(null)
    setRuleName("");
    setReportDate(null)
    setRuleType("");
    setToDate(null)
    setMainRuleData([
      {
        operator: "AND",
        conditionType: "",
        conditionOperator: "",
        conditionValue: "",
        conditionMaxValue: "",
        conditionStatus: "",
        conditionValueType: "",
        useTargetAcos: false,
      },
    ]);
    setActionType({
      actionName: "",
      actionValue: "",
      actionValueType: "",
    });
    setaddModalFlag(false)
  }

  const submitHandler = (e) => {
    e.preventDefault();

    let flag = false;
    let sendData = {
      ruleName: ruleName,
      reportDate: reportDate,
      toDate: toDate,
      actionType: actionType,
      profileId: profileId?.value,
      conditions: mainRuleData,
      ruleType,
    };

    let errorData = {};
    if (!sendData.ruleType) {
      flag = true;
      errorData.ruleType = "Rule Type is required";
    }
    if (!sendData.ruleName) {
      flag = true;
      errorData.ruleName = "Rule Name is required";
    }

    if (sendData.conditions) {
      let mainArr = [];
      sendData.conditions.forEach((el, index) => {
        let subArr = {};

        if (!el.operator) {
          flag = true;
          subArr.operator = "Operator is required";
        }

        if (!el.conditionType) {
          flag = true;
          subArr.conditionType = "Condition Type is required";
        }

        if (["Impressions", "Clicks", "Orders", "Sales", "ROAS", "ACOS", "Spend", "Bid"].includes(el.conditionType)) {
          if (!el.conditionOperator) {
            flag = true;
            subArr.conditionOperator = "Operator is required";
          }
          if (!el.conditionValue && el.conditionValue !== 0) {
            flag = true;
            subArr.conditionValue = "Value is required";
          }
          if (el.conditionOperator === "BETWEEN" && !el.conditionMaxValue && el.conditionMaxValue !== 0) {
            flag = true;
            subArr.conditionMaxValue = "Max Value is required";
          }
        }
        if (Object.keys(subArr).length > 0) mainArr[index] = subArr;
      });
      errorData.conditions = mainArr;
    }

    if (!sendData?.actionType?.actionName) {
      flag = true;
      errorData.actionName = "Action Name is required";
    }

    if (!sendData?.actionType?.actionValueType) {
      flag = true;
      errorData.actionValueType = "Action Type is required";
    }

    if (reportDate && reportDate === "YEAR_TO_DATE" && !toDate) {
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
        SP: UpdateSearchTermQuery(addSearchTermRuleQuery(sendData, mainLabel, "SP"), editData?.campaignIds?.SP ?? []),
        SB: UpdateSearchTermQuery(addSearchTermRuleQuery(sendData, mainLabel, "SB"), editData?.campaignIds?.SB ?? []),
        SD: UpdateSearchTermQuery(addSearchTermRuleQuery(sendData, mainLabel, "SD"), editData?.campaignIds?.SD ?? []),
      };

      if (!editId) {
        setCreationDraft(JSON.parse(JSON.stringify(sendData)));
        return;
      }
      setSubmitting(true);
      if (editId) {
        ApiUpdateSearchTermRule(editId, sendData)
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
        operator: "AND",
        conditionType: "",
        conditionOperator: "",
        conditionValue: "",
        conditionMaxValue: "",
        conditionStatus: "",
        conditionValueType: "",
        useTargetAcos: false,
      },
    ]);
  };

  const handleRemoveRule = (index) => {
    const newData = [...mainRuleData];
    newData.splice(index, 1);
    setMainRuleData(newData);
  }

  const handleActionType = (e) => {
    if (e.target.name === "actionValueType") {
      setActionType({ ...actionType, [e.target.name]: e.target.value })
      removeError('actionValueType');
    }
  }

  const handleUseTargetAcos = (checked, index) => {
    const data = [...mainRuleData];
    data[index].useTargetAcos = checked;
    if (checked) {
      data[index].conditionValue = targetAcos ?? "";
    } else {
      data[index].conditionValue = "";
    }
    setMainRuleData(data);
    removeError('conditions', index, 'conditionValue');
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
        title={t("Create New Search Term Rule")}
        description="Automation helps you optimize your search terms. Select how you want to start building your optimization logic."
        templateCardTitle="Browse Templates"
        templateCardDesc="Choose from pre-configured rules for search term harvesting or negation."
        scratchCardTitle="Build Custom Rule"
        scratchCardDesc="Create a blank search term rule and define your own conditions from the ground up."
        onSelectTemplates={() => setStep('templates')}
        onSelectScratch={() => setStep('form')}
      />
    );
  }

  if (step === 'templates') {
    return (
      <RuleWizardTemplates
        templates={SearchTermRuleTemplates}
        onApplyTemplate={applyTemplate}
        onBack={() => setStep('choose-path')}
      />
    );
  }

  return (
    <div id='search-term-rule-add' className="new_rule">
      <form onSubmit={submitHandler} className="flex flex-col h-full min-h-0 relative">
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
          {/* Rule Name, Date Filter */}
          <div className="mb-6 pb-6 border-b border-dashed border-slate-200 dark:border-slate-700">
            <div className="flex flex-wrap items-start gap-4">
              <div id="search-term-rule-name-input" className="w-full sm:w-[240px]">
                <label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("Rule Name")} <span className="text-danger">*</span></label>
                <Input
                  type="text"
                  name="ruleName"
                  className={`w-full ${error?.ruleName ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  placeholder={t("Enter rule name")}
                  onChange={(e) => {
                    setRuleName(e.target.value);
                    removeError('ruleName');
                  }}
                  value={ruleName}
                />
                {error?.ruleName && <p className="error">{error.ruleName}</p>}
              </div>

              <div className="w-full sm:w-[200px]" id="search-term-rule-date-filter">
                <label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("Date Filter")}</label>
                <Select
                  value={reportDate || undefined}
                  onValueChange={(value) => {
                    setReportDate(value);
                    removeError('reportDate');
                  }}
                >
                  <SelectTrigger className={`w-full h-[40px] ${error?.reportDate ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder={t("Select")} />
                  </SelectTrigger>
                  <SelectContent className="z-[10000]">
                    {DATE_FILTER_OPTION.map((el) => (
                      <SelectItem key={el.value} value={el.value}>
                        {t(el.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {error?.reportDate && <p className="error">{error.reportDate}</p>}
              </div>

              {reportDate === "YEAR_TO_DATE" && (
                <div className="w-full sm:w-[160px]">
                  <label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("Date")}</label>
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

              <div className="w-full sm:w-[200px]" id="search-term-rule-type">
                <label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("Rule Type")} <span className="text-danger">*</span></label>
                <Select
                  value={ruleType || undefined}
                  onValueChange={(value) => {
                    setRuleType(value);
                    removeError('ruleType');
                  }}
                >
                  <SelectTrigger className={`w-full h-[40px] ${error?.ruleType ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder={t("Select")} />
                  </SelectTrigger>
                  <SelectContent className="z-[10000]">
                    {ruleTypeOption.map((el) => (
                      <SelectItem key={el.value} value={el.value}>
                        {t(el.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {error?.ruleType && <p className="error">{error.ruleType}</p>}
              </div>
            </div>
          </div>

          {/* Conditions Array */}
          <div className="mb-6 pb-6 border-b border-dashed border-slate-200 dark:border-slate-700" id="search-term-rule-conditions">
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-sky-500"></div>
                {t("Conditions")}
              </div>
              <ShadcnButton type="button" variant="default" onClick={addConditionHandler}>
                <AiOutlinePlus size={14} className="mr-1" /> {t("Add Condition")}
              </ShadcnButton>
            </div>

            {mainRuleData?.map((element, index) => {
              const conditionError = error?.conditions?.[index] || {};
              const showOperators = ["Impressions", "Clicks", "Orders", "Sales", "ROAS", "ACOS", "Spend", "Bid"].includes(element.conditionType);
              const isAcos = ["ACOS"].includes(element.conditionType);
              const isBetween = element.conditionOperator === "BETWEEN";

              return (
                <div className="mb-3" key={index}>
                  {/* Operator AND/OR Toggle for subsequent conditions */}
                  {index !== 0 && (
                    <div className="col-span-12 my-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-grow h-[1px] bg-[#e2e8f0] dark:bg-slate-700" />
                        <div className="flex items-center border border-[#e2e8f0] dark:border-slate-700 rounded-full p-[3px] bg-white dark:bg-slate-800">
                          {["AND", "OR"].map((option) => (
                            <label
                              key={option}
                              htmlFor={`operator-${option}-${index}`}
                              className={`mb-0 px-3 py-1 cursor-pointer fw-medium small user-select-none rounded-full ${element.operator === option ? "bg-[#3b82f6] !text-white" : "bg-white dark:bg-slate-800 text-slate-500"}`}
                              style={{ transition: "all 0.2s ease" }}
                            >
                              <input
                                className="hidden"
                                type="radio"
                                name={`operator-${index}`}
                                id={`operator-${option}-${index}`}
                                value={option}
                                checked={element.operator === option}
                                onChange={(e) => mainRuleChangeHandler(e, element, "operator", null, index)}
                              />
                              {t(option)}
                            </label>
                          ))}
                        </div>
                        <div className="flex-grow h-[1px] bg-[#e2e8f0] dark:bg-slate-700" />
                      </div>
                      {conditionError.operator && <p className="error">{conditionError.operator}</p>}
                    </div>
                  )}

                  <div className="flex flex-wrap items-start gap-4">
                    <div className="w-full sm:w-[240px]">
                      <Select
                        key={`${element.conditionType || 'empty'}-${mainLabel.map((m) => m.value).join('_')}`}
                        value={element.conditionType || undefined}
                        onValueChange={(value) => {
                          mainRuleChangeHandler({ target: { value } }, element, "conditionType", null, index);
                        }}
                      >
                        <SelectTrigger className={`w-full h-[40px] ${conditionError.conditionType ? 'border-red-500' : ''}`}>
                          <SelectValue placeholder={t("Select")} />
                        </SelectTrigger>
                        <SelectContent className="z-[10000]">
                          {mainLabel.filter(el => !el.isDefault).length > 0 && (
                            <SelectGroup>
                              <SelectLabel>{t("Saved Filters")}</SelectLabel>
                              {mainLabel.filter(el => !el.isDefault).map(el => (
                                <SelectItem key={el.value} value={el.value}>
                                  {t(el.label)}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          <SelectGroup>
                            <SelectLabel>{t("Filter Options")}</SelectLabel>
                            {mainLabel.filter(el => el.isDefault).map(el => (
                              <SelectItem key={el.value} value={el.value}>
                                {t(el.label)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {conditionError.conditionType && <p className="error">{conditionError.conditionType}</p>}
                    </div>

                    {showOperators && (
                      <>
                        <div className="w-full sm:w-[240px]">
                          <Select
                            value={element.conditionOperator || undefined}
                            onValueChange={(value) => {
                              mainRuleChangeHandler({ target: { value } }, element, "conditionOperator", null, index);
                            }}
                          >
                            <SelectTrigger className={`w-full h-[40px] ${conditionError.conditionOperator ? 'border-red-500' : ''}`}>
                              <SelectValue placeholder={t("Select")} />
                            </SelectTrigger>
                            <SelectContent className="z-[10000]">
                              {validatorLabel.map(el => (
                                <SelectItem key={el.value} value={el.value}>
                                  {t(el.label)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {conditionError.conditionOperator && <p className="error">{conditionError.conditionOperator}</p>}
                        </div>

                        <div className={`w-full ${isBetween ? 'sm:w-[420px]' : 'sm:w-[200px]'}`}>
                          {!isBetween && (
                            <div className="input-group">
                              {["Spend", "Sales", "Bid"].includes(element.conditionType) && (
                                <span className="input-group-text">{getCurrencySymbol(currencyCode)}</span>
                              )}
                              <Input
                                type="number"
                                name={`conditions.${index}.conditionValue`}
                                className={`w-full ${conditionError.conditionValue ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                                placeholder={t("Value")}
                                onChange={(e) => mainRuleChangeHandler(e, element, "conditionValue", null, index)}
                                value={element.conditionValue}
                                disabled={element.useTargetAcos}
                              />
                              {isAcos && <span className="input-group-text">%</span>}
                            </div>
                          )}

                          {isBetween && (
                            <div className="flex gap-2">
                              <div className="input-group">
                                {["Spend", "Sales", "Bid"].includes(element.conditionType) && (
                                  <span className="input-group-text">{getCurrencySymbol(currencyCode)}</span>
                                )}
                                <Input
                                  type="number"
                                  name={`conditions.${index}.conditionValue`}
                                  className={`w-full ${conditionError.conditionValue ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                                  placeholder={t("Min")}
                                  onChange={(e) => mainRuleChangeHandler(e, element, "conditionValue", null, index)}
                                  value={element.conditionValue}
                                  disabled={element.useTargetAcos}
                                />
                                {isAcos && <span className="input-group-text">%</span>}
                              </div>
                              <div className="input-group">
                                {["Spend", "Sales", "Bid"].includes(element.conditionType) && (
                                  <span className="input-group-text">{getCurrencySymbol(currencyCode)}</span>
                                )}
                                <Input
                                  type="number"
                                  name={`conditions.${index}.conditionMaxValue`}
                                  className={`w-full ${conditionError.conditionMaxValue ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                                  placeholder={t("Max")}
                                  onChange={(e) => mainRuleChangeHandler(e, element, "conditionMaxValue", null, index)}
                                  value={element.conditionMaxValue}
                                  disabled={element.useTargetAcos}
                                />
                                {isAcos && <span className="input-group-text">%</span>}
                              </div>
                            </div>
                          )}
                          {conditionError.conditionValue && <p className="error">{conditionError.conditionValue}</p>}
                          {isBetween && conditionError.conditionMaxValue && <p className="error">{conditionError.conditionMaxValue}</p>}
                        </div>
                      </>
                    )}

                    <div className="flex items-center h-10 mt-1">
                      {mainRuleData.length > 1 && (
                        <div className="delete_icon cursor-pointer text-slate-400 hover:text-red-500 transition-colors" onClick={() => handleRemoveRule(index)}>
                          <AiFillDelete size={20} />
                        </div>
                      )}
                    </div>

                    {isAcos && (
                      <div className="w-full flex items-center mt-2 gap-2">
                        <Checkbox
                          checked={element.useTargetAcos}
                          onCheckedChange={(checked) => handleUseTargetAcos(checked, index)}
                          id={`useTargetAcos-${index}`}
                        />
                        <label className="form-check-label mb-0 cursor-pointer text-[13px] font-semibold text-slate-700 dark:text-slate-300" htmlFor={`useTargetAcos-${index}`}>
                          {t("Use Target ACOS")} ({targetAcos}%)
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Type */}
          <div className="mb-6 pb-6 border-b border-dashed border-slate-200 dark:border-slate-700" id="search-term-rule-actions">
            <div className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-sky-500"></div>
              {t("Action Type")} <span className="text-danger ml-1">*</span>
            </div>

            <div className="flex flex-wrap items-start gap-4">
              <div className="w-full sm:w-[200px]">
                <label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("Action Name")}</label>
                <Select
                  value={actionType.actionName || undefined}
                  onValueChange={(value) => {
                    setActionType({ ...actionType, actionName: value });
                    removeError('actionName');
                  }}
                >
                  <SelectTrigger className={`w-full h-[40px] ${error?.actionName ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder={t("Select")} />
                  </SelectTrigger>
                  <SelectContent className="z-[10000]">
                    {ACTION_NAME_OPTIONS.map(el => (
                      <SelectItem key={el.value} value={el.value}>
                        {t(el.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {error?.actionName && <p className="error">{error.actionName}</p>}
              </div>

              <div className="w-full sm:w-[200px]">
                <label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("Action Type")}</label>
                <Select
                  value={actionType.actionValueType || undefined}
                  onValueChange={(value) => {
                    handleActionType({ target: { name: "actionValueType", value } });
                  }}
                >
                  <SelectTrigger className={`w-full h-[40px] ${error?.actionValueType ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder={t("Select")} />
                  </SelectTrigger>
                  <SelectContent className="z-[10000]">
                    {negetiveType.map(el => (
                      <SelectItem key={el.value} value={el.value}>
                        {t(el.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {error?.actionValueType && <p className="error">{error.actionValueType}</p>}
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
              id="search-term-rule-submit"
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
            </ShadcnButton>
          </div>
        </div>
      </form>
      <RuleCreationCampaignModal
        draft={creationDraft}
        onCancel={() => setCreationDraft(null)}
        createRule={ApiCreateSearchTermRule}
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

export default AddSearchTermRule
