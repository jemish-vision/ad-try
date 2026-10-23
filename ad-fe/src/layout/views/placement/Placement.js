import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useState, useContext, useEffect, useRef, useMemo, useCallback } from "react";
import AgTable from "../../../common/grid/AgTable";
import Filter from "../../../helper/filter/Filter";
import { handleLoader, Toast, useDispatch } from "../../../helper/links/Link";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { ApiGetAllPlacements, ApiUpdatePlacementBid, ApiUpdatePlacementBidApplyInAmazon } from "../../../api-wrapper/placement/ApiPlacement";
import moment from "moment";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import { useTranslation } from "react-i18next";
import { ApiListGetColumns, ApiListUpdateColumns } from "../../../api-wrapper/columns/ApiColumns";
import CustomizeColumns from "../../../helper/modal/CustomizeColumns";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import { exportGridToExcel } from "../../../utility/exportExcel";
import InlineEditPopup from "../../../helper/modal/InlineEditPopup";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import AgCustomHeader from "../../../common/grid/AgCustomHeader";
import { addPlacementQuery } from "../../../utility/createQuery";
import PlacementFilterModal from "./Placement/PlacementFilterModal";
import PlacementSaveFilter from "./Placement/PlacementSaveFilter";
import PlacementDeleteModal from "./Placement/PlacementDeleteModal";
import { ApiFilterListing, ApiGetCampaignAndAdGroupAutoSearch } from "../../../api-wrapper/customer/ApiCustomer";
import AppliedFilter from "../../component/filter/AppliedFilter";
import { StyledCheckbox } from "../../../common/grid/StyledCheckbox";
import { Button as ShadcnButton } from "../../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Input } from "../../../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { ChevronDown as ExpandMoreIcon, RefreshCw as RefreshIcon, X as CloseIcon } from "lucide-react";
import HourlyPlacementTrackingModal from "./Placement/HourlyPlacementTrackingModal";
import { buildMongoQuery, formatCondition } from "../../../utility/common";
import { MdOutlineClose } from "react-icons/md";
import usePageFilter from "../../../helper/filter/usePageFilter";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import { useTour } from "../../../tour";
import { CampaignNameCell } from "../../../utility/campaignNavigation";

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

const PLACEMENT_BID = ["Top of Search", "Rest of Search", "Product pages"]

const TABS = [
  { label: "all_placements", title: "All Placements", query: { placement: { $in: ["Top of Search", "Rest of Search", "Product pages"] } } },
  { label: "audiences", title: "Audiences", query: { placement: { $in: ["Audience Segment"] } } },
  { label: "amazon_business_placements", title: "Amazon Business Placements", query: { placement: { $in: ["Business Placement"] } } },
]

