import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useCallback, useContext, useEffect, useState, useRef, useMemo } from "react";
import { FiFilter } from "react-icons/fi";
import AgTable from "../../../common/grid/AgTable";
import Filter from "../../../helper/filter/Filter";
import {
  ApiCampaignChartListing,
  ApiCampainListing,
  ApiPlacementList,
  ApiSaveCampaignBidThreshold,
  ApiGetCampaignBidThreshold,
  ApiCalculateCampaignMaxBid
} from "../../../api-wrapper/campaign/ApiCampaign";
import { ApiGetAllPerformanceScoreSetting } from "../../../api-wrapper/campaign-setting/ApiDynamicPerformanceScore";
import { ApiUpdatePlacementBidApplyInAmazon } from "../../../api-wrapper/placement/ApiPlacement";
import ViewCampaign from "./ViewCampaign";
import moment from "moment-timezone";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { AdTypeScopeNote, AdTypeBadge } from "../../../helper/filter/AdTypeScopeNote";
import { isShowingAllAdTypes } from "../../../helper/filter/adTypeAll";
import { handleLoader, Link, Toast, useDispatch } from "../../../helper/links/Link";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import CustomFilter from "../../../helper/filter/CustomFilter";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import TypeShortName from "../../../helper/typeShortName/TypeShortName";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../../../components/ui/dialog";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { ApiListGetColumns, ApiListUpdateColumns } from "../../../api-wrapper/columns/ApiColumns";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import CustomizeColumns from "../../../helper/modal/CustomizeColumns";
import { Buffer } from "buffer";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import { exportGridToExcel } from "../../../utility/exportExcel";
import { useLocation, useNavigate } from "react-router-dom";
import AIAnalysisModal from "./AIAnalysisModel";
import CampaignNotificationSettingModal from "./Campagin/CampaignNotificationSettingModal";
import CampaginPlacementBidModal from "./Campagin/CampaginPlacementBidModal";
import Chart from "../../../helper/charts/Chart";
import Placement from "./Campagin/Placement";
import placementFieldCalculation from "./Campagin/placementFieldCalculation";
import HourlyTrackingModal from "./Campagin/HourlyTrackingModal";
import CreativeModal from "./Campagin/CreativeModal";
import { MoreVertical as MoreVertIcon, Settings as SettingsIcon, Eye as VisibilityIcon, Lightbulb as InsightsIcon, LineChart as ShowChartIcon, Image as ImageIcon, RefreshCw as RefreshIcon, BarChart2 as BarChartIcon, ChevronDown as ExpandMoreIcon, Bell as NotificationsIcon, Plus as AddIcon, X as CloseIcon, Activity as ActivityIcon, Target as TargetIcon, Info as InfoIcon } from "lucide-react";
import { ApiFilterListing, ApiSavePageFilter, ApiGetPageFilter } from "../../../api-wrapper/customer/ApiCustomer";
import CampaignDeleteModal from "./Campagin/CampaignDeleteModal";
import CampaignSaveFilter from "./Campagin/CampaignSaveFilter";
import CampaignFilterModal from "./Campagin/CampaignFilterModal";
import { addCampaignQuery } from "../../../utility/createQuery";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import AgCustomHeader from "../../../common/grid/AgCustomHeader";
import CampaignComparision from "./Campagin/CampaginComparision";
import { useDebouncedColumnSave } from "../../../utility/useDebouncedColumnSave";
import { FaCheckCircle, FaTimesCircle, FaMinusCircle } from "react-icons/fa";
import { MdOutlineClose } from "react-icons/md";
import AdsTrendsModal from "./Campagin/AdsTrendsModal";
import AppliedFilter from "../../component/filter/AppliedFilter";
import { StyledCheckbox } from "../../../common/grid/StyledCheckbox";
import { buildMongoQuery, formatCondition } from "../../../utility/common";
import usePageFilter from "../../../helper/filter/usePageFilter";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import { openCampaignViewInNewTab, CampaignNameCell } from "../../../utility/campaignNavigation";

const P = {
  primary: "#1A9FD4",
  primary50: "#E0F4FD",
  neutral100: "#F1F5F9",
  neutral200: "#E2E8F0",
  neutral400: "#94A3B8",
  neutral600: "#475569",
  neutral800: "#1E293B",
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#E74C3C",
};

// Condition options for filter modals
const CONDITION_OPTIONS = [
  { value: "$eq", labelKey: "equalTo" },
  { value: "$ne", labelKey: "notEqualTo" },
  { value: "$gt", labelKey: "greaterThan" },
  { value: "$gte", labelKey: "greaterThanOrEqualTo" },
  { value: "$lt", labelKey: "lessThan" },
  { value: "$lte", labelKey: "lessThanOrEqualTo" }
];

const STATUS_UI = {
  Healthy: {
    label: "Healthy",
    color: "success",
    icon: <FaCheckCircle />,
  },
  BudgetLeak: {
    label: "Budget Leak",
    color: "danger",
    icon: <FaTimesCircle />,
  },
  NeedsOptimization: {
    label: "Needs Optimization",
    color: "warning",
    icon: <FaMinusCircle />,
  },
};

const HealthScoreBadge = React.memo(({ healthScore }) => {
  if (healthScore) {
    const score = healthScore.replace(/\s+/g, "");
    const ui = STATUS_UI[score];
    if (!ui) return <>-</>;

    return (
      <span
        className={`badge bg-${ui.color} inline-flex items-center gap-1 px-2 py-1`}
        style={{ fontSize: "12px", borderRadius: "12px" }}
        title={ui.label}
      >
        {ui.icon}
        {ui.label}
      </span>
    );
  }
  return <>-</>;
});

export const getCampaignDeliveryStatus = (row) => {
  if (!row) return { key: "UNKNOWN", label: "-", tooltip: "" };
  const rawStatus = (row.status || "").toUpperCase();
  const dailySpend = row.dailySpend !== undefined && row.dailySpend !== null ? Number(row.dailySpend) : null;
  const budget = Number(row.latestBudget || row.budget) || 0;
  const timeInBudget = row.timeInBudget !== undefined && row.timeInBudget !== null ? Number(row.timeInBudget) : undefined;
  const estSpend = Number(row.budgetTracking?.estimatedSpend) || 0;
  const usagePct = Number(row.budgetTracking?.lastUsagePercentage) || 0;

  // 1. Check Out of Budget (Amazon Ads logic based on latest report date status / today's budget tracking & daily spend)
  const isOutOfBudget =
    rawStatus === "OUT_OF_BUDGET" ||
    (rawStatus === "ENABLED" && budget > 0 && (
      usagePct >= 100 ||
      estSpend >= budget ||
      (dailySpend !== null && dailySpend >= budget) ||
      (timeInBudget !== undefined && timeInBudget > 0 && timeInBudget < 100 && (
        (dailySpend !== null && dailySpend >= budget * 0.8) ||
        (estSpend >= budget * 0.8)
      ))
    ));

  if (isOutOfBudget) {
    return {
      key: "OUT_OF_BUDGET",
      label: "Out of budget",
      tooltip: "Campaign has exhausted its daily budget.",
      bgClass: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A] dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700/60",
      iconClass: "text-[#B45309] dark:text-amber-400",
    };
  }

  // 2. Check Paused
  if (rawStatus === "PAUSED") {
    return {
      key: "PAUSED",
      label: "Paused",
      tooltip: "Campaign is paused. Turn on to resume delivering ads.",
      bgClass: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      iconClass: "text-slate-500 dark:text-slate-400",
    };
  }

  // 3. Check Archived
  if (rawStatus === "ARCHIVED") {
    return {
      key: "ARCHIVED",
      label: "Archived",
      tooltip: "Campaign is archived.",
      bgClass: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
      iconClass: "text-gray-500 dark:text-gray-400",
    };
  }

  // 4. Check Ended
  if (row.endDate && moment(row.endDate).isValid() && moment(row.endDate).isBefore(moment(), "day")) {
    return {
      key: "ENDED",
      label: "Ended",
      tooltip: "Campaign end date has passed.",
      bgClass: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
      iconClass: "text-rose-500 dark:text-rose-400",
    };
  }

  // 5. Check Scheduled
  if (row.startDate && moment(row.startDate).isValid() && moment(row.startDate).isAfter(moment(), "day")) {
    const formattedDate = moment(row.startDate).format("YYYY-MM-DD");
    return {
      key: "SCHEDULED",
      label: "Scheduled",
      tooltipKey: "Campaign is scheduled to start on {{date}}.",
      tooltipParams: { date: formattedDate },
      tooltip: `Campaign is scheduled to start on ${formattedDate}.`,
      bgClass: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800",
      iconClass: "text-sky-600 dark:text-sky-400",
    };
  }

  // 6. Delivering
  if (rawStatus === "ENABLED" || rawStatus === "DELIVERING") {
    return {
      key: "DELIVERING",
      label: "Delivering",
      tooltip: "Campaign is delivering ads.",
      bgClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
      iconClass: "text-emerald-600 dark:text-emerald-400",
    };
  }

  return {
    key: rawStatus || "UNKNOWN",
    label: row.status || "-",
    tooltip: row.status || "",
    bgClass: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    iconClass: "text-slate-500",
  };
};

