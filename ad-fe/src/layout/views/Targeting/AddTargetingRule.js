import RuleCreationCampaignModal from '../../../components/rule-wizard/RuleCreationCampaignModal';
import KeywordSelectionModal from '../dayparting-stretegy/KeywordSelectionModal';
import React, { useState, useContext, useEffect, useMemo } from "react";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import {
  handleLoader,
  Toast,
  useDispatch,
  useForm,
} from "../../../helper/links/Link";
import { AiOutlinePlus } from "react-icons/ai";
import { AiFillDelete } from "react-icons/ai";
import {
  ApiCreateTargetingRule,
  ApiGetTargetingRuleById,
  ApiUpdateTargetingRule,
} from "../../../api-wrapper/targeting/ApiTargeting";
import { ApiFilterListing } from "../../../api-wrapper/customer/ApiCustomer";
import { ApigetCampaign } from "../../../api-wrapper/budgetRule/ApiBudgetRule";
import { groupCampaignIdsByType } from "../../../utility/common";
import {
  addRuleQuery,
  UpdateTargetingQuery,
} from "../../../utility/createQuery";
import CustomDebounceSelect from "./CustomDebounceSelect";
import { ShadcnDatePicker } from "../../../components/ui/date-picker";
import moment from "moment";


import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "../../../components/ui/select";
import { Label } from "../../../components/ui/label";

import { Button as ShadcnButton } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Checkbox } from "../../../components/ui/checkbox";
import { Switch } from "../../../components/ui/switch";
import { FiClock, FiInfo, FiSliders, FiHelpCircle } from "react-icons/fi";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import {
  getBlockedSlotsForDays,
  isTimeConflicting,
  validateTimeConflict,
  resolveTemplateTimes,
} from "../../../utility/ruleTimeConflict";
import { RuleWizardChoosePath, RuleWizardTemplates } from "../../../components/rule-wizard/RuleWizardSteps";
import { TargetingRuleTemplates } from "./targetingRuleTemplate";
import { useTranslation } from "react-i18next";
import { getCurrencySymbol } from "../../../helper/currencyCode/CurrencyCode";

