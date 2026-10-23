import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { handleLoader, Toast, useDispatch } from "../../../helper/links/Link";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useTranslation } from "react-i18next";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { exportGridToExcel } from "../../../utility/exportExcel";
import { ApiLifeTimeMatrixListing } from "../../../api-wrapper/targeting/ApiTargeting";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import { FaCheckCircle, FaTimesCircle, FaMinusCircle } from "react-icons/fa";
import TargetingDetailsDrawer from "./Targeting/TargetingDetailsDrawer";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import moment from "moment";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { TargetingTypeBadge } from "../../../utility/targetingUtils";

import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Button as ShadcnButton } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { ApiFilterListing, ApiGetCampaignAndAdGroupAutoSearch } from "../../../api-wrapper/customer/ApiCustomer";
import { ApiListGetColumns, ApiListUpdateColumns } from "../../../api-wrapper/columns/ApiColumns";
import CustomizeColumns from "../../../helper/modal/CustomizeColumns";
import { isEqual } from "lodash";
import {
  MdRefresh as RefreshIcon,
  MdClose as CloseIcon,
  MdInfo as InfoIcon,
  MdArrowUpward as ArrowUpwardIcon,
  MdArrowDownward as ArrowDownwardIcon,
  MdTrackChanges as TrackChangesOutlinedIcon,
  MdOutlineLightbulb as LightbulbOutlinedIcon,
  MdOutlineClose,
  MdExpandMore as ExpandMoreIcon
} from "react-icons/md";
import TargetingFilterModal from "./Targeting/TargetingFilterModal";
import TargetingSaveFilter from "./Targeting/TargetingSaveFilter";
import TargetingDeleteModal from "./Targeting/TargetingDeleteModal";
import { addTargetingQuery } from "../../../utility/createQuery";
import AppliedFilter from "../../component/filter/AppliedFilter";
import SuggestionTable from "./Suggestions/SuggestionTable";
import ReactDOM from "react-dom";
import usePageFilter from "../../../helper/filter/usePageFilter";
import { AppTooltip } from "../../../components/ui/AppTooltip";

// Portal-based tooltip immune to AG-Grid CSS transform offsets

