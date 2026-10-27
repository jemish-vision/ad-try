import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { useContext, useEffect, useState, useRef, useMemo, useCallback } from "react";
import AgTable from "../../../common/grid/AgTable";
import Filter from "../../../helper/filter/Filter";
import { ApiStatusChange, ApiTargetingListing, ApiTargetingChartListing, ApiAdjustBids } from "../../../api-wrapper/targeting/ApiTargeting";
import moment from "moment-timezone";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { AdTypeScopeNote, AdTypeBadge } from "../../../helper/filter/AdTypeScopeNote";
import { isShowingAllAdTypes } from "../../../helper/filter/adTypeAll";
import { handleLoader, Toast, useDispatch } from "../../../helper/links/Link";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useTranslation } from "react-i18next";
import { ApiFilterListing, ApiGetCampaignAndAdGroupAutoSearch } from "../../../api-wrapper/customer/ApiCustomer";
import CurrencyCode, { getMarketplaceMinBid, getCurrencySymbol } from "../../../helper/currencyCode/CurrencyCode";
import { Input } from "../../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Button as ShadcnButton } from "../../../components/ui/button";
import { Checkbox } from "../../../components/ui/checkbox";
import { Switch } from "../../../components/ui/switch";
import { addTargetingQuery } from "../../../utility/createQuery";
import { ApiListGetColumns, ApiListUpdateColumns } from "../../../api-wrapper/columns/ApiColumns";
import CustomizeColumns from "../../../helper/modal/CustomizeColumns";
import { Link, useParams, useLocation, useNavigate } from "react-router-dom";
import Breadcrumb from "../../../common/components/Breadcrumb";
import { Buffer } from "buffer";
import { exportGridToExcel } from "../../../utility/exportExcel";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import TargetingFilterModal from "./Targeting/TargetingFilterModal";
import TargetingSaveFilter from "./Targeting/TargetingSaveFilter";
import TargetingDeleteModal from "./Targeting/TargetingDeleteModal";
import TargetingAdjustBidModal from "./Targeting/TargetingAdjustBidModal";
import Chart from "../../../helper/charts/Chart";
import InlineEditPopup from "../../../helper/modal/InlineEditPopup";
import { useTour } from "../../../tour";
import isEqual from "lodash/isEqual";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import AgCustomHeader from "../../../common/grid/AgCustomHeader";
import { useDebouncedColumnSave } from "../../../utility/useDebouncedColumnSave";
import AppliedFilter from "../../component/filter/AppliedFilter";
import { StyledCheckbox } from "../../../common/grid/StyledCheckbox";
import { CampaignNameCell } from "../../../utility/campaignNavigation";
import { buildMongoQuery, formatCondition } from "../../../utility/common";
import { CustomModal } from "../../../helper/modal/CustomModal";
import ReactDOM from "react-dom";
import { ChevronDown as ExpandMoreIcon, RefreshCw as RefreshIcon, X as CloseIcon } from "lucide-react";
import { TargetingTypeBadge } from "../../../utility/targetingUtils";
import usePageFilter from "../../../helper/filter/usePageFilter";
import { MdOutlineClose } from "react-icons/md";
import { AppTooltip } from "../../../components/ui/AppTooltip";

// Portal-based tooltip immune to AG-Grid CSS transform offsets

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
  { label: "keyword_targets", title: "Keyword Targets", query: { keywordType: { $in: ["EXACT", "PHRASE", "BROAD"] } } },
  { label: "product_targets", title: "Product Targets", query: { keywordType: { $in: ["TARGETING_EXPRESSION"] } } },
  { label: "other_targets", title: "Other Targets", query: { keywordType: { $nin: ["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"] } } },
]