function AddRule({
  setaddModalFlag,
  editId,
  setEditId,
  getRule,
  editData,
  setEditData,
  adminRulesSchedule = [],
  allRulesSchedule = [],
}) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  let { profileId, selectedAdType, currencyCode, profileSendID } = useContext(ProfileContext);
  const currentProfileId = profileSendID || profileId?.value || (typeof profileId === "number" || typeof profileId === "string" ? profileId : undefined);

  const { reset } = useForm({});

  const [isDark, setIsDark] = useState(
    document.documentElement.getAttribute("data-theme") === "dark",
  );

  useEffect(() => {
    const handle = () =>
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const selectTheme = useMemo(
    () => ({
      token: {
        colorPrimary: "#1A9FD4",
        colorPrimaryHover: "#2374F2",
        colorBorder: isDark ? "#334155" : "#ced4da",
        colorBgContainer: isDark ? "#1e293b" : "#fff",
        colorText: isDark ? "#f8fafc" : "#1e293b",
        colorTextPlaceholder: isDark ? "#64748b" : "#94a3b8",
        borderRadius: 8,
        fontSize: 12,
        controlHeight: 30,
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      },
      components: {
        Select: {
          multipleItemBg: isDark ? "#1e3a8a" : "#deeaff",
          multipleItemColor: "#1A9FD4",
          multipleItemBorderColor: "#2374F2",
          optionSelectedBg: isDark ? "#1e3a8a" : "#deeaff",
          optionSelectedColor: "#1A9FD4",
          optionActiveBg: isDark ? "#0f172a" : "#E0F4FD",
          controlItemBgActive: isDark ? "#1e3a8a" : "#deeaff",
          colorBgElevated: isDark ? "#0f172a" : "#fff",
        },
      },
    }),
    [isDark],
  );

  const ACTION_GROUP_OPTIONS = [
    { value: "Enabled", label: "Targets / Keywords: Enabled" },
    { value: "Paused", label: "Targets / Keywords: Paused" },
    { value: "SetBid", label: "Targets / Keywords: Set Bid" },
    { value: "Increase", label: "Targets / Keywords: Increase Bid" },
    { value: "Decrease", label: "Targets / Keywords: Decrease Bid" },
    { value: "CampaignEnabled", label: "Campaign: Enabled" },
    { value: "CampaignPaused", label: "Campaign: Paused" },
    { value: "AdGroupEnabled", label: "AdGroup: Enabled" },
    { value: "AdGroupPaused", label: "AdGroup: Paused" },
  ];

  const validatorLabel = [
    { value: "LESS_THAN", label: "Less Than" },
    { value: "LESS_THAN_OR_EQUAL_TO", label: "Less Than Or Equal To" },
    { value: "GREATER_THAN_OR_EQUAL_TO", label: "Greater Than Or Equal To" },
    { value: "GREATER_THAN", label: "Greater Than" },
    { value: "EQUAL_TO", label: "Equal To" },
    { value: "NOT_EQUAL_TO", label: "Not Equal To" },
  ];

  const TargetStatus = [
    { value: "", label: "All" },
    { value: "NOT_ARCHIVED", label: "All But Archived" },
    { value: "ENABLED", label: "Enabled" },
    { value: "PAUSED", label: "Paused" },
  ];

  const TARGETING_TYPE_OPTIONS = [
    { label: "Exact keywords", value: "EXACT" },
    { label: "Phrase keywords", value: "PHRASE" },
    { label: "Broad keywords", value: "BROAD" },
    { label: "Product targets", value: "TARGETING_EXPRESSION" },
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

  const allDays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Every 10 Days",
    "Every 15 Days",
    "Every 30 Days",
  ];
  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const intervalDays = ["Every 10 Days", "Every 15 Days", "Every 30 Days"];

  const [loadingEditData, setLoadingEditData] = useState(Boolean(editId));
  const [submitting, setSubmitting] = useState(false);
  const [creationDraft, setCreationDraft] = useState(null);
  const [creationKeywordSelection, setCreationKeywordSelection] = useState(null);
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

  // Hourly bid/budget toggle states
  const [isHourlyBidEnabled, setIsHourlyBidEnabled] = useState(false);
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
    const isState = [
      "Enabled",
      "Paused",
      "CampaignEnabled",
      "CampaignPaused",
      "AdGroupEnabled",
      "AdGroupPaused",
    ].includes(currentActionType?.actionName);

    for (let i = 0; i < 24; i += step) {
      slots.push({
        slotIndex: slots.length,
        startTime: `${String(i).padStart(2, "0")}:00`,
        endTime: `${String(i + step).padStart(2, "0")}:00`,
        enabled: true,
        bidPercentage: 0,
        value: 0,
        state: isState && ["Paused", "CampaignPaused", "AdGroupPaused"].includes(currentActionType?.actionName) ? "PAUSED" : "ENABLED",
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
      setMainRuleData([
        {
          conditionType: "",
          conditionOperator: "",
          conditionValue: "",
          conditionStatus: "",
          conditionValueType: "",
          targetingTypes: [],
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

    setIsHourlyBidEnabled(false);
    setHourlySlots([]);
    setStep('form');
  };

  const DEFAULT_TARGETING_FILTERS = [
    { name: "Impressions", label: "Impressions", value: "Impressions", isDefault: true },
    { name: "Clicks", label: "Clicks", value: "Clicks", isDefault: true },
    { name: "Orders", label: "Orders", value: "Orders", isDefault: true },
    { name: "Sales", label: "Sales", value: "Sales", isDefault: true },
    { name: "ROAS", label: "ROAS", value: "ROAS", isDefault: true },
    { name: "ACOS", label: "ACOS", value: "ACOS", isDefault: true },
    { name: "Spend", label: "Spend", value: "Spend", isDefault: true },
    { name: "Bid", label: "Bid", value: "Bid", isDefault: true },
    { name: "Top of Search IS", label: "Top of Search IS", value: "Top of Search IS", isDefault: true },
    { name: "TargetActiveStatus", label: "TargetActiveStatus", value: "TargetActiveStatus", isDefault: true },
    { name: "CampaignActiveStatus", label: "CampaignActiveStatus", value: "CampaignActiveStatus", isDefault: true },
    { name: "TargetingType", label: "TargetingType", value: "TargetingType", isDefault: true },
  ];

  const [mainLabel, setMainLabel] = useState(DEFAULT_TARGETING_FILTERS);

  const [selectedCampaigns, setSelectedCampaigns] = useState([]);
  const [selectedAdGroups, setSelectedAdGroups] = useState([]);

  const [actionType, setActionType] = useState({
    actionName: "",
    actionValue: "",
    actionValueType: "",
  });

  const [mainRuleData, setMainRuleData] = useState([
    {
      conditionType: "",
      conditionOperator: "",
      conditionValue: "",
      conditionStatus: "",
      conditionValueType: "",
      targetingTypes: [],
    },
  ]);

  const [timeData, setTimeData] = useState([""]);
  const isBidAction = ["SetBid", "Increase", "Decrease"].includes(actionType?.actionName);

  const [hourlyTargetingType, setHourlyTargetingType] = useState("TARGETS");
  const [hourlyTargetingIds, setHourlyTargetingIds] = useState({ SP: [], SB: [], SD: [] });

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

  const handleCancel = () => {
    setEditId(null);
    setEditData(null);
    setRuleName("");
    setReportDate(null);
    setToDate(null);
    setSelectedDays([]);
    setMainRuleData([
      {
        conditionType: "",
        conditionOperator: "",
        conditionValue: "",
        conditionStatus: "",
        conditionValueType: "",
        targetingTypes: [],
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
    setIsHourlyBidEnabled(false);
    setHourlyFrequency("DAILY");
    setHourlySlotType("2_HOUR");
    setHourlySlots([]);
    setHourlyTargetingType("TARGETS");
    setHourlyTargetingIds({ SP: [], SB: [], SD: [] });
    setSelectedCampaigns([]);
    setSelectedAdGroups([]);

    reset({
      ruleName: "",
      reportDate: null,
      toDate: null,
      mainRuleData: [
        {
          conditionType: "",
          conditionOperator: "",
          conditionValue: "",
          conditionStatus: "",
          conditionValueType: "",
          targetingTypes: [],
        },
      ],
      actionType: {
        actionName: "",
        actionValue: "",
        actionValueType: "",
      },
      timeData: [{}],
    });

    setaddModalFlag(false);
  };

  const submitHandler = (e) => {
    e.preventDefault();

    const isBidAction = ["SetBid", "Increase", "Decrease"].includes(actionType?.actionName);
    const effectiveIsHourlyBid = isHourlyBidEnabled && isBidAction;

    let flag = false;
    let sendData = {
      ruleName: ruleName,
      reportDate: reportDate,
      toDate: toDate,
      actionType: actionType,
      profileId: currentProfileId,
      conditions: mainRuleData,
      times: effectiveIsHourlyBid ? [] : timeData,
      days: selectedDays,
      ruleType,
      startDate,
      endDate,
      allowMultiTimeChanges,
      daysSinceCreation,
      isDaysSinceCreation,
      isHourlyBid: effectiveIsHourlyBid,
      targetingIds: effectiveIsHourlyBid && hourlyTargetingType === "KEYWORDS" ? hourlyTargetingIds : { SP: [], SB: [], SD: [] },
      hourlyConfig: effectiveIsHourlyBid ? {
        frequency: hourlyFrequency,
        slotType: hourlySlotType,
        targetingType: hourlyTargetingType,
        targetingIds: hourlyTargetingType === "KEYWORDS" ? hourlyTargetingIds : { SP: [], SB: [], SD: [] },
        slots: hourlySlots.map(s => ({
          slotIndex: s.slotIndex,
          startTime: s.startTime,
          endTime: s.endTime,
          enabled: s.enabled !== false,
          bidPercentage: Number(s.bidPercentage) || 0,
          value: Number(s.value) || 0,
          state: s.state || "ENABLED",
        })),
      } : null,
    };

    if (sendData.actionType?.actionName === "SetBid" && !sendData.actionType?.actionValueType) {
      sendData.actionType.actionValueType = "Number";
    }

    let errorData = {};
    if (sendData.ruleName == "") {
      flag = true;
      errorData.ruleName = "Rule Name is required";
    }

    if (sendData.ruleType == "") {
      flag = true;
      errorData.ruleType = "Rule Type is required";
    } else if (sendData.ruleType == "T") {
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

        if (
          ["TargetActiveStatus", "CampaignActiveStatus"].includes(
            el.conditionType,
          )
        ) {
          if (!el.conditionStatus) {
            flag = true;
            subArr.conditionStatus = "Condition Status is required";
          }
        }

        if (["TargetingType"].includes(el.conditionType)) {
          if (!el.targetingTypes || el.targetingTypes.length === 0) {
            flag = true;
            subArr.targetingTypes = "At least one type is required";
          }
        }

        if (
          [
            "Impressions",
            "Clicks",
            "Orders",
            "Sales",
            "ROAS",
            "ACOS",
            "Spend",
            "Bid",
            "Top of Search IS",
          ].includes(el.conditionType)
        ) {
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
      if (sendData?.actionType.actionName == "") {
        flag = true;
        errorData.actionName = "Action Name is required";
      }
      if (
        sendData?.actionType.actionName == "Increase" ||
        sendData?.actionType.actionName == "Decrease" ||
        sendData?.actionType.actionName == "SetBid"
      ) {
        if (!effectiveIsHourlyBid && (sendData?.actionType.actionValue === "" || sendData?.actionType.actionValue === undefined)) {
          flag = true;
          errorData.actionValue = "Action Value is required";
        }
        if (sendData?.actionType.actionValueType == "") {
          flag = true;
          errorData.actionValueType = "Action Value Type is required";
        }
      }
    }

    if (!effectiveIsHourlyBid) {
      let mainArrCheck = [];
      sendData?.times?.forEach((el, index) => {
        if (!el || Object.keys(el).length === 0) {
          flag = true;
          mainArrCheck[index] = "Time is required";
        }
      });
      errorData.timesErr = mainArrCheck;
    } else {
      // Validate hourly slots — at least one slot must be enabled
      if (!hourlySlots.some(s => s.enabled)) {
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

    if (
      mainRuleData.find((it) => it?.conditionType === "CampaignsAndAdGroups") &&
      !Boolean(selectedCampaigns.length + selectedAdGroups.length)
    ) {
      flag = true;
      errorData.campaignsAndAdGroups =
        "Select at least one campaign or ad group";
    }

    if (!effectiveIsHourlyBid && selectedDays.length > 0 && sendData.times?.length > 0) {
      const conflicts = validateTimeConflict(
        allRulesSchedule,
        adminRulesSchedule,
        selectedDays,
        sendData.times,
        editId || null,
      );
      if (conflicts.length > 0) flag = true;
    }

    seterror(errorData);

    if (!flag) {
      if (
        mainRuleData.find((it) => it?.conditionType === "CampaignsAndAdGroups")
      ) {
        sendData = {
          ...sendData,
          conditions: mainRuleData.map((cond) => {
            if (cond.conditionType === "CampaignsAndAdGroups") {
              return {
                ...cond,
                campaigns: selectedCampaigns,
                adGroups: selectedAdGroups,
                campaignIds: selectedCampaigns.map((c) => Number(c?.value)),
                adGroupIds: selectedAdGroups.map((g) => g?.value),
              };
            }
            return cond;
          }),
        };
      }

      sendData.query = {
        SP: UpdateTargetingQuery(
          addRuleQuery(sendData, mainLabel, "SP"),
          editData?.campaignIds?.SP ?? [],
        ),
        SB: UpdateTargetingQuery(
          addRuleQuery(sendData, mainLabel, "SB"),
          editData?.campaignIds?.SB ?? [],
        ),
        SD: UpdateTargetingQuery(
          addRuleQuery(sendData, mainLabel, "SD"),
          editData?.campaignIds?.SD ?? [],
        ),
      };

      if (!editId) {
        if (effectiveIsHourlyBid && hourlyTargetingType === "KEYWORDS") {
          setSubmitting(true);
          ApigetCampaign({ profileId: profileSendID || sendData.profileId })
            .then((res) => {
              if (!res?.isSuccess || !Array.isArray(res.data)) {
                Toast.error(res?.message || t("Unable to load campaigns"));
                return;
              }
              const campaigns = res.data.filter((campaign) =>
                ["Sponsored Products", "Sponsored Brands", "Sponsored Display"].includes(campaign.type),
              );
              if (!campaigns.length) {
                Toast.error(t("No campaigns available for keyword selection."));
                return;
              }
              setCreationKeywordSelection({
                draft: JSON.parse(JSON.stringify(sendData)),
                campaigns,
                campaignIds: groupCampaignIdsByType(
                  campaigns.map((campaign) => campaign.campaignId),
                  campaigns,
                ),
              });
            })
            .catch((err) => Toast.error(err?.message || t("Unable to load campaigns")))
            .finally(() => setSubmitting(false));
          return;
        }
        setCreationDraft(JSON.parse(JSON.stringify(sendData)));
        return;
      }
      setSubmitting(true);
      if (editId) {
        ApiUpdateTargetingRule(editId, sendData)
          .then((res) => {
            if (res.isSuccess) {
              getRule();
              setEditId();
              setEditData(null);
              Toast.success(res.message);
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
      }
    }
  };

  const createRuleWithSelectedKeywords = async (targetingIds, validCampaignIds) => {
    if (!creationKeywordSelection?.draft) return;
    const draft = creationKeywordSelection.draft;
    const campaignIds = groupCampaignIdsByType(
      validCampaignIds || [],
      creationKeywordSelection.campaigns,
    );
    if (!Object.values(campaignIds).some((ids) => ids.length)) {
      Toast.error(t("Please select at least one keyword or target before saving."));
      return;
    }

    const payload = {
      ...draft,
      campaignIds,
      targetingIds,
      hourlyConfig: { ...draft.hourlyConfig, targetingIds },
      query: {
        SP: UpdateTargetingQuery(draft.query?.SP, campaignIds.SP),
        SB: UpdateTargetingQuery(draft.query?.SB, campaignIds.SB),
        SD: UpdateTargetingQuery(draft.query?.SD, campaignIds.SD),
      },
    };

    setSubmitting(true);
    try {
      const result = await ApiCreateTargetingRule(payload);
      if (!result?.isSuccess) throw new Error(result?.message || t("Unable to create rule"));
      setCreationKeywordSelection(null);
      getRule();
      Toast.success(result.message);
      setaddModalFlag(false);
    } catch (err) {
      Toast.error(err?.message || t("Unable to create rule"));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (editId) {
      const scrollableDiv = document.querySelector(".outlet_wrapper");
      if (scrollableDiv) {
        scrollableDiv.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      setLoadingEditData(true);
      ApiGetTargetingRuleById(editId)
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
                    conditionType: "",
                    conditionOperator: "",
                    conditionValue: "",
                    conditionStatus: "",
                    conditionValueType: "",
                    targetingTypes: [],
                  },
                ],
            );
            setSelectedDays(res.data.days);
            setTimeData(res.data.times?.length ? res.data.times : [""]);
            setRuleType(res.data.ruleType);
            setStartDate(res.data.startDate);
            setEndDate(res.data.endDate);
            setAllowMultiTimeChanges(res.data.allowMultiTimeChanges);
            setDaysSinceCreation(res.data.daysSinceCreation || 0);
            setIsDaysSinceCreation(res.data.isDaysSinceCreation || false);
            setIsHourlyBidEnabled(res.data.isHourlyBid || false);
            if (res.data.hourlyConfig) {
              setHourlyFrequency(res.data.hourlyConfig.frequency || "DAILY");
              setHourlySlotType(res.data.hourlyConfig.slotType || "2_HOUR");
              setHourlySlots(res.data.hourlyConfig.slots || []);
              setHourlyTargetingType(res.data.hourlyConfig.targetingType || (res.data.targetingIds && (res.data.targetingIds.SP?.length || res.data.targetingIds.SB?.length || res.data.targetingIds.SD?.length) ? "KEYWORDS" : "TARGETS"));
              setHourlyTargetingIds(res.data.hourlyConfig.targetingIds || res.data.targetingIds || { SP: [], SB: [], SD: [] });
            } else if (res.data.targetingIds) {
              setHourlyTargetingType(res.data.targetingIds.SP?.length || res.data.targetingIds.SB?.length || res.data.targetingIds.SD?.length ? "KEYWORDS" : "TARGETS");
              setHourlyTargetingIds(res.data.targetingIds || { SP: [], SB: [], SD: [] });
            }
            const findCampaignsAndAdGroups = res?.data?.conditions?.find(
              (d) => d?.conditionType === "CampaignsAndAdGroups",
            );
            if (findCampaignsAndAdGroups) {
              setSelectedCampaigns(findCampaignsAndAdGroups?.campaigns);
              setSelectedAdGroups(findCampaignsAndAdGroups?.adGroups);
            }

            reset(res.data);
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

  const mainRuleChangeHandler = (e, obj, address_type, numberVal, index) => {
    let data = [...mainRuleData];
    let value = e.target.value;

    // Handle percentage value constraints
    if (
      address_type === "conditionValue" &&
      data[index]?.conditionValueType === "Percentage"
    ) {
      const newValue = parseFloat(value);
      if (!isNaN(newValue) && newValue >= 0 && newValue <= 100) {
        obj.conditionValue = value;
      } else {
        obj.conditionValue = "";
      }
      setMainRuleData(data);
      return;
    }

    // Handle Top of Search IS percentage constraint
    if (
      address_type === "conditionValue" &&
      data[index]?.conditionType === "Top of Search IS"
    ) {
      const newValue = parseFloat(value);
      if (!isNaN(newValue) && newValue >= 0 && newValue <= 100) {
        obj.conditionValue = value;
      } else {
        obj.conditionValue = "";
      }
      setMainRuleData(data);
      return;
    }

    // Handle targeting types (checkbox)
    if (address_type === "targetingTypes") {
      if (e.target.checked) {
        obj.targetingTypes = [...obj?.targetingTypes, value];
      } else {
        obj.targetingTypes =
          obj?.targetingTypes?.filter((d) => d !== value) || [];
      }
      setMainRuleData(data);
      if (address_type) {
        removeError("conditions", index, address_type);
      }
      return;
    }

    // Handle conditionValueType - reset conditionValue
    if (address_type === "conditionValueType") {
      obj.conditionValue = "";
      obj.conditionValueType = value;
      setMainRuleData(data);
      if (address_type) {
        removeError("conditions", index, address_type);
      }
      return;
    }

    // Handle all other fields
    if (address_type) {
      obj[address_type] = value;
    } else {
      // Fallback for when address_type is not provided
      const dataName = e.target.attributes["data-name"]?.value;
      if (dataName) {
        obj[dataName] = value;
      }
    }

    setMainRuleData(data);

    if (address_type) {
      removeError("conditions", index, address_type);
    }
  };

  const addConditionHandler = () => {
    setMainRuleData([
      ...mainRuleData,
      {
        conditionType: "",
        conditionOperator: "",
        conditionValue: "",
        conditionStatus: "",
        conditionValueType: "",
        targetingTypes: [],
      },
    ]);
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

  const handleAddTimeField = () => {
    setTimeData([...timeData, ""]);
  };

  const handleRemoveTimeField = (index) => {
    let arr = [...timeData];
    arr.splice(index, 1);
    if (arr.length === 0) arr = [""];
    setTimeData(arr);
  };

  const handleRemoveRule = (index) => {
    const newData = [...mainRuleData];
    newData.splice(index, 1);
    setMainRuleData(newData);
  };

  const handleActionType = (e, numberVal) => {
    if (e.target.name == "actionValueType") {
      setActionType({
        ...actionType,
        actionValue: "",
        actionValueType: e.target.value,
      });
    } else if (
      e.target.name == "actionValue" &&
      actionType.actionValueType == "Percentage"
    ) {
      const newValue = parseFloat(e.target.value);
      if (!isNaN(newValue) && newValue >= 0 && newValue <= 100) {
        setActionType({
          ...actionType,
          [e.target.name]: e.target.value,
        });
      } else {
        setActionType({
          ...actionType,
          actionValue: "",
        });
      }
    } else if (
      [
        "Enabled",
        "Paused",
        "CampaignEnabled",
        "CampaignPaused",
        "AdGroupEnabled",
        "AdGroupPaused",
      ].includes(e.target.value)
    ) {
      setActionType({
        actionName: e.target.value,
        actionValue: "",
        actionValueType: "",
      });
      setIsHourlyBidEnabled(false);
    } else if (["SetBid", "Increase", "Decrease"].includes(e.target.value)) {
      setActionType({
        ...actionType,
        actionName: e.target.value,
        actionValueType: actionType.actionValueType || "Number",
      });
      removeError("actionName");
      removeError("actionValueType");
    } else {
      setActionType({
        ...actionType,
        [e.target.name]: e.target.value,
      });
    }

    // Remove error for action fields
    if (e.target.name) {
      removeError(e.target.name);
    }
  };

  const handleCampaignChange = (newCampaigns) => {
    const newCampaignIds = newCampaigns.map((c) => c?.value);
    const removedCampaignIds = selectedCampaigns
      .map((c) => c?.value)
      .filter((id) => !newCampaignIds.includes(id));

    setSelectedAdGroups((prev) =>
      prev.filter(
        (adGroup) => !removedCampaignIds.includes(adGroup?.data?.campaignId),
      ),
    );

    setSelectedCampaigns(newCampaigns);
    removeError("campaignsAndAdGroups");
  };

  const handleAdGroupChange = (newAdGroups) => {
    const adGroupCampaignIds = newAdGroups.map((a) => a?.data?.campaignId);
    setSelectedCampaigns((prev) =>
      prev.filter((c) => !adGroupCampaignIds.includes(c?.value)),
    );
    setSelectedAdGroups(newAdGroups);
    removeError("campaignsAndAdGroups");
  };

  useEffect(() => {
    const getMainLabel = async () => {
      if (profileId.value && selectedAdType) {
        await ApiFilterListing({
          profileId: profileId.value,
          pageName: "Targeting",
        })
          .then((e) => {
            if (e?.isSuccess) {
              const skipOption = ["CampaignsAndAdGroups"];
              const filters =
                e?.filters
                  ?.map((el) => ({
                    ...el,
                    value: el.value || el.name || el._id,
                    label: el.name || el.label,
                  }))
                  .filter((e1) => !skipOption?.includes(e1?.value)) || [];

              DEFAULT_TARGETING_FILTERS.forEach((def) => {
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
    };
    getMainLabel();
  }, [editId, profileId, selectedAdType]);

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
        title={t("Create New Targeting Rule")}
        description="Automation helps you optimize your targeting 24/7. Select how you want to start building your optimization logic."
        templateCardTitle="Browse Templates"
        templateCardDesc="Choose from pre-configured rules for keyword and product targeting optimization."
        scratchCardTitle="Build Custom Rule"
        scratchCardDesc="Create a blank targeting rule and define your own conditions from the ground up."
        onSelectTemplates={() => setStep('templates')}
        onSelectScratch={() => setStep('form')}
      />
    );
  }

  if (step === 'templates') {
    return (
      <RuleWizardTemplates
        templates={TargetingRuleTemplates}
        onApplyTemplate={applyTemplate}
        onBack={() => setStep('choose-path')}
      />
    );
  }

  return (
    <div id="targeting-rule-add" className="new_rule">
      <form onSubmit={submitHandler} className="flex flex-col h-full min-h-0 relative">
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
          {/* Rule Name, Date Filter, Days Since Creation */}
          <div className="mb-6 pb-6 border-b border-dashed border-slate-200 dark:border-slate-700">
            <div className="flex flex-wrap items-start gap-4">
              <div id="rule-name-input" className="w-full sm:w-[240px]">
                <Label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("Rule Name")} <span className="text-danger">*</span>
                </Label>
                <Input
                  type="text"
                  name="ruleName"
                  className={`w-full ${error?.ruleName ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  placeholder={t("Enter rule name")}
                  onChange={(e) => {
                    setRuleName(e.target.value);
                    removeError("ruleName");
                  }}
                  value={ruleName}
                />
                {error?.ruleName && <p className="error">{error.ruleName}</p>}
              </div>
              <div className="w-full sm:w-[200px]" id="rule-date-filter">
                <Label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("Date Filter")}</Label>
                <Select
                  value={reportDate || undefined}
                  onValueChange={(value) => {
                    setReportDate(value);
                    removeError("reportDate");
                  }}
                >
                  <SelectTrigger className={`w-full ${error?.reportDate ? "border-red-500" : ""}`}>
                    <SelectValue placeholder={t("Select")} />
                  </SelectTrigger>
                  <SelectContent>
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
                  <Label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("Date")}</Label>
                  <ShadcnDatePicker
                    className={`${error?.toDate ? "border-red-500" : ""}`}
                    placeholder={t("Select Date")}
                    value={toDate}
                    onChange={(date) => {
                      setToDate(date);
                      removeError("toDate");
                    }}
                  />
                  {error?.toDate && <p className="error">{error.toDate}</p>}
                </div>
              )}
              <div className="w-full sm:w-[200px]" id="rule-days-since">
                <Label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <Checkbox
                    name="isDaysSinceCreation"
                    checked={isDaysSinceCreation}
                    onChange={(e) => {
                      setIsDaysSinceCreation(e.target.checked);
                      if (!e.target.checked) setDaysSinceCreation(0);
                    }}
                  />
                  <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{t("Day's Since Creation")}</span>
                </Label>
                <Input
                  type="number"
                  name="daysSinceCreation"
                  className={`w-full ${error?.daysSinceCreation ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  placeholder={t("0")}
                  value={daysSinceCreation}
                  onChange={(e) => setDaysSinceCreation(e.target.value)}
                  disabled={!isDaysSinceCreation}
                />
                {error?.daysSinceCreation && (
                  <p className="error">{error.daysSinceCreation}</p>
                )}
              </div>
            </div>
            <div className="mt-6">
              <div className="flex items-center gap-2 pb-2">
                {t("Rule Type")} <span className="text-danger">*</span>
              </div>
              <div className="flex flex-wrap items-start gap-4">
                <div className="w-full sm:w-[240px]" id="rule-type">
                  <Select
                    value={ruleType || undefined}
                    onValueChange={(value) => {
                      setRuleType(value);
                      removeError("ruleType");
                    }}
                  >
                    <SelectTrigger className={`w-full ${error?.ruleType ? "border-red-500" : ""}`}>
                      <SelectValue placeholder={t("Select")} />
                    </SelectTrigger>
                    <SelectContent>
                      {ruleTypeOption.map((el) => (
                        <SelectItem key={el.value} value={el.value}>
                          {t(el.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {error?.ruleType && <p className="error">{error.ruleType}</p>}
                </div>
                {ruleType === "T" && (
                  <>
                    <div className="w-full sm:w-[240px]">
                      <Label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t("Start Date")} <span className="text-danger">*</span>
                      </Label>
                      <ShadcnDatePicker
                        className={`${error?.startDate ? "border-red-500" : ""}`}
                        placeholder={t("Select Start Date")}
                        value={startDate}
                        onChange={(date) => {
                          setStartDate(date);
                          removeError("startDate");
                        }}
                      />
                      {error?.startDate && <p className="error">{error.startDate}</p>}
                    </div>
                    <div className="w-full sm:w-[240px]">
                      <Label className="block mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t("End Date")} <span className="text-danger">*</span>
                      </Label>
                      <ShadcnDatePicker
                        className={`${error?.endDate ? "border-red-500" : ""}`}
                        placeholder={t("Select End Date")}
                        value={endDate}
                        onChange={(date) => {
                          setEndDate(date);
                          removeError("endDate");
                        }}
                      />
                      {error?.endDate && <p className="error">{error.endDate}</p>}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="mb-6 pb-3 border-b border-dashed border-slate-200 dark:border-slate-700" id="rule-conditions">
            <div className="flex justify-between items-center mb-3">
              <div className="flex justify-between items-center">
                <div className="section-title">
                  {t("Conditions")}
                </div>
              </div>
              <ShadcnButton type="button" variant="default" onClick={addConditionHandler}>
                <AiOutlinePlus size={14} /> {t("Add Condition")}
              </ShadcnButton>
            </div>
            {mainRuleData?.map((element, index) => {
              const conditionError = error?.conditions?.[index] || {};
              const showOperators = [
                "Impressions",
                "Clicks",
                "Orders",
                "Sales",
                "ROAS",
                "ACOS",
                "Spend",
                "Bid",
                "Top of Search IS",
              ].includes(element.conditionType);
              const showStatus = [
                "TargetActiveStatus",
                "CampaignActiveStatus",
              ].includes(element.conditionType);
              const showTargetingTypes = ["TargetingType"].includes(
                element.conditionType,
              );
              const showCampaigns = ["CampaignsAndAdGroups"].includes(
                element.conditionType,
              );
              return (
                <div className="flex flex-wrap items-start gap-4 mb-4" key={index}>
                  <div className="w-full sm:w-[200px]">
                    <Select
                      key={`${element.conditionType || 'empty'}-${mainLabel.map((m) => m.value).join('_')}`}
                      value={element.conditionType || undefined}
                      onValueChange={(val) =>
                        mainRuleChangeHandler(
                          { target: { value: val } },
                          element,
                          "conditionType",
                          null,
                          index,
                        )
                      }
                    >
                      <SelectTrigger className={`w-full ${conditionError.conditionType ? "border-red-500" : ""}`}>
                        <SelectValue placeholder={t("Select")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const savedFilters = mainLabel.filter((el) => !el.isDefault);
                          const defaultFilters = mainLabel.filter((el) => el.isDefault);
                          return (
                            <>
                              {savedFilters.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>{t("Saved Filters")}</SelectLabel>
                                  {savedFilters.map((el) => (
                                    <SelectItem key={el.value} value={el.value}>
                                      {t(el.label)}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                              <SelectGroup>
                                <SelectLabel>{t("Filter Options")}</SelectLabel>
                                {defaultFilters.map((el) => (
                                  <SelectItem key={el.value} value={el.value}>
                                    {t(el.label)}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </>
                          );
                        })()}
                      </SelectContent>
                    </Select>
                    {conditionError.conditionType && (
                      <p className="error">{conditionError.conditionType}</p>
                    )}
                  </div>
                  {showStatus && (
                    <div className="w-full sm:w-[200px]">
                      <Select
                        value={element.conditionStatus || undefined}
                        onValueChange={(val) =>
                          mainRuleChangeHandler(
                            { target: { value: val } },
                            element,
                            "conditionStatus",
                            null,
                            index,
                          )
                        }
                      >
                        <SelectTrigger className={`w-full ${conditionError.conditionStatus ? "border-red-500" : ""}`}>
                          <SelectValue placeholder={t("Select")} />
                        </SelectTrigger>
                        <SelectContent>
                          {TargetStatus.map((el) => (
                            <SelectItem key={el.value} value={el.value}>
                              {t(el.label)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {conditionError.conditionStatus && (
                        <p className="error">{conditionError.conditionStatus}</p>
                      )}
                    </div>
                  )}
                  {showTargetingTypes && (
                    <div className="w-full sm:w-[450px]">
                      <Label className="mb-1">{t("Types:")}</Label>
                      <div className="custom-checkbox">
                        {TARGETING_TYPE_OPTIONS.map((day) => (
                          <Label
                            key={day.value}
                            className="me-1 flex items-center gap-2"
                          >
                            <Checkbox
                              value={day.value}
                              checked={element.targetingTypes.includes(day.value)}
                              onCheckedChange={(checked) =>
                                mainRuleChangeHandler(
                                  { target: { value: day.value, checked } },
                                  element,
                                  "targetingTypes",
                                  null,
                                  index,
                                )
                              }
                            />
                            {t(day.label)}
                          </Label>
                        ))}
                      </div>
                      {conditionError.targetingTypes && (
                        <p className="error">{conditionError.targetingTypes}</p>
                      )}
                    </div>
                  )}
                  {showCampaigns && (
                    <>
                      <div className="w-full sm:w-[240px]">
                        <CustomDebounceSelect
                          title={t("Search Campaigns")}
                          value={selectedCampaigns}
                          setValue={handleCampaignChange}
                          keys={["campaign", "campaignId"]}
                        />
                      </div>
                      <div className="w-full sm:w-[240px]">
                        <CustomDebounceSelect
                          title={t("Search Ad Groups")}
                          value={selectedAdGroups}
                          setValue={handleAdGroupChange}
                          keys={["adGroup", "adGroupId"]}
                        />
                      </div>
                      {error?.campaignsAndAdGroups && (
                        <p className="error">{error.campaignsAndAdGroups}</p>
                      )}
                    </>
                  )}
                  {showOperators && (
                    <>
                      <div className="w-full sm:w-[200px]">
                        <Select
                          value={element.conditionOperator || undefined}
                          onValueChange={(val) =>
                            mainRuleChangeHandler(
                              { target: { value: val } },
                              element,
                              "conditionOperator",
                              null,
                              index,
                            )
                          }
                        >
                          <SelectTrigger className={`w-full ${conditionError.conditionOperator ? "border-red-500" : ""}`}>
                            <SelectValue placeholder={t("Select")} />
                          </SelectTrigger>
                          <SelectContent>
                            {validatorLabel.map((el) => (
                              <SelectItem key={el.value} value={el.value}>
                                {t(el.label)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {conditionError.conditionOperator && (
                          <p className="error">
                            {conditionError.conditionOperator}
                          </p>
                        )}
                      </div>
                      <div className="w-full sm:w-[200px]">
                        <div className="input-group">
                          {["Spend", "Sales", "Bid"].includes(
                            element.conditionType,
                          ) && <span className="input-group-text">{getCurrencySymbol(currencyCode)}</span>}
                          <Input
                            type="number"
                            name={`conditions.${index}.conditionValue`}
                            className={`w-full ${conditionError.conditionValue ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                            placeholder={t("Value")}
                            onChange={(e) =>
                              mainRuleChangeHandler(
                                e,
                                element,
                                "conditionValue",
                                null,
                                index,
                              )
                            }
                            value={element.conditionValue}
                          />
                          {["ACOS", "Top of Search IS"].includes(
                            element.conditionType,
                          ) && <span className="input-group-text">%</span>}
                        </div>
                        {conditionError.conditionValue && (
                          <p className="error">{conditionError.conditionValue}</p>
                        )}
                      </div>
                    </>
                  )}
                  <div className="col-12 col-md-1 flex items-center gap-2 mt-1">
                    {mainRuleData.length > 1 && (
                      <div
                        className="delete_icon"
                        onClick={() => handleRemoveRule(index)}
                      >
                        <AiFillDelete size={20} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mb-4" id="rule-actions">
            <div className="flex justify-between items-center mb-6">
              <div className="section-title">
                {t("Action Type")} <span className="text-danger ms-1">*</span>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-full sm:w-[240px]">
                <Select
                  value={actionType.actionName || undefined}
                  onValueChange={(val) =>
                    handleActionType({
                      target: { name: "actionName", value: val },
                    })
                  }
                >
                  <SelectTrigger className={`w-full ${error?.actionName ? "border-red-500" : ""}`}>
                    <SelectValue placeholder={t("Select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_GROUP_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(opt.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {error?.actionName && <p className="error">{error.actionName}</p>}
              </div>
              {![
                "Enabled",
                "Paused",
                "CampaignEnabled",
                "CampaignPaused",
                "AdGroupEnabled",
                "AdGroupPaused",
              ].includes(actionType.actionName) && (
                  <>
                    <div className="w-full sm:w-[200px]">
                      <Select
                        value={actionType.actionValueType || undefined}
                        onValueChange={(val) =>
                          handleActionType({
                            target: { name: "actionValueType", value: val },
                          })
                        }
                      >
                        <SelectTrigger className={`w-full ${error?.actionValueType ? "border-red-500" : ""}`}>
                          <SelectValue placeholder={t("Select")} />
                        </SelectTrigger>
                        <SelectContent>
                          {selector.map((el) => (
                            <SelectItem key={el.value} value={el.value}>
                              {t(el.label)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {error?.actionValueType && (
                        <p className="error">{error.actionValueType}</p>
                      )}
                    </div>
                    {!isHourlyBidEnabled && (
                      <div className="w-full sm:w-[200px]">
                        <div className="input-group">
                          {actionType.actionValueType === "Number" && (
                            <span className="input-group-text">{getCurrencySymbol(currencyCode)}</span>
                          )}
                          <Input
                            type="number"
                            name="actionValue"
                            className={`w-full ${error?.actionValue ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                            placeholder={t("Value")}
                            value={actionType.actionValue}
                            onChange={(e) => handleActionType(e)}
                          />
                          {actionType.actionValueType === "Percentage" && (
                            <span className="input-group-text">%</span>
                          )}
                        </div>
                        {error?.actionValue && (
                          <p className="error">{error.actionValue}</p>
                        )}
                      </div>
                    )}
                  </>
                )}
            </div>
          </div>
          <div className="add_border"></div> {/* Days and Times Section */}
          <div className="row mt-4">
            {/* Days Section */}
            <div className="col-12 col-lg-12 mb-4" id="rule-rule-days">
              <Label className="mb-2">
                {t("Rule Days")} <span className="text-danger">*</span>
              </Label>
              <div
                className={`days-container flex flex-col gap-2 mt-3 ${error?.days ? "has-error" : ""}`}
              >
                {/* Row 1: All */}
                <div className="flex flex-wrap gap-2">
                  <div
                    className={`day-btn ${selectedDays.length === allDays.length ? "active" : ""}`}
                    onClick={() => {
                      setSelectedDays(
                        selectedDays.length === allDays.length ? [] : allDays,
                      );
                      removeError("days");
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
                      className={`day-btn ${selectedDays.includes(day) ? "active" : ""}`}
                      onClick={() => {
                        const newDays = selectedDays.includes(day)
                          ? selectedDays.filter((d) => d !== day)
                          : [...selectedDays, day];
                        setSelectedDays(newDays);
                        removeError("days");
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
                      className={`day-btn ${selectedDays.includes(day) ? "active" : ""}`}
                      onClick={() => {
                        const newDays = selectedDays.includes(day)
                          ? selectedDays.filter((d) => d !== day)
                          : [...selectedDays, day];
                        setSelectedDays(newDays);
                        removeError("days");
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
            {(!isHourlyBidEnabled || !isBidAction) && (
              <div className="col-12 col-lg-12 mb-4" id="rule-rule-times">
                <Label className="mb-2">
                  {t("Rule Times")} <span className="text-danger">*</span>
                </Label>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded mt-3">
                  <div className="flex flex-wrap gap-3 mb-2">
                    {(timeData?.length ? timeData : [""]).map((time, index) => {
                      const blockedSlots = getBlockedSlotsForDays(
                        allRulesSchedule,
                        adminRulesSchedule,
                        selectedDays,
                        editId || null,
                      );
                      const conflict = isTimeConflicting(time, blockedSlots);
                      const hasError = error?.timesErr?.[index];
                      return (
                        <div key={index} className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <Input
                              type="time"
                              className={`dark:[color-scheme:dark] ${conflict || hasError ? "border-red-500" : ""}`}
                              value={time}
                              onChange={(e) => handleTimeChange(index, e)}
                            />
                            {conflict && (
                              <p
                                className="error"
                                style={{
                                  fontSize: "10px",
                                  marginTop: "2px",
                                  maxWidth: "120px",
                                  lineHeight: "1.2",
                                }}
                              >
                                ⚠️ {t("Conflict")}: {conflict.ruleName}
                              </p>
                            )}
                            {hasError && !conflict && (
                              <p className="error">{hasError}</p>
                            )}
                          </div>
                          {timeData.length > 1 && (
                            <div
                              className="delete_icon"
                              onClick={() => handleRemoveTimeField(index)}
                            >
                              <AiFillDelete size={18} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex justify-between items-center">
                    <Label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={allowMultiTimeChanges}
                        onCheckedChange={(checked) => setAllowMultiTimeChanges(checked)}
                      />
                      <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-700 dark:text-slate-300">
                        {t("Allow Multiple Time Change In A Campaign Per Day")}
                        <i className="fa fa-info-circle text-gray-400 dark:text-slate-400 ms-1"></i>
                      </span>
                    </Label>
                    <ShadcnButton type="button" variant="default" onClick={handleAddTimeField}>
                      <AiOutlinePlus size={14} /> {t("Add Time")}
                    </ShadcnButton>
                  </div>
                </div>
              </div>
            )}

            {/* Hourly Bid/Budget Changes Section */}
            <div className={`col-12 col-lg-12 ${isHourlyBidEnabled && isBidAction ? "mb-2" : "mb-4"}`} id="rule-hourly-bid-section">
              <div
                className={`p-4 rounded-xl border transition-all duration-200 shadow-sm ${
                  isHourlyBidEnabled && isBidAction
                    ? "bg-sky-50/70 border-sky-300/80 dark:bg-sky-950/20 dark:border-sky-700/50"
                    : !isBidAction
                    ? "bg-slate-50/40 border-slate-200/60 dark:bg-slate-900/40 dark:border-slate-800/60 opacity-60"
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
                        <Label className={`text-sm font-bold text-slate-800 dark:text-slate-200 mb-0 ${isBidAction ? "cursor-pointer" : "cursor-not-allowed"}`}>
                          {t("Enable Hourly-Based Changes")}
                        </Label>
                        <AppTooltip
                          text={
                            !isBidAction
                              ? t("Hourly changes are only available when a Bid action (Set Bid, Increase Bid, Decrease Bid) is selected.")
                              : t("When enabled, replaces single execution times with multi-slot dayparting. Configure custom percentage changes for each time window of the day.")
                          }
                        >
                          <span className="cursor-pointer text-slate-400 hover:text-sky-500 transition-colors">
                            <FiHelpCircle size={14} />
                          </span>
                        </AppTooltip>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-0 mt-0.5">
                        {!isBidAction
                          ? t("Select a bid action (Set Bid, Increase Bid, Decrease Bid) to enable hourly scheduling.")
                          : t("Configure changes for specific time periods throughout the day.")}
                      </p>
                    </div>
                  </div>
                  <Switch
                    disabled={!isBidAction}
                    checked={isHourlyBidEnabled && isBidAction}
                    onCheckedChange={(checked) => {
                      setIsHourlyBidEnabled(checked);
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

                {isHourlyBidEnabled && isBidAction && (
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

                    {/* Apply Scope: All Targets vs Specific Keywords */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {t("Apply Hourly Changes To")} <span className="text-danger">*</span>
                        </Label>
                        <AppTooltip text={t("Choose whether hourly schedule applies to all targets/keywords in the selected campaigns or specific selected individual keywords.")}>
                          <FiInfo size={12} className="text-slate-400 cursor-pointer" />
                        </AppTooltip>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label
                          onClick={() => {
                            setHourlyTargetingType("TARGETS");
                            if (error?.hourlyKeywords) removeError("hourlyKeywords");
                          }}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                            hourlyTargetingType === "TARGETS"
                              ? "bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-400 shadow-sm"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="hourlyTargetingType"
                            value="TARGETS"
                            checked={hourlyTargetingType === "TARGETS"}
                            onChange={() => {
                              setHourlyTargetingType("TARGETS");
                              if (error?.hourlyKeywords) removeError("hourlyKeywords");
                            }}
                            className="h-3.5 w-3.5 text-sky-600 focus:ring-sky-500"
                          />
                          <span>{t("All Targets in Selected Campaigns")}</span>
                        </label>

                        <label
                          onClick={() => setHourlyTargetingType("KEYWORDS")}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                            hourlyTargetingType === "KEYWORDS"
                              ? "bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-400 shadow-sm"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="hourlyTargetingType"
                            value="KEYWORDS"
                            checked={hourlyTargetingType === "KEYWORDS"}
                            onChange={() => setHourlyTargetingType("KEYWORDS")}
                            className="h-3.5 w-3.5 text-sky-600 focus:ring-sky-500"
                          />
                          <span>{t("Specific Keywords / Targets")}</span>
                        </label>
                      </div>

                      {/* When Specific Keywords selected, show informative guidance */}
                      {hourlyTargetingType === "KEYWORDS" && (
                        <div className="mt-1 flex items-start gap-2.5 p-3 rounded-xl border border-sky-200/80 dark:border-sky-800/60 bg-sky-50/50 dark:bg-sky-950/20 text-xs">
                          <FiInfo size={16} className="shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
                          <div className="text-slate-700 dark:text-slate-300 font-medium">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{t("Keyword Assignment")}: </span>
                            {t("Submit opens keyword selection. This rule is created after you select and save at least one keyword or target.")}
                          </div>
                        </div>
                      )}
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
                      const isStateAction = [
                        "Enabled",
                        "Paused",
                        "CampaignEnabled",
                        "CampaignPaused",
                        "AdGroupEnabled",
                        "AdGroupPaused",
                      ].includes(actionType.actionName);

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
                                actionType.actionName === "SetBid" ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHourlySlots(hourlySlots.map((s) => ({ ...s, value: 1 })));
                                      }}
                                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    >
                                      {currSym}1.00
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHourlySlots(hourlySlots.map((s) => ({ ...s, value: 2 })));
                                      }}
                                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
                                    >
                                      {currSym}2.00
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHourlySlots(hourlySlots.map((s) => ({ ...s, value: 5 })));
                                      }}
                                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
                                    >
                                      {currSym}5.00
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
                                        setHourlySlots(hourlySlots.map((s) => ({ ...s, value: 0.25 })));
                                      }}
                                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
                                    >
                                      +{currSym}0.25
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHourlySlots(hourlySlots.map((s) => ({ ...s, value: 0.5 })));
                                      }}
                                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
                                    >
                                      +{currSym}0.50
                                    </button>
                                  </>
                                )
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setHourlySlots(hourlySlots.map((s) => ({ ...s, bidPercentage: 0 })));
                                    }}
                                    className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                  >0</button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setHourlySlots(hourlySlots.map((s) => ({ ...s, bidPercentage: 10 })));
                                    }}
                                    className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
                                  >
                                    +10%
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setHourlySlots(hourlySlots.map((s) => ({ ...s, bidPercentage: 20 })));
                                    }}
                                    className="text-[11px] font-medium px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
                                  >
                                    +20%
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
                                  ? t("Target / Campaign / AdGroup Status")
                                  : isNumberMode
                                  ? (actionType.actionName === "SetBid" ? `${t("Target Bid")} (${currSym})` : `${t("Bid Adjustment")} (${currSym})`)
                                  : t("Bid / Action Value (%)")}
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
                                          value={slot.bidPercentage ?? ""}
                                          onChange={(e) => {
                                            const newSlots = [...hourlySlots];
                                            newSlots[index] = {
                                              ...newSlots[index],
                                              bidPercentage: e.target.value,
                                            };
                                            setHourlySlots(newSlots);
                                          }}
                                          className={`w-full h-8 pl-3 pr-7 text-xs font-semibold ${
                                            Number(slot.bidPercentage) > 0
                                              ? "border-emerald-400 dark:border-emerald-600/60 text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20"
                                              : Number(slot.bidPercentage) < 0
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
              id="rule-submit"
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
            </ShadcnButton >
          </div >
        </div >
      </form >
      <RuleCreationCampaignModal
        draft={creationDraft}
        onCancel={() => setCreationDraft(null)}
        createRule={ApiCreateTargetingRule}
        allRules={allRulesSchedule}
        onCreated={(result) => {
          setCreationDraft(null);
          getRule();
          Toast.success(result.message);
          setaddModalFlag(false);
        }}
      />
      {creationKeywordSelection && (
        <KeywordSelectionModal
          show={true}
          onHide={() => setCreationKeywordSelection(null)}
          campaigns={creationKeywordSelection.campaignIds}
          selectedCampaigns={creationKeywordSelection.campaigns}
          profileId={profileSendID || currentProfileId}
          initialTargetingIds={creationKeywordSelection.draft.targetingIds}
          confirmEmptyCampaigns={false}
          onSave={createRuleWithSelectedKeywords}
        />
      )}
    </div >
  );
}

export default AddRule;