// Custom Header Component matching OrderReport
const CustomHeader = (props) => {
  const { displayName, tooltipText, enableSorting, progressSort } = props;
  const [currentSort, setCurrentSort] = useState(props.column.getSort());

  useEffect(() => {
    const onSortChanged = () => setCurrentSort(props.column.getSort());
    props.column.addEventListener("sortChanged", onSortChanged);
    return () => props.column.removeEventListener("sortChanged", onSortChanged);
  }, [props.column]);

  return (
    <div
      className="flex items-center gap-1"
      style={{ cursor: enableSorting ? "pointer" : "default" }}
      onClick={(e) => enableSorting && progressSort(e.shiftKey)}
    >
      <span className="ag-header-cell-text">{displayName}</span>
      {currentSort === "asc" && <ArrowUpwardIcon style={{ fontSize: 14, color: "#fff", marginLeft: 4 }} />}
      {currentSort === "desc" && <ArrowDownwardIcon style={{ fontSize: 14, color: "#fff", marginLeft: 4 }} />}
      {tooltipText && (
        <AppTooltip
          text={<div style={{ fontSize: 12, padding: "4px" }}>{tooltipText}</div>}
          placement="top"
          arrow
        >
          <InfoIcon
            size={13}
            style={{ color: "#fff", cursor: "help", marginLeft: 4 }}
            onClick={(e) => e.stopPropagation()}
          />
        </AppTooltip>
      )}
    </div>
  );
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

// Targeting type options for checkbox selection
const TARGETING_TYPE_OPTIONS = [
  { label: "Exact keywords", value: "EXACT" },
  { label: "Phrase keywords", value: "PHRASE" },
  { label: "Broad keywords", value: "BROAD" },
  { label: "Product targets", value: "TARGETING_EXPRESSION" }
];

const TABS = [
  { label: "all", title: "All", query: {} },
  { label: "auto_campaign", title: "Auto Campaign", query: { keywordType: { $nin: ["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"] } } },
  { label: "manual_campaign", title: "Manual Campaign", query: { keywordType: { $in: ["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"] } } },
];

const STATUS_UI = {
  WINNER: {
    label: "Winner",
    color: "success",
    icon: <FaCheckCircle />,
  },
  POOR: {
    label: "Poor",
    color: "danger",
    icon: <FaTimesCircle />,
  },
  NEUTRAL: {
    label: "Neutral",
    color: "warning",
    icon: <FaMinusCircle />,
  },
};

const StatusBadge = ({ status }) => {
  const { t } = useTranslation();
  const ui = STATUS_UI[status] || STATUS_UI.NEUTRAL;

  return (
    <span
      className={`badge bg-${ui.color} inline-flex items-center gap-1 px-2 py-1`}
      style={{ fontSize: "12px", borderRadius: "12px" }}
      title={t(ui.label)}
    >
      {ui.icon}
      {t(ui.label)}
    </span>
  );
};

function LifetimeTracker() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { t } = useTranslation();

  let { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);

  const [perPage, setPerPage] = useState(firstPageRows);
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [customStatus, setCustomStatus] = useState(null);
  const [lifetimeTrackerData, setLifetimeTrackerData] = useState();
  const [date, setDate] = useState([new Date(moment()?.startOf("month")), new Date()]);
  const lastFilterProfileRef = useRef(null);
  const filterPromiseRef = useRef(null);
  const lastAutoSearchProfileRef = useRef(null);
  const autoSearchPromiseRef = useRef(null);
  const lastFetchParamsRef = useRef("");

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
      let storeData;
      try {
        storeData = JSON.parse(localStorage.getItem('profile'));
      } catch (err) { }
      if (storeData?.date && Array.isArray(storeData.date) && storeData.date.length >= 2) {
        setSelectedDate(storeData.date);
      } else {
        const firstDate = moment().startOf("month").format("YYYY-MM-DD");
        const lastDate = moment().format("YYYY-MM-DD");
        setSelectedDate([firstDate, lastDate]);
      }
    }
  }, [selectedDate, setSelectedDate]);

  const handleDateChange = (val) => {
    setDate(val);
    if (val && Array.isArray(val) && val.length >= 2) {
      const arr = [moment(val[0]).format("YYYY-MM-DD"), moment(val[1]).format("YYYY-MM-DD")];
      setSelectedDate(arr);
      try {
        let storeData = JSON.parse(localStorage.getItem('profile')) || {};
        storeData.date = arr;
        localStorage.setItem('profile', JSON.stringify(storeData));
      } catch (err) { }
    }
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTargeting, setSelectedTargeting] = useState("");
  const [selectedMatchType, setSelectedMatchType] = useState("");
  const [selectedCampaignIds, setSelectedCampaignIds] = useState([]);

  const [tableData, setTableData] = useState([]);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  const [targetingTabFilter, setTargetingTabFilter] = useState("all");

  const [masterTab, setMasterTab] = useState("KEYWORDS");
  const [hoveredTab, setHoveredTab] = useState(null);
  const [suggestionTab, setSuggestionTab] = useState("MANUAL");

  const [filter, setFilter] = useState([]);
  const [filterOptions, setFilterOptions] = useState([]);
  const [appliedFilters, setAppliedFilters] = useState(() => [
    {
      "id": `${new Date().getTime()}-1`,
      "type": "CampaignActiveStatus",
      "displayText": "Campaign Status: ENABLED",
      "label": "Campaign active status",
      "value": "ENABLED",
    },
    {
      "id": `${new Date().getTime()}-2`,
      "type": "TargetActiveStatus",
      "displayText": "Target Status: ENABLED",
      "label": "Target active status",
      "value": "ENABLED",
    }
  ]);
  const [gridFilter, setGridFilter] = useState("");
  const [status, setStatus] = useState("ENABLED");
  const [type, setType] = useState("");
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedFilterOption, setSelectedFilterOption] = useState(null);
  const [selectedCondition, setSelectedCondition] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [selectedTargetingTypes, setSelectedTargetingTypes] = useState([]);
  const [selectedCampaignStatus, setSelectedCampaignStatus] = useState("");
  const [selectedTargetStatus, setSelectedTargetStatus] = useState("ENABLED");
  const [selectedCampaigns, setSelectedCampaigns] = useState([]);
  const [selectedAdGroups, setSelectedAdGroups] = useState([]);
  const [campaignsData, setCampaignsData] = useState([]);
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [showDeleteFilterModal, setShowDeleteFilterModal] = useState(false);
  const [filterToDelete, setFilterToDelete] = useState(null);
  const [pendingCampaignSelections, setPendingCampaignSelections] = useState(null);
  const [campaignsLoading, setCampaignsLoading] = useState(false);

  const gridRef = useRef(null);
  const manualSuggestionRef = useRef(null);
  const autoSuggestionRef = useRef(null);
  const dispatch = useDispatch();

  // ── Auto-save and restore page filter ──────────────────────────────────────
  const { isFilterReady } = usePageFilter({
    pageName: masterTab === "KEYWORDS" ? "KeywordTracker" : null,
    profileId: profileId?.value,
    selectedAdType,
    appliedFilters,
    setAppliedFilters,
    onFilterLoad: (savedFilters) => {
      const getFilterVal = (type) => savedFilters.find(f => f.type === type)?.value;

      setSelectedTargetStatus(getFilterVal("TargetActiveStatus") || "ENABLED");
      setSelectedCampaignStatus(getFilterVal("CampaignStatus") || "");
      setSelectedTargetingTypes(getFilterVal("TargetingType") || []);
    }
  });

  const [visibleColumns, setVisibleColumns] = useState([]);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [defaultColumns] = useState(["Targeting"]);

  const checkOrderColumns = useCallback((title) => {
    const matched = visibleColumns?.find(col => col?.title === title);
    return {
      width: matched?.width ?? 200,
      hide: Boolean(visibleColumns?.length && !matched),
      order: matched?.order ?? 9999,
    };
  }, [visibleColumns]);

  const columns = useMemo(() => [
    {
      headerName: t("targeting"),
      field: "targeting",
      title: "Targeting",
      width: 220,
      ...(checkOrderColumns("Targeting")),
      sortable: true,
      resizable: true,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("The keyword target or product targeting expression targeting customers.") },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex items-center gap-2 max-w-full overflow-hidden">
            <span
              id={"keyword-tracker-first-target-" + params?.node?.rowIndex}
              onClick={() => {
                setSelectedTargeting(row?.targeting);
                setSelectedMatchType(row?.matchType);
                setSelectedCampaignIds(row?.campaignIds || []);
                setDrawerOpen(true);
              }}
              className="cursor-pointer fw-bolder truncate"
              style={{ color: "#1976d2" }}
              title={row.targeting}
            >
              {row.targeting}
            </span>
            <TargetingTypeBadge
              matchType={row.matchType}
              targeting={row.targeting}
              keywordType={row.keywordType}
            />
          </div>
        );
      },
    },
    {
      headerName: t("Targeting Type"),
      field: "matchType",
      title: "Targeting Type",
      width: 180,
      ...(checkOrderColumns("Targeting Type")),
      sortable: true,
      resizable: true,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("Targeting match type: EXACT, PHRASE, BROAD, or TARGETING_EXPRESSION.") },
      exportFormatter: (val) => val ? `${val}`.toLowerCase() : "",
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex items-center h-full">
            <TargetingTypeBadge
              matchType={params.value || row?.matchType}
              targeting={row?.targeting}
              keywordType={row?.keywordType}
              full
            />
          </div>
        );
      },
    },
    {
      headerName: t("Campaign Count"),
      field: "campaignCount",
      title: "Campaign Count",
      width: 180,
      ...(checkOrderColumns("Campaign Count")),
      sortable: true,
      resizable: true,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("The number of campaigns using this target keyword.") },
    },
    {
      headerName: t("Product Count"),
      field: "productCount",
      title: "Product Count",
      width: 160,
      ...(checkOrderColumns("Product Count")),
      sortable: false,
      resizable: true,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("The number of products targeted by this keyword.") },
    },
    {
      headerName: t("Status"),
      field: "customStatus",
      title: "Status",
      width: 140,
      ...(checkOrderColumns("Status")),
      sortable: false,
      resizable: true,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("Current optimization status segment: Winner, Poor, or Neutral.") },
      exportFormatter: (val) => STATUS_UI[val]?.label || STATUS_UI.NEUTRAL.label,
      cellRenderer: (params) => <StatusBadge status={params.value} />,
    },
    {
      headerName: t("impressions"),
      field: "impressions",
      title: "Impressions",
      width: 160,
      ...(checkOrderColumns("Impressions")),
      sortable: true,
      resizable: true,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("The total number of times ads matching this keyword were shown to customers.") },
      cellRenderer: (params) => <>{params.value != 0 ? `${CurrencyFormat(params.value)}` : "—"}</>,
    },
    {
      headerName: t("clicks"),
      field: "clicks",
      title: "Clicks",
      width: 130,
      ...(checkOrderColumns("Clicks")),
      sortable: true,
      resizable: true,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("The number of times ads matching this keyword were clicked.") },
      cellRenderer: (params) => <>{params.value != 0 ? `${CurrencyFormat(params.value)}` : "—"}</>,
    },
    {
      headerName: t("spend"),
      field: "spend",
      title: "Spend",
      width: 130,
      ...(checkOrderColumns("Spend")),
      sortable: true,
      resizable: true,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("The total advertising cost incurred by clicks on these ads.") },
      cellRenderer: (params) => <>{params.value != 0 ? `${CurrencyCode(params.value)}` : "—"}</>,
    },
    {
      headerName: t("Orders"),
      field: "orders",
      title: "Orders",
      width: 130,
      ...(checkOrderColumns("Orders")),
      sortable: true,
      resizable: true,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("The number of completed shopping cart purchases generated from clicks on this keyword's ads.") },
      cellRenderer: (params) => <>{params.value != 0 ? `${CurrencyFormat(params.value)}` : "—"}</>,
    },
    {
      headerName: t("sales"),
      field: "sales",
      title: "Sales",
      width: 130,
      ...(checkOrderColumns("Sales")),
      sortable: true,
      resizable: true,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("The total revenue value generated from order sales matching this keyword.") },
      cellRenderer: (params) => <>{params.value != 0 ? `${CurrencyCode(params.value)}` : "—"}</>,
    },
    {
      headerName: t("acos"),
      field: "acos",
      title: "ACOS",
      width: 120,
      ...(checkOrderColumns("ACOS")),
      sortable: true,
      resizable: true,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("Advertising Cost of Sales: Ad Spend divided by Sales Revenue.") },
      exportFormatter: (val) => val ? `${val}%` : "—",
      cellRenderer: (params) => <>{params.value ? `${params.value}%` : "—"}</>,
    },
    {
      headerName: t("roas"),
      field: "roas",
      title: "ROAS",
      width: 120,
      ...(checkOrderColumns("ROAS")),
      sortable: true,
      resizable: true,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("Return on Ad Spend: Sales Revenue divided by Ad Spend.") },
      exportFormatter: (val) => val ? `${val}` : "—",
      cellRenderer: (params) => <>{params.value ? `${params.value}` : "—"}</>,
    },
  ], [t, visibleColumns, checkOrderColumns]);

  useEffect(() => {
    const fetchCustomColumns = async () => {
      const body = { pageName: "Keyword Tracker" };
      const response = await ApiListGetColumns(body);

      if (response?.isSuccess && response?.data && response?.data?.columns?.length) {
        const visible = (columns ?? [])
          .map(c => ({ ...c, ...response?.data?.columns.find(col => col.title === c.title) }))
          .filter(c => c?.isDisplay || !c?.title)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .filter(Boolean);

        setVisibleColumns(visible);
      } else {
        setVisibleColumns(columns);
      }
    };

    if (profileId?.value && selectedAdType) fetchCustomColumns();
  }, [profileId?.value, selectedAdType]);

  const handleSaveColumns = async (selectedColumns) => {
    const visible = (columns ?? [])
      .map(c => ({ ...c, ...selectedColumns.find(col => col.title === c.title) }))
      .filter(c => c?.isDisplay || !c?.title)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .filter(Boolean);

    setVisibleColumns(visible);
    setShowCustomizeModal(false);

    const body = {
      pageName: "Keyword Tracker",
      columns: selectedColumns,
    };
    const response = await ApiListUpdateColumns(body);
    if (response?.isSuccess && response?.data?.columns) {
      const updated = (columns ?? [])
        .map(c => ({ ...c, ...response?.data?.columns.find(col => col.title === c.title) }))
        .filter(c => c?.isDisplay || !c?.title)
        .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
        .filter(Boolean);

      setVisibleColumns(updated);
    }
  };

  useEffect(() => {
    lastFetchParamsRef.current = "";
    lastAutoSearchProfileRef.current = null;
    lastFilterProfileRef.current = null;
  }, [profileId?.value, masterTab]);

  useEffect(() => {
    if (isFilterReady && masterTab === "KEYWORDS") {
      LifetimeTrackerList(arg);
    }
  }, [isFilterReady, masterTab, selectedAdType, customStatus, date, targetingTabFilter, status, type, gridFilter, appliedFilters, debouncedSearchName]);

  const handlePageChange = (page) => {
    setArg({ pageNo: page, perPage: perPage })
    LifetimeTrackerList({ pageNo: page, perPage: perPage });
  };

  const handlePerRowsChange = (newPerPage) => {
    setPerPage(newPerPage);
    setArg({ pageNo: 1, perPage: newPerPage });
    LifetimeTrackerList({ pageNo: 1, perPage: newPerPage });
  };

  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    LifetimeTrackerList({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), ...arg });
  };

  const LifetimeTrackerList = async (arg) => {
    if (masterTab !== "KEYWORDS") return;
    if (profileId?.value && selectedAdType && date?.length) {
      const isReload = !!arg?.skipLoader || !!arg?.isReload;

      const campaignStatusFilter = appliedFilters.find(filter => filter.type === "CampaignActiveStatus");
      const campaignStatus = campaignStatusFilter ? campaignStatusFilter.value : "";
      const targetingStatusFilter = appliedFilters.find(filter => filter.type === "TargetActiveStatus");
      const targetingStatus = targetingStatusFilter ? targetingStatusFilter.value : "";
      const targetingTypeFilter = appliedFilters.find(filter => filter.type === "TargetingType");
      const targetingType = targetingTypeFilter ? targetingTypeFilter.value : [];
      const campaignsAndAdGroupsFilter = appliedFilters.find(filter => filter.type === "CampaignsAndAdGroups");
      const campaignIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => item.adGroups).map(campaign => campaign.id) : [];
      const adGroupIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => !item.adGroups).map(adGroup => adGroup.id) : [];

      const fromDateStr = moment(date?.[0]).format("YYYY-MM-DD");
      const toDateStr = moment(date?.[1]).format("YYYY-MM-DD");
      const searchNameVal = arg?.hasOwnProperty("searchName") ? arg.searchName : debouncedSearchName;
      const pageNoVal = arg?.pageNo ?? (arg?.pageNo || 1);
      const perPageVal = arg?.perPage ?? perPage;

      const requestSignature = JSON.stringify({
        profileId: profileId.value,
        selectedAdType,
        fromDate: fromDateStr,
        toDate: toDateStr,
        customStatus: customStatus || "",
        searchName: searchNameVal,
        targetingTabFilter: TABS?.find((tab) => tab?.label === targetingTabFilter)?.query || {},
        campaignId: campaignIds,
        adGroupId: adGroupIds,
        campaignStatus,
        targetingStatus,
        targetingType,
        appliedFilters: (appliedFilters || []).map(f => f.id || f.displayText || f.type),
        pageNo: pageNoVal,
        perPage: perPageVal,
        sortType: arg?.sortType || "DESC",
        fieldName: arg?.fieldName || "sales"
      });

      if (!isReload && lastFetchParamsRef.current === requestSignature) {
        return;
      }

      lastFetchParamsRef.current = requestSignature;
      setCampaignsLoading(true);

      const data = {
        profileId: profileId.value,
        fromDate: fromDateStr,
        toDate: toDateStr,
        customStatus,
        searchName: searchNameVal,
        targetingTabFilter: TABS?.find((tab) => tab?.label === targetingTabFilter)?.query,

        appliedFilters,
        campaignStatus: campaignStatus,
        targetingStatus: targetingStatus,
        targetingType: targetingType,
        campaignId: campaignIds,
        adGroupId: adGroupIds,

        fieldName: "sales",
        sortType: "DESC",
        ...arg
      };

      data.query = addTargetingQuery(data)
      delete data.appliedFilters

      try {
        const e = await ApiLifeTimeMatrixListing(data);
        if (e?.isSuccess) {
          setTableData(e?.getTargeting);
          setLifetimeTrackerData(e);
        } else {
          Toast.error(e?.message);
        }
      } catch (e) {
        lastFetchParamsRef.current = "";
        Toast.error(t("Something went wrong"));
      } finally {
        setCampaignsLoading(false);
      }
    }
  };

  const exportExcel = async () => {
    if (profileId.value && selectedAdType && date?.length) {
      dispatch(handleLoader(true));
      try {
        const campaignStatusFilter = appliedFilters.find(filter => filter.type === "CampaignActiveStatus");
        const campaignStatus = campaignStatusFilter ? campaignStatusFilter.value : "";
        const targetingStatusFilter = appliedFilters.find(filter => filter.type === "TargetActiveStatus");
        const targetingStatus = targetingStatusFilter ? targetingStatusFilter.value : "";
        const targetingTypeFilter = appliedFilters.find(filter => filter.type === "TargetingType");
        const targetingType = targetingTypeFilter ? targetingTypeFilter.value : [];
        const campaignsAndAdGroupsFilter = appliedFilters.find(filter => filter.type === "CampaignsAndAdGroups");
        const campaignIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => item.adGroups).map(campaign => campaign.id) : [];
        const adGroupIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => !item.adGroups).map(adGroup => adGroup.id) : [];

        const data = {
          profileId: profileId.value,
          fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
          toDate: moment(date?.[1]).format("YYYY-MM-DD"),
          customStatus,
          searchName,
          targetingTabFilter: TABS?.find((tab) => tab?.label === targetingTabFilter)?.query,
          appliedFilters,
          campaignStatus,
          targetingStatus,
          targetingType,
          campaignId: campaignIds,
          adGroupId: adGroupIds,
          fieldName: "sales",
          sortType: "DESC",
          ...arg,
          pageNo: 1,
          perPage: 100000
        };

        data.query = addTargetingQuery(data);
        delete data.appliedFilters;

        const res = await ApiLifeTimeMatrixListing(data);
        if (res?.isSuccess) {
          const allData = res.getTargeting || [];
          exportGridToExcel(allData, columns, "keyword_tracker_export.xlsx");
        } else {
          Toast.error(res?.message || "Failed to fetch data for export");
        }
      } catch (e) {
        console.error(e);
        Toast.error(t("Something went wrong during export"));
      } finally {
        dispatch(handleLoader(false));
      }
    }
  };

  const handleSearch = (e) => {
    setSearchName(e.target.value);
  };

  const refreshGrid = () => {
    LifetimeTrackerList({ ...arg, isReload: true, skipLoader: true });
  };



  // Helper function to format targeting types display text
  const formatTargetingTypesText = (targetingTypes) => {
    if (!targetingTypes || !Array.isArray(targetingTypes) || targetingTypes.length === 0) return "";

    // Map values to labels
    const typeLabels = targetingTypes.map(type => {
      const option = TARGETING_TYPE_OPTIONS.find(opt => opt.value === type);
      return option ? t(option.label) : type;
    });

    // Format with proper grammar
    if (typeLabels.length === 1) return typeLabels[0];
    else if (typeLabels.length === 2) return `${typeLabels[0]} and ${typeLabels[1]}`;
    else return `${typeLabels.join(", ")}, and ${typeLabels.pop()}`;
  };

  // Load campaigns data on component mount for better UX
  useEffect(() => {
    if (profileId?.value && selectedAdType) {
      getFilter();
      getCampaignsData();
    }
  }, [profileId?.value]);

  // Process pending campaign selections when campaigns data is loaded
  useEffect(() => {
    if (pendingCampaignSelections && campaignsData.length > 0) {
      const { campaignsAndAdGroups, filterId, currentFilters } = pendingCampaignSelections;
      // Process the pending selections
      const updatedFilters = [...currentFilters];
      processCampaignSelections(campaignsAndAdGroups, filterId, updatedFilters);

      // Remove any duplicate filters before setting applied filters
      const uniqueFilters = updatedFilters.filter((filter, index, self) => index === self.findIndex(f => f.type === filter.type && f.condition === filter.condition && f.value === filter.value && f.apiFieldName === filter.apiFieldName));

      // Update applied filters with the processed campaign selections
      setAppliedFilters(uniqueFilters);
      setPendingCampaignSelections(null);
    }
  }, [campaignsData, pendingCampaignSelections]);

  const getFilter = async () => {
    if (!profileId?.value || !selectedAdType) return;
    if (lastFilterProfileRef.current === profileId.value) return;
    if (filterPromiseRef.current) return filterPromiseRef.current;

    lastFilterProfileRef.current = profileId.value;
    const data = { profileId: profileId.value, pageName: "Keyword Tracker" };
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
  }

  const getCampaignsData = async (searchName = "") => {
    if (!profileId?.value || !selectedAdType) return;
    if (!searchName && lastAutoSearchProfileRef.current === profileId.value) return;
    if (!searchName && autoSearchPromiseRef.current) return autoSearchPromiseRef.current;

    if (!searchName) lastAutoSearchProfileRef.current = profileId.value;
    setCampaignsLoading(true);
    const data = { profileId: profileId.value, searchName: searchName };
    const promise = ApiGetCampaignAndAdGroupAutoSearch(data)
      .then((response) => {
        if (response?.isSuccess && response?.result) {
          const campaignsMap = new Map();

          response.result.forEach(item => {
            const campaignId = item.campaignId;
            const adGroupId = item.adGroupId;

            if (!campaignsMap.has(campaignId)) {
              campaignsMap.set(campaignId, { id: campaignId, name: item.campaign, adGroups: [] });
            }

            campaignsMap.get(campaignId).adGroups.push({ id: adGroupId, name: item.adGroup, campaignId: campaignId, campaignName: item.campaign });
          });

          const campaignsArray = Array.from(campaignsMap.values());
          setCampaignsData(campaignsArray);
        } else {
          setCampaignsData([]);
        }
      })
      .catch((error) => {
        console.error("Error fetching campaigns data:", error);
        setCampaignsData([]);
      })
      .finally(() => {
        setCampaignsLoading(false);
        if (!searchName) autoSearchPromiseRef.current = null;
      });

    if (!searchName) autoSearchPromiseRef.current = promise;
    return promise;
  }

  const handleGridFilter = (event) => {
    const selectedValue = event.target.value;

    // Check if it's a saved filter (custom filter with _id)
    const selectedSavedFilter = filter.find(f => f._id === selectedValue);
    if (selectedSavedFilter) {
      if (!selectedSavedFilter.isDefault && selectedSavedFilter.query) handleSavedFilterSelection(selectedSavedFilter);
      else setGridFilter(selectedValue);
      return;
    }

    // Check if the selected value is one of the modal filter options
    const selectedOption = filterOptions.find(option => option.value === selectedValue);
    if (selectedOption) {
      handleFilterOptionClick(selectedOption);
      // Don't set gridFilter for modal options, just open modal
      return;
    }

    // For non-modal options, set the grid filter normally
    setGridFilter(selectedValue);
  }

  // Helper function to process campaign selections
  const processCampaignSelections = (campaignsAndAdGroups, filterId, filtersArray) => {
    const selectedCampaignObjects = [];
    const selectedAdGroupObjects = [];

    // Find campaigns and ad groups from the data
    campaignsData.forEach(campaign => {
      if (campaignsAndAdGroups.includes(campaign.id)) {
        selectedCampaignObjects.push(campaign);
      } else {
        // Check if any ad groups from this campaign are selected
        campaign.adGroups.forEach(adGroup => {
          if (campaignsAndAdGroups.includes(adGroup.id)) selectedAdGroupObjects.push(adGroup);
        });
      }
    });

    setSelectedCampaigns(selectedCampaignObjects);
    setSelectedAdGroups(selectedAdGroupObjects);

    const totalSelections = selectedCampaignObjects.length + selectedAdGroupObjects.length;
    const campaignsFilter = {
      id: `saved-${filterId}-CampaignsAndAdGroups`,
      type: "CampaignsAndAdGroups",
      label: "Campaigns and ad groups",
      value: [...selectedCampaignObjects, ...selectedAdGroupObjects],
      displayText: `Campaigns & Ad Groups: ${totalSelections} selected`,
      savedFilterId: filterId
    };
    filtersArray.push(campaignsFilter);
  };

  // Handle saved filter selection
  const handleSavedFilterSelection = (savedFilter) => {
    try {
      const queryObj = JSON.parse(savedFilter.query);
      // Parse and apply filters based on query structure
      const newFilters = [];
      // Define conditional fields for filter processing
      const conditionalFields = ['budget', 'Impressions', 'Spend'];

      if (queryObj.campaignStatus) {
        const campaignValue = (Boolean(queryObj?.campaignStatus?.$eq) ? queryObj?.campaignStatus?.$eq : (queryObj?.campaignStatus?.$ne && "NOT_ARCHIVED")) ?? ""
        const typeFilter = {
          id: `saved-${savedFilter._id}-type`,
          type: "CampaignActiveStatus",
          label: "Campaign active status",
          value: campaignValue,
          displayText: `Campaign Status: ${campaignValue}`,
          savedFilterId: savedFilter._id
        };
        newFilters.push(typeFilter);
      }

      // Handle matchType (maps to type state)
      if (queryObj.matchType) {
        setType(queryObj.matchType);
        const typeFilter = {
          id: `saved-${savedFilter._id}-type`,
          type: "type",
          label: "Type",
          value: queryObj.matchType,
          displayText: `Type: ${queryObj.matchType}`,
          savedFilterId: savedFilter._id
        };
        newFilters.push(typeFilter);
      }

      // Handle status
      if (queryObj.status) {
        const statusValue = (Boolean(queryObj?.status?.$eq) ? queryObj?.status?.$eq : (queryObj?.status?.$ne && "NOT_ARCHIVED")) ?? ""
        setSelectedTargetStatus(statusValue);

        const statusFilter = {
          id: `saved-${savedFilter._id}-targetStatus`,
          type: "TargetActiveStatus",
          label: "Target active status",
          value: statusValue,
          displayText: `Target Status: ${statusValue}`,
          savedFilterId: savedFilter._id
        };
        newFilters.push(statusFilter);
      }

      // Handle targetingTypes
      if (queryObj?.keywordType?.$in && Array.isArray(queryObj?.keywordType?.$in)) {
        const isTabFilter = TABS?.find((tab) => isEqual(tab?.query?.keywordType?.$in ?? [], queryObj?.keywordType?.$in))
        if (isTabFilter) {
          setTargetingTabFilter(isTabFilter?.label)
        } else {
          // Set the selected targeting types so checkboxes are pre-selected when modal opens
          setSelectedTargetingTypes(queryObj?.keywordType?.$in);

          const targetingFilter = {
            id: `saved-${savedFilter._id}-targetingTypes`,
            type: "TargetingType",
            label: "Targeting type",
            value: queryObj?.keywordType?.$in,
            displayText: `Targeting Types: ${formatTargetingTypesText(queryObj?.keywordType?.$in)}`,
            savedFilterId: savedFilter._id
          };
          newFilters.push(targetingFilter);
        }
      }

      if (queryObj?.keywordType?.$nin && Array.isArray(queryObj?.keywordType?.$nin)) {
        const isTabFilter = TABS?.find((tab) => isEqual(tab?.query?.keywordType?.$nin ?? [], queryObj?.keywordType?.$nin))
        if (isTabFilter) {
          setTargetingTabFilter(isTabFilter?.label)
        }
      }

      // if (!queryObj?.keywordType?.$in && !queryObj?.keywordType?.$nin && targetingTabFilter !== "all") setTargetingTabFilter("all")

      // Handle targetStatus
      if (queryObj.targetStatus) {
        setSelectedTargetStatus(queryObj.targetStatus);

        const targetStatusFilter = {
          id: `saved-${savedFilter._id}-targetStatus`,
          type: "TargetActiveStatus",
          label: "Target active status",
          value: queryObj.targetStatus,
          displayText: `Target Status: ${queryObj.targetStatus}`,
          savedFilterId: savedFilter._id
        };
        newFilters.push(targetStatusFilter);
      }

      // Handle campaignsAndAdGroups
      if (queryObj.campaignsAndAdGroups && Array.isArray(queryObj.campaignsAndAdGroups)) {
        // If campaigns data is not loaded, set up pending selections
        if (campaignsData.length === 0) {
          // Load campaigns data first
          getCampaignsData();
          // Store pending selections for later processing
          setPendingCampaignSelections({
            campaignsAndAdGroups: queryObj.campaignsAndAdGroups,
            filterId: savedFilter._id,
            currentFilters: newFilters
          });
        } else {
          // Process selections immediately if data is already available
          processCampaignSelections(queryObj.campaignsAndAdGroups, savedFilter._id, newFilters);
        }
      }

      // Handle conditional filters (budget, impressions, spend) - track processed fields to avoid duplication
      const processedConditionalFields = new Set();
      conditionalFields.forEach(field => {
        if (queryObj[field] && typeof queryObj[field] === 'object') {
          processedConditionalFields.add(field);
          const condition = Object.keys(queryObj[field])[0];
          const value = queryObj[field][condition];

          // Map field names to state variables
          const fieldMap = { budget: 'campaignBudgetAmount', Impressions: 'Impressions', Spend: 'Spend' };
          const apiFieldName = fieldMap[field] || field;

          const filterOption = filterOptions.find(opt => opt.value === field);
          if (filterOption) {
            // Get the proper label for the condition
            const conditionOption = CONDITION_OPTIONS.find(opt => opt.value === condition);
            const conditionLabel = conditionOption ? t(conditionOption.labelKey) : condition;

            const conditionalFilter = {
              id: `saved-${savedFilter._id}-${field}`,
              type: field,
              label: filterOption.labelKey,
              condition: condition,
              value: value,
              apiFieldName: apiFieldName,
              displayText: `${t(filterOption.labelKey)}: ${conditionLabel} ${value}`,
              savedFilterId: savedFilter._id
            };
            newFilters.push(conditionalFilter);
          }
        }
      });

      // Handle other filter conditions that don't have direct state mappings
      Object.keys(queryObj).forEach(key => {
        // Skip fields that were already processed in conditional fields and other excluded fields
        if (!['matchType', 'status', 'targetingTypes', 'targetStatus', 'CampaignsAndAdGroups', 'budget'].includes(key) && !processedConditionalFields.has(key)) {
          if (typeof queryObj[key] === 'object' && queryObj[key] !== null) {
            const condition = Object.keys(queryObj[key])[0];
            const value = queryObj[key][condition];

            // Map API field names back to filter option values
            const reverseFieldMap = {
              "impressions": "Impressions",
              "clicks": "Clicks",
              "orders": "Orders",
              "sales": "Sales",
              "roas": "ROAS",
              "acos": "ACOS",
              "spend": "Spend",
              "keywordBid": "Bid"
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

      // Set all state variables first
      if (queryObj.matchType) setType(queryObj.matchType);
      if (queryObj.status) setStatus(queryObj.status);
      if (queryObj.targetingTypes && Array.isArray(queryObj.targetingTypes)) setSelectedTargetingTypes(queryObj.targetingTypes);
      if (queryObj.targetStatus) setSelectedTargetStatus(queryObj.targetStatus);
      if (queryObj.campaignsAndAdGroups && Array.isArray(queryObj.campaignsAndAdGroups)) {
        // Reset selections first
        setSelectedCampaigns([]);
        setSelectedAdGroups([]);

        // Then set the new selections
        const selectedCampaignObjects = [];
        const selectedAdGroupObjects = [];

        campaignsData.forEach(campaign => {
          if (queryObj.campaignsAndAdGroups.includes(campaign.id)) {
            selectedCampaignObjects.push(campaign);
          } else {
            campaign.adGroups.forEach(adGroup => {
              if (queryObj.campaignsAndAdGroups.includes(adGroup.id)) selectedAdGroupObjects.push(adGroup);
            });
          }
        });

        setSelectedCampaigns(selectedCampaignObjects);
        setSelectedAdGroups(selectedAdGroupObjects);
      }

      // Handle conditional filters (skip if already processed above)
      conditionalFields.forEach(field => {
        if (queryObj[field] && typeof queryObj[field] === 'object' && !processedConditionalFields.has(field)) {
          processedConditionalFields.add(field);
          const condition = Object.keys(queryObj[field])[0];
          const value = queryObj[field][condition];

          const fieldMap = { budget: 'campaignBudgetAmount', Impressions: 'Impressions', Spend: 'Spend' };
          const apiFieldName = fieldMap[field] || field;

          const filterOption = filterOptions.find(opt => opt.value === field);
          if (filterOption) {
            // Get the proper label for the condition
            const conditionOption = CONDITION_OPTIONS.find(opt => opt.value === condition);
            const conditionLabel = conditionOption ? t(conditionOption.labelKey) : condition;

            const conditionalFilter = {
              id: `saved-${savedFilter._id}-${field}`,
              type: field,
              label: filterOption.labelKey,
              condition: condition,
              value: value,
              apiFieldName: apiFieldName,
              displayText: `${t(filterOption.labelKey)}: ${conditionLabel} ${value}`
            };
            newFilters.push(conditionalFilter);
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

  // Handle delete filter click
  const handleDeleteFilterClick = (filter) => {
    setFilterToDelete(filter);
    setShowDeleteFilterModal(true);
  };

  // Handle filter option click
  const handleFilterOptionClick = (option) => {

    // Check if there's an existing applied filter for this option and pre-populate
    const existingFilter = appliedFilters.find(filter => filter.type === option.value);

    setSelectedFilterOption(option);

    if (option.value === "TargetingType") {
      setSelectedTargetingTypes(existingFilter ? existingFilter.value : []);
    } else if (option.value === "CampaignActiveStatus") {
      setSelectedCampaignStatus(existingFilter ? existingFilter.value : "");
    } else if (option.value === "TargetActiveStatus") {
      setSelectedTargetStatus(existingFilter ? existingFilter.value : "");
    } else if (option.value === "CampaignsAndAdGroups") {
      // Campaigns data is already loaded on page load
      if (existingFilter) {
        // Pre-select campaigns and ad groups based on existing filter
        const existingSelections = existingFilter.value || [];
        // Separate campaigns and ad groups from existing selections
        const preSelectedCampaigns = [];
        const preSelectedAdGroups = [];

        existingSelections.forEach(selection => {
          // Check if this is a campaign (has adGroups property)
          if (selection.adGroups && Array.isArray(selection.adGroups)) {
            // This is a campaign object
            const campaign = campaignsData.find(c => c.id === selection.id);
            if (campaign) preSelectedCampaigns.push(campaign);
          } else {
            // This is an ad group object
            const adGroup = campaignsData.flatMap(c => c.adGroups).find(ag => ag.id === selection.id);
            if (adGroup) preSelectedAdGroups.push(adGroup);
          }
        });

        setSelectedCampaigns(preSelectedCampaigns);
        setSelectedAdGroups(preSelectedAdGroups);
      } else {
        // No existing filter, start with empty selections
        setSelectedCampaigns([]);
        setSelectedAdGroups([]);
      }
    } else {
      // For regular filters (impressions, clicks, etc.)
      setSelectedCondition(existingFilter ? existingFilter.condition : "$eq");
      setFilterValue(existingFilter ? existingFilter.value : "");
    }

    setShowFilterModal(true);
  };

  // Handle modal close
  const handleModalClose = () => {
    setShowFilterModal(false);
    setSelectedFilterOption(null);
    setSelectedCondition("$eq");
    setFilterValue("");
    setSelectedTargetingTypes([]);
    setSelectedCampaignStatus("");
    setSelectedTargetStatus("");
    setSelectedCampaigns([]);
    setSelectedAdGroups([]);
  };

  // Handle remove single filter
  const handleRemoveSingleFilter = (filterId) => setAppliedFilters(prev => prev.filter(filter => filter.id !== filterId));

  return (
    <>
      <Filter
        name={"Keyword Tracker"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="campaign-tracking-container">
        <div className="middle_container">
          {/* Fluid Translucent Header matching Campaign.js */}
          <div
            className={`glass-sticky-header ${!isMobile ? "sticky-top" : ""}`}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              columnGap: 12,
              rowGap: 10,
              padding: isMobile ? "10px 16px" : "10px 30px",
              zIndex: 90,
              top: 0,
              marginLeft: 0,
              marginRight: 0,
              marginTop: "-10px",
              marginBottom: "20px",
            }}
          >
            {/* ROW 1: Filter By + Status Select */}
            {masterTab === "KEYWORDS" && (
              <div id="keyword-tracker-filters" className="flex-1 sm:flex-none min-w-[280px]" style={{ display: "flex", gap: 12 }}>
                {/* Filter By */}
                <div style={{ flex: isMobile ? 1 : "initial" }}>
                  <Popover>
                    <PopoverTrigger asChild>
                      <ShadcnButton
                        variant="outline"
                        id="bulk-actions-dropdown"
                        className="w-full justify-between active m-0 font-medium h-[40px] px-4 bg-white dark:bg-transparent dark:border-white/10 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
                        style={{ width: "100%", height: "40px" }}
                      >
                        <span className="truncate mr-2">
                          {gridFilter ? (filter.find(f => f._id === gridFilter)?.name || t("Filter By")) : (t("Filter By"))}
                        </span>
                        <ExpandMoreIcon className="text-gray-500" fontSize="small" />
                      </ShadcnButton>
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
                              <ShadcnButton variant="ghost" className="delete-button flex-shrink-0 ml-2 p-1 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-md transition-colors h-auto w-auto" onClick={(e) => { e.stopPropagation(); handleDeleteFilterClick(f); }} title={t("Delete filter")}>
                                <CloseIcon style={{ fontSize: 14, color: "#ef4444" }} />
                              </ShadcnButton>
                            </div>
                          ))}
                          <hr className="my-1.5 border-slate-100 dark:border-slate-800" />
                        </>
                      )}
                      <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t("Filter Options")}</div>
                      <div className="space-y-0.5">
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

                {/* Status Select formatted like Campaign.js profitFilter */}
                <div style={{ flex: isMobile ? 1 : "initial" }}>
                  <Popover>
                    <PopoverTrigger asChild>
                      <ShadcnButton
                        variant="outline"
                        id="status-dropdown"
                        className="w-full justify-between active m-0 font-medium h-[40px] px-4 bg-white dark:bg-transparent dark:border-white/10 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
                        style={{ width: "100%", height: "40px" }}
                      >
                        <span className="truncate mr-2">
                          {customStatus === "" || customStatus === undefined || customStatus === null ? t("all") :
                            customStatus === "WINNER" ? t("Winner") :
                              customStatus === "POOR" ? t("Poor") :
                                customStatus === "NEUTRAL" ? t("Neutral") : t("all")}
                        </span>
                        <ExpandMoreIcon className="text-gray-500" fontSize="small" />
                      </ShadcnButton>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-40 z-[9999] max-h-[500px] overflow-y-auto bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-gray-200">
                      <div className="flex cursor-pointer items-center rounded-sm px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium mr-1" onClick={() => setCustomStatus("")}>{t("all")}</div>
                      <div className="flex cursor-pointer items-center rounded-sm px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium mr-1" onClick={() => setCustomStatus("WINNER")}>{t("Winner")}</div>
                      <div className="flex cursor-pointer items-center rounded-sm px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium mr-1" onClick={() => setCustomStatus("POOR")}>{t("Poor")}</div>
                      <div className="flex cursor-pointer items-center rounded-sm px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium mr-1" onClick={() => setCustomStatus("NEUTRAL")}>{t("Neutral")}</div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {masterTab === "KEYWORD_SUGGESTIONS" && (
              <div className="flex flex-1 sm:flex-none min-w-[200px]" style={{ gap: 12 }}>
                {/* Filter By */}
                <div style={{ flex: isMobile ? 1 : "initial" }}>
                  <Popover>
                    <PopoverTrigger asChild>
                      <ShadcnButton
                        variant="outline"
                        id="suggestion-filter-dropdown"
                        className="w-full h-10 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium justify-between"
                      >
                        {t("Filter By")}
                        <i className="fa fa-chevron-down ml-2 text-[10px] opacity-50" />
                      </ShadcnButton>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[240px] p-2 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl z-[9999]">
                      <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        {t("Filter Options")}
                      </div>
                      <div className="space-y-0.5">
                        {[
                          { label: t("Campaigns"), value: "Campaign" },
                          { label: t("Campaign Type"), value: "Campaign Type" },
                          { label: t("Ad Groups"), value: "Ad Group" },
                          { label: t("Suggested Keyword"), value: "Suggested Keyword" },
                          { label: t("Keyword Exists In Account"), value: "Keyword Exists" },
                          { label: t("Source Keyword"), value: "Source Keyword" }
                        ].map((item) => (
                          <div
                            key={item.value}
                            className="flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                            onClick={() => {
                              const activeRef = suggestionTab === "MANUAL" ? manualSuggestionRef : autoSuggestionRef;
                              activeRef.current?.handleGridFilter({ target: { value: item.value } });
                            }}
                          >
                            <span>{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {/* ROW 2: Date Picker */}
            <div id="keyword-tracker-date-picker" className="flex-1 sm:flex-none min-w-[260px] sm:ml-auto">
              <DateRangePicker
                className="w-full"
                style={{ width: "100%", height: "40px" }}
                ranges={predefinedRanges}
                value={date}
                placeholder={t("Select Date")}
                onChange={handleDateChange}
                placement={isMobile ? "bottomStart" : "bottomEnd"}
                format="yyyy-MM-dd"
                cleanable={false}
              />
            </div>

            {/* ROW 3: Reload Button */}
            <div className="flex flex-none">
              <AppTooltip text={t("Refresh")}>
                <ShadcnButton
                  id="keyword-tracker-refresh-button"
                  className="btn border h-10 px-3 bg-white dark:bg-[#1e293b]"
                  onClick={refreshGrid}
                >
                  <RefreshIcon style={{ fontSize: 18 }} />
                </ShadcnButton>
              </AppTooltip>
            </div>
          </div>
          <div className="glass-grid-container overflow-hidden">
            {/* Folder-style Tab Selector */}
            <div
              className="flex justify-start overflow-x-auto custom-scrollbar"
              style={{
                gap: "6px",
                marginBottom: "-1px",
                position: "relative",
                zIndex: 2,
                background: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.3)",
                backdropFilter: "blur(20px) saturate(120%)",
                WebkitBackdropFilter: "blur(20px) saturate(120%)",
                borderRadius: "16px 16px 0 0",
                borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(2, 70, 139, 0.08)",
                padding: isMobile ? "12px 12px 0 12px" : "16px 24px 0 24px",
              }}
            >
              {[
                {
                  key: "KEYWORDS",
                  label: t("Keywords Tracker"),
                  icon: <TrackChangesOutlinedIcon style={{ fontSize: 16 }} />,
                },
                {
                  key: "KEYWORD_SUGGESTIONS",
                  label: t("Keyword Suggestions"),
                  icon: <LightbulbOutlinedIcon style={{ fontSize: 16 }} />,
                },
              ].map((tab) => {
                const isActive = masterTab === tab.key;
                const isHovered = hoveredTab === tab.key;

                return (
                  <ShadcnButton
                    key={tab.key}
                    id={`keyword-tracker-tab-${tab.key}`}
                    variant="ghost"
                    className="shadow-none border-0 hover:bg-transparent flex-shrink-0"
                    onClick={() => setMasterTab(tab.key)}
                    onMouseEnter={() => setHoveredTab(tab.key)}
                    onMouseLeave={() => setHoveredTab(null)}
                    style={{
                      position: "relative",
                      padding: isMobile ? "8px 24px 8px 16px" : "10px 42px 10px 22px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      outline: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.2s ease",
                      minHeight: isMobile ? "36px" : "42px",
                    }}
                  >
                    <svg
                      viewBox="0 0 180 40"
                      preserveAspectRatio="none"
                      style={{
                        position: "absolute",
                        top: "1px",
                        left: "1px",
                        width: "calc(100% - 2px)",
                        height: "calc(100% - 1px)",
                        zIndex: 0,
                        pointerEvents: "none",
                        overflow: "visible",
                      }}
                    >
                      <defs>
                        <linearGradient id={`tabGrad-${tab.key}`} x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#1A9FD4" />
                          <stop offset="100%" stopColor="#2374F2" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M 0,40 L 0,8 A 8,8 0 0 1 8,0 L 145,0 Q 153,0 160,10 L 180,40 Z"
                        fill={isActive ? `url(#tabGrad-${tab.key})` : isHovered ? (isDark ? "rgba(255, 255, 255, 0.12)" : "#e2e8f0") : (isDark ? "rgba(255, 255, 255, 0.05)" : "#eaeef5")}
                        stroke={isActive ? "#1A9FD4" : (isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(2, 70, 139, 0.15)")}
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        color: isActive ? "#ffffff" : isHovered ? (isDark ? "#2374F2" : "#1A9FD4") : (isDark ? "rgba(255, 255, 255, 0.6)" : "#475569"),
                        position: "relative",
                        zIndex: 1,
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: "600",
                        fontSize: "14px",
                        transition: "color 0.2s ease",
                      }}
                    >
                      <span style={{ display: "inline-flex" }}>{tab.icon}</span>
                      <span>{t(tab.label)}</span>
                    </div>
                  </ShadcnButton>
                );
              })}
            </div>

            {masterTab === "KEYWORD_SUGGESTIONS" ? (
              <div className="data_content data_content_btn m-0" style={{ padding: 0, border: "none", boxShadow: "none", margin: 0 }}>
                <div className="overflow-hidden">
                  <div
                    className="data_model_btn camapgin_btn"
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 16,
                      padding: isMobile ? "12px 16px" : "12px 24px",
                    }}
                  >
                    <div className="flex items-center flex-wrap" style={{ gap: 16 }}>
                      <h5 className="m-0 font-bold">{t("Keyword Suggestions")}</h5>
                    </div>

                    <div className="flex items-center" style={{ gap: 12 }}>
                      {PermissionCheck(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.VIEW_ONLY) && (
                        <ShadcnButton
                          variant="outline"
                          onClick={() => {
                            if (suggestionTab === "MANUAL" && manualSuggestionRef.current) {
                              manualSuggestionRef.current.exportExcel();
                            } else if (suggestionTab === "AUTO" && autoSuggestionRef.current) {
                              autoSuggestionRef.current.exportExcel();
                            }
                          }}
                          className="m-0 h-9 bg-white dark:bg-[#1e293b]"
                          title={t("Export to Excel")}
                        >
                          {t("Export")}
                        </ShadcnButton>
                      )}
                    </div>
                  </div>

                  <div className="or-container-header" style={{ justifyContent: "flex-start" }}>
                    {/* Sub tabs styled as sliding switcher inside the header */}
                    <div id="keyword-suggestion-sub-tabs" className="or-tab-switcher" style={{ minWidth: "420px" }}>
                      <div className="or-tab-switcher__track" style={{ display: "flex", alignItems: "center", position: "relative", borderRadius: "6px", padding: "3px", width: "100%" }}>
                        <div
                          className="or-tab-switcher__indicator"
                          style={{
                            position: "absolute",
                            top: "4px",
                            bottom: "3px",
                            borderRadius: "4px",
                            width: "calc(50% - 5px)",
                            transform: suggestionTab === "MANUAL" ? "translateX(0)" : "translateX(100.5%)",
                            background: "linear-gradient(135deg, #1A9FD4 0%, #1a5da8 50%, #2374F2 100%)",
                            transition: "transform 0.3s ease",
                          }}
                        />
                        <ShadcnButton
                          variant="ghost"
                          className={`or-tab-switcher__btn ${suggestionTab === "MANUAL" ? "or-tab-switcher__btn--active text-white hover:text-white" : "text-slate-600 dark:text-slate-300 hover:text-[#1A9FD4] dark:hover:text-[#1A9FD4] hover:bg-transparent"}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "4px",
                            padding: "6px 16px",
                            fontSize: "12px",
                            fontWeight: 600,
                            flex: "1 1 0px",
                            height: "28px",
                            position: "relative",
                            zIndex: 1,
                            background: "transparent",
                            border: "none",
                            transition: "color 0.2s ease",
                            outline: "none",
                            whiteSpace: "nowrap"
                          }}
                          onClick={() => setSuggestionTab("MANUAL")}
                        >
                          {t("From Manual Campaign")}
                        </ShadcnButton>
                        <ShadcnButton
                          variant="ghost"
                          className={`or-tab-switcher__btn ${suggestionTab === "AUTO" ? "or-tab-switcher__btn--active text-white hover:text-white" : "text-slate-600 dark:text-slate-300 hover:text-[#1A9FD4] dark:hover:text-[#1A9FD4] hover:bg-transparent"}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "4px",
                            padding: "6px 16px",
                            fontSize: "12px",
                            fontWeight: 600,
                            flex: "1 1 0px",
                            height: "28px",
                            position: "relative",
                            zIndex: 1,
                            background: "transparent",
                            border: "none",
                            transition: "color 0.2s ease",
                            outline: "none",
                            whiteSpace: "nowrap"
                          }}
                          onClick={() => setSuggestionTab("AUTO")}
                        >
                          {t("From Auto Campaign")}
                        </ShadcnButton>
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: "0 14px 14px 14px" }}>
                    <div style={{ display: suggestionTab === "MANUAL" ? "block" : "none" }}>
                      <SuggestionTable tabType="MANUAL" isActive={suggestionTab === "MANUAL"} ref={manualSuggestionRef} />
                    </div>
                    <div style={{ display: suggestionTab === "AUTO" ? "block" : "none" }}>
                      <SuggestionTable tabType="AUTO" isActive={suggestionTab === "AUTO"} ref={autoSuggestionRef} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden">
                <div
                  className="data_model_btn camapgin_btn"
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 16,
                    padding: isMobile ? "12px 12px" : "12px 24px",
                  }}
                >
                  <div className="flex items-center flex-wrap" style={{ gap: 16 }}>
                    <h5 className="m-0 font-bold">{t("Keyword Tracker")}</h5>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap" style={{ flex: isMobile ? "1 1 100%" : "0 0 auto", width: isMobile ? "100%" : "auto" }}>
                    <div
                      className="or-container-header bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700/50 rounded-lg flex items-center flex-1 sm:flex-none w-full sm:w-auto"
                      style={{ position: "relative", minWidth: "260px", height: "36px", padding: 0 }}
                    >
                      <Input
                        type="text"
                        placeholder={t("searchHere")}
                        value={searchName}
                        onChange={(e) => handleSearch(e)}
                        className="w-full pr-8 border-0 shadow-none focus-visible:ring-0 bg-transparent h-full"
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
                    <AppTooltip text={t("Customize Columns")} id="keyword-tracker-customize-columns">
                      <ShadcnButton
                        variant="outline"
                        onClick={async () => setShowCustomizeModal(true)}
                        className="customize-button m-0 gap-0 custom-secondary-btn"
                        style={{ height: "36px", whiteSpace: "nowrap", flexGrow: isMobile ? 1 : 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        {t("Columns")}
                        <span style={{ fontSize: 9, marginLeft: 6, display: "inline-block", verticalAlign: "middle" }}>▼</span>
                      </ShadcnButton>
                    </AppTooltip>
                    <AppTooltip text={t("Export to Excel")}>
                      <ShadcnButton
                        variant="outline"
                        onClick={exportExcel}
                        className="customize-button m-0 custom-secondary-btn"
                        style={{ height: "36px", whiteSpace: "nowrap", flexGrow: isMobile ? 1 : 0 }}
                      >
                        {t("Export")}
                      </ShadcnButton>
                    </AppTooltip>
                  </div>
                </div>
                <div className="or-container-header" style={{ justifyContent: "flex-start", padding: isMobile ? "10px 12px" : "14px 24px" }}>
                  {/* Sub tabs styled as sliding switcher inside the header */}
                  <div id="keyword-tracker-sub-tabs" className="or-tab-switcher w-full sm:w-auto" style={{ minWidth: isMobile ? "100%" : "420px" }}>
                    <div className="or-tab-switcher__track" style={{ display: "flex", alignItems: "center", position: "relative", borderRadius: "6px", padding: "3px", width: "100%" }}>
                      <div
                        className="or-tab-switcher__indicator"
                        style={{
                          position: "absolute",
                          top: "4px",
                          bottom: "3px",
                          borderRadius: "4px",
                          width: "calc(33.333% - 2px)",
                          transform:
                            targetingTabFilter === "all"
                              ? "translateX(0)"
                              : targetingTabFilter === "auto_campaign"
                                ? "translateX(100%)"
                                : "translateX(200%)",
                          background: "linear-gradient(135deg, #1A9FD4 0%, #1a5da8 50%, #2374F2 100%)",
                          transition: "transform 0.3s ease",
                        }}
                      />
                      {TABS.map((item) => {
                        const isActive = targetingTabFilter === item?.label;
                        return (
                          <ShadcnButton
                            key={item.label}
                            variant="ghost"
                            className={`or-tab-switcher__btn ${isActive ? "or-tab-switcher__btn--active text-white hover:text-white" : "text-slate-600 dark:text-slate-300 hover:text-[#1A9FD4] dark:hover:text-[#1A9FD4] hover:bg-transparent"}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "4px",
                              padding: isMobile ? "6px 4px" : "6px 12px",
                              fontSize: isMobile ? "11px" : "12px",
                              fontWeight: isActive ? 600 : 500,
                              flex: "1 1 0px",
                              height: "28px",
                              position: "relative",
                              zIndex: 1,
                              background: "transparent",
                              border: "none",
                              transition: "all 0.3s ease",
                              outline: "none",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            onClick={() => setTargetingTabFilter(item?.label)}
                          >
                            {t(item?.title)}
                          </ShadcnButton>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div id="keyword-tracker-applied-filters">
                  <AppliedFilter
                    appliedFilters={appliedFilters}
                    handleGridFilter={handleGridFilter}
                    handleRemoveSingleFilter={handleRemoveSingleFilter}
                    setAppliedFilters={setAppliedFilters}
                    setShowSaveFilterModal={setShowSaveFilterModal}
                    selectedCampaigns={selectedCampaigns}
                    selectedAdGroups={selectedAdGroups}
                  />
                </div>

                {PermissionCheck(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.VIEW_ONLY) && (
                  <div id="keyword-tracker-main-table" className="data_table position-relative" style={{ padding: "0 14px 14px 14px" }}>
                    <AgTable
                      ref={gridRef}
                      tableId="lifetimeTracker-main-table"
                      loading={!isFilterReady || campaignsLoading}
                      onRefresh={refreshGrid}
                      rowData={tableData}
                      columnDefs={columns}
                      customSaveColumnName="Keyword Tracker"
                      isCustomSaveColumns={true}
                      totalRecords={lifetimeTrackerData?.totalRecords ?? 0}
                      perPage={perPage}
                      currentPage={arg.pageNo}
                      onPageChange={handlePageChange}
                      onPerPageChange={handlePerRowsChange}
                      onSortChanged={handleSortChanged}
                      paginationOptions={paginationRowsPerPageOptions}
                      handleSaveColumns={handleSaveColumns}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      <TargetingDetailsDrawer
        open={drawerOpen}
        targeting={selectedTargeting}
        matchType={selectedMatchType}
        campaignIds={selectedCampaignIds}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedTargeting(null);
          setSelectedMatchType(null);
          setSelectedCampaignIds([]);
        }}
      />

      {/* Filter Modal */}
      <TargetingFilterModal
        showFilterModal={showFilterModal}
        handleModalClose={handleModalClose}
        TARGETING_TYPE_OPTIONS={TARGETING_TYPE_OPTIONS}
        CONDITION_OPTIONS={CONDITION_OPTIONS}
        selectedCampaignStatus={selectedCampaignStatus}
        selectedTargetingTypes={selectedTargetingTypes}
        selectedFilterOption={selectedFilterOption}
        selectedTargetStatus={selectedTargetStatus}
        setSelectedTargetStatus={setSelectedTargetStatus}
        campaignsLoading={campaignsLoading}
        campaignsData={campaignsData}
        selectedCampaigns={selectedCampaigns}
        selectedAdGroups={selectedAdGroups}
        selectedCondition={selectedCondition}
        setSelectedCondition={setSelectedCondition}
        setSelectedCampaignStatus={setSelectedCampaignStatus}
        setAppliedFilters={setAppliedFilters}
        filterValue={filterValue}
        setFilterValue={setFilterValue}
        setSelectedAdGroups={setSelectedAdGroups}
        setSelectedCampaigns={setSelectedCampaigns}
        setSelectedTargetingTypes={setSelectedTargetingTypes}
        getCampaignsData={getCampaignsData}
      />

      {/* Save Filter Modal */}
      <TargetingSaveFilter
        showSaveFilterModal={showSaveFilterModal}
        setShowSaveFilterModal={setShowSaveFilterModal}
        filterName={filterName}
        setFilterName={setFilterName}
        appliedFilters={appliedFilters}
        getFilter={getFilter}
        targetingTabFilter={TABS?.find((tab) => tab?.label === targetingTabFilter)?.query}
        pageName={"Keyword Tracker"}
      />

      {/* Delete Filter Confirmation Modal */}
      <TargetingDeleteModal
        showDeleteFilterModal={showDeleteFilterModal}
        setFilterToDelete={setFilterToDelete}
        setShowDeleteFilterModal={setShowDeleteFilterModal}
        filterToDelete={filterToDelete}
        getFilter={getFilter}
      />

      <CustomizeColumns
        showModal={showCustomizeModal}
        setShowModal={setShowCustomizeModal}
        allColumns={columns}
        selectedColumn={visibleColumns}
        handler={handleSaveColumns}
        defaultColumns={defaultColumns}
      />
    </>
  );
}

export default LifetimeTracker;