function Targeting() {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isLaptopL, setIsLaptopL] = useState(window.innerWidth <= 1440);
  const [disablePinning, setDisablePinning] = useState(window.innerWidth < 1100);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
      setIsLaptopL(window.innerWidth <= 1440);
      setDisablePinning(window.innerWidth < 1100);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { t } = useTranslation();
  let { profileId, selectedAdType, currencyCode, countryCode, selectedDate, setSelectedDate } = useContext(ProfileContext);
  // Combined SP+SB+SD view active on the /targeting screen?
  const showAllTypes = isShowingAllAdTypes(
    typeof window !== "undefined" ? window.location.pathname : "",
    selectedAdType
  );
  const { campaignId } = useParams();

  const { state: tourState } = useTour();
  const isTourActive = tourState.run && tourState.activeTourId === "targeting";
  const dispatch = useDispatch();
  const [tableData, setTableData] = useState([]);
  const [targetingData, setTargetingData] = useState();
  const [perPage, setPerPage] = useState(firstPageRows);
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [date, setDate] = useState(() => {
    const savedData = JSON.parse(localStorage.getItem("targeting")) ?? {};
    if (savedData?.date && savedData?.date?.length) {
      return savedData?.date?.map((d) => moment(d).toDate());
    }
    return [new Date(moment()?.startOf("month")), new Date()];
  });
  const [status, setStatus] = useState("ENABLED");
  const [type, setType] = useState("");
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  const lastFilterProfileRef = useRef(null);
  const filterPromiseRef = useRef(null);
  const lastAutoSearchProfileRef = useRef(null);
  const autoSearchPromiseRef = useRef(null);
  const lastFetchParamsRef = useRef("");
  const fetchIdRef = useRef(0);

  const [isExactSearchMatch, setIsExactSearchMatch] = useState(false);
  const [filter, setFilter] = useState([]);
  const location = useLocation();
  const [filterOptions, setFilterOptions] = useState([]);
  const [totalRow, setTotalRow] = useState({});

  const defaultValue = {
    firstCondition: "",
    firstValue: 0,
    operator: "",
    secondCondition: "",
    secondValue: 0,
    sortType: "DESC",
  };

  const [conditionObj, setConditionObj] = useState(defaultValue);
  const [customFilterFlag, setCustomFilterFlag] = useState(false);
  const [fieldName, setfieldName] = useState("sales");
  const [gridFilter, setGridFilter] = useState("");
  const [targetingTabFilter, setTargetingTabFilter] = useState("all");
  const [openFilterField, setOpenFilterField] = useState(null);

  // Modal state management
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
  const [appliedFilters, setAppliedFilters] = useState(() => [
    {
      id: "default-target-status",
      type: "TargetActiveStatus",
      displayText: "Target Status: ENABLED",
      label: "Target active status",
      value: "ENABLED",
    }
  ]);
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [showDeleteFilterModal, setShowDeleteFilterModal] = useState(false);
  const [filterToDelete, setFilterToDelete] = useState(null);
  const [pendingCampaignSelections, setPendingCampaignSelections] = useState(null);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [isTableLoading, setIsTableLoading] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [statusChange, setStatusChange] = useState(null);

  const [chartLoading, setChartLoading] = useState(false);
  const [chartData, setChartData] = useState([]);

  const [defaultColumns] = useState(["Active", "Targeting", "Targeting Type", "Campaign Name"]);

  // Row selection state
  const [selectedRows, setSelectedRows] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(null);

  const gridRef = useRef(null);

  // ── Auto-save and restore page filter ──────────────────────────────────────
  const { isFilterReady } = usePageFilter({
    pageName: "Targeting",
    profileId: profileId?.value,
    selectedAdType,
    appliedFilters,
    setAppliedFilters,
    onFilterLoad: (savedFilters) => {
      const getFilterVal = (type) => savedFilters.find(f => f.type === type)?.value;

      setSelectedTargetStatus(getFilterVal("TargetActiveStatus") || "ENABLED");
      setSelectedCampaignStatus(getFilterVal("CampaignStatus") || "");
      setSelectedTargetingTypes(getFilterVal("TargetingType") || []);

      // We don't restore CampaignsAndAdGroups here because Targeting.js 
      // loads campaigns asynchronously and handles pre-selection inside handleFilterOptionClick.
      // We can also extract the default search value if we want, but it's fine for now.
    }
  });

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

  const updateKeywordBid = async (targetId, bidValue) => {
    try {
      const minMarketplaceBid = getMarketplaceMinBid(currencyCode, countryCode);
      const numericBid = parseFloat(bidValue);
      if (isNaN(numericBid) || numericBid < minMarketplaceBid) {
        Toast.error(`${t("Bid must be at least")} ${getCurrencySymbol(currencyCode)}${minMarketplaceBid.toFixed(2)}`);
        return;
      }
      const response = await ApiAdjustBids({
        profileId: profileId?.value,
        targetIds: [targetId],
        bid: numericBid,
        actionType: "SET_BID",
      });

      if (response?.isSuccess) {
        Toast.success(response?.message || "Bid adjusted successfully");
        await ApiListing(arg);
      } else {
        Toast.error(response?.message || "Failed to adjust bid");
      }
    } catch (error) {
      Toast.error(t("Something went wrong while adjusting the bid"));
      console.error(error);
    }
  };

  const sharedFilterParams = useMemo(() => ({
    conditionObj,
    setConditionObj,
    setfieldName,
    setCustomFilterFlag,
    defaultValue,
    openFilterField,
    setOpenFilterField,
  }), [conditionObj, openFilterField]);

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

  const checkOrderColumns = (title) => {
    const matched = visibleColumns?.find(col => col?.title === title);
    return {
      width: matched?.width ?? 200,
      hide: Boolean(visibleColumns?.length && !matched),
      order: matched?.order ?? 9999,
    };
  };

  const columns = useMemo(() => [
    {
      headerName: "",
      field: "targetId",
      maxWidth: 50,
      pinned: disablePinning ? null : "left",
      lockPinned: !disablePinning,
      suppressMovable: true,
      sortable: false,
      resizable: false,
      headerComponent: () => {
        const toggleAll = (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (!selectAll) {
            setSelectedRows(tableData.filter(row => !row.isTotalRow).map(row => row?.targetId).filter(id => id !== null));
            setSelectAll(true);
          } else {
            setSelectedRows([]);
            setSelectAll(false);
          }
        };
        return (
          <div className="flex items-center justify-center w-full h-full cursor-pointer" onClick={toggleAll} onMouseDown={(e) => e.stopPropagation()}>
            <Checkbox checked={selectAll} className="pointer-events-none" />
          </div>
        );
      },
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row || row?.isTotalRow) return null;

        const isChecked = selectedRows.includes(row?.targetId);

        const toggleRow = (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (!row?.targetId) return;

          if (!isChecked) {
            setSelectedRows(prev => [...prev, row?.targetId]);
          } else {
            setSelectedRows(prev => prev.filter(id => id !== row?.targetId));
            setSelectAll(false);
          }
        };

        return (
          <div className="flex items-center justify-center w-full h-full cursor-pointer" onClick={toggleRow} onMouseDown={(e) => e.stopPropagation()}>
            <Checkbox checked={isChecked} disabled={!row?.targetId} className="pointer-events-none" />
          </div>
        );
      },
    },
    {
      headerName: t("active"),
      field: "status",
      title: "Active",
      ...(checkOrderColumns("Active")),
      pinned: disablePinning ? null : "left",
      lockPinned: !disablePinning,
      suppressMovable: true,
      sortable: false,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row || row?.isTotalRow) return null;
        return (
          <div className="flex justify-center items-center h-full w-full">
            <Switch
              checked={row?.status === "ENABLED"}
              onCheckedChange={(checked) => setStatusChange({ isActive: checked, id: row?.targetId, row })}
              disabled={!PermissionCheck(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.UPDATE)}
            />
          </div>
        );
      },
    },
    {
      headerName: t("targeting"),
      field: "targeting",
      title: "Targeting",
      ...(checkOrderColumns("Targeting")),
      pinned: disablePinning ? null : "left",
      lockPinned: !disablePinning,
      suppressMovable: true,
      sortable: true,
      resizable: true,

      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const statusClass =
          row.status === " " ? "cancelled"
            : row.status === "PAUSED" ? "pending"
              : row.status === "ENABLED" ? "completed"
                : row.status === "ARCHIVED" ? "archived"
                  : "";
        const targetDetailUrl = `/targeting/detail/${row?.targetId}?campaignId=${row?.campaignId || ""}&targeting=${encodeURIComponent(row?.targeting || "")}&matchType=${encodeURIComponent(row?.matchType || "")}&campaignName=${encodeURIComponent(row?.campaignName || "")}`;

        return (
          <div className="campaignStatus w-full flex items-center gap-2" style={{ overflow: "hidden" }}>
            {!row?.isTotalRow && (
              <div className={`customStatus me-1 ${statusClass}`} style={{ flexShrink: 0 }}></div>
            )}
            {!row?.isTotalRow && row?.targetId ? (
              <Link
                to={targetDetailUrl}
                className="customTitle hover:underline cursor-pointer font-medium text-blue-600 dark:text-blue-400"
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                  textDecoration: "none",
                }}
                onClick={(e) => e.stopPropagation()}
                title={t("Open details & history for {{name}}", { name: row.targeting })}
              >
                {row.targeting}
              </Link>
            ) : (
              <div className="customTitle" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                {row.targeting}
              </div>
            )}
            {!row?.isTotalRow && (
              <TargetingTypeBadge
                matchType={row.matchType}
                targeting={row.targeting}
                keywordType={row.keywordType}
              />
            )}
          </div>
        );
      },
    },
    // Ad-type column: present only under the combined "All" view.
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
    {
      headerName: t("Targeting Type"),
      field: "matchType",
      title: "Targeting Type",
      ...(checkOrderColumns("Targeting Type")),
      sortable: true,
      resizable: true,
      minWidth: 140,
      wrapText: true,

      cellRenderer: (params) => {
        const row = params.data;
        if (!row || row?.isTotalRow) return null;
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
      headerName: t("campaignName"),
      field: "campaignName",
      title: "Campaign Name",
      ...(checkOrderColumns("Campaign Name")),
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return <CampaignNameCell row={row} name={params.value} />;
      },
    },
    {
      headerName: t("bid"),
      field: "keywordBid",
      title: "Bid",
      exportFormatter: (val) => val !== "" ? Number(typeof val === "object" ? val?.$numberDecimal : val).toFixed(2) : "0.00",
      ...(checkOrderColumns("Bid")),
      sortable: true,
      resizable: true,
      wrapText: true,

      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        if (row?.isTotalRow) return <>{CurrencyCode(row?.keywordBid ?? 0)}</>;
        return (
          <InlineEditPopup
            value={Number(typeof row.keywordBid === "object" ? row.keywordBid?.$numberDecimal : row.keywordBid)}
            formatter={(v) => CurrencyCode(v)}
            title={t("Bid")}
            min={getMarketplaceMinBid(currencyCode, countryCode)}
            currency={currencyCode}
            onSave={async (newBid) => await updateKeywordBid(row?.targetId, newBid)}
            disabled={!PermissionCheck(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.UPDATE)}
          />
        );
      },
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "keywordBid", hasFilter: true },
    },
    {
      headerName: t("impressions"),
      field: "impressions",
      title: "Impressions",
      ...(checkOrderColumns("Impressions")),
      sortable: true,
      resizable: true,
      wrapText: true,

      cellRenderer: (params) => <>{params.value != 0 ? `${CurrencyFormat(params.value)}` : "—"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "impressions", hasFilter: true },
    },
    {
      headerName: t("TopOfSearch"),
      field: "topOfSearchImpressionShare",
      title: "Top Of Search",
      exportFormatter: (val) => val !== "" && val !== undefined && val !== null ? `${val}%` : "—",
      ...(checkOrderColumns("Top Of Search")),
      sortable: true,
      resizable: true,
      wrapText: true,

      cellRenderer: (params) => <>{params.value != 0 ? `${CurrencyFormat(params.value)}%` : "—"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "topOfSearchImpressionShare", hasFilter: true },
    },
    {
      headerName: t("clicks"),
      field: "clicks",
      title: "Clicks",
      ...(checkOrderColumns("Clicks")),
      sortable: true,
      resizable: true,
      wrapText: true,

      cellRenderer: (params) => <>{params.value != 0 ? `${CurrencyFormat(params.value)}` : "—"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "clicks", hasFilter: true },
    },
    {
      headerName: t("spend"),
      field: "spend",
      title: "Spend",
      exportFormatter: (val) => val !== "" && val !== undefined && val !== null ? Number(val).toFixed(2) : "0.00",
      ...(checkOrderColumns("Spend")),
      sortable: true,
      resizable: true,
      wrapText: true,

      cellRenderer: (params) => <>{params.value != 0 ? `${CurrencyCode(params.value)}` : "—"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "spend", hasFilter: true },
    },
    {
      headerName: t("Orders"),
      field: "orders",
      title: "Orders",
      ...(checkOrderColumns("Orders")),
      sortable: true,
      resizable: true,
      wrapText: true,

      cellRenderer: (params) => <>{params.value != 0 ? `${CurrencyFormat(params.value)}` : "—"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "orders", hasFilter: true },
    },
    {
      headerName: t("sales"),
      field: "sales",
      title: "Sales",
      exportFormatter: (val) => val !== "" && val !== undefined && val !== null ? Number(val).toFixed(2) : "0.00",
      ...(checkOrderColumns("Sales")),
      sortable: true,
      resizable: true,
      wrapText: true,

      cellRenderer: (params) => <>{params.value != 0 ? `${CurrencyCode(params.value)}` : "—"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "sales", hasFilter: true },
    },
    {
      headerName: t("conversionRate"),
      field: "conversionRate",
      title: "Conversion Rate",
      exportFormatter: (val) => val !== "" && val !== undefined && val !== null ? `${val}%` : "—",
      ...(checkOrderColumns("Conversion Rate")),
      sortable: true,
      resizable: true,
      wrapText: true,

      cellRenderer: (params) => <>{params.value != 0 ? `${params.value}%` : "—"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "conversionRate", hasFilter: true },
    },
    {
      headerName: t("acos"),
      field: "acos",
      title: "ACOS",
      exportFormatter: (val) => val !== "" && val !== undefined && val !== null ? `${val}%` : "—",
      ...(checkOrderColumns("ACOS")),
      sortable: true,
      resizable: true,
      wrapText: true,

      cellRenderer: (params) => <>{params.value ? `${params.value}%` : "—"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "acos", hasFilter: true },
    },
    {
      headerName: t("roas"),
      field: "roas",
      title: "ROAS",
      exportFormatter: (val) => val !== "" && val !== undefined && val !== null ? val : "—",
      ...(checkOrderColumns("ROAS")),
      sortable: true,
      resizable: true,
      wrapText: true,

      cellRenderer: (params) => <>{params.value ? `${params.value}` : "—"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "roas", hasFilter: true },
    },
  ], [disablePinning, tableData, selectedRows, selectAll, t, currencyCode, visibleColumns, showAllTypes]);

  useEffect(() => {
    const fetchCustomColumns = async () => {
      const body = { pageName: "Targeting" };
      const response = await ApiListGetColumns(body);

      if (response?.isSuccess && response?.data && response?.data?.columns?.length) {
        const visible = (columns ?? [])
          .map(c => ({ ...c, ...response?.data?.columns.find(col => col.title === c.title) }))
          .filter(c => c?.isDisplay || !c?.title || defaultColumns.includes(c?.title))
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
      .map(c => ({ ...c, ...selectedColumns.find(col => col.title === c.title) }))
      .filter(c => c?.isDisplay || !c?.title || defaultColumns.includes(c?.title))
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .filter(Boolean);

    setVisibleColumns(visible);
    setShowCustomizeModal(false);

    const body = {
      pageName: "Targeting",
      columns: selectedColumns,
    };
    const response = await ApiListUpdateColumns(body);
    if (response?.isSuccess && response?.data?.columns) {
      const updated = (columns ?? [])
        .map(c => ({ ...c, ...response?.data?.columns.find(col => col.title === c.title) }))
        .filter(c => c?.isDisplay || !c?.title || defaultColumns.includes(c?.title))
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

  useEffect(() => {
    if (location.state?.searchName) {
      setSearchName(location.state.searchName);

      setIsExactSearchMatch(true);

      if (location.state.keywordType) {
        const targetingOption = TARGETING_TYPE_OPTIONS.find(opt => opt.value === location.state.keywordType);
        const filterName = targetingOption ? targetingOption.label : location.state.keywordType;
        setAppliedFilters([{
          id: new Date().getTime(),
          type: "TargetingType",
          value: [location.state.keywordType],
          label: "Targeting Type",
          displayText: `Targeting Type: ${filterName}`,
          isPredefined: true
        }]);
        setTargetingTabFilter("keyword_targets");
      }

      if (location.state.fromDate && location.state.toDate) {
        setDate([new Date(location.state.fromDate), new Date(location.state.toDate)]);
      }

      window.history.replaceState({}, document.title);
      return;
    }
  }, [location.state]);

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
      const savedData = JSON.parse(localStorage.getItem("targeting")) ?? {};
      if (savedData?.date && savedData?.date?.length) {
        setDate(savedData?.date?.map((d) => moment(d).toDate()));
      }
      else setDate([new Date(moment()?.startOf("month")), new Date()]);
    }
  }, [selectedDate]);

  // Handle select all state when selectedRows changes
  useEffect(() => {
    if (tableData.length > 0) {
      const allRowIds = tableData.map(row => row?.targetId).filter(id => id !== null);
      setSelectAll(selectedRows.length === allRowIds.length && selectedRows.length > 0);
    }
  }, [selectedRows, tableData]);

  // Load campaigns data on component mount for better UX
  useEffect(() => {
    if (isFilterReady && profileId?.value && selectedAdType) {
      getFilter();
      getCampaignsData();
    }
  }, [isFilterReady]);

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
    const data = { profileId: profileId.value, pageName: "Targeting" };
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

  const refreshGrid = () => {
    localStorage.removeItem("AffectedTargets");
    ApiListing({ ...arg, isReload: true, skipLoader: true });
  };

  const exportExcel = async () => {
    if (profileId.value && selectedAdType && date?.length != 0) {
      dispatch(handleLoader(true));
      try {
        const targets = JSON.parse(localStorage.getItem("AffectedTargets") || "[]");

        const campaignStatusFilter = appliedFilters.find(filter => filter.type === "CampaignActiveStatus");
        const campaignStatus = campaignStatusFilter ? campaignStatusFilter.value : "";

        const targetingStatusFilter = appliedFilters.find(filter => filter.type === "TargetActiveStatus");
        const targetingStatus = targetingStatusFilter ? targetingStatusFilter.value : "";

        const targetingTypeFilter = appliedFilters.find(filter => filter.type === "TargetingType");
        const targetingType = targetingTypeFilter ? targetingTypeFilter.value : [];

        let filterQuery = {};
        appliedFilters.forEach(filter => {
          if (filter.apiFieldName && filter.condition) {
            filterQuery[filter.apiFieldName] = { [filter.condition]: parseFloat(filter.value) ?? filter.value };
          }
        });

        const campaignsAndAdGroupsFilter = appliedFilters.find(filter => filter.type === "CampaignsAndAdGroups");
        const campaignIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => item.adGroups).map(campaign => campaign.id) : [];
        const adGroupIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => !item.adGroups).map(adGroup => adGroup.id) : [];

        const data = {
          searchName: searchName,
          isExactSearchMatch: isExactSearchMatch,
          profileId: profileId.value,
          fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
          toDate: moment(date?.[1]).format("YYYY-MM-DD"),
          status: status,
          type: type,
          gridFilter: gridFilter,
          fieldName: fieldName,
          sortType: conditionObj?.sortType,
          campaignStatus: campaignStatus,
          targetingStatus: targetingStatus,
          targetingType: targetingType,
          filterQuery: JSON.stringify(filterQuery),
          campaignId: [campaignId && parseFloat(Buffer.from(campaignId, "base64").toString("utf8")), ...campaignIds].filter(camp => camp),
          adGroupId: adGroupIds,
          targetingTabFilter: TABS?.find((tab) => tab?.label === targetingTabFilter)?.query,
          filteredTargetingIds: targets.map(cp => cp?.targetId),
          pageNo: 1,
          perPage: 100000,
        };

        data.query = addTargetingQuery(data);

        const response = await ApiTargetingListing(data);

        if (response?.isSuccess) {
          const allData = response?.getTargeting || [];
          const getTotalsRow = () => {
            const totalRow = response?.totalRow ?? {};
            return {
              action: "Total",
              targeting: "Total",
              matchType: "",
              keywordBid: totalRow?.keywordBid,
              impressions: totalRow?.impressions,
              topOfSearchImpressionShare: totalRow?.topOfSearchImpressionShare,
              clicks: totalRow?.clicks,
              spend: totalRow?.spend,
              orders: totalRow?.orders,
              sales: totalRow?.sales,
              conversionRate: totalRow?.conversionRate,
              acos: totalRow?.acos,
              roas: totalRow?.roas,
              isTotalRow: true,
            };
          };

          const totalRowObj = (allData.length > 0 && response?.totalRow) ? getTotalsRow() : null;
          exportGridToExcel(allData, columns, "targeting_export.xlsx", totalRowObj);
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

      // Get selected campaign and ad group IDs from applied filters
      const campaignsAndAdGroupsFilter = appliedFilters.find(filter => filter.type === "CampaignsAndAdGroups");
      let campaignIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => item.adGroups).map(campaign => campaign.id) : [];
      const adGroupIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => !item.adGroups).map(adGroup => adGroup.id) : [];

      if (campaignId) {
        try {
          const decodedId = parseFloat(Buffer.from(campaignId, "base64").toString("utf8"));
          if (decodedId && !campaignIds.includes(decodedId)) {
            campaignIds = [decodedId, ...campaignIds];
          }
        } catch (e) {}
      }

      const campaignStatusFilter = appliedFilters.find(filter => filter.type === "CampaignActiveStatus");
      const campaignStatus = campaignStatusFilter ? campaignStatusFilter.value : "";
      const targetingStatusFilter = appliedFilters.find(filter => filter.type === "TargetActiveStatus");
      const targetingStatus = targetingStatusFilter ? targetingStatusFilter.value : "";

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
        searchName: searchNameVal,
        status: status || "",
        type: type || "",
        targetingTabFilter,
        campaignId: campaignIds,
        adGroupId: adGroupIds,
        campaignStatus: campaignStatus || "",
        targetingStatus: targetingStatus || "",
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
      const currentFetchId = ++fetchIdRef.current;
      setIsTableLoading(true);
      if (!isReload) setChartLoading(true);
      const apiOptions = { skipLoader: true };

      const rawTargets = localStorage.getItem("AffectedTargets");
      let targets = [];
      if (rawTargets) {
        try {
          targets = JSON.parse(rawTargets);
        } catch (err) {
          targets = [];
        }
      }

      const data = {
        searchName: searchNameVal,
        isExactSearchMatch: isExactSearchMatch,
        appliedFilters,
        profileId: profileId.value,
        fromDate: fromDateStr,
        toDate: toDateStr,
        status: status,
        type: type,
        gridFilter: gridFilter,
        fieldName: fieldName,
        sortType: conditionObj?.sortType,
        campaignStatus: campaignStatus,
        targetingStatus: targetingStatus,
        campaignId: campaignIds,
        adGroupId: adGroupIds,
        targetingType: selectedTargetingTypes,
        targetingTabFilter: TABS?.find((tab) => tab?.label === targetingTabFilter)?.query,
        filteredTargetingIds: Array.isArray(targets) ? targets.map(cp => cp?.targetId) : [],
        ...arg,
      };

      data.query = addTargetingQuery(data);
      delete data.appliedFilters;

      try {
        const e = await ApiTargetingListing(data, apiOptions);
        // Discard a stale response if a newer request (ad-type / filter change) started.
        if (currentFetchId !== fetchIdRef.current) return;
        if (e?.isSuccess) {
          const getTotalsRow = () => {
            const totalRow = e?.totalRow ?? {};
            return {
              action: "Total",
              targeting: "Total",
              matchType: "",
              keywordBid: totalRow?.keywordBid,
              impressions: totalRow?.impressions,
              topOfSearchImpressionShare: totalRow?.topOfSearchImpressionShare,
              clicks: totalRow?.clicks,
              spend: totalRow?.spend,
              orders: totalRow?.orders,
              sales: totalRow?.sales,
              conversionRate: totalRow?.conversionRate,
              acos: totalRow?.acos,
              roas: totalRow?.roas,
              isTotalRow: true,
            };
          };

          setTotalRow(getTotalsRow());
          setTableData([...e?.getTargeting, ...(e?.getTargeting?.length ? [getTotalsRow()] : [])]);
          setTargetingData(e);
        } else {
          Toast.error(e?.message);
        }
      } catch (e) {
        if (currentFetchId !== fetchIdRef.current) return;
        lastFetchParamsRef.current = "";
        Toast.error(t("Something went wrong"));
      } finally {
        if (currentFetchId === fetchIdRef.current) setIsTableLoading(false);
      }

      if (!isReload) {
        try {
          const e = await ApiTargetingChartListing(data);
          if (currentFetchId !== fetchIdRef.current) return;
          if (e?.isSuccess) setChartData(e?.data);
          else Toast.error(e?.message);
        } catch (e) {
          if (currentFetchId !== fetchIdRef.current) return;
          Toast.error(t("Something went wrong"));
        } finally {
          if (currentFetchId === fetchIdRef.current) setChartLoading(false);
        }
      }
    }
  };

  useEffect(() => {
    lastFetchParamsRef.current = "";
    lastAutoSearchProfileRef.current = null;
    lastFilterProfileRef.current = null;
  }, [profileId?.value]);

  useEffect(() => {
    if (isFilterReady) {
      ApiListing(arg);
    }
  }, [isFilterReady, profileId?.value, selectedAdType, date, status, type, gridFilter, appliedFilters, targetingTabFilter, isExactSearchMatch, debouncedSearchName]);

  const handlePageChange = (page) => {
    setIsTableLoading(true);
    setArg({ pageNo: page, perPage: perPage })
    ApiListing({ pageNo: page, perPage: perPage });
  };

  const handlePerRowsChange = async (newPerPage) => {
    setIsTableLoading(true);
    setPerPage(newPerPage);
    setArg({ pageNo: 1, perPage: newPerPage })
    ApiListing({ pageNo: 1, perPage: newPerPage });
  };

  // handler for sorting
  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    ApiListing({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), ...arg });
  };

  // Handle date change
  const handleDateChange = (e) => {
    setDate(e);
    if (e && Array.isArray(e) && e.length >= 2) {
      const arr = [moment(e[0]).format("YYYY-MM-DD"), moment(e[1]).format("YYYY-MM-DD")];
      setSelectedDate(arr);
      try {
        let storeData = JSON.parse(localStorage.getItem('profile')) || {};
        storeData.date = arr;
        localStorage.setItem('profile', JSON.stringify(storeData));
      } catch (err) {}
      try {
        const storedData = JSON.parse(localStorage.getItem("targeting")) || {};
        storedData.date = arr;
        localStorage.setItem("targeting", JSON.stringify(storedData));
      } catch (err) {}
    }
  };

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
          // Set condition object for API call
          if (field === 'budget') {
            setConditionObj(prev => ({ ...prev, firstCondition: condition, firstValue: Number(value) }));
            setfieldName('campaignBudgetAmount');
            setCustomFilterFlag(true);
          } else {
            setConditionObj(prev => ({ ...prev, firstCondition: condition, firstValue: Number(value) }));
            setfieldName(apiFieldName);
            setCustomFilterFlag(true);
          }

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
          // Set condition object for API call
          if (field === 'budget') {
            setConditionObj(prev => ({ ...prev, firstCondition: condition, firstValue: Number(value) }));
            setfieldName('campaignBudgetAmount');
            setCustomFilterFlag(true);
          } else {
            setConditionObj(prev => ({ ...prev, firstCondition: condition, firstValue: Number(value) }));
            setfieldName(apiFieldName);
            setCustomFilterFlag(true);
          }

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
      setFilterValue(existingFilter ? existingFilter.value : "0.00");
    }

    setShowFilterModal(true);
  };

  // Handle modal close
  const handleModalClose = () => {
    setShowFilterModal(false);
    setTimeout(() => {
      setSelectedFilterOption(null);
      setSelectedCondition("$eq");
      setFilterValue("0.00");
      setSelectedTargetingTypes([]);
      setSelectedCampaignStatus("");
      setSelectedTargetStatus("");
      setSelectedCampaigns([]);
      setSelectedAdGroups([]);
    }, 300);
  };

  // Handle remove single filter
  const handleRemoveSingleFilter = (filterId) => setAppliedFilters(prev => prev.filter(filter => filter.id !== filterId));

  useEffect(() => {
    if (campaignId) {
      try {
        const decodedId = parseFloat(Buffer.from(campaignId, "base64").toString("utf8"));
        if (decodedId) {
          const findActiveCampaign = campaignsData?.find((cam) => cam?.id === decodedId);
          const campaignObj = findActiveCampaign || { id: decodedId, name: "Campaign", adGroups: [] };
          const filter = {
            id: decodedId,
            type: "CampaignsAndAdGroups",
            displayText: "Campaigns & Ad Groups: 1 selected",
            label: "Campaigns and ad groups",
            value: [campaignObj],
          };
          setAppliedFilters((prev) => {
            const existingIndex = prev.findIndex((f) => f?.type === "CampaignsAndAdGroups");
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = filter;
              return updated;
            }
            return [...prev, filter];
          });
        }
      } catch (e) {}
    }

    if (!campaignId && !Boolean(appliedFilters?.length)) {
      const filter = {
        id: new Date().getTime(),
        type: "TargetActiveStatus",
        displayText: "Target Status: ENABLED",
        label: "Target active status",
        value: "ENABLED",
      };
      setAppliedFilters((prev) => {
        if (prev.some((f) => f?.id === filter?.id)) return prev;
        return [...prev, filter];
      });
    }
  }, [campaignId, campaignsData]);


  const handleAction = (action, ids) => {
    if (action === "adjust-bid") {
      setShowBidModal(true);
      return;
    }
    // Show confirmation for all status changes
    setBulkConfirm({ action, ids: ids ?? selectedRows });
  };

  const executeAction = async () => {
    if (!bulkConfirm) return;
    const { action, ids } = bulkConfirm;

    if (action === "adjust-bid") {
      setShowBidModal(true);
    } else if (["ENABLED", "PAUSED", "ARCHIVED"].includes(action)) {
      await ApiStatusChange({ profileId: profileId?.value, targetIds: ids, status: action })
        .then(async (res) => {
          if (res.isSuccess) {
            Toast.success(res.message || "Success");
            await ApiListing(arg);
          } else Toast.error(res.message || "error");
        })
        .catch((err) => Toast.error(err.message || "Something went wrong"));
      dispatch(handleLoader(false));
    }
    setBulkConfirm(null);
  };

  const breadcrumbData = useMemo(() => {
    if (!campaignId) return null;
    try {
      const decodedCampaignId = Number(Buffer.from(campaignId, "base64").toString("utf8"));
      const campaign = campaignsData.find(c => c.id === decodedCampaignId);

      // Check for selected Ad Group for deeper breadcrumb
      if (selectedAdGroups.length === 1) {
        return {
          campaignName: selectedAdGroups[0].campaignName || (campaign ? campaign.name : "Campaign"),
          adGroupName: selectedAdGroups[0].name
        };
      }

      if (campaign) return { campaignName: campaign.name };

      // Fallback to table data if campaigns list isn't fully loaded
      const row = tableData.find(r => r.campaignName);
      if (row) return { campaignName: row.campaignName };
    } catch (e) {
      console.error("Error decoding campaignId for breadcrumb", e);
    }
    return null;
  }, [campaignId, campaignsData, tableData, selectedAdGroups]);

  return (
    <div className="targeting-tracking-container" id="targeting-page">
      <Filter name={"Targeting"} dateShow={false} profileShow={true} />

      {/* ── GLOBAL FILTERS: Fluid Translucent Header ───── */}
      <div
        id="targeting-filters"
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
          position: isMobile ? "relative" : "sticky",
          top: !isMobile ? (breadcrumbData ? "44px" : "0") : "auto",
          marginBottom: "20px",
          borderRadius: "12px",
        }}
      >
        {/* GROUP 1: Filter By */}
        <div className="w-full sm:w-auto sm:flex-none">
          <Popover>
            <PopoverTrigger asChild>
              <ShadcnButton
                variant="outline"
                id="targeting-filter-by-dropdown"
                className="w-full sm:w-[200px] justify-between active m-0 font-medium h-[40px] px-4 bg-white dark:bg-transparent dark:border-white/10 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
              >
                <span className="truncate mr-2">{gridFilter ? (filter.find(f => f._id === gridFilter)?.name || t("Filter By")) : (t("Filter By"))}</span>
                <ExpandMoreIcon className="text-gray-500" fontSize="small" />
              </ShadcnButton>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 z-[9999] max-h-[300px] overflow-y-auto p-2 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl">
              {filter.filter(f => !f.isDefault).length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t("Saved Filters")}</div>
                  {filter.filter(f => !f.isDefault).map((f) => (
                    <div key={f._id} className="flex justify-between items-center px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors group">
                      <div className="flex-grow truncate cursor-pointer flex items-center text-slate-700 dark:text-slate-200" onClick={() => handleGridFilter({ target: { value: f._id } })}>
                        {appliedFilters.some(filter => filter.savedFilterId === f._id) && (<span className="text-emerald-500 mr-2 font-bold">✓</span>)}
                        {f.name}
                      </div>
                      <ShadcnButton variant="ghost" className="delete-button flex-shrink-0 ml-1 p-1 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-md transition-all w-auto" onClick={(e) => { e.stopPropagation(); handleDeleteFilterClick(f); }} title={t("Delete filter")}>
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

        {/* GROUP 2: Search & Exact Match */}
        <div className="w-full sm:w-auto md:ml-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <label className="m-0 flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 shrink-0" style={{ fontSize: "13px", fontWeight: "500", whiteSpace: "nowrap" }}>
            <Checkbox
              checked={isExactSearchMatch}
              onCheckedChange={(checked) => setIsExactSearchMatch(checked)}
              className="w-4 h-4 cursor-pointer"
            />
            {t("Exact match")}
          </label>

          <div id="targeting-search-option" className="search_option m-0 flex items-center w-full sm:w-[320px] relative h-[40px]">
            <Input
              type="text"
              value={searchName}
              placeholder={t("searchHere")}
              onChange={(e) => setSearchName(e.target.value)}
              className="w-full pl-3 pr-10 h-10"
            />
            {searchName && (
              <MdOutlineClose
                onClick={() => setSearchName("")}
                style={{
                  position: "absolute",
                  right: "12px",
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

        {/* GROUP 3: Date Picker */}
        <div id="targeting-date-picker" className="w-full sm:w-auto">
          <DateRangePicker
            className="w-full sm:w-[260px]"
            ranges={predefinedRanges}
            value={date}
            placeholder={t("Select Date")}
            onChange={handleDateChange}
            placement={isMobile ? "bottomStart" : "bottomEnd"}
            format="yyyy-MM-dd"
            cleanable={false}
            style={{ height: "40px" }}
          />
        </div>

        {/* GROUP 4: Refresh button */}
        <div className="flex gap-2 w-full sm:w-auto">
          <AppTooltip text={t("Refresh")}>
            <ShadcnButton
              variant="outline"
              id="targeting-refresh-button"
              onClick={refreshGrid}
              className="h-10 px-3 bg-white dark:bg-[#1e293b] w-full sm:w-auto"
            >
              <RefreshIcon style={{ fontSize: 18 }} />
            </ShadcnButton>
          </AppTooltip>
        </div>
      </div >



      <div className="middle_container">
        {/* Smart Breadcrumbs - Sticky & Highlighted */}
        {breadcrumbData && (
          <div className="budget_container pt-3">
            <div className="mt-4">
              <Breadcrumb
                paths={[
                  { label: "Campaigns", link: "/campaigns" },
                  { label: breadcrumbData.campaignName },
                  ...(breadcrumbData.adGroupName ? [{ label: breadcrumbData.adGroupName }] : [])
                ]}
                onBack={() => navigate("/campaigns")}
              />
            </div>
          </div>
        )}
        {showAllTypes && (
          <div style={{ padding: "0 0 10px 0" }}>
            <AdTypeScopeNote selectedAdType={selectedAdType} excludedAdTypes={targetingData?.excludedAdTypes} />
          </div>
        )}
        <Chart chartLoading={chartLoading} chartData={chartData} totalRow={totalRow} id={"targeting-chart"} />
        {/* Glass Grid Container Wrapper */}
        <div className="data_content data_content_btn m-0" style={{ padding: 0, border: "none", boxShadow: "none" }}>
          {/* Glass Grid Container */}
          <div className="glass-grid-container overflow-hidden">
            <div
              className="data_model_btn camapgin_btn"
              style={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "flex-start" : "center",
                justifyContent: "flex-start",
                flexWrap: "wrap",
                gap: 10,
                padding: isMobile ? "10px 14px" : "12px 24px",
              }}
            >
              <div>
                <h5 className="m-0 font-bold" style={{ color: "#334155" }}>{t("targeting")}</h5>
              </div>

            </div>

            <div className="flex flex-col xl:flex-row items-start xl:items-center px-4 py-2 gap-3 justify-between w-full">
              <div id="targeting-tabs" className="flex flex-wrap gap-2 mt-2">
                {TABS.map((item) => (
                  <ShadcnButton
                    key={item.label}
                    variant={targetingTabFilter === item?.label ? "default" : "outline"}
                    className={targetingTabFilter === item?.label ? "btn-campaign-primary m-0 gap-2 flex items-center justify-center h-9 px-4 rounded-md shadow-sm" : "m-0 gap-0 h-9 px-4 bg-white dark:bg-[#1e293b]"}
                    onClick={() => {
                      if (targetingTabFilter !== item?.label) {
                        setTableData([]);
                        setIsTableLoading(true);
                        setTargetingTabFilter(item?.label);
                      }
                    }}
                  >
                    {t(item?.title)}
                  </ShadcnButton>
                ))}
              </div>
              {/* Action Buttons (Bulk Actions, History & Columns) moved here */}
              <div className="flex flex-wrap items-center gap-2 mt-2" style={{ width: isMobile ? "100%" : "auto", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
                {(selectedRows?.length > 0 || isTourActive) && PermissionCheck(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.UPDATE) && (
                  <div id="bulk-actions-dropdown" style={{ flex: "0 0 auto" }}>
                    <Popover>
                      <PopoverTrigger asChild>
                        <ShadcnButton
                          variant="outline"
                          className="customize-button m-0 gap-1 whitespace-nowrap"
                        >
                          {t("Bulk actions")}
                          <i className="fa fa-chevron-down ml-1 text-[10px] opacity-70" />
                        </ShadcnButton>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[200px] bg-white dark:bg-[#1e293b]">
                        <div disabled className="font-semibold text-slate-400">
                          {t("Selected")}: {selectedRows?.length} {selectedRows?.length === 1 ? t("row") : t("rows")}
                        </div>
                        <hr className="-mx-1 my-1 h-px bg-slate-100 dark:bg-slate-800 border-0" />
                        <div className="px-2 py-1.5 text-sm font-bold text-slate-800 dark:text-slate-200">{t("Quick Actions")}</div>
                        <div className="cursor-pointer focus:bg-slate-100 dark:focus:bg-slate-800" onClick={() => handleAction("ENABLED")}>{t("enabled")}</div>
                        <div className="cursor-pointer focus:bg-slate-100 dark:focus:bg-slate-800" onClick={() => handleAction("PAUSED")}>{t("paused")}</div>
                        <div className="cursor-pointer focus:bg-slate-100 dark:focus:bg-slate-800" onClick={() => handleAction("ARCHIVED")}>{t("archived")}</div>
                        <hr className="-mx-1 my-1 h-px bg-slate-100 dark:bg-slate-800 border-0" />
                        <div className="px-2 py-1.5 text-sm font-bold text-slate-800 dark:text-slate-200">{t("bid")}</div>
                        <div className="cursor-pointer focus:bg-slate-100 dark:focus:bg-slate-800" onClick={() => handleAction("adjust-bid")}>{t("bid Adjustment")}</div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
                <AppTooltip text={t("History")}>
                  <Link id="targeting-history" to={`/targeting/history${campaignId ? `/${campaignId}` : ""}`} className="customize-button m-0 flex items-center whitespace-nowrap" style={{ height: "36px" }}>
                    {t("History")}
                  </Link>
                </AppTooltip>
                <AppTooltip text={t("Customize Columns")}>
                  <ShadcnButton variant="outline" id="targeting-customize-columns" onClick={async () => setShowCustomizeModal(true)} className="m-0 h-9 bg-white dark:bg-[#1e293b] whitespace-nowrap">
                    {t("Columns")} <i className="fa fa-caret-down ml-2"></i>
                  </ShadcnButton>
                </AppTooltip>
                <AppTooltip text={t("Export to Excel")}>
                  <ShadcnButton variant="outline" onClick={exportExcel} className="m-0 h-9 bg-white dark:bg-[#1e293b] whitespace-nowrap">
                    {t("Export")}
                  </ShadcnButton>
                </AppTooltip>
              </div>
            </div>

            <div id="targeting-applied-filter">
              <AppliedFilter
                appliedFilters={appliedFilters}
                handleGridFilter={handleGridFilter}
                handleRemoveSingleFilter={handleRemoveSingleFilter}
                setAppliedFilters={setAppliedFilters}
                setShowSaveFilterModal={setShowSaveFilterModal}
                selectedCampaigns={selectedCampaigns}
                selectedAdGroups={selectedAdGroups}
                onEditCustomFilter={handleEditCustomFilter}
              />
            </div>

            {PermissionCheck(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.VIEW_ONLY) && (
              <div className="data_table position-relative" id="targeting-main-table" style={{ padding: "0 14px 14px 14px" }}>
                <AgTable
                  ref={gridRef}
                  tableId="targeting-main-table"
                  height="calc(100vh - 260px)"
                  loading={!profileId?.value || !selectedAdType || !isFilterReady || isTableLoading}
                  onRefresh={refreshGrid}
                  rowData={tableData?.filter(r => !r?.isTotalRow)}
                  columnDefs={columns}
                  customSaveColumnName="Targeting"
                  isCustomSaveColumns={true}
                  totalRecords={targetingData?.totalRecords ?? 0}
                  perPage={perPage}
                  currentPage={customFilterFlag ? 1 : arg.pageNo}
                  onPageChange={handlePageChange}
                  onPerPageChange={handlePerRowsChange}
                  onSortChanged={handleSortChanged}
                  paginationOptions={paginationRowsPerPageOptions}
                  handleSaveColumns={handleSaveColumns}
                  pinnedBottomRowData={tableData?.some(r => r?.isTotalRow) ? [tableData.find(r => r?.isTotalRow)] : []}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Modal */}
      < TargetingFilterModal
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
      < TargetingSaveFilter
        showSaveFilterModal={showSaveFilterModal}
        setShowSaveFilterModal={setShowSaveFilterModal}
        filterName={filterName}
        setFilterName={setFilterName}
        appliedFilters={appliedFilters}
        getFilter={getFilter}
        targetingTabFilter={TABS?.find((tab) => tab?.label === targetingTabFilter)?.query}
      />

      {/* Delete Filter Confirmation Modal */}
      < TargetingDeleteModal
        showDeleteFilterModal={showDeleteFilterModal}
        setFilterToDelete={setFilterToDelete}
        setShowDeleteFilterModal={setShowDeleteFilterModal}
        filterToDelete={filterToDelete}
        getFilter={getFilter}
      />

      {/* Adjust bid */}
      < TargetingAdjustBidModal
        profileId={profileId}
        showBidModal={showBidModal}
        setShowBidModal={setShowBidModal}
        selectedRows={selectedRows}
        setSelectedRows={setSelectedRows}
        handleSubmit={async () => await ApiListing(arg)}
      />

      <CustomModal
        show={!!statusChange?.id}
        onHide={() => setStatusChange(null)}
        title={t("Confirm Status Change")}
        subtitle={t("Targeting status update")}
        icon="edit"
        iconVariant={statusChange?.isActive ? "success" : "warning"}
        message={t("You are about to {{action}} the targeting {{targeting}} for campaign {{campaign}}.", {
          action: statusChange?.isActive ? t("enable") : t("disable"),
          targeting: statusChange?.row?.targeting || "",
          campaign: statusChange?.row?.campaignName || ""
        })}
        alertText={statusChange?.isActive ? t("This targeting will become active and start serving impressions.") : t("This targeting will be paused and stop serving impressions.")}
        alertVariant={statusChange?.isActive ? "info" : "warning"}
        closeOnBackdrop={false}
        actions={[
          {
            label: t("cancel"),
            cancel: true,
            icon: "close",
            onClick: () => setStatusChange(null),
          },
          {
            label: statusChange?.isActive ? t("enable") : t("disable"),
            variant: statusChange?.isActive ? "success" : "warning",
            icon: statusChange?.isActive ? "check_circle_outline" : "pause_circle_outline",
            onClick: async () => {
              await handleAction(statusChange?.isActive ? "ENABLED" : "PAUSED", [statusChange?.id]);
              setStatusChange(null);
            },
          },
        ]}
      />

      {/* ── Bulk action confirmation ── */}
      <CustomModal
        show={!!bulkConfirm}
        onHide={() => setBulkConfirm(null)}
        title={bulkConfirm?.action === "ENABLED" ? "Enable Targeting" : bulkConfirm?.action === "PAUSED" ? "Pause Targeting" : bulkConfirm?.action === "ARCHIVED" ? "Archive Targeting" : "Confirm Action"}
        subtitle={`${bulkConfirm?.ids?.length ?? 0} row${(bulkConfirm?.ids?.length ?? 0) !== 1 ? "s" : ""} selected`}
        icon={bulkConfirm?.action === "ENABLED" ? "check_circle_outline" : bulkConfirm?.action === "PAUSED" ? "pause_circle_outline" : bulkConfirm?.action === "ARCHIVED" ? "archive" : "edit"}
        iconVariant={bulkConfirm?.action === "ENABLED" ? "success" : bulkConfirm?.action === "PAUSED" ? "warning" : bulkConfirm?.action === "ARCHIVED" ? "danger" : "primary"}
        message={
          bulkConfirm?.action === "ENABLED" ? `You are about to <span class="cm-highlight">enable ${bulkConfirm?.ids?.length} targeting${bulkConfirm?.ids?.length !== 1 ? "s" : ""}</span>. They will become active and start serving impressions.`
            : bulkConfirm?.action === "PAUSED" ? `You are about to <span class="cm-highlight">pause ${bulkConfirm?.ids?.length} targeting${bulkConfirm?.ids?.length !== 1 ? "s" : ""}</span>. They will stop serving impressions immediately.`
              : bulkConfirm?.action === "ARCHIVED" ? `You are about to <span class="cm-highlight">archive ${bulkConfirm?.ids?.length} targeting${bulkConfirm?.ids?.length !== 1 ? "s" : ""}</span>. This action cannot be easily undone.` : ""
        }
        alertText={
          bulkConfirm?.action === "ARCHIVED" ? "Archived targetings cannot be re-enabled. Please confirm before proceeding."
            : bulkConfirm?.action === "PAUSED" ? "Paused targetings will stop spending immediately."
              : "Selected targetings will go live and begin spending."
        }
        alertVariant={bulkConfirm?.action === "ARCHIVED" ? "danger" : bulkConfirm?.action === "PAUSED" ? "warning" : "info"}
        closeOnBackdrop={false}
        actions={[
          {
            label: t("cancel"),
            cancel: true,
            icon: "close",
            onClick: () => setBulkConfirm(null),
          },
          {
            label: bulkConfirm?.action === "ENABLED" ? `${t("enable")} (${bulkConfirm?.ids?.length})` : bulkConfirm?.action === "PAUSED" ? `${t("paused")} (${bulkConfirm?.ids?.length})` : bulkConfirm?.action === "ARCHIVED" ? `${t("archived")} (${bulkConfirm?.ids?.length})` : t("confirm"),
            variant: bulkConfirm?.action === "ENABLED" ? "success" : bulkConfirm?.action === "PAUSED" ? "warning" : bulkConfirm?.action === "ARCHIVED" ? "danger" : "primary",
            icon: bulkConfirm?.action === "ENABLED" ? "check_circle_outline" : bulkConfirm?.action === "PAUSED" ? "pause_circle_outline" : bulkConfirm?.action === "ARCHIVED" ? "archive" : "check",
            onClick: executeAction,
          },
        ]}
      />

      <CustomizeColumns showModal={showCustomizeModal} setShowModal={setShowCustomizeModal} allColumns={columns} selectedColumn={visibleColumns} handler={handleSaveColumns} defaultColumns={defaultColumns} />
    </div >
  );
}

export default Targeting;
