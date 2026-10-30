import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useState, useContext, useEffect, useRef, useMemo, useCallback } from "react";
import { Button as ShadcnButton } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import AgTable from "../../../common/grid/AgTable";
import ReactDOM from "react-dom";
import Filter from "../../../helper/filter/Filter";
import { handleLoader, Link, Toast, useDispatch, useNavigate } from "../../../helper/links/Link";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { ApiAddToNegative, ApiAddNegativeToCampaign, ApiGetAllSearchTerms, ApiAddToNegativeProduct, ApiGetSearchTermsProductView } from "../../../api-wrapper/search-term/ApiSearchTerm";
import ProductSearchTerms from "./SearchTerms/ProductSearchTerms";
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
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  MdExpandMore as ExpandMoreIcon,
  MdRefresh as RefreshIcon,
  MdClose as CloseIcon,
  MdOutlineCampaign as CampaignOutlinedIcon,
  MdOutlineInventory as InventoryOutlinedIcon,
  MdOutlineClose
} from "react-icons/md";
import CampaignAndAdGroupModel from "./CampaignAndAdGroupModel";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import AgCustomHeader from "../../../common/grid/AgCustomHeader";
import { addSearchTermQuery } from "../../../utility/createQuery";
import { ApiFilterListing, ApiGetCampaignAndAdGroupAutoSearch } from "../../../api-wrapper/customer/ApiCustomer";
import SearchTermSaveFilter from "./SearchTerms/SearchTermSaveFilter";
import SearchTermDeleteModal from "./SearchTerms/SearchTermDeleteModal";
import SearchTermFilterModal from "./SearchTerms/SearchTermFilterModal";
import { CampaignNameCell } from "../../../utility/campaignNavigation";
import SummaryModal from "../../../helper/modal/SummaryModal";
import AppliedFilter from "../../component/filter/AppliedFilter";
import { Checkbox } from "../../../components/ui/checkbox";
import { Badge } from "../../../components/ui/badge";
import { buildMongoQuery, formatCondition } from "../../../utility/common";
import { CustomModal } from "../../../helper/modal/CustomModal";
import usePageFilter from "../../../helper/filter/usePageFilter";
import { AdTypeScopeNote, AdTypeBadge } from "../../../helper/filter/AdTypeScopeNote";
import { isShowingAllAdTypes } from "../../../helper/filter/adTypeAll";
import "./SearchTerm.css";
import { AppTooltip } from "../../../components/ui/AppTooltip";

// Condition options for filter modals
const CONDITION_OPTIONS = [
  { value: "$eq", labelKey: "equalTo" },
  { value: "$ne", labelKey: "notEqualTo" },
  { value: "$gt", labelKey: "greaterThan" },
  { value: "$gte", labelKey: "greaterThanOrEqualTo" },
  { value: "$lt", labelKey: "lessThan" },
  { value: "$lte", labelKey: "lessThanOrEqualTo" }
];

// Portal-based tooltip immune to AG-Grid CSS transform offsets