function Placement() {
  const { state: tourState } = useTour();
  const isTourActive = tourState.run && tourState.activeTourId === "placement";

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [disablePinning, setDisablePinning] = useState(window.innerWidth < 1100);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setDisablePinning(window.innerWidth < 1100);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { t } = useTranslation();
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [tableData, setTableData] = useState([]);
  const [placementData, setPlacementData] = useState([]);
  const [perPage, setPerPage] = useState(firstPageRows);
  const [date, setDate] = useState(() => [
    new Date(moment().startOf("month")),
    new Date()
  ]);

  let { profileId, selectedAdType, currencyCode, selectedDate, setSelectedDate } = useContext(ProfileContext);
  const dispatch = useDispatch();
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");
  const lastFetchParamsRef = useRef("");
  // Monotonic id used to discard stale API responses (e.g. when switching tabs quickly)
  const fetchIdRef = useRef(0);
  const lastFilterProfileRef = useRef(null);
  const filterPromiseRef = useRef(null);
  const lastAutoSearchProfileRef = useRef(null);
  const autoSearchPromiseRef = useRef(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  const [bid, setBid] = useState(0);
  const [action, setAction] = useState("");
  const [showBidModal, setShowBidModal] = useState(false);

  // custom filter
  const defaultValue = {
    firstCondition: "",
    firstValue: 0,
    operator: "",
    secondCondition: "",
    secondValue: 0,
    sortType: "DESC",
  };

  const [conditionObj, setConditionObj] = useState(defaultValue);
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [defaultColumns] = useState(["Action", "Campaign Name", "Placement"]);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [customFilterFlag, setCustomFilterFlag] = useState(false);
  const [fieldName, setfieldName] = useState("sales");
  const [selectedRows, setSelectedRows] = useState([]);

  const [filter, setFilter] = useState([]);
  const [filterOptions, setFilterOptions] = useState([]);
  const [filterValue, setFilterValue] = useState("");
  const [gridFilter, setGridFilter] = useState("");
  const [selectedCampaigns, setSelectedCampaigns] = useState([]);
  const [selectedAdGroups, setSelectedAdGroups] = useState([]);
  const [campaignsData, setCampaignsData] = useState([]);
  const [appliedFilters, setAppliedFilters] = useState([]);
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [showDeleteFilterModal, setShowDeleteFilterModal] = useState(false);
  const [filterToDelete, setFilterToDelete] = useState(null);
  const [pendingCampaignSelections, setPendingCampaignSelections] = useState(null);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  // Dedicated loading flag for the placements grid — independent of the campaigns dropdown loading,
  // so the grid overlay stays visible until getAllPlacements itself resolves.
  const [isTableLoading, setIsTableLoading] = useState(true);
  const [selectedFilterOption, setSelectedFilterOption] = useState(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState("");
  const [placementTabFilter, setPlacementTabFilter] = useState("all_placements");

  const [hourlyTrackingCampaigns, setHourlyTrackingCampaigns] = useState([]);
  const [showHourlyTrackingModal, setShowHourlyTrackingModal] = useState(false);

  const gridRef = useRef(null);

  // ── Auto-save and restore page filter ──────────────────────────────────────
  const { isFilterReady } = usePageFilter({
    pageName: "Placement",
    profileId: profileId?.value,
    selectedAdType,
    appliedFilters,
    setAppliedFilters,
    // We don't need onFilterLoad here because Placement uses CampaignsAndAdGroups 
    // which gets hydrated from appliedFilters automatically in handleFilterOptionClick when the modal opens.
  });

  const [openFilterField, setOpenFilterField] = useState(null);

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

  const checkOrderColumns = useCallback((title) => {
    const matched = visibleColumns?.find(col => col?.title === title);
    return {
      width: matched?.width ?? 200,
      hide: Boolean(visibleColumns?.length && !matched),
      order: matched?.order ?? 9999,
    };
  }, [visibleColumns]);

  // Helper: get all eligible row IDs (non-total rows with a valid PLACEMENT_BID placement)
  const getEligibleRowIds = (rows) => rows.filter(row => !row?.isTotalRow && PLACEMENT_BID.includes(row.placement)).map(row => `${row?.campaignId}-${row.placement.replace(/\s+/g, "_")}`);

  const columns = useMemo(() => [
    {
      headerName: "",
      field: "_checkbox",
      title: "Action",
      maxWidth: 50,
      pinned: (disablePinning || isTourActive) ? null : "left",
      lockPinned: !(disablePinning || isTourActive),
      suppressMovable: true,
      sortable: false,
      resizable: false,
      headerComponent: () => (
        <div className="flex items-center justify-center" style={{ width: "100%" }}>
          <StyledCheckbox
            disabled={!PermissionCheck(SYSTEM_PAGES.PLACEMENT, PAGE_ACTIONS.UPDATE)}
            checked={
              selectedRows.length > 0 &&
              getEligibleRowIds(tableData).every(id => selectedRows.includes(id))
            }
            onChange={(e) => {
              if (e.target.checked) {
                const eligibleIds = getEligibleRowIds(tableData);
                setSelectedRows(eligibleIds);
              } else {
                setSelectedRows([]);
              }
            }}
          />
        </div>
      ),
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row || row?.isTotalRow) return null;
        const rowId = `${row?.campaignId}-${row.placement.replace(/\s+/g, "_")}`;
        const isEligible = PLACEMENT_BID.includes(row.placement);
        const isDisabled = !PermissionCheck(SYSTEM_PAGES.PLACEMENT, PAGE_ACTIONS.UPDATE) || !isEligible;
        return (
          <StyledCheckbox
            checked={selectedRows.includes(rowId)}
            disabled={isDisabled}
            onChange={(e) => {
              if (e.target.checked) {
                setHourlyTrackingCampaigns(prev => [...prev, row.campaignId]);
                setSelectedRows(prev => [...prev, rowId]);
              } else {
                setHourlyTrackingCampaigns(prev => prev.filter(id => id !== row.campaignId));
                setSelectedRows(prev => prev.filter(id => id !== rowId));
              }
            }}
          />
        );
      },
    },
    {
      headerName: t("campaignName"),
      field: "campaignName",
      title: "Campaign Name",
      ...(checkOrderColumns("Campaign Name")),
      pinned: disablePinning ? null : "left",
      lockPinned: !disablePinning,
      suppressMovable: true,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return <CampaignNameCell row={row} name={params.value} />;
      },
    },
    {
      headerName: t("placement"),
      field: "placement",
      title: "Placement",
      ...(checkOrderColumns("Placement")),
      pinned: disablePinning ? null : "left",
      lockPinned: !disablePinning,
      suppressMovable: true,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: t("bidStartegy"),
      field: "biddingStartegy",
      title: "Bidding Startegy",
      ...(checkOrderColumns("Bidding Startegy")),
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: t("bid Adjustment"),
      field: "placementModifier",
      title: "Bid Adjustment",
      ...(checkOrderColumns("Bid Adjustment")),
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "placementModifier", hasFilter: true },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <InlineEditPopup
            value={Number(typeof row.placementModifier === "object" ? row.placementModifier?.$numberDecimal : row.placementModifier)}
            formatter={(v) => CurrencyFormat(v)}
            title={t("Bid")}
            currency={currencyCode}
            onSave={async (newBid) => await updateBidAdjustment(row.campaignId, row.placement, newBid)}
            append={"%"}
            disabled={!PermissionCheck(SYSTEM_PAGES.PLACEMENT, PAGE_ACTIONS.UPDATE) || !PLACEMENT_BID?.includes(row.placement)}
          />
        );
      },
    },
    {
      headerName: t("impressions"),
      field: "impressions",
      title: "Impressions",
      exportFormatter: (val) => val !== "" && val != null ? val : 0,
      ...(checkOrderColumns("Impressions")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{CurrencyFormat(params.value ?? 0)}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "impressions", hasFilter: true },
    },
    {
      headerName: t("clicks"),
      field: "clicks",
      title: "Clicks",
      exportFormatter: (val) => val !== "" && val != null ? val : 0,
      ...(checkOrderColumns("Clicks")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{CurrencyFormat(params.value ?? 0)}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "clicks", hasFilter: true },
    },
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
    {
      headerName: t("Orders"),
      field: "orders",
      title: "Orders",
      exportFormatter: (val) => val !== "" && val != null ? val : 0,
      ...(checkOrderColumns("Orders")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{CurrencyFormat(params.value ?? 0)}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "orders", hasFilter: true },
    },
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
    {
      headerName: t("acos"),
      field: "acos",
      title: "ACOS",
      exportFormatter: (val) => val ? `${val}%` : "N/A",
      ...(checkOrderColumns("ACOS")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{`${params.value}%`}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "acos", hasFilter: true },
    },
    {
      headerName: t("roas"),
      field: "roas",
      title: "ROAS",
      exportFormatter: (val) => val !== "" && val != null ? val : "—",
      ...(checkOrderColumns("ROAS")),
      sortable: true,
      resizable: true,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "roas", hasFilter: true },
    },
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
    {
      headerName: t("ctr"),
      field: "ctr",
      title: "CTR",
      exportFormatter: (val) => val ? `${val}%` : "N/A",
      ...(checkOrderColumns("CTR")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{`${params.value}%`}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "ctr", hasFilter: true },
    },
  ], [disablePinning, selectedRows, tableData, t, visibleColumns, sharedFilterParams, checkOrderColumns]);

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
      const firstDate = new Date(moment().startOf("month"));
      const lastDate = new Date();
      setDate([firstDate, lastDate]);
    }
  }, [selectedDate]);

  const refreshGrid = () => {
    localStorage.removeItem("AffectedPlacements");
    ApiListing({ ...arg, isReload: true, skipLoader: true });
  };

  const ApiListing = async (arg) => {
    const isReload = !!arg?.skipLoader || !!arg?.isReload;

    // Get selected campaign and ad group IDs from applied filters
    const campaignsAndAdGroupsFilter = appliedFilters.find(filter => filter.type === "CampaignsAndAdGroups");
    const campaignIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => item.adGroups).map(campaign => campaign.id) : [];
    const adGroupIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => !item.adGroups).map(adGroup => adGroup.id) : [];

    const fromDateStr = moment(date?.[0]).format("YYYY-MM-DD");
    const toDateStr = moment(date?.[1]).format("YYYY-MM-DD");
    const searchNameVal = arg?.hasOwnProperty("searchName") ? arg.searchName : debouncedSearchName;
    const pageNoVal = arg?.pageNo ?? (arg?.pageNo || 1);
    const perPageVal = arg?.perPage ?? perPage;

    const requestSignature = JSON.stringify({
      profileId: profileId?.value,
      selectedAdType,
      fromDate: fromDateStr,
      toDate: toDateStr,
      searchName: searchNameVal,
      placementTabFilter,
      campaignId: campaignIds,
      adGroupId: adGroupIds,
      appliedFilters: (appliedFilters || []).map(f => f.id || f.displayText || f.type),
      gridFilter: gridFilter || "",
      pageNo: pageNoVal,
      perPage: perPageVal,
      sortType: arg?.sortType || conditionObj?.sortType || "DESC",
      fieldName: arg?.fieldName || fieldName || "sales"
    });

    if (!isReload && !arg?.isForce && lastFetchParamsRef.current === requestSignature) {
      return;
    }

    lastFetchParamsRef.current = requestSignature;
    setIsTableLoading(true);
    const apiOptions = { skipLoader: true };

    const rawPlacements = localStorage.getItem("AffectedPlacements");
    let placements = [];
    if (rawPlacements) {
      try {
        placements = JSON.parse(rawPlacements);
      } catch (err) {
        placements = [];
      }
    }

    if (profileId?.value && selectedAdType) {
      const currentFetchId = ++fetchIdRef.current;
      const data = {
        searchName: searchNameVal,
        appliedFilters,
        profileId: profileId.value,
        fromDate: fromDateStr,
        toDate: toDateStr,
        fieldName: arg?.fieldName || fieldName,
        sortType: arg?.sortType || conditionObj?.sortType,
        campaignId: campaignIds,
        adGroupId: adGroupIds,
        placementTabFilter: TABS?.find((tab) => tab?.label === placementTabFilter)?.query,
        filteredPlacements: Array.isArray(placements) ? placements.map(st => ({ campaignId: st.campaignId, placement: st.placement })) : [],
        ...arg,
      };

      data.query = addPlacementQuery(data);
      delete data.appliedFilters;

      try {
        const [e] = await Promise.all([
          ApiGetAllPlacements(data, apiOptions),
          new Promise(resolve => setTimeout(resolve, 300))
        ]);

        // A newer request has started (tab switch / filter change / pagination).
        // Discard this stale response so it can't overwrite the current tab's data.
        if (currentFetchId !== fetchIdRef.current) return;

        if (e?.isSuccess) {
          dispatch(handleLoader(false));
          setTableData(e?.getPlacement);
          setPlacementData(e);
          if (isReload) {
            Toast.success(e?.message);
          }
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
    } else {
      setIsTableLoading(false);
    }
  };

  const exportExcel = async () => {
    if (profileId.value && selectedAdType) {
      dispatch(handleLoader(true));
      try {
        const placements = JSON.parse(localStorage.getItem("AffectedPlacements") || "[]");
        const campaignsAndAdGroupsFilter = appliedFilters.find(filter => filter.type === "CampaignsAndAdGroups");
        const campaignIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => item.adGroups).map(campaign => campaign.id) : [];
        const adGroupIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => !item.adGroups).map(adGroup => adGroup.id) : [];

        const data = {
          searchName: searchName,
          appliedFilters,
          profileId: profileId.value,
          fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
          toDate: moment(date?.[1]).format("YYYY-MM-DD"),
          fieldName: fieldName,
          sortType: conditionObj?.sortType,
          campaignId: campaignIds,
          adGroupId: adGroupIds,
          placementTabFilter: TABS?.find((tab) => tab?.label === placementTabFilter)?.query,
          filteredPlacements: placements.map(st => ({ campaignId: st.campaignId, placement: st.placement })),
          pageNo: 1,
          perPage: 100000,
        };

        data.query = addPlacementQuery(data);
        delete data.appliedFilters;

        const response = await ApiGetAllPlacements(data);

        if (response?.isSuccess) {
          const allData = response?.getPlacement || [];

          const getTotalsRow = () => {
            const totalRow = response?.totalRow ?? {};
            return {
              _checkbox: `Total: ${response?.totalRecords || 0}`,
              campaignName: `Total: ${response?.totalRecords || 0}`,
              impressions: totalRow?.impressions,
              clicks: totalRow?.clicks,
              spend: totalRow?.spend,
              orders: totalRow?.orders,
              sales: totalRow?.sales,
              acos: totalRow?.acos,
              roas: totalRow?.roas,
              cpc: totalRow?.cpc,
              ctr: totalRow?.ctr,
              isTotalRow: true,
            };
          };

          const totalRowObj = (allData.length > 0 && response?.totalRow) ? getTotalsRow() : null;
          exportGridToExcel(allData, columns, "placement_export.xls", totalRowObj);
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

  const updateBidAdjustment = async (campaignId, placement, newBid) => {
    const payload = {
      profileId: profileId?.value,
      campaignIds: [campaignId],
      ...(Boolean(placement === "Top of Search") && { topOfSearchBid: newBid }),
      ...(Boolean(placement === "Rest of Search") && { restOfSearchBid: newBid }),
      ...(Boolean(placement === "Product pages") && { productPageBid: newBid }),
    };

    await ApiUpdatePlacementBid(payload)
      .then(async (e) => {
        if (e?.isSuccess) {
          Toast.success(e?.message);
          ApiListing({ ...arg, isForce: true });
        } else {
          Toast.error(e?.message);
        }
      })
      .catch((e) => {
        Toast.error(t("Something went wrong"));
      });
  }

  useEffect(() => {
    lastFetchParamsRef.current = "";
    lastAutoSearchProfileRef.current = null;
    lastFilterProfileRef.current = null;
  }, [profileId?.value]);

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
    }
  }, [selectedDate]);

  useEffect(() => {
    if (isFilterReady && profileId?.value && selectedAdType) ApiListing(arg);
  }, [isFilterReady, profileId?.value, selectedAdType, date, gridFilter, appliedFilters, placementTabFilter, debouncedSearchName]);
  useEffect(() => {
    const fetchCustomColumns = async () => {
      const body = { pageName: "Placement" };
      const response = await ApiListGetColumns(body);

      if (response?.isSuccess && response?.data && response?.data?.columns?.length) {
        const visible = (columns ?? [])
          .map(c => ({ ...c, ...response?.data?.columns.find(col => col.title === c.title) }))
          .filter(c => c?.isDisplay || !c?.title)
          .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
          .filter(Boolean);

        setVisibleColumns(visible);
      } else {
        setVisibleColumns(columns);
      }
    };

    if (profileId?.value && selectedAdType) fetchCustomColumns();
  }, [profileId?.value, selectedAdType]);

  const handleSaveColumns = async (selectedColumns) => {
    setShowCustomizeModal(false);

    const optimisticVisible = (columns ?? [])
      .map(c => ({ ...c, ...selectedColumns.find(col => col.title === c.title) }))
      .filter(c => c?.isDisplay || !c?.title)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .filter(Boolean);
    setVisibleColumns(optimisticVisible);

    const body = {
      pageName: "Placement",
      columns: selectedColumns,
    };
    const response = await ApiListUpdateColumns(body);
    if (response?.isSuccess && response?.data?.columns) {
      const visible = (columns ?? [])
        .map(c => ({ ...c, ...response?.data?.columns.find(col => col.title === c.title) }))
        .filter(c => c?.isDisplay || !c?.title)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .filter(Boolean);
      setVisibleColumns(visible);
    }
  };

  const handlePageChange = (page) => {
    setIsTableLoading(true);
    setArg({ pageNo: page, perPage: perPage });
    ApiListing({ pageNo: page, perPage: perPage });
  };

  const handlePerRowsChange = async (newPerPage) => {
    setIsTableLoading(true);
    setArg({ pageNo: 1, perPage: newPerPage });
    setPerPage(newPerPage);
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
    const nextArg = { ...arg, fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }) };
    setArg(nextArg); // persist so future effect-driven refetches keep the active sort
    ApiListing(nextArg);
  };

  const handleAction = (action) => {
    setAction(action);
    setShowBidModal(true);
  }

  const handleClose = () => {
    setShowBidModal(false);
  }

  const handleSubmit = async (e) => {

    const placementList = selectedRows.flatMap((term) => {

      const termSep = term.split('-');
      const campaignId = Number(termSep[0]);
      const placement = termSep[1].replace(/_/g, " ");

      const row = tableData.find((item) => item.campaignId === campaignId && item.placement === placement);
      if (!row) return null;

      let newBid;
      if (action === "increase-perc") {
        newBid = row.placementModifier + (row.placementModifier * bid / 100);
      }
      else if (action === "decrease-perc") {
        newBid = row.placementModifier - (row.placementModifier * bid / 100);
      }
      else if (action === "set") {
        newBid = bid;
      }

      if (placement === "Top of Search") {
        return { campaignId: row?.campaignId, topOfSearchBid: Math.round(newBid) };
      }
      else if (placement === "Product pages") {
        return { campaignId: row?.campaignId, productPageBid: Math.round(newBid) };
      }
      else {
        return { campaignId: row?.campaignId, restOfSearchBid: Math.round(newBid) };
      }
    })

    await ApiUpdatePlacementBidApplyInAmazon({ placements: placementList, profileId: profileId.value })
      .then(async (e) => {
        if (e?.isSuccess) {
          Toast.success(e?.message);
          setShowBidModal(false);
          ApiListing(arg);
        } else {
          Toast.error(e?.message);
        }
      })
      .catch((e) => {
        Toast.error(t("Something went wrong"));
      });

  }

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
    const data = { profileId: profileId.value, pageName: "Placement" };
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
    setFilterPopoverOpen(false);
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
        if (!['CampaignsAndAdGroups'].includes(key) && !processedConditionalFields.has(key)) {
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
              "placementModifier": "BidAdjustment"
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
    setFilterPopoverOpen(false);
    setFilterToDelete(filter);
    setShowDeleteFilterModal(true);
  };

  // Handle filter option click
  const handleFilterOptionClick = (option) => {

    // Check if there's an existing applied filter for this option and pre-populate
    const existingFilter = appliedFilters.find(filter => filter.type === option.value);

    setSelectedFilterOption(option);

    if (option.value === "CampaignsAndAdGroups") {
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
    setSelectedFilterOption(null);
    setSelectedCondition("$eq");
    setFilterValue("0.00");
    setSelectedCampaigns([]);
    setSelectedAdGroups([]);
  };

  // Handle remove single filter
  const handleRemoveSingleFilter = (filterId) => setAppliedFilters(prev => prev.filter(filter => filter.id !== filterId));

  const handleDateChange = (e) => {
    setDate(e);
    if (e && Array.isArray(e) && e.length >= 2) {
      const arr = [moment(e[0]).format("YYYY-MM-DD"), moment(e[1]).format("YYYY-MM-DD")];
      setSelectedDate(arr);
      try {
        let storeData = JSON.parse(localStorage.getItem('profile')) || {};
        storeData.date = arr;
        localStorage.setItem('profile', JSON.stringify(storeData));
      } catch (err) { }
    }
  };

  const handleCloseHourlyTrackingModel = async () => {
    setShowHourlyTrackingModal(false);
    setHourlyTrackingCampaigns([]);
    setSelectedRows([]);
  }

  return (
    <div className="placement-tracking-container" id="placement-page">
      <Filter nameShow={false} dateShow={false} profileShow={true} />
      <div className="middle_container">
        {/* Sticky Filters Header */}
        <div
          id="placement-filters"
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
            top: 0,
            marginLeft: 0,
            marginRight: 0,
            marginTop: "-10px",
            marginBottom: "20px",
          }}
        >
          {/* Filter By */}
          <div style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
            <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
              <PopoverTrigger asChild>
                <ShadcnButton
                  variant="outline"
                  id="bulk-actions-dropdown"
                  className="w-full justify-between active m-0 font-medium h-[40px] px-4 bg-white dark:bg-transparent dark:border-white/10 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
                  style={{ width: "100%", height: "40px" }}
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

          {/* Date Picker */}
          <div style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }} className={isMobile ? "" : "ml-auto"}>
            <DateRangePicker
              className="w-full sm:w-[260px]"
              style={{ width: isMobile ? "100%" : "260px", height: "40px" }}
              ranges={predefinedRanges}
              value={date}
              placeholder={t("Select Date")}
              onChange={handleDateChange}
              placement={isMobile ? "bottomStart" : "bottomEnd"}
              format="yyyy-MM-dd"
              cleanable={false}
            />
          </div>

          {/* Refresh Action Button */}
          <div className="flex" style={{ gap: 10, width: isMobile ? "100%" : "auto" }}>
            <AppTooltip text={t("Refresh")} id="placement-refresh-button">
              <ShadcnButton
                variant="outline"
                onClick={refreshGrid}
                className="h-[40px] w-[40px] p-0 bg-white dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-700 dark:text-white/80 hover:bg-slate-100 dark:hover:bg-white/10"
                style={{ flex: isMobile ? 1 : "initial" }}
              >
                <RefreshIcon style={{ fontSize: 18 }} />
              </ShadcnButton>

            </AppTooltip>
          </div>
        </div>

        {/* Glass Grid Container Wrapper */}
        <div className="data_content data_content_btn m-0" style={{ padding: 0, border: "none", boxShadow: "none" }}>
          {/* Glass Grid Container */}
          <div className="glass-grid-container overflow-hidden" id="placement-data">
            {/* Table actions bar */}
            <div
              className="data_model_btn camapgin_btn"
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-start",
                flexWrap: "wrap",
                gap: 10,
                padding: isMobile ? "10px 14px" : "12px 24px",
              }}
            >
              {/* Title */}
              <div style={{ width: isMobile ? "100%" : "auto" }}>
                <h5 className="m-0 font-bold">{t("placement")}</h5>
              </div>

              {/* Spacer to push controls to the right */}
              {!isMobile && <div style={{ marginLeft: "auto" }} />}

              {/* Bulk Actions (Contextual) */}
              {(selectedRows?.length > 0 || isTourActive) && PermissionCheck(SYSTEM_PAGES.PLACEMENT, PAGE_ACTIONS.UPDATE) && (
                <div id="bulk-actions-dropdown" style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
                  <Popover>
                    <PopoverTrigger asChild>
                      <ShadcnButton
                        variant="outline"
                        className="customize-button m-0 gap-0"
                      >
                        {t("Bulk actions")}
                        <ExpandMoreIcon style={{ fontSize: 18 }} className="ml-2 text-slate-500" />
                      </ShadcnButton>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[290px] z-[9999] bg-white dark:bg-[#0f172a] border-slate-200 dark:border-white/10">
                      <div className="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-slate-700 dark:text-white/80 focus:bg-slate-100 dark:focus:bg-white/10" onClick={() => handleAction("increase-perc")} >{t("➕ Increase Bid Adjustment (%)")}</div>
                      <div className="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-slate-700 dark:text-white/80 focus:bg-slate-100 dark:focus:bg-white/10" onClick={() => handleAction("decrease-perc")} >{t("➖ Decrease Bid Adjustment (%)")}</div>
                      <div className="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-slate-700 dark:text-white/80 focus:bg-slate-100 dark:focus:bg-white/10" onClick={() => handleAction("set")} >{t("🟰 Set Bid (%)")}</div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}


              {/* Search option */}
              <div id="placement-search-option" className="search_option m-0 flex items-center" style={{ position: "relative", width: isMobile ? "100%" : "auto", minWidth: isMobile ? "auto" : "320px", height: "36px" }}>
                <Input
                  type="text"
                  placeholder={t("searchHere")}
                  value={searchName}
                  onChange={(e) => handleSearch(e)}
                  className="w-full h-[36px] border-none shadow-none bg-transparent text-[13px] px-3 pr-8 focus-visible:ring-0 text-slate-900 dark:text-white placeholder:text-slate-400"
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

              {/* Hourly Tracking */}
              <AppTooltip text={t("Hourly Data Tracking")}>
                <ShadcnButton
                  id="placement-hourly-data"
                  variant="outline"
                  onClick={() => { setShowHourlyTrackingModal(true); }}
                  className="customize-button m-0 gap-0"
                >
                  {t("Hourly Data")}
                  {selectedRows?.length > 0 && (
                    <span
                      className="bg-primary text-white ml-2 flex items-center justify-center"
                      style={{ borderRadius: "50%", width: "22px", height: "22px", fontSize: "11px", padding: 0, fontWeight: "bold" }}
                    >
                      {selectedRows.length}
                    </span>
                  )}
                </ShadcnButton>
              </AppTooltip>

              {/* Columns Customizer */}
              <AppTooltip text={t("Customize Columns")} id="placement-customize-columns">
                <ShadcnButton
                  variant="outline"
                  onClick={async () => setShowCustomizeModal(true)}
                  className="customize-button m-0 gap-0"
                >
                  {t("Columns")}
                  <span style={{ fontSize: 10 }}>▼</span>
                </ShadcnButton>
              </AppTooltip>
              <AppTooltip text={t("Export to Excel")}>
                <ShadcnButton
                  variant="outline"
                  onClick={exportExcel}
                  className="customize-button m-0 gap-0"
                >
                  {t("Export")}
                </ShadcnButton>
              </AppTooltip>
            </div>

            {/* Placement Tabs row below grid actions bar */}
            <div id="placement-tabs" className="flex flex-md-row items-start md:items-center px-4 py-2 gap-2 gap-md-3 justify-start">
              <div className="flex flex-wrap gap-3 mt-2">
                {TABS.map((item) => (
                  <ShadcnButton
                    key={item.label}
                    variant={placementTabFilter === item?.label ? "default" : "outline"}
                    className={`h-[36px] whitespace-nowrap font-medium px-4 ${placementTabFilter === item?.label ? "bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] text-white hover:opacity-90 border-0" : "bg-white dark:bg-[#0f172a] border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                    onClick={() => {
                      if (placementTabFilter !== item?.label) {
                        setTableData([]);
                        setIsTableLoading(true);
                        setPlacementTabFilter(item?.label);
                      }
                    }}
                  >
                    {t(item?.title)}
                  </ShadcnButton>
                ))}
              </div>
            </div>

            <AppliedFilter
              id="placement-applied-filter"
              appliedFilters={appliedFilters}
              handleGridFilter={handleGridFilter}
              handleRemoveSingleFilter={handleRemoveSingleFilter}
              setAppliedFilters={setAppliedFilters}
              setShowSaveFilterModal={setShowSaveFilterModal}
              selectedCampaigns={selectedCampaigns}
              selectedAdGroups={selectedAdGroups}
              onEditCustomFilter={handleEditCustomFilter}
            />

            {PermissionCheck(SYSTEM_PAGES.PLACEMENT, PAGE_ACTIONS.VIEW_ONLY) && (
              <div className="data_table position-relative" id="placement-main-table" style={{ padding: "0 14px 14px 14px" }}>
                <AgTable
                  ref={gridRef}
                  tableId="placement-main-table"
                  height="calc(100vh - 260px)"
                  loading={!profileId?.value || !selectedAdType || !isFilterReady || isTableLoading}
                  onRefresh={refreshGrid}
                  rowData={tableData}
                  columnDefs={columns}
                  customSaveColumnName="Placement"
                  isCustomSaveColumns={true}
                  totalRecords={placementData?.totalRecords ?? 0}
                  perPage={perPage}
                  currentPage={customFilterFlag ? 1 : arg.pageNo}
                  onPageChange={handlePageChange}
                  onPerPageChange={handlePerRowsChange}
                  onSortChanged={handleSortChanged}
                  paginationOptions={paginationRowsPerPageOptions}
                  handleSaveColumns={handleSaveColumns}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showBidModal} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("Bid Multiplier")}</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <div className="row mb-3">
              <div className="col-12">
                <label className="form-label fw-medium">
                  {t("Enter Bid percentage")}
                </label>
                <Input
                  type="number"
                  name="bidAdjustment"
                  value={bid}
                  onChange={(e) => setBid(e.target.value)}
                  className="h-[40px] bg-white dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white shadow-none mt-1"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex justify-end gap-2">
            <ShadcnButton onClick={handleSubmit} className="bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] hover:opacity-90 border-0 text-white font-semibold">
              {t("submit")}
            </ShadcnButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>




      {/* Filter Modal */}
      <PlacementFilterModal
        showFilterModal={showFilterModal}
        handleModalClose={handleModalClose}

        CONDITION_OPTIONS={CONDITION_OPTIONS}

        selectedFilterOption={selectedFilterOption}
        campaignsLoading={campaignsLoading}
        campaignsData={campaignsData}
        selectedCampaigns={selectedCampaigns}
        selectedAdGroups={selectedAdGroups}
        selectedCondition={selectedCondition}
        setSelectedCondition={setSelectedCondition}
        setAppliedFilters={setAppliedFilters}
        filterValue={filterValue}
        setFilterValue={setFilterValue}
        setSelectedAdGroups={setSelectedAdGroups}
        setSelectedCampaigns={setSelectedCampaigns}

        getCampaignsData={getCampaignsData}
      />

      {/* Save Filter Modal */}
      <PlacementSaveFilter
        showSaveFilterModal={showSaveFilterModal}
        setShowSaveFilterModal={setShowSaveFilterModal}
        filterName={filterName}
        setFilterName={setFilterName}
        appliedFilters={appliedFilters}
        getFilter={getFilter}
      />

      {/* Delete Filter Confirmation Modal */}
      <PlacementDeleteModal
        showDeleteFilterModal={showDeleteFilterModal}
        setFilterToDelete={setFilterToDelete}
        setShowDeleteFilterModal={setShowDeleteFilterModal}
        filterToDelete={filterToDelete}
        getFilter={getFilter}
      />

      {/* Hourly Tracking Modal */}
      <HourlyPlacementTrackingModal
        showModal={showHourlyTrackingModal}
        setShowModal={setShowHourlyTrackingModal}
        campaignId={hourlyTrackingCampaigns}
        profileId={profileId?.value}
        closeHandler={handleCloseHourlyTrackingModel}
      />

      <CustomizeColumns showModal={showCustomizeModal} setShowModal={setShowCustomizeModal} allColumns={columns} selectedColumn={visibleColumns} handler={handleSaveColumns} defaultColumns={defaultColumns} />
    </div>
  );
}

export default Placement;