const CampaignStatusBadge = React.memo(({ row }) => {
  const { t } = useTranslation();
  if (!row || row?.isTotalRow) return null;
  const statusInfo = getCampaignDeliveryStatus(row);
  const tooltipText = statusInfo.tooltipKey
    ? t(statusInfo.tooltipKey, statusInfo.tooltipParams)
    : t(statusInfo.tooltip);

  return (
    <div className="flex items-center h-full">
      <AppTooltip text={tooltipText}>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border cursor-default select-none transition-colors ${statusInfo.bgClass}`}
        >
          <span>{t(statusInfo.label)}</span>
        </span>
      </AppTooltip>
    </div>
  );
});

const CampaignCheckboxHeader = React.memo(({ selectAll, onToggleAll }) => (
  <div className="flex items-center justify-center" style={{ width: "100%" }}>
    <StyledCheckbox
      checked={selectAll}
      onChange={onToggleAll}
    />
  </div>
));

const CampaignCheckboxCell = React.memo(({ isSelected, campaignId, onToggleRow }) => (
  <StyledCheckbox
    checked={isSelected}
    disabled={!campaignId}
    onChange={(e) => onToggleRow(campaignId, e.target.checked)}
  />
));

const PlacementDetailCellRenderer = React.memo((props) => {
  const { data, handleSubmit, visibleColumns, placementEdits } = props;
  return (
    <div className="placement-detail-row" style={{ padding: "8px 16px" }}>
      <Placement
        data={data?.placements}
        visibleColumns={visibleColumns}
        placementEdits={placementEdits}
        handleSubmit={handleSubmit}
      />
    </div>
  );
});

// Controlled Action Menu cell component to ensure popup closes when any option is selected
const CampaignActionCell = ({
  row,
  PermissionCheck,
  setCampaignDetails,
  getBidThreshold,
  setViewPress,
  handleOpenViewCampaign,
  setShowAIAnalysisModel,
  setShowHourlyTrackingModal,
  setHourlyTrackingCampaigns,
  setShowCreativeModal,
}) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!row || row.isTotalRow) return null;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 transition"
          >
            <MoreVertIcon className="h-4.5 w-4.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-2 z-[9999] shadow-lg rounded-xl bg-white dark:bg-[#1e293b] border border-slate-100 dark:border-slate-800">
          <div className="flex flex-col space-y-1">
            {PermissionCheck(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE) && (
              <div
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium cursor-pointer rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 transition-colors"
                onClick={() => {
                  setOpen(false);
                  setCampaignDetails(row);
                  getBidThreshold(row);
                }}
              >
                <SettingsIcon fontSize="small" className="text-slate-400 dark:text-slate-400" />
                <span>{t('Bid Threshold')}</span>
              </div>
            )}

            {PermissionCheck(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY) && (
              <div
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium cursor-pointer rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 transition-colors"
                onClick={() => {
                  setOpen(false);
                  if (handleOpenViewCampaign) {
                    handleOpenViewCampaign(row);
                  } else {
                    setViewPress(true);
                    setCampaignDetails(row);
                  }
                }}
              >
                <VisibilityIcon fontSize="small" className="text-slate-400 dark:text-slate-400" />
                <span>{t('View Campaign')}</span>
              </div>
            )}

            {PermissionCheck(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE) && (
              <div
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium cursor-pointer rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 transition-colors"
                onClick={() => {
                  setOpen(false);
                  setShowAIAnalysisModel(true);
                  setCampaignDetails(row);
                }}
              >
                <InsightsIcon fontSize="small" className="text-slate-400 dark:text-slate-400" />
                <span>{t('AI Analysis')}</span>
              </div>
            )}

            <div
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium cursor-pointer rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 transition-colors"
              onClick={() => {
                setOpen(false);
                setShowHourlyTrackingModal(true);
                setHourlyTrackingCampaigns([row.campaignId]);
              }}
            >
              <ShowChartIcon fontSize="small" className="text-slate-400 dark:text-slate-400" />
              <span>{t('Hourly Tracking')}</span>
            </div>

            {row?.type?.toLowerCase()?.includes('display') && PermissionCheck(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE) && (
              <div
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium cursor-pointer rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 transition-colors"
                onClick={() => {
                  setOpen(false);
                  setCampaignDetails(row);
                  setShowCreativeModal(true);
                }}
              >
                <ImageIcon fontSize="small" className="text-slate-400 dark:text-slate-400" />
                <span>{t('Creative')}</span>
              </div>
            )}

            {PermissionCheck(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.VIEW_ONLY) && (
              <div
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium cursor-pointer rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 transition-colors"
                onClick={() => {
                  setOpen(false);
                  navigate(`/targeting/${Buffer.from(String(row?.campaignId)).toString("base64")}`);
                }}
              >
                <TargetIcon fontSize="small" className="text-slate-400 dark:text-slate-400" />
                <span>{t('Targeting')}</span>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// Portal-based tooltip using Shadcn

function Campaign() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isLaptopL, setIsLaptopL] = useState(window.innerWidth <= 1440);
  const [disablePinning, setDisablePinning] = useState(window.innerWidth < 1100);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsLaptopL(window.innerWidth <= 1440);
      setDisablePinning(window.innerWidth < 1100);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { t } = useTranslation();
  let { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);
  // Combined SP+SB+SD view active on the /campaigns screen?
  const showAllTypes = isShowingAllAdTypes(
    typeof window !== "undefined" ? window.location.pathname : "",
    selectedAdType
  );

  const dispatch = useDispatch();
  const location = useLocation();
  const navigate = useNavigate();

  const gridRef = useRef(null);
  const lastFetchParamsRef = useRef("");
  const placementPromiseRef = useRef(null);
  const lastPlacementProfileRef = useRef(null);
  const lastFilterProfileRef = useRef(null);
  const filterPromiseRef = useRef(null);

  const [addName, setAddName] = useState("Add Campaign");
  const [tableData, setTableData] = useState([]);
  const [campaignData, setCampaignData] = useState();
  const [viewPress, setViewPress] = useState(false);
  const [perPage, setPerPage] = useState(firstPageRows);
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [editData, setEditData] = useState();
  const [campaignDetails, setCampaignDetails] = useState([]);
  const [date, setDate] = useState([]);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("ENABLED");
  const [searchName, setSearchName] = useState("");
  const [loading, setLoading] = useState(false);
  const [debouncedSearchName, setDebouncedSearchName] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  const [showCampaignSetting, setShowCampaignSetting] = useState(false);
  const [lowACOS, setLowACOS] = useState(10);
  const [highACOS, setHighACOS] = useState(90);
  const [hourlyTrackingCampaigns, setHourlyTrackingCampaigns] = useState([]);
  const [showHourlyTrackingModal, setShowHourlyTrackingModal] = useState(false);
  const [comparePrevious, setComparePrevious] = useState(false);
  const [profitFilter, setProfitFilter] = useState("");
  const [performanceScores, setPerformanceScores] = useState([]);
  const [showAdsTrendsModal, setShowAdsTrendsModal] = useState(false);
  const [showCreativeModal, setShowCreativeModal] = useState(false);

  // custom filter
  const defaultValue = {
    firstCondition: "",
    firstValue: 0,
    operator: "",
    secondCondition: "",
    secondValue: 0,
    sortType: "",
  };
  const [conditionObj, setConditionObj] = useState(defaultValue);
  const [showAIAnalysisModel, setShowAIAnalysisModel] = useState(false);
  const [showCampaignTypeModal, setShowCampaignTypeModal] = useState(false);
  const [customFilterFlag, setCustomFilterFlag] = useState(false);
  const [fieldName, setfieldName] = useState("sales");
  const [placementEdits, setPlacementEdits] = useState({});
  const [placementData, setPlacementData] = useState(null);
  const [bestArr, setBestArr] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [totalRow, setTotalRow] = useState({});
  const [chartData, setChartData] = useState([]);
  const [defaultColumns] = useState(["Action", "Campaign Name"]);

  const [columnsLoaded, setColumnsLoaded] = useState(false);

  const fetchPerformanceScores = async () => {
    try {
      const res = await ApiGetAllPerformanceScoreSetting({ profileId: profileId?.value, pageNo: 1, perPage: 100 });
      if (res?.isSuccess) {
        setPerformanceScores(res.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (profileId?.value) {
      fetchPerformanceScores();
    }
  }, [profileId?.value]);

  const [chartLoading, setChartLoading] = useState(false);

  // Row selection state
  const [selectedRows, setSelectedRows] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);

  const [showBidThresholdModel, setShowBidThresholdModel] = useState(false);
  const [maxBid, setMaxbid] = useState(50);
  const [minBid, setMinbid] = useState(0);
  const [targetACOS, setTargetACOS] = useState(30);

  const handleOpenViewCampaign = (row) => {
    if (!row || row.isTotalRow) return;
    setCampaignDetails(row);
    setViewPress(true);
    const params = new URLSearchParams(location.search);
    if (row.campaignId) params.set("campaignId", row.campaignId);
    navigate(`/campaigns?${params.toString()}`, { replace: false });
  };

  const handleCloseViewCampaign = () => {
    setViewPress(false);
    const params = new URLSearchParams(location.search);
    params.delete("view");
    params.delete("viewCampaign");
    params.delete("campaignId");
    params.delete("campaignName");
    params.delete("name");
    params.delete("type");
    params.delete("status");
    params.delete("budget");
    params.delete("budgetType");
    params.delete("startDate");
    params.delete("endDate");
    const remaining = params.toString();
    navigate(remaining ? `/campaigns?${remaining}` : "/campaigns", { replace: false });
  };

  // Removed menuAnchor and menuRow states

  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [showDeleteFilterModal, setShowDeleteFilterModal] = useState(false);
  const [filterToDelete, setFilterToDelete] = useState(null);
  const [appliedFilters, setAppliedFilters] = useState([]);
  const [filter, setFilter] = useState([]);
  const [gridFilter, setGridFilter] = useState("");
  const [filterOptions, setFilterOptions] = useState([]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedFilterOption, setSelectedFilterOption] = useState(null);
  const [selectedCondition, setSelectedCondition] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [openFilterField, setOpenFilterField] = useState(null);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);

  const sharedFilterParams = useMemo(() => ({
    conditionObj,
    setConditionObj,
    setfieldName,
    setCustomFilterFlag,
    defaultValue,
    openFilterField,
    setOpenFilterField,
  }), [conditionObj, openFilterField]);

  const { isFilterReady } = usePageFilter({
    pageName: "Campaign",
    profileId: profileId?.value,
    selectedAdType,
    appliedFilters,
    setAppliedFilters,
    onFilterLoad: (savedFilters) => {
      const campaignStatusFilter = savedFilters.find(filter => filter.type === "Status");
      if (campaignStatusFilter) setStatus(campaignStatusFilter.value);

      const typeFilter = savedFilters.find(filter => filter.type === "Type");
      if (typeFilter) setType(typeFilter.value);
    }
  });

  useEffect(() => {
    if (conditionObj && conditionObj?.firstCondition) {
      const displayText = `${`${fieldName}`?.toUpperCase()}: ${formatCondition(conditionObj)}`;
      const alreadyExists = appliedFilters.some((filter) => filter?.field === fieldName && filter?.isCustom && filter?.displayText === displayText);
      if (alreadyExists) return;

      const newFilters = appliedFilters?.filter((filter) => filter?.field !== fieldName);

      const typeFilter = {
        id: new Date().getTime(),
        type: `${fieldName}`?.toUpperCase(),
        label: `${fieldName}`?.toUpperCase(),
        displayText,
        isCustom: true,
        field: fieldName,
        conditionObj,
        query: buildMongoQuery(fieldName, conditionObj)
      };

      setAppliedFilters([...newFilters, typeFilter]);
    }
  }, [customFilterFlag])

  const handleEditCustomFilter = useCallback(({ field, conditionObj: existingConditionObj }) => {
    setConditionObj(existingConditionObj);
    setfieldName(field);
    setOpenFilterField(field);
  }, []);

  // Removed openMenu and closeMenu functions

  // Handle select all state when selectedRows changes
  useEffect(() => {
    if (tableData.length > 0) {
      const allRowIds = tableData.filter((r) => !r.isTotalRow).map(row => row?.campaignId);
      setSelectAll(selectedRows.length === allRowIds.length && selectedRows.length > 0);
    }
  }, [selectedRows, tableData]);

  const checkOrderColumns = useCallback((title) => {
    const matchedIndex = visibleColumns?.findIndex((col) => col?.title === title);
    const matched = matchedIndex !== undefined && matchedIndex !== -1 ? visibleColumns?.[matchedIndex] : undefined;
    return {
      width: matched?.width ?? 200,
      hide: Boolean(visibleColumns?.length && !matched),
      order: (matched?.order !== undefined && matched?.order !== 9999) ? matched.order : (matched ? matchedIndex + 1 : 9999),
    };
  }, [visibleColumns]);

  const handleToggleAll = useCallback((e) => {
    if (e.target.checked) {
      setSelectedRows(tableData.filter((r) => !r.isTotalRow).map((r) => r?.campaignId));
      setSelectAll(true);
    } else {
      setSelectedRows([]);
      setSelectAll(false);
    }
  }, [tableData]);

  const handleToggleRow = useCallback((campaignId, checked) => {
    if (!campaignId) return;
    if (checked) {
      setSelectedRows((prev) => [...prev, campaignId]);
      setHourlyTrackingCampaigns((prev) => [...prev, campaignId]);
    } else {
      setSelectedRows((prev) => prev.filter((id) => id !== campaignId));
      setHourlyTrackingCampaigns((prev) => prev.filter((id) => id !== campaignId));
      setSelectAll(false);
    }
  }, []);

  // ── Column definitions ────────────────────────────────────────────────────
  const columns = useMemo(() => [
    // ── Expand Column (No Header Name) ─────────────────────────
    {
      headerName: "",
      field: "expand",
      colId: "expand",
      _isInternal: true,
      order: -100,
      hide: false,
      maxWidth: 50,
      pinned: disablePinning ? null : "left",
      lockPinned: !disablePinning,
      suppressMovable: true,
      sortable: false,
      resizable: false,
      cellRenderer: "agGroupCellRenderer",
      cellRendererParams: {
        suppressCount: true,
        innerRenderer: (params) => {
          if (params?.data?.isTotalRow) return null;
          return null;
        },
      }
    },

    // ── Checkbox ──────────────────────────────────────────────────────────
    {
      headerName: "",
      field: "campaignId",
      colId: "campaignId",
      _isInternal: true,
      order: -99,
      hide: false,
      maxWidth: 50,
      pinned: disablePinning ? null : "left",
      lockPinned: !disablePinning,
      suppressMovable: true,
      sortable: false,
      resizable: false,
      headerComponent: () => (
        <CampaignCheckboxHeader
          selectAll={selectAll}
          onToggleAll={handleToggleAll}
        />
      ),
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row || row?.isTotalRow) return null;
        return (
          <CampaignCheckboxCell
            isSelected={selectedRows.includes(row?.campaignId)}
            campaignId={row?.campaignId}
            onToggleRow={handleToggleRow}
          />
        );
      },
    },

    // ── Action Column ─────────────────────────────────────
    {
      headerName: t("Action"),
      field: "action",
      title: "Action",
      ...(checkOrderColumns("Action")),
      maxWidth: 70,
      pinned: disablePinning ? null : "left",
      lockPinned: !disablePinning,
      sortable: false,
      resizable: false,
      suppressMovable: true,
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      cellRenderer: (params) => (
        <CampaignActionCell
          row={params.data}
          PermissionCheck={PermissionCheck}
          setCampaignDetails={setCampaignDetails}
          getBidThreshold={getBidThreshold}
          setViewPress={setViewPress}
          handleOpenViewCampaign={handleOpenViewCampaign}
          setShowAIAnalysisModel={setShowAIAnalysisModel}
          setShowHourlyTrackingModal={setShowHourlyTrackingModal}
          setHourlyTrackingCampaigns={setHourlyTrackingCampaigns}
          setShowCreativeModal={setShowCreativeModal}
        />
      ),
    },

    // ── Campaign Name ─────────────────────────────────────────────────────
    {
      headerName: t("Campaign Name"),
      field: "name",
      title: "Campaign Name",
      ...(checkOrderColumns("Campaign Name")),
      pinned: disablePinning ? null : "left",
      lockPinned: !disablePinning,
      suppressMovable: true,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        if (row?.isTotalRow) return <span>{row.name}</span>;
        return (
          <CampaignNameCell
            row={row}
            name={row.name}
            showStatusDot={true}
            onClick={() => handleOpenViewCampaign(row)}
          />
        );
      },
    },

    // ── Ad Type (only under the combined "All" view) ─────────────────────
    ...(showAllTypes ? [{
      headerName: t("Type"),
      field: "adType",
      title: "Type",
      maxWidth: 90,
      sortable: true,
      resizable: true,
      suppressMovable: true,
      exportFormatter: (val) => String(val || "").toUpperCase(),
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row || row?.isTotalRow) return null;
        return <AdTypeBadge type={params.value} />;
      },
    }] : []),

    // ── Status Column ─────────────────────────────────────────────────────
    {
      headerName: t("Status"),
      field: "status",
      title: "Status",
      minWidth: 160,
      width: 175,
      exportFormatter: (val, row) => t(getCampaignDeliveryStatus(row).label),
      ...(checkOrderColumns("Status")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <CampaignStatusBadge row={params.data} />,
      headerComponent: AgCustomHeader,
      headerComponentParams: {
        ...sharedFilterParams,
        field: "status",
        hasFilter: false,
      },
    },
    // ── Health Score ──────────────────────────────────────────────────────
    {
      headerName: t("Health Score"),
      field: "healthScore",
      title: "Health Score",
      ...(checkOrderColumns("Health Score")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <HealthScoreBadge healthScore={params.value} />,
    },
    // ── Bid Adjustment ────────────────────────────────────────────────────
    {
      headerName: t("bid Adjustment"),
      field: "placementModifier",
      title: "Bid Adjustment",
      exportFormatter: (val, row) => row?.keywordBid !== null && row?.keywordBid !== undefined ? `${parseFloat(row.keywordBid).toFixed(2)}%` : "N/A",
      ...(checkOrderColumns("Bid Adjustment")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return <>{row?.keywordBid ? `${CurrencyCode(row?.keywordBid)}` : "N/A"}</>;
      },
    },
    // ── Target ACOS ───────────────────────────────────────────────────────
    {
      headerName: t("Target Acos"),
      field: "targetACOS",
      title: "Target ACOS",
      ...(checkOrderColumns("Target ACOS")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{params.value ? `${params.value}%` : "N/A"}</>,
    },
    // ── Delta ACOS ────────────────────────────────────────────────────────
    {
      headerName: t("Delta ACOS"),
      field: "deltaACOS",
      title: "Delta ACOS",
      ...(checkOrderColumns("Delta ACOS")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const delta = params.value;
        const row = params.data;
        if (delta === null || delta === undefined || row?.acos === 0)
          return <span className="text-gray-500">N/A</span>;
        let className = "text-secondary font-semibold";
        if (delta > 0) className = "text-danger font-semibold";
        else if (delta < 0) className = "text-success font-semibold";
        return <span className={className}>{delta > 0 ? `+${delta}` : delta}</span>;
      },
    },

    // ── Target CPC ───────────────────────────────────────────────────────
    {
      headerName: t("target CPC"),
      field: "targetCPC",
      title: "Target CPC",
      ...(checkOrderColumns("Target CPC")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{params.value ?? "N/A"}</>,
    },

    // ── New Bid Adjustment ────────────────────────────────────────────────
    {
      headerName: t("new bid Adjustment"),
      field: "newbidAdjustment",
      title: "New Bid Adjustment",
      ...(checkOrderColumns("New Bid Adjustment")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => (
        <>
          {params.value !== null && params.value !== undefined
            ? parseFloat(params.value).toFixed(2)
            : "N/A"}
        </>
      ),
    },
    // ── Type ──────────────────────────────────────────────────────────────
    {
      headerName: t("type"),
      field: "type",
      title: "Type",
      ...(checkOrderColumns("Type")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{TypeShortName(params.value ?? "N/A")}</>,
    },
    // ── Budget ────────────────────────────────────────────────────
    {
      headerName: t("Budget"),
      field: "budget",
      title: "Budget",
      exportFormatter: (val) => val !== "" && val != null ? Number(val).toFixed(2) : "0.00",
      ...(checkOrderColumns("Budget")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{CurrencyCode(params.value)}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "budget", hasFilter: true },
    },
    // ── Time in Budget ────────────────────────────────────────────────────
    {
      headerName: t("Time in Budget"),
      field: "timeInBudget",
      title: "Time in Budget",
      ...(checkOrderColumns("Time in Budget")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const val = params.value;
        return (
          <div className="flex items-center gap-2">
            {(val || 0) > 0 && (
              <div className="progress" style={{ height: "12px", backgroundColor: "#e9ecef", width: "60px" }}>
                <div
                  className="progress-bar"
                  role="progressbar"
                  style={{ width: `${val || 0}%`, backgroundColor: "#28a745", fontSize: "10px", lineHeight: "12px" }}
                />
              </div>
            )}
            {val && val > 0 ? `${val}%` : "N/A"}
          </div>
        );
      },
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "timeInBudget", hasFilter: true },
    },
    // ── Spend ─────────────────────────────────────────────────────────────
    {
      headerName: t("spend"),
      field: "spend",
      title: "Spend",
      exportFormatter: (val) => val !== "" && val != null ? Number(val).toFixed(2) : "0.00",
      ...(checkOrderColumns("Spend")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{CurrencyCode(params.value)}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "spend", hasFilter: true },
    },
    // ── Sales ─────────────────────────────────────────────────────────────
    {
      headerName: t("sales"),
      field: "sales",
      title: "Sales",
      exportFormatter: (val) => val !== "" && val != null ? Number(val).toFixed(2) : "0.00",
      ...(checkOrderColumns("Sales")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{CurrencyCode(params.value)}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "sales", hasFilter: true },
    },
    // ── ACOS ──────────────────────────────────────────────────────────────
    {
      headerName: t("acos"),
      field: "acos",
      title: "ACOS",
      exportFormatter: (val) => val !== "" && val != null && val !== -30 && val !== "-30" ? `${val}%` : "N/A",
      ...(checkOrderColumns("ACOS")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{params.value !== null && params.value !== undefined && params.value !== -30 && params.value !== "-30" ? `${params.value}%` : "N/A"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "acos", hasFilter: true },
    },
    // ── ROAS ──────────────────────────────────────────────────────────────
    {
      headerName: t("roas"),
      field: "roas",
      title: "ROAS",
      exportFormatter: (val) => val !== "" && val != null && val !== 9999 ? val : "-",
      ...(checkOrderColumns("ROAS")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{params.value === 9999 ? "-" : `${params.value}`}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "roas", hasFilter: true },
    },
    // ── Orders ────────────────────────────────────────────────────────────
    {
      headerName: t("Orders"),
      field: "orders",
      title: "Orders",
      ...(checkOrderColumns("Orders")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{CurrencyFormat(params.value ?? 0)}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "orders", hasFilter: true },
    },
    // ── Impressions ───────────────────────────────────────────────────────
    {
      headerName: t("impressions"),
      field: "impressions",
      title: "Impressions",
      ...(checkOrderColumns("Impressions")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{CurrencyFormat(params.value ?? 0)}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "impressions", hasFilter: true },
    },
    // ── CPC ───────────────────────────────────────────────────────────────
    {
      headerName: t("cpc"),
      field: "cpc",
      title: "CPC",
      exportFormatter: (val) => val !== "" && val != null ? Number(val).toFixed(2) : "0.00",
      ...(checkOrderColumns("CPC")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{CurrencyCode(params.value)}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "cpc", hasFilter: true },
    },
    // ── Clicks ────────────────────────────────────────────────────────────
    {
      headerName: t("clicks"),
      field: "clicks",
      title: "Clicks",
      ...(checkOrderColumns("Clicks")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{CurrencyFormat(params.value)}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "clicks", hasFilter: true },
    },
    // ── Conversion ────────────────────────────────────────────────────────
    {
      headerName: t("conversion"),
      field: "conversion",
      title: "Conversion",
      exportFormatter: (val) => val ? `${val}%` : "N/A",
      ...(checkOrderColumns("Conversion")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) =>
        <>{params.value ? `${params.value}%` : "N/A"}</>,
    },
    // ── CVR ───────────────────────────────────────────────────────────────
    {
      headerName: t("cvr"),
      field: "cvr",
      title: "CVR",
      exportFormatter: (val) => val ? `${val}%` : "N/A",
      ...(checkOrderColumns("CVR")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{params.value ? `${params.value}%` : "N/A"}</>,
    },
    // ── CTR ───────────────────────────────────────────────────────────────
    {
      headerName: t("ctr"),
      field: "ctr",
      title: "CTR",
      exportFormatter: (val) => val ? `${val}%` : "N/A",
      ...(checkOrderColumns("CTR")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{params.value ? `${params.value}%` : "N/A"}</>,
    },
    // ── Bid Strategy ──────────────────────────────────────────────────────
    {
      headerName: t("bidStartegy"),
      field: "bidStrategy",
      title: "Bid Startegy",
      ...(checkOrderColumns("Bid Startegy")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{params.value ?? "N/A"}</>,
    },
    // ── Start Date ────────────────────────────────────────────────────────
    {
      headerName: t("startDate"),
      field: "startDate",
      title: "Start Date",
      ...(checkOrderColumns("Start Date")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => (
        <>{params.value ? moment(params.value).format("YYYY-MM-DD") : "N/A"}</>
      ),
    },
    // ── End Date ──────────────────────────────────────────────────────────
    {
      headerName: t("endDate"),
      field: "endDate",
      title: "End Date",
      ...(checkOrderColumns("End Date")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => (
        <>{params.value ? moment(params.value).format("YYYY-MM-DD") : "N/A"}</>
      ),
    },
    // ── Budget Type ───────────────────────────────────────────────────────
    {
      headerName: t("budgetType"),
      field: "budgetType",
      title: "Budget Type",
      ...(checkOrderColumns("Budget Type")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{params.value ?? "N/A"}</>,
    },
  ], [isMobile, disablePinning, selectAll, selectedRows, handleToggleAll, handleToggleRow, t, visibleColumns, sharedFilterParams, checkOrderColumns, showAllTypes]);

  // ── Detail cell renderer params (placement expansion) ────────────────────
  const detailCellRenderer = useCallback((params) => <PlacementDetailCellRenderer {...params} handleSubmit={async () => await ApiListing(arg)} />, [arg]);
  const detailCellRendererParams = { detailGridOptions: {} };

  useEffect(() => {
    const fetchCustomColumns = async () => {
      const body = { pageName: "Campaign" };
      const response = await ApiListGetColumns(body);

      if (response?.isSuccess && response?.data && response?.data?.columns?.length) {
        const visible = (columns ?? [])
          .map((c, idx) => {
            if (c?._isInternal || !c?.title) {
              return { ...c, order: c?.order ?? (idx - 100), isDisplay: true, hide: false };
            }
            const saved = response?.data?.columns.find(col => col.title === c.title);
            if (saved) return { ...c, ...saved };
            if (c.title === "Status") {
              return { ...c, isDisplay: true };
            }
            return c;
          })
          .filter(c => c?._isInternal || c?.isDisplay || !c?.title || defaultColumns.includes(c?.title))
          .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
          .filter(Boolean);

        setVisibleColumns(visible);
      } else {
        setVisibleColumns(columns);
      }
    };

    if (profileId?.value && selectedAdType) fetchCustomColumns();
  }, [profileId?.value, selectedAdType, defaultColumns]);

  const handleSaveColumns = async (selectedColumns) => {
    const visible = (columns ?? [])
      .map((c, idx) => {
        if (c?._isInternal || !c?.title) {
          return { ...c, order: c?.order ?? (idx - 100), isDisplay: true, hide: false };
        }
        return { ...c, ...selectedColumns.find(col => col.title === c.title) };
      })
      .filter(c => c?._isInternal || c?.isDisplay || !c?.title || defaultColumns.includes(c?.title))
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .filter(Boolean);

    setVisibleColumns(visible);
    setShowCustomizeModal(false);

    const body = {
      pageName: "Campaign",
      columns: selectedColumns,
    };
    const response = await ApiListUpdateColumns(body);
    if (response?.isSuccess && response?.data?.columns) {
      const updated = (columns ?? [])
        .map((c, idx) => {
          if (c?._isInternal || !c?.title) {
            return { ...c, order: c?.order ?? (idx - 100), isDisplay: true, hide: false };
          }
          return { ...c, ...response?.data?.columns.find(col => col.title === c.title) };
        })
        .filter(c => c?._isInternal || c?.isDisplay || !c?.title || defaultColumns.includes(c?.title))
        .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
        .filter(Boolean);
      setVisibleColumns(updated);
    }
  };

  const debouncedSaveColumns = useDebouncedColumnSave(handleSaveColumns);

  const handleDragAndDrop = async (col) => {
    const selectedColumns = [
      ...defaultColumns.map((title) => ({ title, isDisplay: true, isDefault: true, order: visibleColumns?.find((c) => c?.title === title)?.order })),
      ...(visibleColumns?.filter((col) => col?.title && !defaultColumns.includes(col.title)) ?? []),
    ].sort((a, b) => a?.order - b?.order);

    const finalCols = col?.filter(col => col?.title).map((col, index) => {
      const found = selectedColumns.find((s) => s.title === col.title);
      return {
        title: col.title,
        isDisplay: !!found,
        order: found ? index + 1 : null,
        isDefault: defaultColumns.includes(col.title),
      };
    });

    debouncedSaveColumns(finalCols);
  }

  const getBidThreshold = async (rows) => {
    const body = {
      profileId: profileId?.value,
      campaignId: Number(rows.campaignId)
    };
    const response = await ApiGetCampaignBidThreshold(body);
    if (response.isSuccess) {
      setMaxbid(response.data?.maxBid || maxBid);
      setMinbid(response.data?.minBid || minBid);
      setTargetACOS(response.data?.targetACOS || targetACOS);
    }
    setShowBidThresholdModel(true);
  }

  const submitBidThashold = async () => {
    const body = {
      profileId: profileId?.value,
      campaignId: Number(campaignDetails.campaignId),
      maxBid: Number(maxBid),
      minBid: Number(minBid),
      targetACOS: Number(targetACOS)
    };
    const response = await ApiSaveCampaignBidThreshold(body);

    if (response?.isSuccess) {
      resetCampaignBidThreshold();
      Toast.success(response.message);
      await ApiListing(arg);
    }
    else {
      Toast.error(t("Something went wrong"))
    }
  };

  const resetCampaignBidThreshold = () => {
    setShowBidThresholdModel(false);
    setMaxbid(20);
    setMinbid(0)
    setTargetACOS(30);
  }

  useEffect(() => {
    if (!targetACOS || !profileId?.value || !campaignDetails?.campaignId) return;

    const calculateMaxBid = async () => {
      const body = {
        profileId: profileId?.value,
        campaignId: Number(campaignDetails.campaignId),
        targetACOS: Number(targetACOS),
      };

      const response = await ApiCalculateCampaignMaxBid(body);
      if (response?.isSuccess && response?.maxBid) setMaxbid(response?.maxBid);
    };

    const debounce = setTimeout(calculateMaxBid, 500);
    return () => clearTimeout(debounce);
  }, [targetACOS]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const paramCampaignId = searchParams.get("campaignId") || location.state?.campaignId;
    const paramCampaignName = searchParams.get("campaignName") || searchParams.get("name") || location.state?.campaignName || location.state?.name;
    const isView = Boolean(paramCampaignId) || Boolean(paramCampaignName) || searchParams.get("view") === "true" || searchParams.get("viewCampaign") === "true" || location.state?.viewCampaign;

    if (isView && (paramCampaignId || paramCampaignName)) {
      setCampaignDetails({
        campaignId: paramCampaignId ? (Number(paramCampaignId) || paramCampaignId) : undefined,
        name: paramCampaignName || "",
        type: searchParams.get("type") || location.state?.type || "SP",
        status: searchParams.get("status") || location.state?.status || "ENABLED",
        budget: searchParams.get("budget") ? Number(searchParams.get("budget")) : (location.state?.budget ?? 0),
        budgetType: searchParams.get("budgetType") || location.state?.budgetType || "",
        startDate: searchParams.get("startDate") || location.state?.startDate,
        endDate: searchParams.get("endDate") || location.state?.endDate,
        targetingType: searchParams.get("targetingType") || location.state?.targetingType,
      });
      setViewPress(true);
      if (searchParams.get("fromDate") && searchParams.get("toDate")) {
        setDate([new Date(searchParams.get("fromDate")), new Date(searchParams.get("toDate"))]);
      } else if (location.state?.fromDate && location.state?.toDate) {
        setDate([new Date(location.state.fromDate), new Date(location.state.toDate)]);
      }
      return;
    } else {
      setViewPress(false);
    }

    if (location.state?.searchName || searchParams.get("searchName")) {
      const sName = location.state?.searchName || searchParams.get("searchName");
      setSearchName(sName);
      if (location.state?.fromDate && location.state?.toDate) {
        setDate([new Date(location.state.fromDate), new Date(location.state.toDate)]);
      }
      // Replace history state to prevent persisting on manual refresh
      window.history.replaceState({}, document.title);
      return;
    }

    const savedData = JSON.parse(localStorage.getItem("campaigns")) ?? {};

    if (savedData?.type || savedData?.status) {
      setType(savedData?.type || "");
      setStatus(savedData?.status || "ENABLED");
    };
  }, [location.state, location.search]);

  const handleDateChange = (e) => {
    if (!e || !Array.isArray(e) || e.length < 2) {
      setDate(e);
      return;
    }
    const newD0 = moment(e[0]).format("YYYY-MM-DD");
    const newD1 = moment(e[1]).format("YYYY-MM-DD");
    const curD0 = date?.[0] ? moment(date[0]).format("YYYY-MM-DD") : "";
    const curD1 = date?.[1] ? moment(date[1]).format("YYYY-MM-DD") : "";

    if (newD0 === curD0 && newD1 === curD1) return;

    setDate(e);
    const arr = [newD0, newD1];
    setSelectedDate(arr);
    try {
      let storeData = JSON.parse(localStorage.getItem('profile')) || {};
      storeData.date = arr;
      localStorage.setItem('profile', JSON.stringify(storeData));
    } catch (err) { }
    try {
      let campaignsData = JSON.parse(localStorage.getItem('campaigns')) || {};
      campaignsData.date = arr;
      localStorage.setItem('campaigns', JSON.stringify(campaignsData));
    } catch (err) { }
  };

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      const newD1 = moment(selectedDate[0]).toDate();
      const newD2 = moment(selectedDate[1]).toDate();
      setDate((prevDate) => {
        if (
          prevDate &&
          prevDate.length >= 2 &&
          moment(prevDate[0]).format("YYYY-MM-DD") === moment(newD1).format("YYYY-MM-DD") &&
          moment(prevDate[1]).format("YYYY-MM-DD") === moment(newD2).format("YYYY-MM-DD")
        ) {
          return prevDate;
        }
        return [newD1, newD2];
      });
    } else {
      const savedData = JSON.parse(localStorage.getItem("campaigns")) ?? {};
      if (savedData?.date && savedData?.date?.length) {
        setDate(savedData?.date?.map((d) => new Date(d)));
      } else {
        const firstDate = new Date(moment()?.startOf("month"));
        const lastDate = new Date();
        setDate([firstDate, lastDate]);
      }
    }
  }, [selectedDate]);

  const handleModalClose = () => {
    setShowFilterModal(false);
    setSelectedFilterOption(null);
    setSelectedCondition("$eq");
    setFilterValue("0.00");
    setStatus("");
    setType("");
  };

  const refreshGrid = () => {
    localStorage.removeItem("AffectedCampaigns");
    ApiListing({ ...arg, isReload: true, skipLoader: true });
  };

  const exportExcel = async () => {
    if (profileId.value && selectedAdType && date?.length != 0) {
      dispatch(handleLoader(true));
      try {
        const campaigns = JSON.parse(localStorage.getItem("AffectedCampaigns") || "[]");

        const campaignStatusFilter = appliedFilters.find(filter => filter.type === "Status");
        const campaignStatus = campaignStatusFilter ? campaignStatusFilter.value : "";
        const isOutOfBudget = appliedFilters?.some(filter => filter?.type === "OutOfBudget" || filter?.value === "OUT_OF_BUDGET");
        const effectiveStatus = isOutOfBudget ? "OUT_OF_BUDGET" : campaignStatus;

        const typeFilter = appliedFilters.find(filter => filter.type === "Type");
        const type = typeFilter ? typeFilter.value : "";

        const filterData = { appliedFilters, campaignStatus: effectiveStatus, type };
        const customFilter = addCampaignQuery(filterData);

        const data = {
          searchName: searchName,
          profileId: profileId.value,
          fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
          toDate: moment(date?.[1]).format("YYYY-MM-DD"),
          fieldName: fieldName,
          status: effectiveStatus,
          sortType: conditionObj?.sortType || "DESC",
          filteredCampaignIds: campaigns.map(cp => cp.campaignId),
          profitFilter,
          ...(customFilter && { customFilter }),
          pageNo: 1,
          perPage: 100000
        };

        const response = await ApiCampainListing(data);

        if (response?.isSuccess) {
          const processedData = placementFieldCalculation({ data: response?.getCampaign, placementData, bestArr });

          const getTotalsRow = () => {
            const totalRow = response?.totalRow ?? {};
            return {
              name: `Total: ${response?.totalRecords || 0}`,
              budget: totalRow?.budget,
              timeInBudget: totalRow?.timeInBudget,
              spend: totalRow?.spend,
              sales: totalRow?.sales,
              acos: totalRow?.acos,
              roas: totalRow?.roas,
              orders: totalRow?.orders,
              impressions: totalRow?.impressions,
              cpc: totalRow?.cpc,
              clicks: totalRow?.clicks,
              isTotalRow: true,
            };
          };

          const totalRowObj = (processedData.length > 0 && response?.totalRow) ? getTotalsRow() : null;
          exportGridToExcel(processedData, columns, "campaign_export.xlsx", totalRowObj);
        } else {
          Toast.error(response?.message || "Failed to fetch data for export");
        }
      } catch (e) {
        console.error(e);
        Toast.error(t("Something went wrong during export"));
      } finally {
        dispatch(handleLoader(false));
      }
    }
  };

  const ApiListing = async (arg) => {
    if (profileId?.value && selectedAdType && date?.length != 0) {
      const isReload = !!arg?.skipLoader || !!arg?.isReload;

      const fromDateStr = moment(date?.[0]).format("YYYY-MM-DD");
      const toDateStr = moment(date?.[1]).format("YYYY-MM-DD");
      const searchNameVal = arg?.hasOwnProperty("searchName") ? arg.searchName : debouncedSearchName;
      const pageNoVal = arg?.pageNo ?? (arg?.pageNo || 1);
      const perPageVal = arg?.perPage ?? perPage;

      const campaignStatusFilter = appliedFilters.find(filter => filter.type === "Status");
      const isOutOfBudget = appliedFilters?.some(filter => filter?.type === "OutOfBudget" || filter?.value === "OUT_OF_BUDGET");
      const campaignStatus = isOutOfBudget ? "OUT_OF_BUDGET" : (campaignStatusFilter ? campaignStatusFilter.value : "");
      const typeFilter = appliedFilters.find(filter => filter.type === "Type");
      const type = typeFilter ? typeFilter.value : "";

      const requestSignature = JSON.stringify({
        profileId: profileId.value,
        selectedAdType,
        fromDate: fromDateStr,
        toDate: toDateStr,
        searchName: searchNameVal,
        profitFilter: profitFilter || "",
        campaignStatus,
        type,
        appliedFilters: (appliedFilters || []).map(f => f.id || f.displayText || f.type),
        gridFilter: gridFilter || "",
        pageNo: pageNoVal,
        perPage: perPageVal,
        sortType: conditionObj?.sortType || "DESC",
        fieldName: fieldName || "sales"
      });

      if (!isReload && lastFetchParamsRef.current === requestSignature) {
        return;
      }

      lastFetchParamsRef.current = requestSignature;
      setLoading(true);
      setChartLoading(true);
      const apiOptions = isReload ? { skipLoader: true } : {};

      const fetchPlacementData = async (profileIdVal, options = {}) => {
        if (!profileIdVal) return null;
        if (placementData && lastPlacementProfileRef.current === profileIdVal) {
          return placementData;
        }
        if (placementPromiseRef.current && lastPlacementProfileRef.current === profileIdVal) {
          return placementPromiseRef.current;
        }

        lastPlacementProfileRef.current = profileIdVal;
        placementPromiseRef.current = ApiPlacementList({ profileId: profileIdVal }, options)
          .then((e) => {
            if (e?.isSuccess) {
              setPlacementData(e);
              return e;
            }
            return null;
          })
          .catch((err) => {
            console.error(err);
            return null;
          })
          .finally(() => {
            placementPromiseRef.current = null;
          });

        return placementPromiseRef.current;
      };

      const rawAffected = localStorage.getItem("AffectedCampaigns");
      let campaigns = [];
      if (rawAffected) {
        try {
          campaigns = JSON.parse(rawAffected);
        } catch (err) {
          campaigns = [];
        }
      }

      const filterData = { appliedFilters, campaignStatus, type };
      const customFilter = addCampaignQuery(filterData);

      const data = {
        searchName: searchNameVal,
        profileId: profileId.value,
        fromDate: fromDateStr,
        toDate: toDateStr,
        fieldName: fieldName,
        status: campaignStatus,
        sortType: conditionObj?.sortType || "DESC",
        filteredCampaignIds: Array.isArray(campaigns) ? campaigns.map(cp => cp.campaignId) : [],
        ...(customFilter && { customFilter }),
        ...arg,
        profitFilter
      };

      const placementPromise = (placementData && lastPlacementProfileRef.current === profileId.value)
        ? Promise.resolve(placementData)
        : fetchPlacementData(profileId.value, apiOptions);

      const campaignPromise = ApiCampainListing(data, apiOptions);
      const chartPromise = ApiCampaignChartListing(data, apiOptions);

      Promise.all([campaignPromise, placementPromise])
        .then(([e, currentPlacementData]) => {
          if (e?.isSuccess) {
            const processedData = placementFieldCalculation({ data: e?.getCampaign, placementData: currentPlacementData, bestArr });

            const getTotalsRow = () => {
              const totalRow = e?.totalRow ?? {};
              return {
                action: `Total: ${e?.totalRecords || 0}`,
                name: `Total: ${e?.totalRecords || 0}`,
                budget: totalRow?.budget,
                timeInBudget: totalRow?.timeInBudget,
                spend: totalRow?.spend,
                sales: totalRow?.sales,
                acos: totalRow?.acos,
                roas: totalRow?.roas,
                orders: totalRow?.orders,
                impressions: totalRow?.impressions,
                cpc: totalRow?.cpc,
                clicks: totalRow?.clicks,
                isTotalRow: true,
              };
            };

            const totRow = getTotalsRow();
            setTotalRow(totRow);
            setTableData([...processedData, ...(processedData?.length ? [totRow] : [])]);
            setCampaignData(e);
            setCustomFilterFlag(false);

            setLowACOS(e?.notifySetting?.lowACOS);
            setHighACOS(e?.notifySetting?.highACOS);
          } else {
            Toast.error(e?.message);
          }
        })
        .catch((e) => {
          lastFetchParamsRef.current = "";
          Toast.error(t("Something went wrong"));
        })
        .finally(() => {
          setLoading(false);
        });

      chartPromise
        .then((e) => {
          if (e?.isSuccess) {
            setChartData(e?.data);
          } else {
            Toast.error(e?.message);
          }
        })
        .catch((e) => {
          Toast.error(t("Something went wrong"));
        })
        .finally(() => {
          setChartLoading(false);
        });
    }
  };

  useEffect(() => {
    lastFetchParamsRef.current = "";
    lastPlacementProfileRef.current = null;
    lastFilterProfileRef.current = null;
  }, [profileId?.value]);

  useEffect(() => {
    if (!isFilterReady || viewPress) return;
    const params = new URLSearchParams(location?.search);
    const searchParam = params.get("search") ?? "";
    if (searchParam) {
      const searchTerm = Buffer.from(searchParam, "base64").toString("utf8");
      setSearchName(searchTerm);
      ApiListing({ searchName: searchTerm });
      return;
    }

    ApiListing(arg);
  }, [isFilterReady, selectedAdType, date, location.search, gridFilter, appliedFilters, profitFilter, debouncedSearchName, viewPress]);

  const handlePageChange = (page) => {
    setArg({ pageNo: page, perPage: perPage })
    ApiListing({ pageNo: page, perPage: perPage });
  };

  const handlePerRowsChange = async (newPerPage) => {
    setPerPage(newPerPage);
    setArg({ pageNo: 1, perPage: newPerPage });
    ApiListing({ pageNo: 1, perPage: newPerPage });
  };

  const handleSearch = (e) => {
    setSearchName(e.target.value);
  };

  // handler for sorting
  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    ApiListing({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), ...arg });
  };

  const handleTypeChange = (e) => {
    const newType = e.target.value;
    setType(newType);

    // Get existing data
    const storedData = JSON.parse(localStorage.getItem("campaigns")) || {};

    // Update type
    storedData.type = newType;

    // Save back
    localStorage.setItem("campaigns", JSON.stringify(storedData));
  }



  const handleProfitFilter = (val) => {
    setProfitFilter(val);
  }

  const handleApplyInAmazon = async () => {
    const entries = Object.entries(placementEdits || {});
    if (!entries.length) {
      Toast.error(t("No placement edits to save"));
      return;
    }

    // Build a single payload containing all campaigns & their placement bids.
    const placements = entries.map(([campaignId, p]) => {
      const getValue = (placementName) => p?.[placementName] ?? null;
      return {
        campaignId: Number(campaignId),
        ...(getValue("Top of Search") && { topOfSearchBid: getValue("Top of Search") }),
        ...(getValue("Rest of Search") && { restOfSearchBid: getValue("Rest of Search") }),
        ...(getValue("Product pages") && { productPageBid: getValue("Product pages") }),
      };
    });

    const payload = {
      profileId: profileId?.value,
      placements, // backend should iterate this array and apply updates per campaign
    };

    try {
      const res = await ApiUpdatePlacementBidApplyInAmazon(payload);
      if (res?.isSuccess) {
        Toast.success(res?.message || "Saved placements");
        setPlacementEdits({});
        try {
          await ApiListing(arg);
        } catch (e) {
        }
      } else {
        Toast.error(res?.message || "Failed to save placements");
      }
    } catch (err) {
      Toast.error(t("Something went wrong"));
    }
  };

  const PlacementInput = React.memo(function PlacementInput({
    campaignId,
    placement,
    value,
    onCommit,
    onChange,
    min = 0,
    step = "0.01",
    style = {},
    append,
  }) {
    const [local, setLocal] = useState(value ?? "");
    useEffect(() => { setLocal(value ?? "") }, [value]);

    return (
      <div className="input-group" style={{ width: "100px", fontSize: "13px" }}>
        <input
          type="number"
          className="form-control form-control-sm"
          style={{ padding: "2px 6px", ...style }}
          value={local}
          onChange={(e) => {
            const newVal = e.target.value;
            setLocal(newVal);
            onChange(newVal, campaignId, placement);
          }}
          onBlur={() => onCommit(local, campaignId, placement)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          min={min}
          step={step}
        />
        {append && (
          <div className="input-group-append">
            <span className="input-group-text p-1 px-2 bg-secondary bg-opacity-25" style={{ borderRadius: "0px 0.375rem 0.375rem 0px" }}>{append}</span>
          </div>
        )}
      </div>
    );
  });

  const handleAction = (action) => {
    if (action === "placement-bid") {
      setShowBidModal(true);
    }
  };

  useEffect(() => {
    setPlacementData(null);
    lastPlacementProfileRef.current = null;
    if (profileId?.value && selectedAdType) {
      getFilter();
    }
  }, [profileId?.value, selectedAdType]);

  const handleCloseHourlyTrackingModel = async () => {
    setShowHourlyTrackingModal(false);
    setHourlyTrackingCampaigns([]);
    setSelectedRows([]);
    setSelectAll(false);
  }

  const getFilter = async () => {
    if (!profileId?.value || !selectedAdType) return;
    if (lastFilterProfileRef.current === profileId.value && filter.length > 0) return;
    if (filterPromiseRef.current && lastFilterProfileRef.current === profileId.value) return filterPromiseRef.current;

    lastFilterProfileRef.current = profileId.value;
    const data = { profileId: profileId.value, pageName: "Dashboard" };
    filterPromiseRef.current = ApiFilterListing(data)
      .then((e) => {
        if (e?.isSuccess) {
          setFilter(e?.filters);
          setFilterOptions(e?.filters?.filter(f => f?.isDefault)?.map((el) => ({ ...el, labelKey: el.name })));
        } else {
          Toast.error(e?.message);
        }
      })
      .catch((e) => Toast.error(t("Something went wrong")))
      .finally(() => {
        filterPromiseRef.current = null;
      });

    return filterPromiseRef.current;
  };

  const handleSavedFilterSelection = (savedFilter) => {
    try {
      const queryObj = JSON.parse(savedFilter.query);
      // Parse and apply filters based on query structure
      const newFilters = [];
      // Define conditional fields for filter processing

      if (queryObj.status) {
        const campaignValue = (Boolean(queryObj?.status?.$eq) ? queryObj?.status?.$eq : (queryObj?.status?.$ne && "NOT_ARCHIVED")) ?? ""
        setStatus(campaignValue);
        const typeFilter = {
          id: `saved-${savedFilter._id}-type`,
          type: "Status",
          label: "Status",
          value: campaignValue,
          displayText: `Campaign Status: ${campaignValue}`,
          savedFilterId: savedFilter._id
        };
        newFilters.push(typeFilter);
      }

      // Handle matchType (maps to type state)
      if (queryObj.type) {
        setType(queryObj.type);
        const typeFilter = {
          id: `saved-${savedFilter._id}-type`,
          type: "Type",
          label: "Type",
          value: queryObj.type,
          displayText: `Type: ${queryObj.type}`,
          savedFilterId: savedFilter._id
        };
        newFilters.push(typeFilter);
      }

      // Handle other filter conditions that don't have direct state mappings
      Object.keys(queryObj).forEach(key => {
        // Skip fields that were already processed in conditional fields and other excluded fields
        if (!['status', 'type'].includes(key)) {
          if (typeof queryObj[key] === 'object' && queryObj[key] !== null) {
            const condition = Object.keys(queryObj[key])[0];
            const value = queryObj[key][condition];

            // Map API field names back to filter option values
            const reverseFieldMap = {
              "timeInBudget": "timeInBudget",
              "budget": "Budget",
              "impressions": "Impressions",
              "clicks": "Clicks",
              "orders": "Orders",
              "sales": "Sales",
              "roas": "ROAS",
              "acos": "ACOS",
              "spend": "Spend",
              "cpc": "CPC"
            };

            const filterType = reverseFieldMap[key] || key;
            const filterOption = filterOptions.find(opt => opt.value === filterType);

            if (filterOption) {
              // Get the proper label for the condition
              const conditionOption = CONDITION_OPTIONS.find(opt => opt.value === condition);
              const conditionLabel = conditionOption ? t(conditionOption.labelKey) : condition;

              const regularFilter = {
                id: `saved-${savedFilter._id}-${key}`,
                type: filterType,
                label: filterOption.labelKey,
                condition: condition,
                value: value,
                apiFieldName: key,
                displayText: `${t(filterOption.labelKey)}: ${conditionLabel} ${value}`,
                savedFilterId: savedFilter._id
              };
              newFilters.push(regularFilter);
            }
          }
        }
      });

      // Remove any duplicate filters before setting applied filters
      const uniqueFilters = newFilters.filter((filter, index, self) => index === self.findIndex(f => f.type === filter.type && f.condition === filter.condition && f.value === filter.value && f.apiFieldName === filter.apiFieldName)
      );

      // Set applied filters last to trigger single API call
      setAppliedFilters(uniqueFilters);

    } catch (error) {
      console.error("Error parsing saved filter query:", error);
      Toast.error(t("Error loading saved filter"));
    }
  };

  const handleFilterOptionClick = (option) => {

    // Check if there's an existing applied filter for this option and pre-populate
    const existingFilter = appliedFilters.find(filter => filter.type === option.value);

    setSelectedFilterOption(option);

    if (option.value === "Status") {
      setStatus(existingFilter ? existingFilter.value : "");
    } else if (option.value === "Type") {
      setType(existingFilter ? existingFilter.value : "");
    } else {
      // For regular filters (impressions, clicks, etc.)
      setSelectedCondition(existingFilter ? existingFilter.condition : "$eq");
      setFilterValue(existingFilter ? existingFilter.value : "0.00");
    }

    setShowFilterModal(true);
  };

  const isOutOfBudgetActive = appliedFilters.some(f => f.type === "OutOfBudget" || f.value === "OUT_OF_BUDGET");

  const handleToggleOutOfBudget = useCallback(() => {
    setFilterPopoverOpen(false);
    const existing = appliedFilters.find(f => f.type === "OutOfBudget" || f.value === "OUT_OF_BUDGET");
    if (existing) {
      setAppliedFilters(prev => prev.filter(f => f.id !== existing.id && f.type !== "OutOfBudget" && f.value !== "OUT_OF_BUDGET"));
    } else {
      const newFilter = {
        id: "out-of-budget-filter",
        type: "OutOfBudget",
        label: "Out of budget",
        value: "OUT_OF_BUDGET",
        displayText: "Out of budget",
      };
      setAppliedFilters(prev => [...prev.filter(f => f.type !== "OutOfBudget" && f.value !== "OUT_OF_BUDGET"), newFilter]);
    }
  }, [appliedFilters]);

  const handleGridFilter = (event) => {
    setFilterPopoverOpen(false);
    const selectedValue = event.target.value;

    if (selectedValue === "OutOfBudget" || selectedValue === "Out of budget") {
      handleToggleOutOfBudget();
      return;
    }

    // Check if it's a saved filter (custom filter with _id)
    const selectedSavedFilter = filter.find(f => f._id === selectedValue);
    if (selectedSavedFilter) {
      if (!selectedSavedFilter.isDefault && selectedSavedFilter.query) handleSavedFilterSelection(selectedSavedFilter);
      else setGridFilter(selectedValue);
      return;
    }

    const selectedOption = filterOptions.find(option => option.value === selectedValue);
    if (selectedOption) {
      handleFilterOptionClick(selectedOption);
      return;
    }

    // For non-modal options, set the grid filter normally
    setGridFilter(selectedValue);
  }

  const handleRemoveSingleFilter = (filterId) => setAppliedFilters(prev => prev.filter(filter => filter.id !== filterId));

  const handleDeleteFilterClick = (filter) => {
    setFilterPopoverOpen(false);
    setFilterToDelete(filter);
    setShowDeleteFilterModal(true);
  };

  useEffect(() => {
    if (!Boolean(appliedFilters?.length)) {
      const filter = {
        "id": new Date().getTime(),
        "type": "Status",
        "label": "Status",
        "displayText": "Campaign Status: ENABLED",
        "value": "ENABLED",
      }
      setAppliedFilters((prev) => {
        if (prev.some((f) => f?.id === filter?.id)) return prev;
        return [...prev, filter];
      });
    }
  }, [])

  return (
    <>
      <Filter name={"Campaigns"} isShowBackIcon={viewPress} handleClick={handleCloseViewCampaign} dateShow={false} profileShow={true} nameShow={false} />
      {viewPress ? (
        <ViewCampaign
          viewPress={viewPress}
          setViewPress={setViewPress}
          campaignDetails={campaignDetails}
          campaignDate={date}
          handleBack={handleCloseViewCampaign}
        />
      ) : (
        <div className="campaign-tracking-container" id="campaign-page">
          <div className="middle_container" >
            {/* ── GLOBAL FILTERS: Sticky Header matching OrderReport ───── */}
            <div
              id="campaign-filters"
              className={`glass-sticky-header ${!isMobile ? "sticky-top" : ""}`}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                columnGap: 12,
                rowGap: 10,
                padding: isMobile ? "10px 16px" : "10px 24px",
                zIndex: 90,
                marginLeft: 0,
                marginRight: 0,
                marginTop: "-10px",
                marginBottom: "20px",
              }}
            >
              {/* ROW 1: Filter By & Profit Filter */}
              <div className="flex" style={{ gap: 12, width: isMobile ? "100%" : "auto" }}>
                {/* Filter By */}
                <div style={{ flex: isMobile ? 1 : "initial" }}>
                  <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        id="campaign-filter-by"
                        className="w-full justify-between active m-0 font-medium h-[40px] px-4 bg-white dark:bg-transparent dark:border-white/10 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
                        style={{ width: "100%", height: "40px" }}
                      >
                        <span className="truncate mr-2">
                          {gridFilter ? (filter.find(f => f._id === gridFilter)?.name || t("Filter By")) : (t("Filter By"))}
                        </span>
                        <ExpandMoreIcon className="text-gray-500" fontSize="small" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 z-[9999] max-h-[300px] overflow-y-auto p-2 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl">
                      {filter.filter(f => !f.isDefault).length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t("Saved Filters")}</div>
                          {filter.filter(f => !f.isDefault).map((f) => (
                            <div key={f._id} className="flex justify-between items-center px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors group">
                              <div className="flex-grow truncate cursor-pointer flex items-center text-slate-700 dark:text-slate-200" onClick={() => handleGridFilter({ target: { value: f._id } })} title={f.name}>
                                {appliedFilters.some(filter => filter.savedFilterId === f._id) && (<span className="text-emerald-500 mr-2 font-bold">✓</span>)}
                                {f.name}
                              </div>
                              <Button variant="ghost" className="delete-button flex-shrink-0 ml-2 p-1 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-md transition-colors h-auto w-auto" onClick={(e) => { e.stopPropagation(); handleDeleteFilterClick(f); }} title={t("Delete filter")}>
                                <CloseIcon style={{ fontSize: 14, color: "#ef4444" }} />
                              </Button>
                            </div>
                          ))}
                          <hr className="my-1.5 border-slate-100 dark:border-slate-800" />
                        </>
                      )}
                      <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t("Filter Options")}</div>
                      <div className="space-y-0.5">
                        <div
                          className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                          onClick={handleToggleOutOfBudget}
                        >
                          <span>{t("Out of budget")}</span>
                          {isOutOfBudgetActive && (<span className="text-emerald-500 font-bold ml-2">✓</span>)}
                        </div>
                        {filterOptions.map((option) => (
                          <div className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                            key={option.value}
                            onClick={() => { handleGridFilter({ target: { value: option.value } }); }}
                          >
                            <span>{t(option.labelKey)}</span>
                            {appliedFilters.some(filter => filter.type === option.value) && (<span className="text-emerald-500 font-bold ml-2">✓</span>)}
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Profit Filter */}
                {performanceScores && performanceScores.length > 0 && (
                  <div style={{ flex: isMobile ? 1 : "initial" }}>
                    <Select value={profitFilter || "all"} onValueChange={(val) => handleProfitFilter(val === "all" ? "" : val)}>
                      <SelectTrigger id="profit-filter-dropdown" className="w-full md:w-[160px] h-[40px] px-4 font-medium bg-white dark:bg-transparent dark:border-white/10 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5">
                        <SelectValue placeholder={t("all")}>
                          {!profitFilter ? t("all") : performanceScores.find(s => s.scoreName === profitFilter)?.scoreName || t("all")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent align="start" className="z-[9999]">
                        <SelectItem value="all" className="font-medium cursor-pointer">
                          {t("all")}
                        </SelectItem>
                        {performanceScores.map((score) => (
                          <SelectItem key={score._id} value={score.scoreName} className="font-medium cursor-pointer">
                            {t(score.scoreName)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* ROW 2 & 3: Grouped Right-Aligned Controls */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginLeft: !isMobile ? "auto" : undefined,
                  width: isMobile ? "100%" : "auto",
                  flexWrap: "wrap",
                }}
              >
                {/* Date Picker */}
                <div id="campaign-date-picker" style={{ width: isMobile ? "100%" : "auto" }}>
                  <DateRangePicker
                    className="w-full sm:w-[260px]"
                    ranges={predefinedRanges}
                    value={date}
                    placeholder={t("Select Date")}
                    onChange={handleDateChange}
                  />
                </div>

                {/* Action Icons */}
                <div className="flex" style={{ gap: 10, width: isMobile ? "100%" : "auto" }}>
                  {/* Reload Button */}
                  <AppTooltip text={t("Refresh")} id="refresh-button">
                    <Button
                      variant="outline"
                      className="btn border custom-secondary-btn"
                      onClick={refreshGrid}
                      style={{ flex: isMobile ? 1 : "initial" }}
                    >
                      <RefreshIcon style={{ fontSize: 18 }} />
                    </Button>
                  </AppTooltip>

                  {/* Ads Trends Button */}
                  <AppTooltip text={t("Ads Trends")} id="ads-trends-button">
                    <Button
                      variant="outline"
                      className="btn border custom-secondary-btn"
                      onClick={() => setShowAdsTrendsModal(true)}
                      style={{ flex: isMobile ? 1 : "initial" }}
                    >
                      <BarChartIcon style={{ fontSize: 18 }} />
                    </Button>
                  </AppTooltip>

                  {/* Campaign Setting Button */}
                  {PermissionCheck(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE) && (
                    <AppTooltip text={t("Notification Setting")} id="notification-setting-button">
                      <Button
                        variant="outline"
                        className="btn border custom-secondary-btn"
                        onClick={() => setShowCampaignSetting(true)}
                        style={{ flex: isMobile ? 1 : "initial" }}
                      >
                        <NotificationsIcon style={{ fontSize: 18 }} />
                      </Button>
                    </AppTooltip>
                  )}
                  {PermissionCheck(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE) && (
                    <AppTooltip text={t("Setting")} id="setting-button">
                      <Button
                        variant="outline"
                        className="btn border custom-secondary-btn"
                        onClick={() => navigate("/campaign/setting")}
                        style={{ flex: isMobile ? 1 : "initial" }}
                      >
                        <SettingsIcon style={{ fontSize: 18 }} />
                      </Button>
                    </AppTooltip>
                  )}
                </div>
              </div>
            </div>

            <Chart chartLoading={chartLoading} isTotalsLoading={loading} chartData={chartData} totalRow={totalRow} id="chart" />

            {showAllTypes && (
              <div style={{ padding: "0 0 10px 0" }}>
                <AdTypeScopeNote selectedAdType={selectedAdType} excludedAdTypes={campaignData?.excludedAdTypes} />
              </div>
            )}

            <div className="glass-grid-container overflow-hidden" id="campaign-data">
              {/* Header Title Row */}
              <div className="px-6 py-3 border-b border-slate-100 dark:border-white/10 shrink-0">
                <h5 className="m-0 font-bold text-slate-800 dark:text-white">{t("Campaigns")}</h5>
              </div>

              {/* Toolbar Actions Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-slate-50/30 dark:bg-white/5 border-b border-slate-100 dark:border-white/10 shrink-0">
                {/* Left Side: Compare toggle & Search box */}
                <div className="flex items-center gap-3 flex-wrap">
                  {selectedRows?.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setComparePrevious(!comparePrevious)}
                      className={`h-9 px-3.5 rounded-lg border text-xs font-bold transition-all duration-200 flex items-center gap-2 ${comparePrevious
                        ? "bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-400"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
                        }`}
                    >
                      <ActivityIcon className={`h-4 w-4 ${comparePrevious ? "animate-pulse" : "text-slate-400 dark:text-slate-500"}`} />
                      <span>{t("Compare Previous")}</span>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors ${comparePrevious ? "border-sky-500 bg-sky-500" : "border-slate-300 dark:border-slate-600"
                        }`}>
                        {comparePrevious && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </button>
                  )}

                  {/* Search */}
                  <div id="campaign-search-option" className="search_option m-0 flex items-center" style={{ position: "relative", minWidth: "260px", height: "36px" }}>
                    <Input
                      type="text"
                      placeholder={t("searchHere")}
                      value={searchName}
                      onChange={(e) => handleSearch(e)}
                      className="flex-grow w-full h-[36px] bg-transparent"
                      style={{ paddingRight: searchName ? "30px" : "10px" }}
                    />
                    {searchName && (
                      <MdOutlineClose
                        onClick={() => setSearchName("")}
                        style={{
                          position: "absolute",
                          right: "10px",
                          cursor: "pointer",
                          color: "var(--text-secondary)",
                          fontSize: "18px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: 0.7,
                          transition: "opacity 0.2s"
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = 1}
                        onMouseLeave={(e) => e.target.style.opacity = 0.7}
                      />
                    )}
                  </div>
                </div>

                {/* Right Side: Action buttons with original classes and inline styles */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Hourly Data */}
                  <AppTooltip text={t("Hourly Data Tracking")} id="campaign-hourly-data">
                    <Button
                      variant="outline"
                      onClick={() => { setShowHourlyTrackingModal(true); setCampaignDetails(null); }}
                      className="customize-button m-0 gap-0 custom-secondary-btn"
                      style={{ height: "36px", whiteSpace: "nowrap", flexGrow: isMobile ? 1 : 0, display: "inline-flex", alignItems: "center" }}
                    >
                      <ShowChartIcon style={{ fontSize: 18, marginRight: 4 }} /> {t("Hourly Data")}
                      {selectedRows?.length > 0 && (
                        <span
                          className="bg-primary text-white text-[10px] font-bold rounded-full ml-2 flex items-center justify-center shrink-0"
                          style={{ minWidth: "18px", height: "18px", padding: "0 4px", lineHeight: "18px" }}
                        >
                          {selectedRows.length}
                        </span>
                      )}
                    </Button>
                  </AppTooltip>

                  {/* Columns */}
                  <AppTooltip text={t("Customize Columns")} id="campaign-customize-columns">
                    <Button
                      variant="outline"
                      onClick={async () => setShowCustomizeModal(true)}
                      className="customize-button m-0 gap-0 custom-secondary-btn"
                      style={{ height: "36px", whiteSpace: "nowrap", flexGrow: isMobile ? 1 : 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      {t("Columns")}
                      <span style={{ fontSize: 9, marginLeft: 6, display: "inline-block", verticalAlign: "middle" }}>▼</span>
                    </Button>
                  </AppTooltip>

                  {/* Export Excel */}
                  <AppTooltip text={t("Export to Excel")}>
                    <Button
                      variant="outline"
                      onClick={exportExcel}
                      className="customize-button m-0 custom-secondary-btn"
                      style={{ height: "36px", whiteSpace: "nowrap", flexGrow: isMobile ? 1 : 0 }}
                    >
                      {t("Export")}
                    </Button>
                  </AppTooltip>

                  {/* Update and Save */}
                  {/* {PermissionCheck(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE) && (
                    <Button
                      onClick={handleApplyInAmazon}
                      className="improve update_btn m-0 btn-campaign-primary"
                      style={{ flexGrow: isMobile ? 1 : 0, whiteSpace: "nowrap" }}
                    >
                      {t("Update and Save")}
                    </Button>
                  )} */}

                  {/* Add Campaign */}
                  {PermissionCheck(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.CREATE) && (
                    <Button
                      id="campaign-add"
                      className="customize-button clicked m-0 gap-0 btn-campaign-primary"
                      style={{ flexGrow: isMobile ? 1 : 0, whiteSpace: "nowrap" }}
                      onClick={() => navigate("/add-campagin")}
                    >
                      <AddIcon style={{ fontSize: 16, marginRight: 4 }} />
                      {t("addCampaign")}
                    </Button>
                  )}
                </div>
              </div>

              <AppliedFilter
                appliedFilters={appliedFilters}
                handleGridFilter={handleGridFilter}
                handleRemoveSingleFilter={handleRemoveSingleFilter}
                setAppliedFilters={setAppliedFilters}
                setShowSaveFilterModal={setShowSaveFilterModal}
                onEditCustomFilter={handleEditCustomFilter}
                id={"campaign-applied-filter"}
              />

              {/* Amazon Ads Out of Budget Alert Banner */}
              {isOutOfBudgetActive && (
                <div className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300">
                  <InfoIcon className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400" />
                  <span>{t("The Out of budget filter only includes single-country campaigns with daily budget.")}</span>
                </div>
              )}

              {PermissionCheck(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY) && (
                <div className="data_table position-relative" id="campaign-main-table">
                  <AgTable
                    ref={gridRef}
                    tableId="campaign-main-table"
                    customSaveColumnName="Campaign"
                    isCustomSaveColumns={true}
                    loading={loading}
                    onRefresh={refreshGrid}
                    rowData={tableData?.filter((r) => !r?.isTotalRow)}
                    columnDefs={columns}
                    totalRecords={campaignData?.totalRecords ?? 0}
                    perPage={perPage}
                    currentPage={customFilterFlag ? 1 : arg.pageNo}
                    onPageChange={handlePageChange}
                    onPerPageChange={handlePerRowsChange}
                    onSortChanged={handleSortChanged}
                    paginationOptions={paginationRowsPerPageOptions}
                    handleSaveColumns={handleSaveColumns}
                    pinnedBottomRowData={tableData?.some((r) => r?.isTotalRow) ? [tableData.find((r) => r?.isTotalRow)] : []}
                    masterDetail={true}
                    detailCellRenderer={detailCellRenderer}
                    detailCellRendererParams={detailCellRendererParams}
                    detailRowAutoHeight={true}
                    isRowMaster={(row) => !row?.isTotalRow && Boolean(row?.placements?.length)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <CampaginPlacementBidModal
        showBidModal={showBidModal}
        setShowBidModal={setShowBidModal}
        selectedRows={selectedRows}
        handleSubmit={async () => await ApiListing(arg)}
      />

      <CampaignNotificationSettingModal
        showCampaignSetting={showCampaignSetting}
        setShowCampaignSetting={setShowCampaignSetting}
        lowACOS={lowACOS}
        setLowACOS={setLowACOS}
        highACOS={highACOS}
        setHighACOS={setHighACOS}
      />

      {/* Hourly Tracking Modal */}
      <HourlyTrackingModal
        showModal={showHourlyTrackingModal}
        setShowModal={setShowHourlyTrackingModal}
        campaignId={hourlyTrackingCampaigns}
        profileId={profileId?.value}
        closeHandler={handleCloseHourlyTrackingModel}
      />

      <CreativeModal
        showModal={showCreativeModal}
        setShowModal={setShowCreativeModal}
        campaignId={campaignDetails?.campaignId}
        profileId={profileId?.value}
      />

      {/* Filter Modal */}
      <CampaignFilterModal
        showFilterModal={showFilterModal}
        handleModalClose={handleModalClose}

        CONDITION_OPTIONS={CONDITION_OPTIONS}

        status={status}
        setStatus={setStatus}
        type={type}
        setType={setType}
        selectedFilterOption={selectedFilterOption}
        selectedCondition={selectedCondition}
        setSelectedCondition={setSelectedCondition}
        setAppliedFilters={setAppliedFilters}
        filterValue={filterValue}
        setFilterValue={setFilterValue}
      />

      {/* Save Filter Modal */}
      <CampaignSaveFilter
        showSaveFilterModal={showSaveFilterModal}
        setShowSaveFilterModal={setShowSaveFilterModal}
        filterName={filterName}
        setFilterName={setFilterName}
        appliedFilters={appliedFilters}
        getFilter={getFilter}
      />

      {/* Delete Filter Confirmation Modal */}
      <CampaignDeleteModal
        showDeleteFilterModal={showDeleteFilterModal}
        setFilterToDelete={setFilterToDelete}
        setShowDeleteFilterModal={setShowDeleteFilterModal}
        filterToDelete={filterToDelete}
        getFilter={getFilter}
      />

      <CustomizeColumns showModal={showCustomizeModal} setShowModal={setShowCustomizeModal} allColumns={columns} selectedColumn={visibleColumns} handler={handleSaveColumns} defaultColumns={defaultColumns} />

      <AIAnalysisModal showModal={showAIAnalysisModel} hideModal={setShowAIAnalysisModel} campaign={campaignDetails} predefinedRanges={predefinedRanges} date={date} />

      <CampaignComparision
        show={comparePrevious}
        onClose={() => setComparePrevious(false)}
        campaginIds={selectedRows}
        date={date}
      />

      <AdsTrendsModal show={showAdsTrendsModal} onClose={() => setShowAdsTrendsModal(false)} />

      <CustomModal
        show={showBidThresholdModel}
        onHide={() => setShowBidThresholdModel(false)}
        title={t("Campaigns Bid Threshold")}
        subtitle=""
        icon="settings"
        iconVariant="primary"
        size="md"
        closeOnBackdrop={true}
        actions={[
          {
            label: t('Clear Inputs'),
            cancel: true,
            onClick: () => { setMaxbid(20); setMinbid(0); setTargetACOS(30); },
          },
          {
            label: t('Apply'),
            variant: 'primary',
            icon: 'save',
            onClick: submitBidThashold,
          },
        ]}
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-slate-700 dark:text-slate-200">{t('maxBid')}:</Label>
            <Input
              type="number"
              name="maxBid"
              onChange={(e) => setMaxbid(e.target.value)}
              value={maxBid}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-slate-700 dark:text-slate-200">{t('minBid')}:</Label>
            <Input
              type="number"
              name="minBid"
              onChange={(e) => setMinbid(e.target.value)}
              value={minBid}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-slate-700 dark:text-slate-200">{t('Target ACOS')}:</Label>
            <Input
              type="number"
              name="targetACOS"
              onChange={(e) => setTargetACOS(e.target.value)}
              value={targetACOS}
            />
          </div>
        </div>
      </CustomModal>

      {/* Campaign Type Selection Modal */}
      {/* <Modal
        show={showCampaignTypeModal}
        onHide={() => setShowCampaignTypeModal(false)}
        centered
        className="campaign-type-modal"
        size="lg"
      >
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="fw-bold h4 px-2">{t("Create campaign")}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4 pt-2">
          <div className="row g-4 mt-2">
            <div className="col-md-4">
              <div
                className="campaign-type-card h-full p-4 border rounded-3 text-center cursor-pointer transition-all shadow-sm hover-shadow"
                onClick={() => {
                  setShowCampaignTypeModal(false);
                  navigate("/add-campagin", { state: { type: "SPONSORED_PRODUCTS" } });
                }}
              >
                <div className="mb-3">
                  <i className="fa-solid fa-box-open fs-1 text-primary"></i>
                </div>
                <h5 className="fw-bold mb-3">{t("Sponsored Products")}</h5>
                <p className="text-muted small mb-0">Promote individual products to shoppers.</p>
              </div>
            </div>

            <div className="col-md-4">
              <div
                className="campaign-type-card h-full p-4 border rounded-3 text-center cursor-pointer transition-all shadow-sm hover-shadow"
                onClick={() => {
                  setShowCampaignTypeModal(false);
                  navigate("/add-campagin", { state: { type: "SPONSORED_BRANDS" } });
                }}
              >
                <div className="mb-3">
                  <i className="fa-solid fa-award fs-1 text-primary"></i>
                </div>
                <h5 className="fw-bold mb-3">{t("Sponsored Brands")}</h5>
                <p className="text-muted small mb-0">Showcase your brand and product portfolio.</p>
              </div>
            </div>

            <div className="col-md-4">
              <div
                className="campaign-type-card h-full p-4 border rounded-3 text-center cursor-not-allowed opacity-50 bg-gray-100"
                style={{ cursor: 'not-allowed' }}
              >
                <div className="mb-3">
                  <i className="fa-solid fa-rectangle-ad fs-1 text-secondary"></i>
                </div>
                <h5 className="fw-bold mb-3">{t("Display")}</h5>
                <p className="text-muted small mb-0">Reach audiences on and off Amazon. (Coming Soon)</p>
              </div>
            </div>
          </div>
        </Modal.Body>
      </Modal> */}

    </>
  );
}

export default Campaign;