function SearchTerm() {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignPerPage, setCampaignPerPage] = useState(firstPageRows);
  const [productPage, setProductPage] = useState(1);
  const [productPerPage, setProductPerPage] = useState(10);
  const [tableData, setTableData] = useState([]);
  const [searchTermData, setSearchTermData] = useState([]);
  const [date, setDate] = useState([]);
  const [viewMode, setViewMode] = useState("campaign");
  const [hoveredTab, setHoveredTab] = useState(null);
  const [selectedProductAsin, setSelectedProductAsin] = useState(null);
  const [stPage, setStPage] = useState(1);
  const [stPerPage, setStPerPage] = useState(firstPageRows);
  const [searchTermSearch, setSearchTermSearch] = useState("");
  const [debouncedSearchTermSearch, setDebouncedSearchTermSearch] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTermSearch(searchTermSearch);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchTermSearch]);

  const [selectedCampaignStatus, setSelectedCampaignStatus] = useState("");

  useEffect(() => {
    setStPage(1);
  }, [selectedProductAsin]);

  useEffect(() => {
    if (viewMode === "product" && tableData.length > 0) {
      const exists = tableData.some(p => p.asin === selectedProductAsin);
      if (!exists) {
        setSelectedProductAsin(tableData[0].asin);
      }
    }
  }, [tableData, viewMode, selectedProductAsin]);

  const selectedProduct = useMemo(() => {
    if (viewMode !== "product") return null;
    return tableData.find(p => p.asin === selectedProductAsin) || tableData[0];
  }, [tableData, selectedProductAsin, viewMode]);

  const productSearchTerms = useMemo(() => {
    if (!selectedProduct || !selectedProduct.campaigns) return [];
    const list = [];
    selectedProduct.campaigns.forEach(c => {
      (c.searchTerms || []).forEach(st => {
        list.push({
          ...st,
          guid: st.guid || `${c.campaignId}_${st.adGroupId}_${st.keywordId || ""}_${st.searchTerm}`,
          campaignName: c.campaignName,
          campaignStatus: c.campaignStatus,
        });
      });
    });

    if (debouncedSearchTermSearch?.trim()) {
      const q = debouncedSearchTermSearch.toLowerCase().trim();
      return list.filter(st => st.searchTerm?.toLowerCase().includes(q));
    }
    return list;
  }, [selectedProduct, debouncedSearchTermSearch]);

  const displayedSearchTerms = useMemo(() => {
    if (viewMode !== "product") return [];
    const start = (stPage - 1) * stPerPage;
    return productSearchTerms.slice(start, start + stPerPage);
  }, [productSearchTerms, stPage, stPerPage, viewMode]);

  // Context for profile and global date range
  let { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);
  // Combined SP+SB (+SD) view active on this screen? (Campaign View is
  // All-ready; Product View is single-type only for now — see guard below.)
  const showAllTypes = isShowingAllAdTypes(
    typeof window !== "undefined" ? window.location.pathname : "",
    selectedAdType
  );
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  // Product View is single-type only for now; under the combined "All" view keep
  // the user on Campaign View so the product endpoint is never called with
  // "All" (which would silently fall back to SP-only data).
  useEffect(() => {
    if (showAllTypes && viewMode === "product") {
      setViewMode("campaign");
      setTableData([]);
    }
  }, [showAllTypes, viewMode]);

  const [filterModal, setfilterModal] = useState();

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
  const [defaultColumns] = useState(["Search Term"]);

  const [showCampaignAdGroupModel, setShowCampignAdGroupModel] = useState(false);
  const [addNegativeToCampaign, setAddNegativeToCampaign] = useState(false);

  const [showSalesFilter, setShowSalesFilter] = useState(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [customFilterFlag, setCustomFilterFlag] = useState(false);
  const [fieldName, setfieldName] = useState("sales");
  const [selectedRows, setSelectedRows] = useState([]);
  const [selectedSubRows, setSelectedSubRows] = useState({});

  const findSearchTermRow = useCallback((guid) => {
    if (viewMode === "campaign") {
      return tableData.find(item => item.guid === guid);
    } else {
      for (const product of tableData) {
        for (const campaign of (product.campaigns || [])) {
          for (const st of (campaign.searchTerms || [])) {
            const stGuid = st.guid || `${campaign.campaignId}_${st.adGroupId}_${st.keywordId || ""}_${st.searchTerm}`;
            if (stGuid === guid) {
              return {
                ...st,
                campaignId: campaign.campaignId,
                campaignName: campaign.campaignName,
              };
            }
          }
        }
      }
    }
    return null;
  }, [tableData, viewMode]);

  const handleDetailSelectionChanged = useCallback((asin, selectedNodes) => {
    setSelectedSubRows(prev => {
      const next = { ...prev, [asin]: selectedNodes };
      const allSelectedGuids = Object.values(next).flat().map(row => row.guid);
      setSelectedRows(allSelectedGuids);
      return next;
    });
  }, []);
  const [negativeList, setNegativeList] = useState([]);
  const [showNegativeKeywordTypeModel, setShowNegativeKeywordTypeModel] = useState(false);
  const [negativeKeywordType, setNegativeKeywordType] = useState("NEGATIVE_EXACT");
  const [selectAll, setSelectAll] = useState(false);

  const [negativeKeyword, setNegativeKeyword] = useState([]);
  const [negativeProduct, setNegativeProduct] = useState([]);
  const [showNegativeProductTypeModel, setShowNegativeProductTypeModel] = useState(false);
  const [negativeProductType, setNegativeProductType] = useState("ASIN_SAME_AS");
  const [showSummary, setShowSummary] = useState(null);

  const [filter, setFilter] = useState([]);
  const [filterOptions, setFilterOptions] = useState([]);
  const [filterValue, setFilterValue] = useState("");
  const [gridFilter, setGridFilter] = useState("");
  const [selectedCampaigns, setSelectedCampaigns] = useState([]);
  const [selectedAdGroups, setSelectedAdGroups] = useState([]);
  const [campaignsData, setCampaignsData] = useState([]);
  const lastFilterProfileRef = useRef(null);
  const filterPromiseRef = useRef(null);
  const lastAutoSearchProfileRef = useRef(null);
  const autoSearchPromiseRef = useRef(null);
  const [appliedFilters, setAppliedFilters] = useState([]);
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [showDeleteFilterModal, setShowDeleteFilterModal] = useState(false);
  const [filterToDelete, setFilterToDelete] = useState(null);
  const [pendingCampaignSelections, setPendingCampaignSelections] = useState(null);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  // Dedicated loading flag for the search terms grid — independent of the campaigns dropdown loading,
  // so the grid overlay stays visible until getAllSearchTerms / getSearchTermsProductView resolves.
  const [isTableLoading, setIsTableLoading] = useState(true);
  const [selectedFilterOption, setSelectedFilterOption] = useState(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState("");

  const [bulkConfirm, setBulkConfirm] = useState(null);

  const gridRef = useRef(null);
  const lastFetchParamsRef = useRef("");

  // ── Auto-save and restore page filter ──────────────────────────────────────
  const { isFilterReady } = usePageFilter({
    pageName: "SearchTerm_" + viewMode,
    profileId: profileId?.value,
    selectedAdType,
    appliedFilters,
    setAppliedFilters,
    // SearchTerm handles CampaignsAndAdGroups dynamically through handleFilterOptionClick,
    // so no onFilterLoad is needed here specifically.
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

  const columns = useMemo(() => [
    ...(PermissionCheck(SYSTEM_PAGES.SEARCH_TERM, PAGE_ACTIONS.UPDATE) ? [{
      headerName: "",
      field: "guid",
      maxWidth: 50,
      pinned: isMobile ? null : "left",
      lockPinned: !isMobile,
      suppressMovable: true,
      sortable: false,
      resizable: false,
      headerComponent: () => (
        <div className="flex items-center justify-center" style={{ width: "100%" }}>
          <Checkbox
            checked={selectAll}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const currentRows = viewMode === "campaign" ? tableData : displayedSearchTerms;
              if (e.target.checked) {
                setSelectedRows(currentRows.map(row => row?.guid));
                setSelectAll(true);
              } else {
                setSelectedRows([]);
                setSelectAll(false);
              }
            }}
          />
        </div>
      ),
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row || row?.isTotalRow) return null;
        return (
          <Checkbox
            checked={selectedRows.includes(row?.guid)}
            disabled={!(row?.guid)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const rowId = row?.guid;
              if (e.target.checked && rowId) {
                setSelectedRows(prev => [...prev, rowId]);
              } else {
                setSelectedRows(prev => prev.filter(id => id !== rowId));
                setSelectAll(false);
              }
            }}
          />
        );
      },
    }] : []),
    {
      headerName: t("searchTerm"),
      field: "searchTerm",
      title: "Search Term",
      ...(checkOrderColumns("Search Term")),
      pinned: isMobile ? null : "left",
      lockPinned: !isMobile,
      suppressMovable: true,
      sortable: true,
      resizable: true,
    },
    // Ad-type column: only meaningful (and only present) under the combined
    // "All" view, where rows come from different ad types.
    ...(showAllTypes && viewMode === "campaign" ? [{
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
      headerName: t("Status"),
      field: "existTargeting",
      title: "Status",
      exportFormatter: (val) => {
        if (!val) return "";
        if (!val.isExist || !val.list?.length) return "New";
        const config = {
          ENABLED: { EXACT: "Exact", PHRASE: "Phrase", BROAD: "Broad", TARGETING_EXPRESSION: "Product" },
          PAUSED: { EXACT: "Exact", PHRASE: "Phrase", BROAD: "Broad", TARGETING_EXPRESSION: "Product" },
          ARCHIVED: { EXACT: "Exact", PHRASE: "Phrase", BROAD: "Broad", TARGETING_EXPRESSION: "Product" },
        };
        return val.list.map(item => config[item.status || ""]?.[item.keywordType || item.type || ""] || "—").join(", ");
      },
      ...(checkOrderColumns("Status")),
      sortable: false,
      resizable: true,
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      cellRenderer: (params) => {
        const data = params.value || {};

        const pillBase = {
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          padding: "3px 9px",
          borderRadius: "20px",
          fontSize: "11px",
          fontWeight: 600,
          border: "1px solid",
          lineHeight: "1.5",
          whiteSpace: "nowrap",
        };

        // ⭐ NEW OPPORTUNITY
        if (!data.isExist || !data.list?.length) {
          return (
            <Badge className="status-badge" variant="outline" style={{ letterSpacing: "0.6px", background: "linear-gradient(135deg, #1A9FD4, #0566c3)", color: "#fff", textTransform: "uppercase", padding: "4px 10px", fontSize: "10px", lineHeight: "1.2", borderColor: "transparent" }}>
              ✦ New
            </Badge>
          );
        }

        // ⭐ NESTED CONFIG: config[STATUS][TYPE]
        const config = {
          ENABLED: {
            EXACT: { label: "⚡ Exact", bg: "#e6f4ea", color: "#166534", border: "#86efac", dot: "#22c55e" },
            PHRASE: { label: "💬 Phrase", bg: "#e6f4ea", color: "#166534", border: "#86efac", dot: "#22c55e" },
            BROAD: { label: "🌐 Broad", bg: "#e6f4ea", color: "#166534", border: "#86efac", dot: "#22c55e" },
            TARGETING_EXPRESSION: { label: "🎯 Product", bg: "#e6f4ea", color: "#166534", border: "#86efac", dot: "#22c55e" },
          },
          PAUSED: {
            EXACT: { label: "⚡ Exact", bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1", dot: "#94a3b8" },
            PHRASE: { label: "💬 Phrase", bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1", dot: "#94a3b8" },
            BROAD: { label: "🌐 Broad", bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1", dot: "#94a3b8" },
            TARGETING_EXPRESSION: { label: "🎯 Product", bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1", dot: "#94a3b8" },
          },
          ARCHIVED: {
            EXACT: { label: "⚡ Exact", bg: "#fef2f2", color: "#991b1b", border: "#fecaca", dot: "#ef4444" },
            PHRASE: { label: "💬 Phrase", bg: "#fef2f2", color: "#991b1b", border: "#fecaca", dot: "#ef4444" },
            BROAD: { label: "🌐 Broad", bg: "#fef2f2", color: "#991b1b", border: "#fecaca", dot: "#ef4444" },
            TARGETING_EXPRESSION: { label: "🎯 Product", bg: "#fef2f2", color: "#991b1b", border: "#fecaca", dot: "#ef4444" },
          },
        };

        const fallback = { label: "—", bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1", dot: "#94a3b8" };

        return (
          <div className="flex flex-row gap-1 flex-wrap" style={{ padding: "5px 0" }}>
            {data.list.map((item, idx) => {
              const status = item.status || "";
              const type = item.keywordType || item.type || "";

              const style = config[status]?.[type] ?? fallback;

              return (
                <Badge
                  key={idx}
                  className="status-badge"
                  variant="outline"
                  style={{ background: style.bg, color: style.color, borderColor: style.border, gap: "5px", padding: "4px 10px", fontSize: "10px", lineHeight: "1.2" }}
                >
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: style.dot, display: "inline-block", flexShrink: 0 }} />
                  {style.label}
                </Badge>
              );
            })}
          </div>
        );
      }
    },
    {
      headerName: t("campaignName"),
      field: "campaignName",
      title: "Campaign Name",
      ...(checkOrderColumns("Campaign Name")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return <CampaignNameCell row={row} name={params.value} />;
      },
    },
    ...(viewMode !== "product" ? [{
      headerName: t("adGroupName"),
      field: "adGroupName",
      title: "AD Group Name",
      valueGetter: (params) => params.data?.adGroupName || params.data?.adGroupname || "-",
      ...(checkOrderColumns("AD Group Name")),
      sortable: true,
      resizable: true,
    }] : []),
    {
      headerName: t("impressions"),
      field: "impressions",
      title: "Impressions",
      exportFormatter: (val) => val !== "" && val != null ? val : 0,
      ...(checkOrderColumns("Impressions")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0),
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
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0),
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
      cellRenderer: (params) => CurrencyCode(params.value),
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
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0),
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
      cellRenderer: (params) => CurrencyCode(params.value),
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
      cellRenderer: (params) => `${params.value}%`,
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
      cellRenderer: (params) => CurrencyCode(params.value),
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
      cellRenderer: (params) => `${params.value}%`,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "ctr", hasFilter: true },
    },
  ], [isMobile, t, selectAll, viewMode, tableData, displayedSearchTerms, selectedRows, visibleColumns, sharedFilterParams, selectedAdType]);



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

  useEffect(() => {
    const currentRows = viewMode === "campaign" ? tableData : displayedSearchTerms;
    if (currentRows.length > 0) {
      const allRowGuids = currentRows.map(row => row?.guid).filter(Boolean);
      const isAllSelected = allRowGuids.length > 0 && allRowGuids.every(guid => selectedRows.includes(guid));
      setSelectAll(isAllSelected);
    } else {
      setSelectAll(false);
    }
  }, [selectedRows, tableData, displayedSearchTerms, viewMode]);

  const refreshGrid = () => {
    localStorage.setItem("AffectedSearchTerms", []);
    ApiListing({ isReload: true, skipLoader: true });
  }

  useEffect(() => {
    if (!Boolean(appliedFilters?.length)) {
      const filter = {
        "id": 999999,
        "type": "CampaignActiveStatus",
        "displayText": "Campaign Status: ENABLED",
        "label": "Campaign active status",
        "value": "ENABLED",
      }
      setAppliedFilters((prev) => {
        if (prev.some((f) => f?.type === "CampaignActiveStatus")) return prev;
        return [...prev, filter];
      });
    }
  }, [campaignsData]);

  const ApiListing = async (customArgs) => {
    if (profileId?.value && selectedAdType) {
      const isReload = !!customArgs?.skipLoader || !!customArgs?.isReload;
      const searchTerms = JSON.parse(localStorage.getItem("AffectedSearchTerms") || "[]");

      const campaignStatusFilter = appliedFilters.find(filter => filter.type === "CampaignActiveStatus");
      const campaignStatus = campaignStatusFilter ? campaignStatusFilter.value : "";

      const campaignsAndAdGroupsFilter = appliedFilters.find(filter => filter.type === "CampaignsAndAdGroups");
      const campaignIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => item.adGroups).map(campaign => campaign.id) : [];
      const adGroupIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => !item.adGroups).map(adGroup => adGroup.id) : [];

      const fromDateStr = moment(date?.[0]).format("YYYY-MM-DD");
      const toDateStr = moment(date?.[1]).format("YYYY-MM-DD");
      const searchNameVal = customArgs?.hasOwnProperty("searchName") ? customArgs.searchName : debouncedSearchName;
      const pageNoVal = customArgs?.pageNo ?? (viewMode === "campaign" ? campaignPage : productPage);
      const perPageVal = customArgs?.perPage ?? (viewMode === "campaign" ? campaignPerPage : productPerPage);

      const requestSignature = JSON.stringify({
        profileId: profileId.value,
        selectedAdType,
        viewMode,
        fromDate: fromDateStr,
        toDate: toDateStr,
        searchName: searchNameVal,
        campaignId: campaignIds,
        adGroupId: adGroupIds,
        campaignStatus,
        appliedFilters: (appliedFilters || []).map(f => f.id || f.displayText || f.type),
        pageNo: pageNoVal,
        perPage: perPageVal,
        sortType: conditionObj?.sortType || "DESC",
        fieldName: fieldName || "sales"
      });

      if (!isReload && lastFetchParamsRef.current === requestSignature) {
        return;
      }

      lastFetchParamsRef.current = requestSignature;

      const data = {
        searchName: searchNameVal,
        appliedFilters,
        profileId: profileId.value,
        fromDate: fromDateStr,
        toDate: toDateStr,
        fieldName: fieldName,
        sortType: conditionObj?.sortType,
        campaignId: campaignIds,
        campaignStatus: campaignStatus,
        adGroupId: adGroupIds,
        filteredSearchTerms: searchTerms.map(st => ({ campaignId: st.campaignId, adGroupId: st.adGroupId, keywordId: st.keywordId, searchTerm: st.searchTerm })),
        pageNo: pageNoVal,
        perPage: perPageVal,
        ...customArgs,
      };

      data.query = addSearchTermQuery(data);
      delete data.appliedFilters;

      if (!isReload) {
        setTableData([]);
      }
      setIsTableLoading(true);
      const apiCall = viewMode === "campaign" ? ApiGetAllSearchTerms : ApiGetSearchTermsProductView;
      let isActive = true;
      try {
        const e = await apiCall(data);
        if (lastFetchParamsRef.current !== requestSignature) {
          isActive = false;
          return;
        }
        if (e?.isSuccess) {
          if (viewMode === "campaign") {
            setTableData(e?.getSearchTerm || []);
          } else {
            setTableData(e?.products || []);
          }
          setSearchTermData(e);
        } else {
          Toast.error(e?.message);
        }
      } catch (e) {
        if (lastFetchParamsRef.current !== requestSignature) {
          isActive = false;
          return;
        }
        lastFetchParamsRef.current = "";
        Toast.error(t("Something went wrong"));
      } finally {
        if (isActive) {
          setIsTableLoading(false);
        }
      }
    }
  };

  const exportExcel = async () => {
    if (profileId.value && selectedAdType) {
      dispatch(handleLoader(true));
      try {
        const campaignStatusFilter = appliedFilters.find(filter => filter.type === "CampaignActiveStatus");
        const campaignStatus = campaignStatusFilter ? campaignStatusFilter.value : "";
        const campaignsAndAdGroupsFilter = appliedFilters.find(filter => filter.type === "CampaignsAndAdGroups");
        const campaignIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => item.adGroups).map(campaign => campaign.id) : [];
        const adGroupIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => !item.adGroups).map(adGroup => adGroup.id) : [];
        const searchTerms = JSON.parse(localStorage.getItem("AffectedSearchTerms") || "[]");

        const data = {
          searchName: searchName,
          appliedFilters,
          profileId: profileId.value,
          fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
          toDate: moment(date?.[1]).format("YYYY-MM-DD"),
          fieldName: fieldName,
          sortType: conditionObj?.sortType,
          campaignId: campaignIds,
          campaignStatus: campaignStatus,
          adGroupId: adGroupIds,
          filteredSearchTerms: searchTerms.map(st => ({ campaignId: st.campaignId, adGroupId: st.adGroupId, keywordId: st.keywordId, searchTerm: st.searchTerm })),
          pageNo: 1,
          perPage: 100000,
        };

        data.query = addSearchTermQuery(data);
        delete data.appliedFilters;

        const apiCall = viewMode === "campaign" ? ApiGetAllSearchTerms : ApiGetSearchTermsProductView;
        const response = await apiCall(data);

        if (response?.isSuccess) {
          if (viewMode === "campaign") {
            const allData = response?.getSearchTerm || [];
            exportGridToExcel(allData, columns, "search_term_export.xlsx");
          } else {
            const allData = response?.products || [];
            let list = [];
            allData.forEach(p => {
              (p.campaigns || []).forEach(c => {
                (c.searchTerms || []).forEach(st => {
                  list.push({
                    ...st,
                    guid: st.guid || `${c.campaignId}_${st.adGroupId}_${st.keywordId || ""}_${st.searchTerm}`,
                    campaignName: c.campaignName,
                    campaignStatus: c.campaignStatus,
                  });
                });
              });
            });
            exportGridToExcel(list, columns, "search_term_product_export.xlsx");
          }
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

  useEffect(() => {
    lastFetchParamsRef.current = "";
    lastAutoSearchProfileRef.current = null;
    lastFilterProfileRef.current = null;
  }, [profileId?.value, viewMode]);

  useEffect(() => {
    if (!isFilterReady) return;
    if (profileId?.value && selectedAdType) {
      setSelectedRows([]);
      setSelectAll(false);
      setSelectedSubRows({});
      if (viewMode === "campaign") {
        setCampaignPage(1);
        ApiListing({ pageNo: 1, perPage: campaignPerPage });
      } else {
        setProductPage(1);
        ApiListing({ pageNo: 1, perPage: productPerPage });
      }
    }
  }, [isFilterReady, profileId?.value, selectedAdType, date, gridFilter, appliedFilters, debouncedSearchName]);

  useEffect(() => {
    const fetchCustomColumns = async () => {
      const body = { pageName: "SearchTerm" };
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
    let finalColumns = [...selectedColumns];
    if (viewMode === "product") {
      const adGroupCol = visibleColumns.find(c => c.title === "AD Group Name");
      if (adGroupCol) {
        finalColumns.push({
          title: "AD Group Name",
          isDisplay: adGroupCol.isDisplay,
          order: adGroupCol.order,
          isDefault: adGroupCol.isDefault
        });
      }
    }

    const visible = (columns ?? [])
      .map(c => ({ ...c, ...finalColumns.find(col => col.title === c.title) }))
      .filter(c => c?.isDisplay || !c?.title)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .filter(Boolean);

    setVisibleColumns(visible);
    setShowCustomizeModal(false);

    const body = {
      pageName: "SearchTerm",
      columns: finalColumns,
    };
    const response = await ApiListUpdateColumns(body);
    if (response?.isSuccess && response?.data?.columns) {
      const updated = (columns ?? [])
        .map(c => ({ ...c, ...response?.data?.columns.find(col => col.title === c.title) }))
        .filter(c => c?.isDisplay || !c?.title)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .filter(Boolean);

      setVisibleColumns(updated);
    }
  };


  const handlePageChange = (page) => {
    setIsTableLoading(true);
    if (viewMode === "campaign") {
      setCampaignPage(page);
      ApiListing({ pageNo: page, perPage: campaignPerPage });
    } else {
      setProductPage(page);
      ApiListing({ pageNo: page, perPage: productPerPage });
    }
  };

  const handlePerRowsChange = async (newPerPage) => {
    setIsTableLoading(true);
    if (viewMode === "campaign") {
      setCampaignPage(1);
      setCampaignPerPage(newPerPage);
      ApiListing({ pageNo: 1, perPage: newPerPage });
    } else {
      setProductPage(1);
      setProductPerPage(newPerPage);
      ApiListing({ pageNo: 1, perPage: newPerPage });
    }
  };

  const handleSearch = (e) => {
    setSearchName(e.target.value);
  };

  // handler for sorting
  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    ApiListing({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }) });
  };

  useEffect(() => {
    const isValidProduct = (searchTerm) => typeof searchTerm === "string" && `${searchTerm}`.trim().length === 10 && /^b/i.test(searchTerm)
    if (selectedRows?.length) {
      const { keyword, product } = selectedRows?.reduce((acc, term) => {
        const row = findSearchTermRow(term);
        if (!row) return acc;

        if (isValidProduct(row?.searchTerm)) acc.product.push(row.searchTerm);
        else acc.keyword.push(row.searchTerm);

        return acc;
      }, { keyword: [], product: [] })

      setNegativeKeyword(keyword)
      setNegativeProduct(product)
    } else {
      setNegativeKeyword([]);
      setNegativeProduct([]);
    }
  }, [selectedRows, findSearchTermRow])

  const handleAction = (action) => {
    setBulkConfirm({ action });
  };

  const executeAction = async () => {
    if (!bulkConfirm) return;
    const { action } = bulkConfirm;

    if (action === "add-negative-campaign") {
      setShowCampignAdGroupModel("campaign");
    }

    if (action === "add-negative-adgroup") {
      setShowCampignAdGroupModel("adgroup");
    }

    if (action === "add-negative") {
      const negativeKeywords = selectedRows.flatMap((term) => {
        const row = findSearchTermRow(term);
        if (!row) return null;
        return {
          campaignId: String(row?.campaignId),
          adGroupId: String(row?.adGroupId),
          keywordText: row.searchTerm,
          matchType: "NEGATIVE_EXACT",
          state: "ENABLED"
        };
      });
      setNegativeList(negativeKeywords);
      setShowNegativeKeywordTypeModel(true);
    }

    if (action === "add-negative-product") {
      const negativeKeywords = selectedRows.flatMap((term) => {
        const row = findSearchTermRow(term);
        if (!row) return null;
        return {
          campaignId: String(row?.campaignId),
          adGroupId: String(row?.adGroupId),
          expression: [{ type: "ASIN_SAME_AS", value: `${row.searchTerm}`?.toUpperCase() }],
          state: "ENABLED"
        };
      });
      setNegativeList(negativeKeywords);
      setShowNegativeProductTypeModel(true);
    }

    setBulkConfirm(null);
  };

  const addNegative = async () => {
    const negativeKeywords = negativeList.flatMap(nk => {
      if (nk && nk.keywordText) {
        const obj = { keywordText: nk.keywordText, state: nk.state };
        if (nk.campaignId) {
          obj.campaignId = nk.campaignId;
        }
        if (nk.adGroupId) {
          obj.adGroupId = nk.adGroupId;
        }
        obj.matchType = negativeKeywordType;
        return obj;
      }
      return [];
    });

    if (negativeKeywords.length > 0) {
      const data = {
        negativeKeywordList: negativeKeywords,
        profileId: profileId?.value
      }
      if (addNegativeToCampaign) {
        await ApiAddNegativeToCampaign(data)
          .then((e) => {
            if (e?.isSuccess) {
              Toast.success(e?.message);
              setShowNegativeKeywordTypeModel(false);
              setNegativeKeywordType("NEGATIVE_EXACT")
              setShowSummary(e?.summary)
            }
            else {
              Toast.error(e?.message);
            }
          })
          .catch((e) => {
            console.log(e);
            Toast.error(t("Something went wrong"));
          });
      }
      else {
        await ApiAddToNegative(data)
          .then((e) => {
            if (e?.isSuccess) {
              Toast.success(e?.message);
              setShowNegativeKeywordTypeModel(false);
              setNegativeKeywordType("NEGATIVE_EXACT")
              setShowSummary(e?.summary)
            }
            else {
              Toast.error(e?.message);
            }
          })
          .catch((e) => {
            console.log(e);
            Toast.error(t("Something went wrong"));
          });
      }
    }
  }

  const addNegativeProduct = async () => {
    const negativeProducts = negativeList.flatMap(nk => {
      if (nk && nk?.expression?.[0]?.value) {
        const obj = { state: nk.state };
        if (nk.campaignId) {
          obj.campaignId = nk.campaignId;
        }
        if (nk.adGroupId) {
          obj.adGroupId = nk.adGroupId;
        }
        obj.expression = [{ type: negativeProductType, value: nk?.expression?.[0]?.value }];
        return obj;
      }
      return [];
    });

    if (negativeProducts.length > 0) {
      const data = {
        negativeTargetingList: negativeProducts,
        profileId: profileId?.value
      }
      await ApiAddToNegativeProduct(data)
        .then((e) => {
          if (e?.isSuccess) {
            Toast.success(e?.message);
            setShowNegativeProductTypeModel(false);
            setNegativeProductType("ASIN_SAME_AS")
            setShowSummary(e?.summary)
          }
          else {
            Toast.error(e?.message);
          }
        })
        .catch((e) => {
          console.log(e);
          Toast.error(t("Something went wrong"));
        });
    }
  }

  const handleOtherCampaginAdGroup = async (data) => {
    if (data?.mode === "campaign") {
      const negativeKeywords = data?.selectedCampaigns.flatMap((campaign) => {
        return selectedRows.flatMap((term) => {
          const row = findSearchTermRow(term);
          if (!row) return null;
          return {
            campaignId: String(campaign?.id),
            keywordText: row.searchTerm,
            matchType: "NEGATIVE_EXACT",
            state: "ENABLED"
          };
        })
      });
      setAddNegativeToCampaign(true);
      setShowCampignAdGroupModel(false);
      setNegativeList(negativeKeywords);
      setShowNegativeKeywordTypeModel(true);
    }

    if (data?.mode === "adgroup") {
      const negativeKeywords = data?.selectedAdGroups.flatMap((adGroup) => {
        return selectedRows.flatMap((term) => {
          const row = findSearchTermRow(term);
          if (!row) return null;
          return {
            adGroupId: String(adGroup?.id),
            campaignId: String(adGroup?.campaignId),
            keywordText: row.searchTerm,
            matchType: "NEGATIVE_EXACT",
            state: "ENABLED"
          };
        })
      });
      setShowCampignAdGroupModel(false);
      setNegativeList(negativeKeywords);
      setShowNegativeKeywordTypeModel(true);
    }
  }

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
    const data = { profileId: profileId.value, pageName: "Search Term" };
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
    setFilterToDelete(filter);
    setShowDeleteFilterModal(true);
  };

  // Handle filter option click
  const handleFilterOptionClick = (option) => {

    // Check if there's an existing applied filter for this option and pre-populate
    const existingFilter = appliedFilters.find(filter => filter.type === option.value);

    setSelectedFilterOption(option);

    if (option.value === "CampaignActiveStatus") {
      setSelectedCampaignStatus(existingFilter ? existingFilter.value : "");
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
      setSelectedCampaigns([]);
      setSelectedCampaignStatus("");
      setSelectedAdGroups([]);
    }, 300);
  };

  // Handle remove single filter
  const handleRemoveSingleFilter = (filterId) => setAppliedFilters(prev => prev.filter(filter => filter.id !== filterId));

  // Handle reset all filters
  const handleResetAll = () => {
    setAppliedFilters([]);
    setGridFilter("");
    setSearchName("");
    setSelectedRows([]);
    ApiListing({ searchName: "" });
  };

  const handleNegativeKeywordTypeClose = () => {
    setShowNegativeKeywordTypeModel(false);
    setNegativeKeywordType("NEGATIVE_EXACT")

    setShowNegativeProductTypeModel(false);
    setNegativeProductType("ASIN_SAME_AS")
  }

  const setSelectedSearchTerm = () => {
    const selectedSearchTerms = showNegativeKeywordTypeModel ? negativeKeyword : negativeProduct
    return selectedSearchTerms.join(",");
  }

  return (
    <div className="search-term-view-container" id="search-term-page">
      <Filter name={"Seatch Terms"} dateShow={false} profileShow={true} />
      <div className="middle_container budget_container bg-transparent rounded-0 shadow-none">
        {/* Fluid Translucent Header matching Campaign.js and LifetimeTracker.js */}
        <div
          id="search-term-filters"
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
          {/* ROW 1: Filter By + Bulk Actions + Reset */}
          <div style={{ flex: isMobile ? "1 1 100%" : "0 0 auto", display: "flex", gap: 12, alignItems: "center", width: isMobile ? "100%" : "auto", flexWrap: "wrap" }}>
            {/* Filter By */}
            <div style={{ flex: isMobile ? "1 1 120px" : "initial" }}>
              <Popover>
                <PopoverTrigger asChild>
                  <ShadcnButton
                    variant="outline"
                    id="filter-by-dropdown"
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

            {/* Bulk Actions Dropdown */}
            {selectedRows?.length > 0 && PermissionCheck(SYSTEM_PAGES.SEARCH_TERM, PAGE_ACTIONS.UPDATE) && (
              <div style={{ flex: isMobile ? "1 1 120px" : "initial" }}>
                <Popover>
                  <PopoverTrigger asChild>
                    <ShadcnButton
                      variant="outline"
                      id="bulk-actions-dropdown"
                      className="w-full justify-between active m-0 font-medium h-[40px] px-4 bg-white border custom-secondary-btn dark:bg-[#0e1626] dark:border-white/10"
                      style={{ width: "100%", height: "40px" }}
                    >
                      <span className="truncate mr-2">{t("Bulk Actions")}</span>
                      <ExpandMoreIcon className="text-gray-500" fontSize="small" />
                    </ShadcnButton>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 bg-white dark:bg-[#0e1626] dark:border-white/10 p-2 shadow-xl rounded-xl z-[9999]">
                    <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-3 py-2">
                      {t("Selected")}: {selectedRows?.length} {selectedRows?.length === 1 ? t("row") : t("rows")}
                    </div>
                    <hr className="my-1 border-slate-100 dark:border-white/5" />

                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-3 pt-2 pb-1">
                      {t("In the current Campaign/Ad Group")}
                    </div>
                    <button
                      disabled={!negativeKeyword?.length}
                      onClick={() => handleAction("add-negative")}
                      className="w-full text-left px-3 py-2 text-sm rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-slate-700 dark:text-slate-300 disabled:hover:bg-transparent"
                    >
                      {t("Add as Negative Keyword")} ({negativeKeyword?.length})
                    </button>
                    <button
                      disabled={!negativeProduct?.length}
                      onClick={() => handleAction("add-negative-product")}
                      className="w-full text-left px-3 py-2 text-sm rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-slate-700 dark:text-slate-300 disabled:hover:bg-transparent"
                    >
                      {t("Add as Negative Product")} ({negativeProduct?.length})
                    </button>

                    <hr className="my-1 border-slate-100 dark:border-white/5" />

                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-3 pt-2 pb-1">
                      {t("In Other Campaign/Ad Group")}
                    </div>
                    <button
                      onClick={() => handleAction("add-negative-campaign")}
                      className="w-full text-left px-3 py-2 text-sm rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-white/5 font-medium text-slate-700 dark:text-slate-300"
                    >
                      {t("Add as Negative to Campaign")}
                    </button>
                    <button
                      onClick={() => handleAction("add-negative-adgroup")}
                      className="w-full text-left px-3 py-2 text-sm rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-white/5 font-medium text-slate-700 dark:text-slate-300"
                    >
                      {t("Add as Negative to Ad Group")}
                    </button>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Reset button inside ROW 1 */}
            <div style={{ flex: isMobile ? "1 1 120px" : "0 0 auto" }}>
              <ShadcnButton
                onClick={handleResetAll}
                className="customize-button m-0"
                style={{
                  height: "40px",
                  width: "100%"
                }}
              >
                {t("Reset")}
              </ShadcnButton>
            </div>
          </div>

          {/* ROW 2: Search, Date Picker and Refresh align end */}
          <div style={{ flex: isMobile ? "1 1 100%" : "1 1 300px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: isMobile ? "flex-start" : "flex-end", width: isMobile ? "100%" : "auto" }}>
            <div id="search-term-search-option" className="search_option m-0 flex items-center" style={{ position: "relative", flex: isMobile ? "1 1 100%" : "1 1 220px", maxWidth: isMobile ? "100%" : "320px", height: "40px" }}>
              <Input
                type="text"
                placeholder={viewMode === "product" ? t("searchProducts", "Search Products...") : t("searchHere")}
                value={searchName}
                onChange={(e) => handleSearch(e)}
                className="w-full h-[40px] text-sm"
                style={{ paddingRight: searchName ? "30px" : "12px", paddingLeft: "12px" }}
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

            <div id="search-term-date-picker" style={{ flex: isMobile ? "1 1 100%" : "1 1 260px", maxWidth: isMobile ? "100%" : "260px" }}>
              <DateRangePicker
                className="w-full"
                style={{ height: "40px" }}
                ranges={predefinedRanges}
                value={date}
                placeholder={t("Select Date")}
                onChange={handleDateChange}
                placement={isMobile ? "bottomStart" : "bottomEnd"}
                format="yyyy-MM-dd"
                cleanable={false}
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap" style={{ flex: isMobile ? "1 1 100%" : "0 0 auto", width: isMobile ? "100%" : "auto" }}>
              <AppTooltip text={t("Customize Columns")} id="search-term-customize-columns">
                <ShadcnButton
                  variant="outline"
                  onClick={async () => setShowCustomizeModal(true)}
                  className="customize-button m-0 gap-0 custom-secondary-btn"
                  style={{ height: "40px", whiteSpace: "nowrap", flex: isMobile ? 1 : "initial", width: isMobile ? "100%" : "auto", display: "flex", alignItems: "center", justifyContent: "center" }}
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
                  style={{ height: "40px", padding: "8px 12px", whiteSpace: "nowrap", flex: isMobile ? 1 : "initial", width: isMobile ? "100%" : "auto" }}
                >
                  {t("Export")}
                </ShadcnButton>
              </AppTooltip>
              <AppTooltip text={t("Refresh")}>
                <ShadcnButton
                  id="search-term-refresh-button"
                  onClick={refreshGrid}
                  className="btn border"
                  style={{ height: "40px", width: isMobile ? "100%" : "40px", flex: isMobile ? "0 0 40px" : "initial", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}
                >
                  <RefreshIcon style={{ fontSize: 18 }} />
                </ShadcnButton>
              </AppTooltip>
            </div>
          </div>
        </div>

        {showAllTypes && (
          <div style={{ padding: "0 14px 10px 14px" }}>
            <AdTypeScopeNote selectedAdType={selectedAdType} excludedAdTypes={searchTermData?.excludedAdTypes} />
            {viewMode === "product" && (
              <div className="mt-2 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                {t("Product View shows one ad type at a time. Switch to Campaign View for the combined All view, or pick a single ad type.")}
              </div>
            )}
          </div>
        )}

        {/* Folder-style Tab Selector matching LifetimeTracker */}
        <div className="glass-grid-container overflow-hidden">
          <div
            className="flex justify-start"
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
              padding: "16px 24px 0 24px",
            }}
          >
            {[
              {
                key: "campaign",
                label: t("Campaign View"),
                icon: <CampaignOutlinedIcon style={{ fontSize: 16 }} />,
              },
              {
                key: "product",
                label: t("Product View"),
                icon: <InventoryOutlinedIcon style={{ fontSize: 16 }} />,
              },
            ].map((tab) => {
              const isActive = viewMode === tab.key;
              const isHovered = hoveredTab === tab.key;
              // Product View is not part of the combined "All" view yet.
              const isDisabled = showAllTypes && tab.key === "product";

              return (
                <ShadcnButton
                  id={`search-term-tab-${tab.key}`}
                  key={tab.key}
                  variant="ghost"
                  disabled={isDisabled}
                  title={isDisabled ? t("Available per single ad type (SP/SB/SD)") : undefined}
                  className="shadow-none border-0 hover:bg-transparent"
                  onClick={() => {
                    if (isDisabled) return;
                    if (viewMode !== tab.key) {
                      setTableData([]);
                      setIsTableLoading(true);
                      setViewMode(tab.key);
                      setSearchName("");
                      setSearchTermSearch("");
                    }
                  }}
                  onMouseEnter={() => setHoveredTab(tab.key)}
                  onMouseLeave={() => setHoveredTab(null)}
                  style={{
                    position: "relative",
                    padding: "10px 42px 10px 22px",
                    background: "transparent",
                    border: "none",
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    outline: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s ease",
                    minHeight: "42px",
                    opacity: isDisabled ? 0.45 : 1,
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
                      fill={isActive ? `url(#tabGrad-${tab.key})` : isHovered ? (isDark ? "rgba(35, 116, 242, 0.15)" : "#EFF6FF") : (isDark ? "rgba(255, 255, 255, 0.05)" : "#eaeef5")}
                      stroke={isActive ? "#1A9FD4" : "transparent"}
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
                      color: isActive ? "#ffffff" : isHovered ? "#2374F2" : (isDark ? "rgba(255, 255, 255, 0.6)" : "#475569"),
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

          <div className="data_content data_content_btn m-0" style={{ padding: 0, border: "none", boxShadow: "none" }}>

            <div id="search-term-applied-filter">
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

            {PermissionCheck(SYSTEM_PAGES.SEARCH_TERM, PAGE_ACTIONS.VIEW_ONLY) && (
              <div className="overflow-hidden">
                <div className="flex flex-col md:flex-row gap-3 items-stretch" style={{ padding: "0 14px 14px 14px" }}>
                  {viewMode === "product" && (
                    <div id="search-term-product-view-sidebar" className="product-sidebar-container border-end">
                      <div className="text-gray-500 font-bold mb-3 mt-2 px-1 flex-shrink-0" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        {t("Products")} ({searchTermData?.totalRecords ?? 0})
                      </div>
                      <div className="product-sidebar-list flex-grow-1" style={{ paddingRight: "10px" }}>
                        {tableData.map((prod) => {
                          const totalTerms = prod.campaigns ? prod.campaigns.reduce((acc, c) => acc + (c.searchTerms?.length || 0), 0) : 0;
                          const isSelected = selectedProductAsin === prod.asin;
                          return (
                            <div
                              key={prod.asin}
                              className={`product-sidebar-card ${isSelected ? "selected" : ""}`}
                              onClick={() => setSelectedProductAsin(prod.asin)}
                            >
                              <div className="flex gap-2 items-center">
                                <div className="product-sidebar-img-wrapper">
                                  {prod.imageUrl ? (
                                    <img src={prod.imageUrl} className="product-sidebar-img" alt="" />
                                  ) : (
                                    <div className="product-sidebar-img-placeholder">
                                      <i className="fa-solid fa-image"></i>
                                    </div>
                                  )}
                                </div>
                                <div className="product-sidebar-info">
                                  <div className="flex items-center justify-between gap-1 w-full">
                                    <div className="product-sidebar-title" title={prod.productName} style={{ flexGrow: 1, minWidth: 0 }}>
                                      {prod.productName}
                                    </div>
                                    <i
                                      className="fa-solid fa-copy product-sidebar-copy-btn"
                                      title={t("Copy Product Name")}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(prod.productName);
                                        Toast.success(t("Copied to clipboard!"));
                                      }}
                                    />
                                  </div>
                                  <div className="product-sidebar-meta">
                                    <div>ASIN: <strong>{prod.asin}</strong></div>
                                    <div>SKU: <strong>{prod.sku}</strong></div>
                                  </div>
                                  <div className="product-sidebar-stats">
                                    <span className="product-sidebar-stat-item terms">
                                      Terms: <strong>{totalTerms}</strong>
                                    </span>
                                    <span className="product-sidebar-stat-item sales">
                                      Sales: <strong>{CurrencyCode(prod.totalSales ?? 0)}</strong>
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Product Sidebar Pagination */}
                      <div className="product-sidebar-pagination border-top mt-2 pt-2">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between" style={{ fontSize: "11px", color: "#64748b" }}>
                            <span>{t("Rows/Page:")}</span>
                            <select
                              value={productPerPage}
                              onChange={(e) => handlePerRowsChange(Number(e.target.value))}
                              style={{ border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 6px", outline: "none", fontSize: "11px" }}
                            >
                              {[10, 25, 50, 100].map((n) => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center justify-between mt-1">
                            <span style={{ fontSize: "10.5px", color: "#94a3b8" }}>
                              {searchTermData?.totalRecords > 0 ? (
                                <>
                                  {(productPage - 1) * productPerPage + 1}–{Math.min(productPage * productPerPage, searchTermData.totalRecords)} of <strong>{searchTermData.totalRecords}</strong>
                                </>
                              ) : "0 of 0"}
                            </span>

                            <div className="flex items-center gap-1">
                              <ShadcnButton
                                className="btn btn-sm btn-outline-secondary p-1 flex items-center justify-center"
                                style={{ width: "24px", height: "24px" }}
                                disabled={productPage <= 1}
                                onClick={() => handlePageChange(1)}
                                title={t("First page")}
                              >
                                <i className="fa-solid fa-angles-left" style={{ fontSize: "9px" }} />
                              </ShadcnButton>
                              <ShadcnButton
                                className="btn btn-sm btn-outline-secondary p-1 flex items-center justify-center"
                                style={{ width: "24px", height: "24px" }}
                                disabled={productPage <= 1}
                                onClick={() => handlePageChange(productPage - 1)}
                                title={t("Previous page")}
                              >
                                <i className="fa-solid fa-angle-left" style={{ fontSize: "9px" }} />
                              </ShadcnButton>
                              <span className="px-1 font-bold text-dark" style={{ fontSize: "10.5px" }}>{productPage} / {Math.ceil((searchTermData?.totalRecords ?? 0) / productPerPage) || 1}</span>
                              <ShadcnButton
                                className="btn btn-sm btn-outline-secondary p-1 flex items-center justify-center"
                                style={{ width: "24px", height: "24px" }}
                                disabled={productPage >= (Math.ceil((searchTermData?.totalRecords ?? 0) / productPerPage) || 1)}
                                onClick={() => handlePageChange(productPage + 1)}
                                title={t("Next page")}
                              >
                                <i className="fa-solid fa-angle-right" style={{ fontSize: "9px" }} />
                              </ShadcnButton>
                              <ShadcnButton
                                className="btn btn-sm btn-outline-secondary p-1 flex items-center justify-center"
                                style={{ width: "24px", height: "24px" }}
                                disabled={productPage >= (Math.ceil((searchTermData?.totalRecords ?? 0) / productPerPage) || 1)}
                                onClick={() => handlePageChange(Math.ceil((searchTermData?.totalRecords ?? 0) / productPerPage) || 1)}
                                title={t("Last page")}
                              >
                                <i className="fa-solid fa-angles-right" style={{ fontSize: "9px" }} />
                              </ShadcnButton>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex-1 w-full position-relative flex flex-col data_table" id="searchTerm-main-table" style={{ minWidth: 0 }}>
                    {viewMode === "product" && (
                      <div className="flex justify-end mb-2" style={{ marginRight: "15px" }}>
                        <div className="search_option m-0" style={{ width: "320px", display: "flex", alignItems: "center", position: "relative" }}>
                          <Input
                            type="text"
                            placeholder={t("searchSearchTerm", "Search Search Term...")}
                            value={searchTermSearch}
                            onChange={(e) => {
                              setSearchTermSearch(e.target.value);
                              setStPage(1);
                            }}
                            className="w-full h-[38px] text-sm"
                            style={{ paddingRight: searchTermSearch ? "30px" : "12px", paddingLeft: "12px" }}
                          />
                          {searchTermSearch && (
                            <MdOutlineClose
                              onClick={() => setSearchTermSearch("")}
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
                    )}
                    <div id="search-term-main-table">
                      <AgTable
                        ref={gridRef}
                        tableId="searchTerm-main-table"
                        height={viewMode === "campaign" ? "calc(100vh - 380px)" : "calc(100vh - 440px)"}
                        loading={!profileId?.value || !selectedAdType || !isFilterReady || isTableLoading}
                        onRefresh={refreshGrid}
                        pinnedBottomRowData={viewMode === "campaign" && tableData?.some(r => r?.isTotalRow) ? [tableData.find(r => r?.isTotalRow)] : []}
                        rowData={viewMode === "campaign" ? tableData : displayedSearchTerms}
                        columnDefs={columns}
                        customSaveColumnName="SearchTerm"
                        isCustomSaveColumns={true}
                        totalRecords={viewMode === "campaign" ? (searchTermData?.totalRecords ?? 0) : productSearchTerms.length}
                        perPage={viewMode === "campaign" ? campaignPerPage : stPerPage}
                        currentPage={viewMode === "campaign" ? (customFilterFlag ? 1 : campaignPage) : stPage}
                        onPageChange={viewMode === "campaign" ? handlePageChange : (page) => setStPage(page)}
                        onPerPageChange={viewMode === "campaign" ? handlePerRowsChange : (size) => { setStPerPage(size); setStPage(1); }}
                        onSortChanged={handleSortChanged}
                        paginationOptions={paginationRowsPerPageOptions}
                        handleSaveColumns={handleSaveColumns}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
            }
          </div >
        </div >
      </div >



      <Dialog open={showNegativeKeywordTypeModel} onOpenChange={(open) => !open && handleNegativeKeywordTypeClose()}>
        <DialogContent
          className="max-w-[460px] w-[95vw] p-6 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/90 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[90vh] [&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-white/10 [&>button]:bg-slate-50 dark:[&>button]:bg-white/5 [&>button]:text-slate-500 dark:[&>button]:text-white/70 hover:[&>button]:text-slate-900 dark:hover:[&>button]:text-white [&>button]:rounded-full [&>button]:p-1.5 [&>button]:transition-all"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div
            className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
            style={{
              background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
              opacity: 0.8
            }}
          />
          <DialogHeader className="p-0 shrink-0 mb-3 text-left">
            <DialogTitle className="text-sm font-bold text-slate-900 dark:text-white leading-tight font-sans">
              {t("Add Negative Keyword")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 text-left font-sans">
            <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-white/5 p-3 rounded-lg border border-slate-100 dark:border-transparent">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{t("Keyword")}:</span> <span className="font-mono text-sky-600 dark:text-sky-400 break-all">{setSelectedSearchTerm()}</span>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("Match Type")}</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="radio"
                    name="neg-key-type"
                    checked={negativeKeywordType === "NEGATIVE_EXACT"}
                    onChange={() => setNegativeKeywordType("NEGATIVE_EXACT")}
                    className="w-4 h-4 accent-[#1A9FD4] cursor-pointer"
                  />
                  <span>Exact</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="radio"
                    name="neg-key-type"
                    checked={negativeKeywordType === "NEGATIVE_PHRASE"}
                    onChange={() => setNegativeKeywordType("NEGATIVE_PHRASE")}
                    className="w-4 h-4 accent-[#1A9FD4] cursor-pointer"
                  />
                  <span>Phrase</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-white/10 shrink-0">
            <ShadcnButton
              variant="outline"
              onClick={handleNegativeKeywordTypeClose}
              className="h-[36px] px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition-all duration-200 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white active:scale-[0.98]"
            >
              {t("Cancel")}
            </ShadcnButton>
            <ShadcnButton
              onClick={addNegative}
              className="h-[36px] px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition-all duration-200 bg-gradient-to-r from-[#1A9FD4] to-[#2374F2] text-white border-transparent hover:opacity-90 active:scale-[0.98]"
            >
              {t("Add Negative")}
            </ShadcnButton>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNegativeProductTypeModel} onOpenChange={(open) => !open && handleNegativeKeywordTypeClose()}>
        <DialogContent
          className="max-w-[460px] w-[95vw] p-6 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/90 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[90vh] [&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-white/10 [&>button]:bg-slate-50 dark:[&>button]:bg-white/5 [&>button]:text-slate-500 dark:[&>button]:text-white/70 hover:[&>button]:text-slate-900 dark:hover:[&>button]:text-white [&>button]:rounded-full [&>button]:p-1.5 [&>button]:transition-all"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div
            className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
            style={{
              background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
              opacity: 0.8
            }}
          />
          <DialogHeader className="p-0 shrink-0 mb-3 text-left">
            <DialogTitle className="text-sm font-bold text-slate-900 dark:text-white leading-tight font-sans">
              {t("Add Negative Product")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 text-left font-sans">
            <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-white/5 p-3 rounded-lg border border-slate-100 dark:border-transparent">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{t("Product")}:</span> <span className="font-mono text-sky-600 dark:text-sky-400 break-all">{setSelectedSearchTerm()}</span>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("Match Type")}</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="radio"
                    name="neg-prod-type"
                    checked={negativeProductType === "ASIN_SAME_AS"}
                    onChange={() => setNegativeProductType("ASIN_SAME_AS")}
                    className="w-4 h-4 accent-[#1A9FD4] cursor-pointer"
                  />
                  <span>Exact</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="radio"
                    name="neg-prod-type"
                    checked={negativeProductType === "ASIN_EXPANDED_FROM"}
                    onChange={() => setNegativeProductType("ASIN_EXPANDED_FROM")}
                    className="w-4 h-4 accent-[#1A9FD4] cursor-pointer"
                  />
                  <span>Expanded</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-white/10 shrink-0">
            <ShadcnButton
              variant="outline"
              onClick={handleNegativeKeywordTypeClose}
              className="h-[36px] px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition-all duration-200 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white active:scale-[0.98]"
            >
              {t("Cancel")}
            </ShadcnButton>
            <ShadcnButton
              onClick={addNegativeProduct}
              className="h-[36px] px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition-all duration-200 bg-gradient-to-r from-[#1A9FD4] to-[#2374F2] text-white border-transparent hover:opacity-90 active:scale-[0.98]"
            >
              {t("Add Negative")}
            </ShadcnButton>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={filterModal} onOpenChange={setfilterModal}>
        <DialogContent className="hidden"></DialogContent>
      </Dialog>

      <CampaignAndAdGroupModel
        showModal={Boolean(showCampaignAdGroupModel)}
        handleClose={setShowCampignAdGroupModel}
        mode={showCampaignAdGroupModel}
        handleSubmit={handleOtherCampaginAdGroup}
      />


      {/* Filter Modal */}
      <SearchTermFilterModal
        showFilterModal={showFilterModal}
        handleModalClose={handleModalClose}

        CONDITION_OPTIONS={CONDITION_OPTIONS}

        selectedCampaignStatus={selectedCampaignStatus}
        setSelectedCampaignStatus={setSelectedCampaignStatus}

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
      <SearchTermSaveFilter
        showSaveFilterModal={showSaveFilterModal}
        setShowSaveFilterModal={setShowSaveFilterModal}
        filterName={filterName}
        setFilterName={setFilterName}
        appliedFilters={appliedFilters}
        getFilter={getFilter}
      />

      {/* Delete Filter Confirmation Modal */}
      <SearchTermDeleteModal
        showDeleteFilterModal={showDeleteFilterModal}
        setFilterToDelete={setFilterToDelete}
        setShowDeleteFilterModal={setShowDeleteFilterModal}
        filterToDelete={filterToDelete}
        getFilter={getFilter}
      />

      {/* ── Bulk Action Confirmation Modal ── */}
      <CustomModal
        show={!!bulkConfirm}
        onHide={() => setBulkConfirm(null)}
        title={bulkConfirm?.action === "add-negative" ? t("Add Negative Keyword") : bulkConfirm?.action === "add-negative-product" ? t("Add Negative Product") : bulkConfirm?.action === "add-negative-campaign" ? t("Add Negative to Campaign") : bulkConfirm?.action === "add-negative-adgroup" ? t("Add Negative to Ad Group") : t("Confirm Action")}
        subtitle={`${selectedRows?.length} row${selectedRows?.length !== 1 ? "s" : ""} selected`}
        icon={bulkConfirm?.action === "add-negative" ? "block" : bulkConfirm?.action === "add-negative-product" ? "remove_shopping_cart" : bulkConfirm?.action === "add-negative-campaign" ? "block" : bulkConfirm?.action === "add-negative-adgroup" ? "block" : "help_outline"}
        iconVariant={"danger"}
        message={
          bulkConfirm?.action === "add-negative" ? `You are about to add <span class="cm-highlight">${negativeKeyword?.length} keyword${negativeKeyword?.length !== 1 ? "s" : ""}</span> as negative keywords to their current ad group. This will prevent these search terms from triggering your ads.`
            : bulkConfirm?.action === "add-negative-product" ? `You are about to add <span class="cm-highlight">${negativeProduct?.length} product${negativeProduct?.length !== 1 ? "s" : ""}</span> as negative products to their current ad group. These products will be excluded from targeting.`
              : bulkConfirm?.action === "add-negative-campaign" ? `You are about to add <span class="cm-highlight">${selectedRows?.length} search term${selectedRows?.length !== 1 ? "s" : ""}</span> as negative keywords to their current campaign.`
                : bulkConfirm?.action === "add-negative-adgroup" ? `You are about to add <span class="cm-highlight">${selectedRows?.length} search term${selectedRows?.length !== 1 ? "s" : ""}</span> as negative keywords to their current ad group.`
                  : ""
        }
        alertText={"Adding negative keywords or products will immediately affect which searches can trigger your ads."}
        alertVariant={"danger"}
        closeOnBackdrop={false}
        actions={[
          {
            label: t("Cancel"),
            cancel: true,
            icon: "close",
            onClick: () => setBulkConfirm(null),
          },
          {
            label: bulkConfirm?.action === "add-negative" ? `${t("Add Negative")} (${negativeKeyword?.length})` : bulkConfirm?.action === "add-negative-product" ? `${t("Add Negative")} (${negativeProduct?.length})` : bulkConfirm?.action === "add-negative-campaign" ? t("Add Campaign Negative") : bulkConfirm?.action === "add-negative-adgroup" ? t("Add Ad Group Negative") : t("Confirm"),
            variant: "danger",
            icon: bulkConfirm?.action === "add-negative" ? "block" : bulkConfirm?.action === "add-negative-product" ? "remove_shopping_cart" : bulkConfirm?.action === "add-negative-campaign" ? "block" : bulkConfirm?.action === "add-negative-adgroup" ? "block" : "check",
            onClick: executeAction,
          },
        ]}
      />

      <SummaryModal show={showSummary} onClose={() => setShowSummary(null)} summary={showSummary} />

      <CustomizeColumns showModal={showCustomizeModal} setShowModal={setShowCustomizeModal} allColumns={columns} selectedColumn={visibleColumns} handler={handleSaveColumns} defaultColumns={defaultColumns} />
    </div >
  );
}

export default SearchTerm;
