import React, { useState, useContext, useEffect } from 'react'
import { useTranslation } from 'react-i18next';
import { handleLoader, Toast, useDispatch } from "../../../../helper/links/Link";
import { AiOutlinePlus, AiFillDelete } from "react-icons/ai";
import { ProfileContext } from '../../../../helper/usecontext/useContext';
import { ApiFilterListing } from '../../../../api-wrapper/customer/ApiCustomer';
import { ApiGetAcos } from '../../../../api-wrapper/campaign-setting/ApiSettings';
import { ApiCreateHealthScoreSetting, ApiUpdateHealthScoreSetting } from '../../../../api-wrapper/campaign-setting/ApiDynamicHealthScore';
import { Input } from "../../../../components/ui/input";
import { Checkbox } from "../../../../components/ui/checkbox";
import { Button } from "../../../../components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, SelectLabel } from "../../../../components/ui/select";
import { RuleWizardChoosePath, RuleWizardTemplates } from "../../../../components/rule-wizard/RuleWizardSteps";
import { getHealthScoreRuleTemplates } from "./healthScoreRuleTemplate";

const defaultCondition = {
  queryOperator: "AND",
  conditionType: "",
  conditionOperator: "",
  conditionValue: "",
  conditionMaxValue: "",
  conditionStringValue: "",
  conditionValueType: "Number",
  useTargetAcos: false,
};

const STATUS_OPTIONS = [
  { value: "ENABLED", label: "Enabled" },
  { value: "PAUSED", label: "Paused" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "OUT_OF_BUDGET", label: "Out Of Budget" },
];

const TYPE_OPTIONS = [
  { value: "Sponsored Products", label: "Sponsored Products" },
  { value: "Sponsored Brands", label: "Sponsored Brands" },
  { value: "Sponsored Display", label: "Sponsored Display" },
];

const TARGETING_TYPE_OPTIONS = [
  { value: "MANUAL", label: "Manual Targeting" },
  { value: "AUTO", label: "Automatic Targeting" },
];

const OPERATOR_OPTIONS = [
  { value: "LESS_THAN", label: "Less Than" },
  { value: "LESS_THAN_OR_EQUAL_TO", label: "Less Than Or Equal To" },
  { value: "GREATER_THAN_OR_EQUAL_TO", label: "Greater Than Or Equal To" },
  { value: "GREATER_THAN", label: "Greater Than" },
  { value: "EQUAL_TO", label: "Equal To" },
  { value: "NOT_EQUAL_TO", label: "Not Equal To" },
  { value: "BETWEEN", label: "Between" },
];

const STRING_CONDITION_TYPES = ["Status", "Type", "Targeting Type"];
const CURRENCY_TYPES = ["Spend", "Sales", "Bid"];
const PERCENT_TYPES = ["ACOS", "ROAS"];

function AddHealthScoreRule({ setaddModalFlag, editId, getRule, editData }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { profileId, selectedAdType } = useContext(ProfileContext);

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);



  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState({});
  const [ruleName, setRuleName] = useState("");
  const [targetAcos, setTargetAcos] = useState(0);
  const [mainLabel, setMainLabel] = useState([]);
  const [mainRuleData, setMainRuleData] = useState([{ ...defaultCondition }]);
  const [step, setStep] = useState(editId ? 'form' : 'choose-path');

  const applyTemplate = (template) => {
    setRuleName(template.data.scoreName || "");
    setMainRuleData(template.data.conditions?.map(c => ({ ...c })) || [{ ...defaultCondition }]);
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

  // ── Reset form ──────────────────────────────────────────────
  const resetForm = () => {
    setRuleName("");
    setMainRuleData([{ ...defaultCondition }]);
    setError({});
  };

  const handleCancel = () => {
    resetForm();
    setaddModalFlag(false);
  };

  // ── Populate on edit ────────────────────────────────────────
  useEffect(() => {
    if (editData) {
      setRuleName(editData.scoreName || "");
      setMainRuleData(editData.conditions?.length ? editData.conditions.map(c => ({ ...c })) : [{ ...defaultCondition }]);
      setStep('form');
    } else {
      resetForm();
      setStep('choose-path');
    }
  }, [editData]);

  // ── Load target ACOS ────────────────────────────────────────
  useEffect(() => {
    if (profileId?.value && selectedAdType) {
      ApiGetAcos({ profileId: profileId?.value })
        .then((e) => {
          if (e?.isSuccess && e?.campaignSetting?.targetAcos) {
            const acosVal = e.campaignSetting.targetAcos;
            setTargetAcos(acosVal);
            setMainRuleData((prev) =>
              prev.map((cond) =>
                cond.useTargetAcos ? { ...cond, conditionValue: acosVal } : cond
              )
            );
          }
        })
        .catch(() => { });
    }
  }, [profileId?.value, selectedAdType]);

  // ── Load filter labels ───────────────────────────────────────
  useEffect(() => {
    if (profileId?.value && selectedAdType) {
      ApiFilterListing({ profileId: profileId.value, pageName: "Campaign Setting" })
        .then((e) => {
          if (e?.isSuccess) {
            const skip = ["CampaignsAndAdGroups"];
            setMainLabel(
              e.filters
                .map((el) => ({ ...el, label: el.name }))
                .filter((el) => !skip.includes(el?.value))
            );
          } else Toast.error(e?.message);
        })
        .catch(() => Toast.error(t("Something went wrong")));
    }
  }, [editId, profileId?.value, selectedAdType]);

  // ── Condition change ─────────────────────────────────────────
  const mainRuleChangeHandler = (e, obj, address_type, index) => {
    const data = [...mainRuleData];
    const value = e.target.value;

    if (address_type === "conditionValueType") {
      obj.conditionValue = "";
      obj.conditionValueType = value;
      setMainRuleData(data);
      removeError('conditions', index, 'conditionValueType');
      return;
    }

    if (address_type === "conditionValue" && data[index]?.conditionValueType === "Percentage") {
      const v = parseFloat(value);
      if (!isNaN(v) && v >= 0 && v <= 100) {
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

    const dataName = e.target.getAttribute("data-name");
    if (dataName) {
      obj[dataName] = value;
      setMainRuleData(data);
    }
  };

  const handleUseTargetAcos = (checked, index) => {
    const data = [...mainRuleData];
    data[index].useTargetAcos = checked;
    data[index].conditionValue = checked ? (targetAcos ?? "") : "";
    setMainRuleData(data);
    removeError('conditions', index, 'conditionValue');
  };

  const addConditionHandler = () =>
    setMainRuleData([...mainRuleData, { ...defaultCondition }]);

  const handleRemoveRule = (index) => {
    setMainRuleData(mainRuleData.filter((_, i) => i !== index));
    if (error?.conditions) {
      const newConditions = [...error.conditions];
      newConditions.splice(index, 1);
      setError({ ...error, conditions: newConditions });
    }
  };

  // ── Validation ───────────────────────────────────────────────
  const validate = () => {
    let flag = false;
    const errorData = {};

    if (!ruleName.trim()) {
      flag = true;
      errorData.ruleName = "Score Name is required";
    }

    const condErrs = [];
    mainRuleData.forEach((el, index) => {
      const sub = {};
      if (!el.conditionType) {
        flag = true;
        sub.conditionType = "Condition Type is required";
      }

      if (STRING_CONDITION_TYPES.includes(el.conditionType)) {
        if (!el.conditionStringValue) {
          flag = true;
          sub.conditionStringValue = "Condition Status is required";
        }
      } else if (el.conditionType) {
        if (!el.conditionOperator) {
          flag = true;
          sub.conditionOperator = "Operator is required";
        }
        if (!el.conditionValue && el.conditionValue !== 0) {
          flag = true;
          sub.conditionValue = "Value is required";
        }
        if (el.conditionOperator === "BETWEEN" && !el.conditionMaxValue && el.conditionMaxValue !== 0) {
          flag = true;
          sub.conditionMaxValue = "Max Value is required";
        }
      }
      if (Object.keys(sub).length) condErrs[index] = sub;
    });

    errorData.conditions = condErrs;
    setError(errorData);
    return flag;
  };

  // ── Submit ───────────────────────────────────────────────────
  const submitHandler = (e) => {
    e.preventDefault();
    if (validate()) return;

    const sendData = {
      scoreName: ruleName,
      conditions: mainRuleData,
      profileId: profileId?.value,
    };

    setSubmitting(true);

    const apiFn = editId
      ? ApiUpdateHealthScoreSetting({ healthScoreSettingId: editId, ...sendData })
      : ApiCreateHealthScoreSetting(sendData);

    apiFn
      .then((res) => {
        if (res?.isSuccess) {
          Toast.success(res.message);
          getRule();
          handleCancel();
        } else {
          Toast.error(res?.message || "Something went wrong");
        }
      })
      .catch(() => Toast.error(t("Something went wrong")))
      .finally(() => setSubmitting(false));
  };

  // ── Error helper ─────────────────────────────────────────────
  const errorFun = (index, label) => {
    const obj = error?.conditions?.[index];
    if (!obj) return null;
    return obj[label] ? <p className="error">{obj[label]}</p> : null;
  };

  // ── Render ───────────────────────────────────────────────────
  if (step === 'choose-path') {
    return (
      <RuleWizardChoosePath
        title={t("Create New Health Score Rule")}
        description="Monitor campaign health automatically. Select how you want to define your health parameters."
        templateCardTitle="Browse Templates"
        templateCardDesc="Use predefined health indicators like High ACOS or Low Impressions."
        scratchCardTitle="Build Custom Rule"
        scratchCardDesc="Create a blank health score rule and define your own thresholds."
        onSelectTemplates={() => setStep('templates')}
        onSelectScratch={() => setStep('form')}
      />
    );
  }

  if (step === 'templates') {
    return (
      <RuleWizardTemplates
        templates={getHealthScoreRuleTemplates(t)}
        onApplyTemplate={applyTemplate}
        onBack={() => setStep('choose-path')}
      />
    );
  }

  return (
    <div id='health-score-rule-add' className="new_rule p-8 pb-0 pt-6">
      <form onSubmit={submitHandler}>

        {/* ── Rule Name ── */}
        <div className="grid grid-cols-12 gap-4 items-start mb-3">
          <div className="col-span-12 md:col-span-4">
            <label className="block mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">{t("Score Name")} <span className="text-danger">*</span></label>
            <Input
              type="text"
              name="ruleName"
              className={error?.ruleName ? "border-red-500" : ""}
              placeholder={t("Enter a Score Name")}
              value={ruleName}
              onChange={(e) => {
                setRuleName(e.target.value);
                removeError('ruleName');
              }}
            />
            {error?.ruleName && <p className="error">{error.ruleName}</p>}
          </div>
        </div>

        <div className="add_border" />

        {/* ── Conditions ── */}
        <div className="mb-10">
          <div className="flex justify-between items-center mb-3">
            <div className="section-title">{t("Conditions")}</div>
            <Button variant="outline" type="button" className="customize-button h-[36px] !bg-white !border !border-slate-300 !text-slate-700 hover:!bg-slate-50 dark:!bg-transparent dark:!border-slate-700 dark:!text-slate-300 dark:hover:!bg-slate-800 px-4 font-medium rounded-md shadow-sm flex items-center justify-center gap-1.5" onClick={addConditionHandler}>
              <AiOutlinePlus size={14} /> {t("Add Condition")}
            </Button>
          </div>

          {mainRuleData.map((element, index) => {
            const isStringCondition = STRING_CONDITION_TYPES.includes(element.conditionType);
            const isNumericCondition = !isStringCondition && element.conditionType;
            const isBetween = element.conditionOperator === "BETWEEN";

            return (
              <div key={index} className="mb-3">

                {/* AND / OR toggle — hidden for first row */}
                {index !== 0 && (
                  <div className="col-span-12 my-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-grow h-[1px] bg-[#e2e8f0] dark:bg-slate-700" />
                      <div className="flex items-center border border-[#e2e8f0] dark:border-slate-700 rounded-full p-[3px] bg-white dark:bg-slate-800">
                        {["AND", "OR"].map((opt) => (
                          <label
                            key={opt}
                            htmlFor={`queryOperator-${opt}-${index}`}
                            className={`mb-0 px-3 py-1 cursor-pointer fw-medium small user-select-none rounded-full ${element.queryOperator === opt ? "bg-[#3b82f6] !text-white" : "bg-white dark:bg-slate-800 text-slate-500"}`}
                            style={{ transition: "all 0.2s ease" }}
                          >
                            <input
                              className="hidden"
                              type="radio"
                              name={`queryOperator-${index}`}
                              id={`queryOperator-${opt}-${index}`}
                              value={opt}
                              checked={element.queryOperator === opt}
                              onChange={(e) => mainRuleChangeHandler(e, element, "queryOperator", index)}
                            />
                            {t(opt)}
                          </label>
                        ))}
                      </div>
                      <div className="flex-grow h-[1px] bg-[#e2e8f0] dark:bg-slate-700" />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-12 gap-3 items-start">
                  {/* Condition Type */}
                  <div className="col-span-12 md:col-span-3">
                    <Select
                      key={`conditionType-${index}-${mainLabel.length}-${element.conditionType || 'empty'}`}
                      value={element.conditionType ? String(element.conditionType) : undefined}
                      onValueChange={(value) => {
                        mainRuleChangeHandler({ target: { value } }, element, "conditionType", index);
                      }}
                    >
                      <SelectTrigger className={error?.conditions?.[index]?.conditionType ? 'border-red-500' : ''}>
                        <SelectValue placeholder={t("Select")} />
                      </SelectTrigger>
                      <SelectContent>
                        {mainLabel.filter(el => !el.isDefault).length > 0 && (
                          <SelectGroup>
                            <SelectLabel>{t("Saved Filters")}</SelectLabel>
                            {mainLabel.filter(el => !el.isDefault).map(el => (
                              <SelectItem key={el.value} value={el.value}>{t(el.label)}</SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        <SelectGroup>
                          <SelectLabel>{t("Filter Options")}</SelectLabel>
                          {mainLabel.filter(el => el.isDefault).map(el => (
                            <SelectItem key={el.value} value={el.value}>{t(el.label)}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {errorFun(index, "conditionType")}
                  </div>

                  {/* String condition types */}
                  {element.conditionType === "Status" && (
                    <div className="col-span-12 md:col-span-3">
                      <Select
                        key={`conditionStatus-${index}-${element.conditionStringValue || 'empty'}`}
                        value={element.conditionStringValue ? String(element.conditionStringValue) : undefined}
                        onValueChange={(value) => {
                          mainRuleChangeHandler({ target: { value } }, element, "conditionStringValue", index);
                        }}
                      >
                        <SelectTrigger className={error?.conditions?.[index]?.conditionStringValue ? 'border-red-500' : ''}>
                          <SelectValue placeholder={t("Select")} />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map(el => (
                            <SelectItem key={el.value} value={el.value}>{t(el.label)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errorFun(index, "conditionStringValue")}
                    </div>
                  )}

                  {element.conditionType === "Type" && (
                    <div className="col-span-12 md:col-span-3">
                      <Select
                        key={`conditionTypeVal-${index}-${element.conditionStringValue || 'empty'}`}
                        value={element.conditionStringValue ? String(element.conditionStringValue) : undefined}
                        onValueChange={(value) => {
                          mainRuleChangeHandler({ target: { value } }, element, "conditionStringValue", index);
                        }}
                      >
                        <SelectTrigger className={error?.conditions?.[index]?.conditionStringValue ? 'border-red-500' : ''}>
                          <SelectValue placeholder={t("Select")} />
                        </SelectTrigger>
                        <SelectContent>
                          {TYPE_OPTIONS.map(el => (
                            <SelectItem key={el.value} value={el.value}>{t(el.label)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errorFun(index, "conditionStringValue")}
                    </div>
                  )}

                  {element.conditionType === "Targeting Type" && (
                    <div className="col-span-12 md:col-span-3">
                      <Select
                        key={`conditionTargetingType-${index}-${element.conditionStringValue || 'empty'}`}
                        value={element.conditionStringValue ? String(element.conditionStringValue) : undefined}
                        onValueChange={(value) => {
                          mainRuleChangeHandler({ target: { value } }, element, "conditionStringValue", index);
                        }}
                      >
                        <SelectTrigger className={error?.conditions?.[index]?.conditionStringValue ? 'border-red-500' : ''}>
                          <SelectValue placeholder={t("Select")} />
                        </SelectTrigger>
                        <SelectContent>
                          {TARGETING_TYPE_OPTIONS.map(el => (
                            <SelectItem key={el.value} value={el.value}>{t(el.label)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errorFun(index, "conditionStringValue")}
                    </div>
                  )}

                  {/* Numeric condition types */}
                  {isNumericCondition && (
                    <>
                      {/* Operator */}
                      <div className="col-span-12 md:col-span-3">
                        <Select
                          key={`conditionOperator-${index}-${element.conditionOperator || 'empty'}`}
                          value={element.conditionOperator ? String(element.conditionOperator) : undefined}
                          onValueChange={(value) => {
                            mainRuleChangeHandler({ target: { value } }, element, "conditionOperator", index);
                          }}
                        >
                          <SelectTrigger className={error?.conditions?.[index]?.conditionOperator ? 'border-red-500' : ''}>
                            <SelectValue placeholder={t("Select")} />
                          </SelectTrigger>
                          <SelectContent>
                            {OPERATOR_OPTIONS.map(el => (
                              <SelectItem key={el.value} value={el.value}>{t(el.label)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errorFun(index, "conditionOperator")}
                      </div>

                      {/* Value(s) */}
                      <div className={`col-span-12 ${isBetween ? 'md:col-span-4' : 'md:col-span-3'}`}>
                        <div className="form_field w-full">

                          {/* Single value */}
                          {!isBetween && (
                            <div className="input-group">
                              {CURRENCY_TYPES.includes(element.conditionType) && (
                                <span className="input-group-text">₹</span>
                              )}
                              <Input
                                type="number"
                                data-name="conditionValue"
                                className={error?.conditions?.[index]?.conditionValue ? 'border-red-500' : ''}
                                placeholder={t("Value")}
                                value={element.conditionValue}
                                disabled={element.useTargetAcos}
                                onChange={(e) => mainRuleChangeHandler(e, element, "conditionValue", index)}
                              />
                              {PERCENT_TYPES.includes(element.conditionType) && (
                                <span className="input-group-text">%</span>
                              )}
                            </div>
                          )}

                          {/* Between: min + max */}
                          {isBetween && (
                            <div className="flex gap-2">
                              <div className="input-group">
                                {CURRENCY_TYPES.includes(element.conditionType) && (
                                  <span className="input-group-text">₹</span>
                                )}
                                <Input
                                  type="number"
                                  data-name="conditionValue"
                                  className={error?.conditions?.[index]?.conditionValue ? 'border-red-500' : ''}
                                  placeholder={t("Min")}
                                  value={element.conditionValue}
                                  disabled={element.useTargetAcos}
                                  onChange={(e) => mainRuleChangeHandler(e, element, "conditionValue", index)}
                                />
                                {PERCENT_TYPES.includes(element.conditionType) && (
                                  <span className="input-group-text">%</span>
                                )}
                              </div>
                              <div className="input-group">
                                {CURRENCY_TYPES.includes(element.conditionType) && (
                                  <span className="input-group-text">₹</span>
                                )}
                                <Input
                                  type="number"
                                  data-name="conditionMaxValue"
                                  className={error?.conditions?.[index]?.conditionMaxValue ? 'border-red-500' : ''}
                                  placeholder={t("Max")}
                                  value={element.conditionMaxValue}
                                  disabled={element.useTargetAcos}
                                  onChange={(e) => mainRuleChangeHandler(e, element, "conditionMaxValue", index)}
                                />
                                {PERCENT_TYPES.includes(element.conditionType) && (
                                  <span className="input-group-text">%</span>
                                )}
                              </div>
                            </div>
                          )}

                          {errorFun(index, "conditionValue")}
                          {isBetween && errorFun(index, "conditionMaxValue")}
                        </div>
                      </div>

                      {/* Use Target ACOS checkbox — only for ACOS field */}
                      {element.conditionType === "ACOS" && (
                        <div className="col-span-12 md:col-span-2 flex items-center">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              className="h-4 w-4"
                              id={`useTargetAcos-${index}`}
                              checked={element.useTargetAcos}
                              onChange={(e) => handleUseTargetAcos(e.target.checked, index)}
                            />
                            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer mb-0" htmlFor={`useTargetAcos-${index}`}>
                              {t("Use Target ACOS")} ({targetAcos}%)
                            </label>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Delete row */}
                  <div className="col-span-12 md:col-span-1 flex items-center gap-2 mt-1">
                    {mainRuleData.length !== 1 && (
                      <div className="delete_icon" onClick={() => handleRemoveRule(index)}>
                        <AiFillDelete size={20} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Buttons ── */}
        <div className="form_btn flex !justify-between items-center mt-6 pt-4 border-t border-slate-100 dark:border-white/10">
          <div>
            {!editId && (
              <Button variant="outline" disabled={submitting} className="customize-button h-[36px] !bg-white !border !border-slate-300 !text-slate-700 hover:!bg-slate-50 dark:!bg-transparent dark:!border-slate-700 dark:!text-slate-300 dark:hover:!bg-slate-800 px-4 font-medium rounded-md shadow-sm flex items-center justify-center gap-1.5" type="button" onClick={() => setStep('choose-path')}>
                {t("Back")}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button disabled={submitting} variant="outline" className="customize-button h-[36px] !bg-white !border !border-slate-300 !text-slate-700 hover:!bg-slate-50 dark:!bg-transparent dark:!border-slate-700 dark:!text-slate-300 dark:hover:!bg-slate-800 px-4 font-medium rounded-md shadow-sm flex items-center justify-center gap-1.5" type="button" onClick={handleCancel}>
              {t("Cancel")}
            </Button>
            <Button disabled={submitting} className="h-[36px] bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] !text-white hover:opacity-90 !border-0 whitespace-nowrap px-4 font-semibold shadow-sm flex items-center justify-center gap-1.5" type="submit">
              {submitting ? (
                <>
                  <i className="fa fa-spinner fa-spin mr-1.5" />
                  {t("Submitting...")}
                </>
              ) : (
                t("Submit")
              )}
            </Button>
          </div>
        </div >

      </form >
    </div >
  );
}

export default AddHealthScoreRule;